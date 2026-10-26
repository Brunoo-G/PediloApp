-- ============================================================================
-- MIGRACIÓN 11 — propinas, y hasta tres viajes a la vez
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- Va después de la 10.
--
-- QUÉ TRAE
--
--   1. `pedidos.propina` — el cliente la elige en el checkout.
--   2. `configuracion.reparto_pct_envio` — qué porcentaje del envío le queda al
--      repartidor.
--   3. `tomar_pedido` ahora deja tener hasta 3 viajes en curso.
--   4. `resumen_repartidor()` — lo que el repartidor ve en sus pantallas.
--
-- LA PROPINA ES DEL REPARTIDOR. TODA.
--
-- No es una decisión de diseño, es lo único honesto que se puede hacer con una
-- propina: el cliente la puso pensando en la persona que le tocó el timbre. Por
-- eso viaja en su propia columna en vez de sumarse al total y perderse:
--
--   * el local no la ve ni la cobra (`resumen_ventas` ya suma sólo subtotal);
--   * Pedilo no se queda con nada de ella;
--   * en un pedido en efectivo el repartidor ya la tiene en la mano, y en uno
--     con tarjeta se la debe Pedilo.
--
-- Va aparte del total también por una razón práctica: si mañana hay que
-- devolverle la plata a un cliente, el subtotal se devuelve y la propina de un
-- viaje ya hecho no.
--
-- POR QUÉ EL PORCENTAJE DEL ENVÍO ESTÁ EN `configuracion`
--
-- Porque es una decisión comercial que va a cambiar, y cambiarla no puede
-- requerir publicar la app. Arranca en 80: de cada $900 de envío, $720 son del
-- repartidor y $180 quedan en Pedilo. El número no está pensado, está puesto
-- para que se vea funcionando.
--
--   update public.configuracion set valor = '70' where clave = 'reparto_pct_envio';
-- ============================================================================

alter table public.pedidos
  add column if not exists propina integer not null default 0 check (propina >= 0);

comment on column public.pedidos.propina is
  'Propina para el repartidor, en pesos. Es toda suya: ni el local ni Pedilo tocan esta plata.';

insert into public.configuracion (clave, valor, descripcion)
values ('reparto_pct_envio', '80',
        'Qué % del envío le queda al repartidor. El resto queda en Pedilo. La propina no entra acá: esa es 100% suya.')
on conflict (clave) do nothing;

-- ============================================================================
-- crear_pedido: ahora recibe la propina
--
-- La propina se suma al total **al final**, después del descuento: un cupón del
-- 20% descuenta la comida, no lo que el cliente decidió darle al repartidor.
-- Tampoco entra en la base de la tarifa de servicio, por lo mismo.
-- ============================================================================

create or replace function public.crear_pedido(
  p_comercio_id  uuid,
  p_items        jsonb,
  p_direccion    text,
  p_telefono     text default '',
  p_metodo_pago  text default 'efectivo',
  p_nota         text default '',
  p_cupon        text default null,
  p_efectivo_con integer default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_propina      integer default 0
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
  v_envio_base  integer;
  v_envio_free  boolean := false;
  v_tarifa      integer := 0;
  v_tar_monto   integer;
  v_tar_pct     numeric;
  v_propina     integer := 0;
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

  select * into v_comercio from public.comercios where id = p_comercio_id;
  if not found or not v_comercio.aprobado then
    raise exception 'Ese local no está disponible' using errcode = 'P0001';
  end if;
  if not v_comercio.abierto then
    raise exception 'El local cerró mientras armabas el pedido' using errcode = 'P0001';
  end if;

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

  insert into public.pedidos (
    cliente_id, comercio_id, subtotal, descuento, costo_envio, tarifa_servicio, propina, total,
    direccion, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0, 0, 0,
    p_direccion, coalesce(p_telefono, ''), coalesce(p_nota, ''), p_metodo_pago, '', p_efectivo_con
  ) returning * into v_pedido;

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
  end if;

  select coalesce((select valor::integer from public.configuracion where clave = 'tarifa_servicio_monto'), 0),
         coalesce((select valor::numeric from public.configuracion where clave = 'tarifa_servicio_pct'), 0)
    into v_tar_monto, v_tar_pct;

  v_tarifa := greatest(0, v_tar_monto + round(v_subtotal * v_tar_pct / 100.0));

  select coalesce((select valor::integer from public.configuracion where clave = 'envio_base'),
                  v_comercio.costo_envio,
                  0)
    into v_envio_base;

  v_envio := case when v_envio_free then 0 else greatest(0, v_envio_base) end;

  -- Un tope para que un dedo pesado en "Otro" no arme un pedido de un millón de
  -- pesos sin querer. No es una regla de negocio, es un cinturón de seguridad.
  v_propina := least(greatest(0, coalesce(p_propina, 0)), 100000);

  v_total := greatest(0, v_subtotal - v_descuento) + v_envio + v_tarifa + v_propina;

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
    propina         = v_propina,
    total           = v_total,
    pago_label      = case p_metodo_pago
                        when 'efectivo' then 'Efectivo'
                        when 'debito'   then 'Tarjeta de débito'
                        when 'credito'  then 'Tarjeta de crédito'
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

revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision, integer) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision, integer) to authenticated;

-- La versión vieja de 10 parámetros queda colgada y PostgREST no sabría cuál
-- elegir si la app manda los 10. Se borra: la nueva hace lo mismo, con la
-- propina en 0 por defecto.
drop function if exists public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision);

-- ============================================================================
-- HASTA TRES VIAJES
--
-- Antes era uno. Tres es el número que el dueño del producto eligió, y tiene
-- sentido: con uno solo, un repartidor que pasa por la puerta de un local con
-- otro pedido listo no lo puede levantar, y el viaje se hace igual.
--
-- El tope cuenta **viajes en curso**, no viajes por tanda: apenas entrega uno,
-- se le libera un lugar. Un repartidor con dos entregados y uno en la mano
-- puede tomar dos más ahora mismo, en vez de tener que terminar la tanda.
-- ============================================================================

create or replace function public.tomar_pedido(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_rol     rol_usuario;
  v_pedido  public.pedidos;
  v_encurso integer;
  v_tope    constant integer := 3;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  v_rol := public.mi_rol();
  if v_rol not in ('repartidor', 'admin') then
    raise exception 'Sólo un repartidor puede tomar pedidos' using errcode = 'P0001';
  end if;

  select count(*) into v_encurso
    from public.pedidos
   where repartidor_id = v_usuario
     and estado in ('Listo', 'En camino');

  if v_encurso >= v_tope then
    raise exception 'Ya tenés % pedidos en curso. Entregá alguno antes de tomar otro.', v_tope
      using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  if v_pedido.estado <> 'Listo' then
    raise exception 'Ese pedido todavía no está listo para retirar' using errcode = 'P0001';
  end if;

  if v_pedido.repartidor_id is not null then
    raise exception 'Otro repartidor lo tomó primero' using errcode = 'P0001';
  end if;

  update public.pedidos
     set repartidor_id = v_usuario
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.tomar_pedido(uuid) from public;
grant execute on function public.tomar_pedido(uuid) to authenticated;

-- ============================================================================
-- LO QUE EL REPARTIDOR TIENE QUE COBRAR
--
-- Se calcula en el servidor y no en la app por una razón concreta: la app se
-- trae como mucho 50 entregas para armar la lista, y sumar sobre esas 50 daría
-- un total que se queda corto justo cuando más importa, que es cuando el
-- repartidor lleva muchos viajes.
--
-- `p_dias` null = desde siempre. Es lo que usa la pantalla de perfil.
--
-- OJO CON "SALDO A PAGAR": hoy es **todo lo acumulado**, no lo pendiente. No
-- existe todavía la liquidación —nada marca un pago como hecho—, así que este
-- número sólo sube. Cuando haya que pagarles de verdad hace falta una tabla de
-- pagos y restar lo ya liquidado.
-- ============================================================================

create or replace function public.resumen_repartidor(p_dias integer default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_desde   timestamptz;
  v_pct     numeric;
  v_r       record;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  v_desde := case when p_dias is null then '-infinity'::timestamptz
                  else date_trunc('day', now()) - make_interval(days => greatest(0, p_dias - 1)) end;

  select coalesce((select valor::numeric from public.configuracion where clave = 'reparto_pct_envio'), 0)
    into v_pct;

  select count(*)                                             as entregas,
         coalesce(sum(propina), 0)                            as propinas,
         coalesce(sum(costo_envio), 0)                        as envios,
         coalesce(sum(round(costo_envio * v_pct / 100.0)), 0) as parte_envios
    into v_r
    from public.pedidos
   where repartidor_id = v_usuario
     and estado = 'Entregado'
     and coalesce(entregado_en, creado_en) >= v_desde;

  return jsonb_build_object(
    'desde',        case when p_dias is null then null else v_desde end,
    'dias',         p_dias,
    'entregas',     v_r.entregas,
    'propinas',     v_r.propinas,
    'envios',       v_r.envios,
    'pct_envio',    v_pct,
    'parte_envios', v_r.parte_envios,
    -- Lo que Pedilo le debe: su parte del envío más la propina entera.
    'saldo',        v_r.parte_envios + v_r.propinas
  );
end $$;

revoke all on function public.resumen_repartidor(integer) from public;
grant execute on function public.resumen_repartidor(integer) to authenticated;
