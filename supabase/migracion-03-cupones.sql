-- ============================================================================
-- MIGRACIÓN 03 — los cupones son la única fuente de promociones
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- QUÉ CAMBIA Y POR QUÉ
--
-- Se van dos promociones que estaban hardcodeadas:
--
--   * El 15% por pagar con Mercado Pago. Todavía no hay vinculación con MP y
--     el porcentaje es una decisión comercial que no está tomada. Prometer un
--     descuento por un medio de pago que no está integrado es exactamente el
--     tipo de promesa vacía que ya nos costó una auditoría.
--
--   * El envío gratis automático a partir de $5.000. Misma razón: es una
--     decisión de negocio, no una constante técnica. Que viva en el código
--     significa que cambiarla es publicar una versión nueva.
--
-- A cambio, un cupón ahora puede dar descuento, envío gratis, o las dos cosas.
-- Toda promoción pasa a ser una fila en esta tabla: se crea, se cambia y se
-- apaga desde el panel de Supabase, sin tocar la app. Y como el home muestra
-- los cupones que existen de verdad, deja de ser posible que prometa algo que
-- el checkout no cumple.
-- ============================================================================

-- El porcentaje deja de ser obligatorio: un cupón puede ser sólo envío gratis.
alter table public.cupones alter column porcentaje drop not null;

alter table public.cupones add column if not exists envio_gratis boolean not null default false;

-- Un cupón que no descuenta ni da envío gratis no es un cupón.
alter table public.cupones drop constraint if exists cupones_hace_algo;
alter table public.cupones add constraint cupones_hace_algo
  check (envio_gratis or (porcentaje is not null and porcentaje between 1 and 100));

-- El check viejo exigía porcentaje siempre.
alter table public.cupones drop constraint if exists cupones_porcentaje_check;

comment on column public.cupones.porcentaje   is 'Descuento sobre el subtotal. NULL si el cupón sólo da envío gratis.';
comment on column public.cupones.envio_gratis is 'Si es true, el envío de ese pedido no se cobra.';
comment on column public.cupones.descripcion  is 'Se muestra tal cual en el home y en el checkout.';

-- --------------------------------------------------------------- cupones ---

insert into public.cupones (codigo, descripcion, porcentaje, envio_gratis, activo) values
  ('BIENVENIDO', '20% OFF en tu primer pedido', 20, false, true),
  ('ENVIOGRATIS', 'Envío gratis en este pedido', null, true, true)
on conflict (codigo) do update
  set descripcion  = excluded.descripcion,
      porcentaje   = excluded.porcentaje,
      envio_gratis = excluded.envio_gratis,
      activo       = excluded.activo;

-- ============================================================================
-- crear_pedido, sin las promos automáticas
-- ============================================================================

create or replace function public.crear_pedido(
  p_comercio_id  uuid,
  p_items        jsonb,
  p_direccion    text,
  p_telefono     text,
  p_metodo_pago  text,
  p_nota         text default '',
  p_cupon        text default null,
  p_efectivo_con integer default null,
  p_lat          double precision default null,
  p_lng          double precision default null
) returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario     uuid := auth.uid();
  v_comercio    public.comercios;
  v_radio       numeric;
  v_distancia   double precision;
  v_subtotal    integer := 0;
  v_descuento   integer := 0;
  v_cupon       public.cupones;
  v_promo       text := null;
  v_envio       integer;
  v_envio_free  boolean := false;
  v_total       integer;
  v_pedido      public.pedidos;
  v_item        jsonb;
  v_producto    public.productos;
  v_cantidad    smallint;
  v_foto        text;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión para pedir' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos' using errcode = 'P0001';
  end if;

  -- ------------------------------------------------------------- el local ---
  select * into v_comercio from public.comercios where id = p_comercio_id;
  if not found or not v_comercio.aprobado then
    raise exception 'Ese local no está disponible' using errcode = 'P0001';
  end if;
  if not v_comercio.abierto then
    raise exception 'El local cerró mientras armabas el pedido' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------- la zona ---
  select coalesce(v_comercio.radio_envio_km,
                  (select valor::numeric from public.configuracion where clave = 'radio_envio_km'),
                  8)
    into v_radio;

  if p_lat is not null and p_lng is not null
     and v_comercio.lat is not null and v_comercio.lng is not null then
    v_distancia := public.distancia_km(p_lat, p_lng, v_comercio.lat, v_comercio.lng);
    if v_distancia > v_radio then
      raise exception 'Tu dirección está a % km y el local entrega hasta % km',
        round(v_distancia::numeric, 1), v_radio using errcode = 'P0001';
    end if;
  end if;

  -- ------------------------------------------------------------ el pedido ---
  insert into public.pedidos (
    cliente_id, comercio_id, subtotal, descuento, costo_envio, total,
    direccion, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0,
    p_direccion, p_telefono, coalesce(p_nota, ''), p_metodo_pago, '', p_efectivo_con
  ) returning * into v_pedido;

  -- ---------------------------------------------------------- los renglones -
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := greatest(1, least(99, coalesce((v_item->>'cantidad')::smallint, 1)));

    select * into v_producto
      from public.productos
     where id = (v_item->>'producto_id')::uuid
       and comercio_id = p_comercio_id
       and activo;

    if not found then
      raise exception 'Uno de los productos ya no está disponible' using errcode = 'P0001';
    end if;

    select url into v_foto
      from public.producto_fotos
     where producto_id = v_producto.id
     order by orden limit 1;

    insert into public.pedido_items (pedido_id, producto_id, nombre, precio, cantidad, foto_url, nota)
    values (v_pedido.id, v_producto.id, v_producto.nombre, v_producto.precio, v_cantidad, v_foto,
            left(coalesce(v_item->>'nota', ''), 140));

    v_subtotal := v_subtotal + v_producto.precio * v_cantidad;
  end loop;

  -- -------------------------------------------------------------- el cupón --
  -- Única fuente de promociones. Puede descontar, dar envío gratis, o las dos.
  if p_cupon is not null and length(trim(p_cupon)) > 0 then
    select * into v_cupon
      from public.cupones
     where codigo = upper(trim(p_cupon))
       and activo
       and (vence_el is null or vence_el > now())
       and (usos_max is null or usos < usos_max);

    if found then
      v_descuento  := round(v_subtotal * coalesce(v_cupon.porcentaje, 0) / 100.0);
      v_envio_free := v_cupon.envio_gratis;
      v_promo      := v_cupon.descripcion;
    end if;
    -- Un cupón inválido no frena el pedido: simplemente no se aplica. Perder
    -- una compra porque alguien tipeó mal un código sería peor que cobrarle
    -- el precio de lista.
  end if;

  v_envio := case when v_envio_free then 0 else v_comercio.costo_envio end;
  v_total := greatest(0, v_subtotal - v_descuento) + v_envio;

  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del pedido' using errcode = 'P0001';
  end if;

  update public.pedidos set
    subtotal     = v_subtotal,
    descuento    = v_descuento,
    promo_label  = v_promo,
    cupon_codigo = case when v_cupon.codigo is not null then v_cupon.codigo else null end,
    costo_envio  = v_envio,
    envio_gratis = v_envio_free,
    total        = v_total,
    pago_label   = case p_metodo_pago
                     when 'efectivo'    then 'Efectivo'
                     when 'mercadopago' then 'Mercado Pago'
                     when 'debito'      then 'Tarjeta de débito'
                     when 'credito'     then 'Tarjeta de crédito'
                     else p_metodo_pago end,
    vuelto       = case when p_metodo_pago = 'efectivo' and p_efectivo_con is not null
                        then p_efectivo_con - v_total else null end
  where id = v_pedido.id
  returning * into v_pedido;

  if v_pedido.cupon_codigo is not null then
    update public.cupones set usos = usos + 1 where codigo = v_pedido.cupon_codigo;
  end if;

  return v_pedido;
end $$;

revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) to authenticated;
