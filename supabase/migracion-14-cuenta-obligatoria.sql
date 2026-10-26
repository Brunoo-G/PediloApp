-- ============================================================================
-- MIGRACIÓN 14 — para pedir hace falta cuenta y dirección
--
-- Correr en Supabase → SQL Editor. Es idempotente. Va después de la 13.
--
-- QUÉ CAMBIA
--
--   1. Para pedir hay que tener una cuenta de verdad. Se terminan los pedidos
--      hechos con sesión anónima.
--   2. La dirección de entrega es obligatoria y tiene un mínimo de largo.
--   3. El pedido guarda el punto exacto (lat/lng) de la entrega.
--
-- POR QUÉ LA REGLA VA ACÁ Y NO SÓLO EN LA APP
--
-- Porque la app se puede saltear. La clave publicable viaja en el bundle, así
-- que cualquiera puede llamar a `crear_pedido` desde una consola con una sesión
-- anónima. Si la única validación fuera la pantalla, la regla sería una
-- sugerencia. Acá es una regla.
--
-- La app igual la repite, pero para otra cosa: para no dejar que alguien llene
-- un carrito y se entere recién al final de que necesitaba cuenta.
--
-- EL PUNTO EXACTO
--
-- `pedidos.lat/lng` no es lo mismo que `perfiles.lat/lng`. El perfil guarda
-- dónde vive la persona **hoy**; el pedido tiene que guardar a dónde se llevó
-- **ese** pedido. Si alguien se muda, los pedidos viejos no pueden cambiar de
-- destino: un pedido es un documento histórico.
--
-- Sirve para algo concreto: el repartidor abre el mapa en el punto exacto en
-- lugar de buscar un texto. "Av. Siempreviva 742, 3º B" buscado como texto
-- puede caer a tres cuadras; una coordenada cae donde hay que tocar el timbre.
--
-- LAS SESIONES ANÓNIMAS NO SE APAGAN
--
-- A propósito. Los usuarios anónimos que ya existen tienen pedidos en el
-- historial, y Supabase permite **vincular** una cuenta de Google a un usuario
-- anónimo existente (`linkIdentity`), que conserva ese historial. Apagarlas de
-- entrada dejaría a esa gente sin forma de recuperar lo suyo.
-- ============================================================================

alter table public.pedidos
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.pedidos.lat is
  'Punto exacto de la entrega, congelado al momento del pedido. No se actualiza si el cliente se muda.';

-- ============================================================================
-- crear_pedido: cuenta real + dirección + punto
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
  v_anonimo     boolean;
  v_direccion   text;
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

  -- Una sesión anónima ya no alcanza para pedir. El dato está en el token:
  -- Supabase pone `is_anonymous` en el JWT de las sesiones anónimas.
  v_anonimo := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anonimo then
    raise exception 'Para pedir hace falta una cuenta' using errcode = 'P0001';
  end if;

  -- La dirección es obligatoria. El mínimo de 5 no pretende validar que exista
  -- —eso no lo puede saber la base— sino frenar el "asd" y el espacio solo.
  v_direccion := trim(coalesce(p_direccion, ''));
  if length(v_direccion) < 5 then
    raise exception 'Falta la dirección de entrega' using errcode = 'P0001';
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
    direccion, lat, lng, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 0, 0, 0, 0, 0, 0,
    v_direccion, p_lat, p_lng, coalesce(p_telefono, ''), coalesce(p_nota, ''),
    p_metodo_pago, '', p_efectivo_con
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

  v_envio   := case when v_envio_free then 0 else greatest(0, v_envio_base) end;
  v_propina := least(greatest(0, coalesce(p_propina, 0)), 100000);
  v_total   := greatest(0, v_subtotal - v_descuento) + v_envio + v_tarifa + v_propina;

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

-- ============================================================================
-- EL PERFIL SE CREA SOLO AL ENTRAR CON GOOGLE
--
-- Sin esto, quien entra con Google queda con sesión pero sin fila en
-- `perfiles`, y la app no sabría ni cómo se llama. El trigger lo crea con lo
-- que Google mandó en el token —nombre y mail— y deja la dirección vacía, que
-- es justamente lo que la app le va a pedir en el primer paso.
--
-- `on conflict do nothing`: si la fila ya existe (un anónimo que vinculó su
-- cuenta de Google) no se pisa nada, y menos el rol — un comercio que algún día
-- entre con Google no puede volverse cliente por un trigger.
-- ============================================================================

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.perfiles (id, rol, nombre, email)
  values (
    new.id,
    'cliente',
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- Y para los que ya entraron antes de que existiera el trigger.
insert into public.perfiles (id, rol, nombre, email)
select u.id,
       'cliente',
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
       coalesce(u.email, '')
  from auth.users u
 where not exists (select 1 from public.perfiles p where p.id = u.id)
on conflict (id) do nothing;
