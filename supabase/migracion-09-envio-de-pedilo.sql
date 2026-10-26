-- ============================================================================
-- MIGRACIÓN 09 — el envío lo pone Pedilo, no el local
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- POR QUÉ
--
-- Hasta acá cada comercio escribía su costo de envío en un campo de "Mi local".
-- Eso tenía dos problemas.
--
-- Uno de plata: el envío no es del local. Pedilo pone el repartidor y Pedilo
-- cobra el envío (así quedó definido en la migración 08, donde los ingresos del
-- local son el subtotal y nada más). Que el local fije un precio que cobra otro
-- es una cuenta que no cierra.
--
-- Uno de producto: el envío real depende de cuánto tiene que viajar el
-- repartidor, no de la opinión del local. Eso es lo que viene: calcularlo por
-- distancia. Esta migración es el paso intermedio honesto — un solo número para
-- toda la plataforma, en un lugar donde se puede cambiar sin publicar la app.
--
-- QUÉ CAMBIA
--
--   * Aparece `configuracion.envio_base`.
--   * `crear_pedido` lo usa en lugar de `comercios.costo_envio`.
--   * La app dejó de mostrar el campo en el panel del comercio.
--
-- `comercios.costo_envio` NO se borra: los pedidos viejos se calcularon con ese
-- número y la columna sigue siendo el valor de reserva si algún día se saca la
-- fila de configuración. Deja de leerse, no deja de existir.
--
-- CUÁNTO PONER
--
-- El valor que se instala es 900. Cambiarlo es una línea, sin tocar la app:
--   update public.configuracion set valor = '1200' where clave = 'envio_base';
-- ============================================================================

insert into public.configuracion (clave, valor, descripcion)
values ('envio_base', '900',
        'Lo que paga el cliente por el envío, en pesos. Lo cobra Pedilo, que pone el repartidor. Provisorio hasta calcularlo por distancia.')
on conflict (clave) do nothing;

comment on column public.comercios.costo_envio is
  'Histórico. El envío sale de configuracion.envio_base; esta columna es sólo el valor de reserva.';

-- ============================================================================
-- crear_pedido: misma función, el envío sale de la configuración
--
-- El orden del coalesce importa. Si la fila de configuración está, manda ella;
-- si alguien la borra, se vuelve al número viejo del local antes que cobrar 0
-- por un viaje que igual hay que pagarle a alguien.
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
  v_envio_base  integer;
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
    cliente_id, comercio_id, subtotal, descuento, costo_envio, tarifa_servicio, total,
    direccion, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0, 0,
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

  v_envio  := case when v_envio_free then 0 else greatest(0, v_envio_base) end;
  v_total  := greatest(0, v_subtotal - v_descuento) + v_envio + v_tarifa;

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

revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) to authenticated;
