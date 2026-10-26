-- ============================================================================
-- MIGRACIÓN 02 — crear pedidos del lado del servidor
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- POR QUÉ ESTO EXISTE
--
-- Hasta acá la app podía insertar el pedido directamente. El problema es que la
-- clave `sb_publishable_` viaja dentro del bundle: cualquiera puede abrir la
-- consola del navegador y mandar un insert con total = 1. RLS controla QUIÉN
-- escribe, no QUÉ escribe.
--
-- Con esta función el cliente ya no manda precios. Manda qué productos quiere y
-- cuántos; el servidor busca los precios en el catálogo, aplica las promos,
-- calcula el total y recién ahí crea el pedido. Un total falseado deja de ser
-- posible porque el cliente nunca lo elige.
--
-- Además hace todo en una sola transacción: o se crea el pedido con todos sus
-- renglones, o no se crea nada. Insertando por separado desde la app, un corte
-- de red en el medio dejaba pedidos vacíos en la base.
--
-- Y valida lo que la interfaz ya valida, pero del lado que no se puede saltear:
-- que el local exista, esté aprobado y abierto; que los productos sean de ESE
-- local y estén activos; y que la dirección esté dentro del radio de entrega.
-- ============================================================================

-- Distancia en kilómetros entre dos puntos (haversine).
-- Es la misma fórmula que usa la app en src/lib/geo.ts: si alguna vez cambia
-- una, hay que cambiar la otra.
create or replace function public.distancia_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------
-- crear_pedido
--
-- p_items es un JSON así:
--   [{"producto_id": "uuid", "cantidad": 2, "nota": "sin cebolla"}, ...]
--
-- Devuelve el pedido creado.
-- ---------------------------------------------------------------------------
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
security definer          -- necesita leer precios y cupones sin depender del RLS del cliente
set search_path = public
as $$
declare
  v_usuario     uuid := auth.uid();
  v_comercio    public.comercios;
  v_radio       numeric;
  v_distancia   double precision;
  v_subtotal    integer := 0;
  v_descuento   integer := 0;
  v_promo       text;
  v_cupon_pct   smallint;
  v_mp_pct      smallint := 15;   -- descuento por pagar con Mercado Pago
  v_mejor_pct   smallint := 0;
  v_envio       integer;
  v_envio_free  boolean;
  v_min_free    integer := 5000;
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
  -- Sólo se valida si tenemos las dos coordenadas. Sin datos no se bloquea a
  -- nadie: puede ser un local viejo al que todavía no le cargaron el pin.
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
  -- Se crea primero con totales en cero y se corrigen al final: los renglones
  -- necesitan el id del pedido para existir.
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
       and comercio_id = p_comercio_id      -- no se puede colar un producto de otro local
       and activo;

    if not found then
      raise exception 'Uno de los productos ya no está disponible' using errcode = 'P0001';
    end if;

    select url into v_foto
      from public.producto_fotos
     where producto_id = v_producto.id
     order by orden limit 1;

    -- Nombre y precio se COPIAN: el pedido es un documento histórico.
    insert into public.pedido_items (pedido_id, producto_id, nombre, precio, cantidad, foto_url, nota)
    values (v_pedido.id, v_producto.id, v_producto.nombre, v_producto.precio, v_cantidad, v_foto,
            left(coalesce(v_item->>'nota', ''), 140));

    v_subtotal := v_subtotal + v_producto.precio * v_cantidad;
  end loop;

  -- ------------------------------------------------------------ las promos --
  -- No se acumulan: se aplica la mejor. Misma regla que en src/lib/precios.ts.
  if p_cupon is not null and length(trim(p_cupon)) > 0 then
    select porcentaje into v_cupon_pct
      from public.cupones
     where codigo = upper(trim(p_cupon))
       and activo
       and (vence_el is null or vence_el > now())
       and (usos_max is null or usos < usos_max);

    if v_cupon_pct is not null and v_cupon_pct > v_mejor_pct then
      v_mejor_pct := v_cupon_pct;
      v_promo := upper(trim(p_cupon));
    end if;
  end if;

  if p_metodo_pago = 'mercadopago' and v_mp_pct > v_mejor_pct then
    v_mejor_pct := v_mp_pct;
    v_promo := 'Mercado Pago';
  end if;

  v_descuento  := round(v_subtotal * v_mejor_pct / 100.0);
  v_envio_free := v_subtotal >= v_min_free;
  v_envio      := case when v_envio_free then 0 else v_comercio.costo_envio end;
  v_total      := greatest(0, v_subtotal - v_descuento) + v_envio;

  -- El vuelto se calcula sobre el total real, no sobre el que mandó el cliente.
  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del pedido' using errcode = 'P0001';
  end if;

  update public.pedidos set
    subtotal     = v_subtotal,
    descuento    = v_descuento,
    promo_label  = case when v_mejor_pct > 0 then v_mejor_pct || '% OFF · ' || v_promo else null end,
    cupon_codigo = case when v_promo is not null and v_promo <> 'Mercado Pago' then v_promo else null end,
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

  -- Se cuenta el uso del cupón sólo si de verdad se aplicó.
  if v_pedido.cupon_codigo is not null then
    update public.cupones set usos = usos + 1 where codigo = v_pedido.cupon_codigo;
  end if;

  return v_pedido;
end $$;

-- Sólo usuarios con sesión (incluye las anónimas).
revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Con la función creada, la app ya no necesita insertar pedidos a mano.
-- Se quitan esos permisos: la única puerta de entrada es crear_pedido.
-- ---------------------------------------------------------------------------
drop policy if exists pedidos_crear on public.pedidos;
drop policy if exists items_crear   on public.pedido_items;
