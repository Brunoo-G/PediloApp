-- ============================================================================
-- MIGRACIÓN 04 — tarifa de servicio
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- QUÉ AGREGA
--
-- Un cargo de la plataforma, aparte del envío. Va en el pedido como una columna
-- propia y no sumado al total a ciegas, por dos razones:
--
--   * El cliente tiene que verlo desglosado. Un total que no se puede
--     descomponer es un total que no se entiende.
--   * La plata del envío y la del servicio no son de los mismos. Cuando haya
--     que liquidarle al comercio, el corte tiene que estar hecho en la base y
--     no reconstruido a mano después.
--
-- CÓMO SE CONFIGURA
--
-- Dos parámetros en `configuracion`, para no atarse a una sola forma de cobrar:
--
--   tarifa_servicio_monto  → un fijo por pedido, en pesos (ej. 300)
--   tarifa_servicio_pct    → un porcentaje del subtotal (ej. 5)
--
-- Se suman: si querés sólo fijo, dejá el porcentaje en 0, y al revés. Con los
-- dos en 0 la tarifa no se cobra y la fila ni siquiera aparece en el detalle.
--
-- Se cambia desde el panel, sin publicar la app:
--   update configuracion set valor = '500' where clave = 'tarifa_servicio_monto';
--
-- QUÉ NO HACE
--
-- El descuento del cupón se aplica al subtotal, no a la tarifa ni al envío.
-- Un cupón de "envío gratis" tampoco la toca: son cargos distintos.
-- ============================================================================

alter table public.pedidos
  add column if not exists tarifa_servicio integer not null default 0
  check (tarifa_servicio >= 0);

comment on column public.pedidos.tarifa_servicio is
  'Cargo de la plataforma, congelado al momento del pedido. Separado del envío porque no es plata del comercio.';

insert into public.configuracion (clave, valor, descripcion) values
  ('tarifa_servicio_monto', '300', 'Cargo fijo de la plataforma por pedido, en pesos. 0 para no cobrarlo.'),
  ('tarifa_servicio_pct',   '0',   'Cargo de la plataforma como % del subtotal. Se suma al monto fijo. 0 para no usarlo.')
on conflict (clave) do nothing;

-- ============================================================================
-- crear_pedido, ahora con la tarifa
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
  v_tarifa      integer := 0;
  v_tar_monto   integer;
  v_tar_pct     numeric;
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
    cliente_id, comercio_id, subtotal, descuento, costo_envio, tarifa_servicio, total,
    direccion, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0, 0,
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
    -- Un cupón inválido no frena el pedido del lado del servidor: la app ya
    -- avisa antes de confirmar. Acá es una red de seguridad, no la validación.
  end if;

  -- ------------------------------------------------------ tarifa de servicio -
  -- Se calcula sobre el subtotal SIN descuento y no la afecta el envío gratis:
  -- es un cargo de la plataforma, no del comercio.
  select coalesce((select valor::integer from public.configuracion where clave = 'tarifa_servicio_monto'), 0),
         coalesce((select valor::numeric from public.configuracion where clave = 'tarifa_servicio_pct'), 0)
    into v_tar_monto, v_tar_pct;

  v_tarifa := greatest(0, v_tar_monto + round(v_subtotal * v_tar_pct / 100.0));

  v_envio := case when v_envio_free then 0 else v_comercio.costo_envio end;
  v_total := greatest(0, v_subtotal - v_descuento) + v_envio + v_tarifa;

  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del pedido' using errcode = 'P0001';
  end if;

  update public.pedidos set
    subtotal        = v_subtotal,
    descuento       = v_descuento,
    promo_label     = v_promo,
    cupon_codigo    = case when v_cupon.codigo is not null then v_cupon.codigo else null end,
    costo_envio     = v_envio,
    envio_gratis    = v_envio_free,
    tarifa_servicio = v_tarifa,
    total           = v_total,
    pago_label      = case p_metodo_pago
                        when 'efectivo'    then 'Efectivo'
                        when 'mercadopago' then 'Mercado Pago'
                        when 'debito'      then 'Tarjeta de débito'
                        when 'credito'     then 'Tarjeta de crédito'
                        else p_metodo_pago end,
    vuelto          = case when p_metodo_pago = 'efectivo' and p_efectivo_con is not null
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
