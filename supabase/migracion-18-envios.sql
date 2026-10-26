-- ============================================================================
-- MIGRACIÓN 18 — Envíos: mandar una cosa de un punto a otro
--
-- Correr en Supabase → SQL Editor. Es idempotente. Va después de la 17.
--
-- QUÉ ES
--
-- Un servicio nuevo, al lado del delivery: alguien pide un repartidor para
-- llevar algo de una dirección a otra. No hay local, no hay carta, no hay
-- productos. Hay dos paradas y una descripción de qué se lleva.
--
-- POR QUÉ VA EN `pedidos` Y NO EN UNA TABLA NUEVA
--
-- Porque para el repartidor es lo mismo: un viaje con dos paradas, que se toma,
-- se retira y se entrega. Todo lo que ya está construido alrededor de `pedidos`
-- sirve tal cual:
--
--   * el chat (`mensajes.pedido_id` y `participa_del_pedido`),
--   * la máquina de estados (`cambiar_estado_pedido`),
--   * el tope de tres viajes a la vez (`tomar_pedido`),
--   * lo que gana el repartidor (`resumen_repartidor`),
--   * el realtime que ya escucha la tabla.
--
-- Una tabla `envios` aparte habría obligado a duplicar las seis cosas, y a que
-- el tope de tres viajes contara mal desde el primer día: tres pedidos más tres
-- envíos son seis viajes, no tres.
--
-- La diferencia es de PRODUCTO, no de datos, y ahí sí se nota: el cliente y el
-- repartidor los ven en pestañas distintas, con otro color y otro nombre.
--
-- QUÉ LOS DISTINGUE EN LA BASE
--
--   tipo = 'envio'      · comercio_id NULL · sin `pedido_items`
--   tipo = 'delivery'   · comercio_id con local · con `pedido_items`
--
-- Y el punto de retiro: para un delivery es la dirección del local; para un
-- envío la escribe el cliente, y por eso son columnas propias.
--
-- LOS ESTADOS
--
-- Un envío no pasa por la cocina, así que salta los estados del local:
--
--   Pendiente ──(un repartidor lo toma y retira)──> En camino ──> Entregado
--        │
--        └──(el cliente se arrepiente)──> Rechazado
--
-- "Rechazado" se reusa para la cancelación en lugar de agregar un estado nuevo.
-- No es sólo por ahorrar: `alter type ... add value` no se puede correr en la
-- misma transacción que el resto, y el editor de Supabase manda todo junto (es
-- la trampa que ya nos comimos con la migración 05a). El motivo queda escrito
-- en `motivo_rechazo`.
-- ============================================================================

-- ------------------------------------------------------------- columnas ----

alter table public.pedidos
  add column if not exists tipo text not null default 'delivery',
  add column if not exists retiro_direccion text,
  add column if not exists retiro_lat double precision,
  add column if not exists retiro_lng double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_tipo_valido') then
    alter table public.pedidos
      add constraint pedidos_tipo_valido check (tipo in ('delivery', 'envio'));
  end if;
end $$;

-- Un envío no tiene local. Hasta hoy la columna era obligatoria.
alter table public.pedidos alter column comercio_id drop not null;

comment on column public.pedidos.tipo is
  'delivery = pedido a un local. envio = el cliente manda algo de un punto a otro, sin local.';
comment on column public.pedidos.retiro_direccion is
  'De dónde se retira. Sólo para tipo=envio: en un delivery el punto de retiro es el local.';

-- Un envío sin dueño y esperando repartidor es lo que aparece en la bolsa.
create index if not exists envios_sin_repartidor_idx
  on public.pedidos (creado_en)
  where tipo = 'envio' and repartidor_id is null and estado = 'Pendiente';

-- Coherencia: que la base no deje entrar un envío sin punto de retiro ni un
-- delivery sin local. Es la clase de regla que si no está acá termina siendo
-- "me acordé de validarlo en dos de las tres pantallas".
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_forma_segun_tipo') then
    alter table public.pedidos add constraint pedidos_forma_segun_tipo check (
      (tipo = 'delivery' and comercio_id is not null)
      or (tipo = 'envio' and comercio_id is null and coalesce(retiro_direccion, '') <> '')
    );
  end if;
end $$;

-- ============================================================================
-- LA NOTA ARRANCA EL CHAT
--
-- Hasta ahora la nota del pedido era un texto que el repartidor leía en su
-- pantalla y no podía responder. Como mensaje, en cambio, queda dentro de la
-- conversación: el repartidor contesta "dale" y el cliente lo ve.
--
-- Se escribe con el rol del cliente y con su propio id, igual que si lo hubiera
-- tipeado en el chat, porque eso es exactamente lo que hizo.
-- ============================================================================

create or replace function public.nota_como_mensaje(p_pedido_id uuid, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_texto text := trim(coalesce(p_nota, ''));
begin
  if length(v_texto) = 0 then return; end if;

  insert into public.mensajes (pedido_id, autor_id, autor_rol, texto)
  values (p_pedido_id, auth.uid(), coalesce(public.mi_rol(), 'cliente'), left(v_texto, 1000));
end $$;

revoke all on function public.nota_como_mensaje(uuid, text) from public;

-- ============================================================================
-- CREAR UN ENVÍO
--
-- El precio lo pone el servidor, igual que en `crear_pedido` y por la misma
-- razón: la clave publicable viaja en el bundle de la app. Un envío cuesta lo
-- mismo que el envío de un pedido (`configuracion.envio_base`) más la tarifa de
-- servicio; el subtotal es cero porque no hay productos que cobrar.
-- ============================================================================

create or replace function public.crear_envio(
  p_retiro_direccion text,
  p_direccion        text,
  p_nota             text default '',
  p_metodo_pago      text default 'efectivo',
  p_retiro_lat       double precision default null,
  p_retiro_lng       double precision default null,
  p_lat              double precision default null,
  p_lng              double precision default null,
  p_efectivo_con     integer default null,
  p_propina          integer default 0
) returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario   uuid := auth.uid();
  v_anonimo   boolean;
  v_retiro    text;
  v_entrega   text;
  v_envio     integer;
  v_tarifa    integer;
  v_propina   integer;
  v_total     integer;
  v_pedido    public.pedidos;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión para pedir un envío' using errcode = 'P0001';
  end if;

  v_anonimo := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anonimo then
    raise exception 'Para pedir un envío hace falta una cuenta' using errcode = 'P0001';
  end if;

  v_retiro  := trim(coalesce(p_retiro_direccion, ''));
  v_entrega := trim(coalesce(p_direccion, ''));
  if length(v_retiro) < 5 then
    raise exception 'Falta la dirección de retiro' using errcode = 'P0001';
  end if;
  if length(v_entrega) < 5 then
    raise exception 'Falta la dirección de entrega' using errcode = 'P0001';
  end if;
  -- Mandar algo a la misma dirección de la que se retira no es un envío; es un
  -- error de tipeo que el repartidor descubre en la puerta.
  if lower(v_retiro) = lower(v_entrega) then
    raise exception 'El retiro y la entrega son la misma dirección' using errcode = 'P0001';
  end if;

  select coalesce((select valor::integer from public.configuracion where clave = 'envio_base'), 0),
         coalesce((select valor::integer from public.configuracion where clave = 'tarifa_servicio_monto'), 0)
    into v_envio, v_tarifa;

  v_envio   := greatest(0, v_envio);
  v_tarifa  := greatest(0, v_tarifa);
  v_propina := least(greatest(0, coalesce(p_propina, 0)), 100000);
  v_total   := v_envio + v_tarifa + v_propina;

  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del envío' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    cliente_id, comercio_id, tipo, estado,
    subtotal, descuento, costo_envio, tarifa_servicio, propina, total,
    retiro_direccion, retiro_lat, retiro_lng,
    direccion, lat, lng, telefono, nota,
    metodo_pago, pago_label, efectivo_con, vuelto
  ) values (
    v_usuario, null, 'envio', 'Pendiente',
    0, 0, v_envio, v_tarifa, v_propina, v_total,
    v_retiro, p_retiro_lat, p_retiro_lng,
    v_entrega, p_lat, p_lng, '', left(coalesce(p_nota, ''), 200),
    p_metodo_pago,
    case p_metodo_pago
      when 'efectivo' then 'Efectivo'
      when 'debito'   then 'Tarjeta de débito'
      when 'credito'  then 'Tarjeta de crédito'
      else p_metodo_pago end,
    p_efectivo_con,
    case when p_metodo_pago = 'efectivo' and p_efectivo_con is not null
         then p_efectivo_con - v_total else null end
  ) returning * into v_pedido;

  perform public.nota_como_mensaje(v_pedido.id, p_nota);

  return v_pedido;
end $$;

revoke all on function public.crear_envio(text, text, text, text, double precision, double precision, double precision, double precision, integer, integer) from public;
grant execute on function public.crear_envio(text, text, text, text, double precision, double precision, double precision, double precision, integer, integer) to authenticated;

-- ============================================================================
-- CANCELAR UN ENVÍO
--
-- Sólo el cliente, sólo su envío, y sólo mientras no lo tomó nadie. Una vez que
-- un repartidor lo agarró, cancelar sería dejarlo a mitad de camino sin
-- explicación; a partir de ahí se arregla por el chat.
-- ============================================================================

create or replace function public.cancelar_envio(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_pedido  public.pedidos;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese envío no existe' using errcode = 'P0001';
  end if;
  if v_pedido.cliente_id <> v_usuario then
    raise exception 'Ese envío no es tuyo' using errcode = 'P0001';
  end if;
  if v_pedido.tipo <> 'envio' then
    raise exception 'Esto no es un envío' using errcode = 'P0001';
  end if;
  if v_pedido.repartidor_id is not null or v_pedido.estado <> 'Pendiente' then
    raise exception 'Ya lo tomó un repartidor. Escribile por el chat.' using errcode = 'P0001';
  end if;

  update public.pedidos
     set estado = 'Rechazado', motivo_rechazo = 'Lo canceló el cliente'
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.cancelar_envio(uuid) from public;
grant execute on function public.cancelar_envio(uuid) to authenticated;

-- ============================================================================
-- TOMAR: ahora también envíos
--
-- Un envío está disponible apenas se crea (no hay local que lo prepare), así
-- que la condición deja de ser "estado = Listo" y pasa a depender del tipo.
-- El tope de tres viajes cuenta los dos juntos, a propósito: el repartidor
-- tiene una moto sola.
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

  -- Los viajes en curso son los dos tipos: un envío tomado ocupa lugar igual.
  select count(*) into v_encurso
    from public.pedidos
   where repartidor_id = v_usuario
     and estado in ('Pendiente', 'Listo', 'En camino');

  if v_encurso >= v_tope then
    raise exception 'Ya tenés % viajes en curso. Entregá alguno antes de tomar otro.', v_tope
      using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  if v_pedido.repartidor_id is not null then
    raise exception 'Otro repartidor lo tomó primero' using errcode = 'P0001';
  end if;

  if v_pedido.tipo = 'envio' then
    if v_pedido.estado <> 'Pendiente' then
      raise exception 'Ese envío ya no está disponible' using errcode = 'P0001';
    end if;
  else
    if v_pedido.estado <> 'Listo' then
      raise exception 'Ese pedido todavía no está listo para retirar' using errcode = 'P0001';
    end if;
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
-- SOLTAR: también un envío que todavía no retiró
--
-- La condición era "estado = Listo", que para un envío tomado nunca se cumple:
-- un envío queda en Pendiente hasta que el repartidor marca que lo retiró. Sin
-- esto, agarrar un envío por error era irreversible.
-- ============================================================================

create or replace function public.soltar_pedido(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_pedido  public.pedidos;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  if v_pedido.repartidor_id <> v_usuario and public.mi_rol() <> 'admin' then
    raise exception 'Ese pedido no es tuyo' using errcode = 'P0001';
  end if;

  -- Se puede soltar hasta el momento de retirarlo, no después.
  if v_pedido.estado <> (case when v_pedido.tipo = 'envio' then 'Pendiente' else 'Listo' end)::estado_pedido then
    raise exception 'Ya lo retiraste. Avisale a Pedilo si no lo podés entregar.'
      using errcode = 'P0001';
  end if;

  update public.pedidos
     set repartidor_id = null
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.soltar_pedido(uuid) from public;
grant execute on function public.soltar_pedido(uuid) to authenticated;

-- ============================================================================
-- ESTADOS: un envío salta la cocina
-- ============================================================================

create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado    text,
  p_motivo    text default null
) returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario   uuid := auth.uid();
  v_rol       rol_usuario;
  v_pedido    public.pedidos;
  v_es_dueno  boolean;
  v_nuevo     estado_pedido;
  v_ok        boolean;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  v_rol := public.mi_rol();
  v_es_dueno := v_pedido.comercio_id is not null and public.es_dueno(v_pedido.comercio_id);
  v_nuevo := p_estado::estado_pedido;

  if v_pedido.estado in ('Entregado', 'Rechazado') then
    raise exception 'El pedido ya está %, no se puede cambiar', v_pedido.estado using errcode = 'P0001';
  end if;

  -- ------------------------------------------------- quién puede qué ------
  if v_nuevo in ('Preparando', 'Listo', 'Rechazado') then
    if v_pedido.tipo = 'envio' then
      raise exception 'Un envío no pasa por el local' using errcode = 'P0001';
    end if;
    if not v_es_dueno and v_rol <> 'admin' then
      raise exception 'Sólo el local puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;

  elsif v_nuevo in ('En camino', 'Entregado') then
    if v_rol not in ('repartidor', 'admin') and not v_es_dueno then
      raise exception 'Sólo el repartidor puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;

    if v_rol = 'repartidor' then
      if v_pedido.repartidor_id is null then
        raise exception 'Primero tenés que tomar el pedido' using errcode = 'P0001';
      end if;
      if v_pedido.repartidor_id <> v_usuario then
        raise exception 'Ese pedido lo está llevando otro repartidor' using errcode = 'P0001';
      end if;
    end if;

  else
    raise exception 'Estado no válido: %', p_estado using errcode = 'P0001';
  end if;

  -- --------------------------------------------- transiciones permitidas ---
  if v_pedido.tipo = 'envio' then
    -- Pendiente -> En camino (lo retiró) -> Entregado. Nada más.
    v_ok := (v_pedido.estado = 'Pendiente'  and v_nuevo = 'En camino')
         or (v_pedido.estado = 'En camino' and v_nuevo = 'Entregado');
  else
    v_ok := (v_pedido.estado = 'Pendiente'  and v_nuevo in ('Preparando', 'Rechazado'))
         or (v_pedido.estado = 'Preparando' and v_nuevo in ('Listo', 'Rechazado'))
         or (v_pedido.estado = 'Listo'      and v_nuevo = 'En camino')
         or (v_pedido.estado = 'En camino'  and v_nuevo = 'Entregado');
  end if;

  if not v_ok then
    raise exception 'No se puede pasar de % a %', v_pedido.estado, v_nuevo using errcode = 'P0001';
  end if;

  if v_nuevo = 'Rechazado' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Para rechazar hay que poner un motivo' using errcode = 'P0001';
  end if;

  update public.pedidos set
    estado         = v_nuevo,
    motivo_rechazo = case when v_nuevo = 'Rechazado' then left(trim(p_motivo), 200) else motivo_rechazo end,
    aceptado_en    = case when v_nuevo = 'Preparando' then now() else aceptado_en end,
    listo_en       = case when v_nuevo = 'Listo'      then now() else listo_en end,
    retirado_en    = case when v_nuevo = 'En camino'  then now() else retirado_en end,
    entregado_en   = case when v_nuevo = 'Entregado'  then now() else entregado_en end
  where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.cambiar_estado_pedido(uuid, text, text) from public;
grant execute on function public.cambiar_estado_pedido(uuid, text, text) to authenticated;

-- ============================================================================
-- QUIÉN VE QUÉ
--
-- Se agrega la bolsa de envíos: un repartidor ve los envíos que nadie tomó.
-- Lo demás queda igual.
-- ============================================================================

drop policy if exists pedidos_ver on public.pedidos;
create policy pedidos_ver on public.pedidos for select using (
  cliente_id = auth.uid()
  or (comercio_id is not null and public.es_dueno(comercio_id))
  or repartidor_id = auth.uid()
  or (repartidor_id is null and estado = 'Listo' and tipo = 'delivery' and public.mi_rol() = 'repartidor')
  or (repartidor_id is null and estado = 'Pendiente' and tipo = 'envio' and public.mi_rol() = 'repartidor')
);

-- ============================================================================
-- Y LA NOTA DEL PEDIDO NORMAL TAMBIÉN ARRANCA EL CHAT
--
-- Mismo cuerpo que la migración 14, con una línea más al final. Se repite
-- entera porque `create or replace function` no sabe de parches.
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

  v_anonimo := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anonimo then
    raise exception 'Para pedir hace falta una cuenta' using errcode = 'P0001';
  end if;

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
    cliente_id, comercio_id, tipo, subtotal, descuento, costo_envio, tarifa_servicio, propina, total,
    direccion, lat, lng, telefono, nota, metodo_pago, pago_label, efectivo_con
  ) values (
    v_usuario, p_comercio_id, 'delivery', 0, 0, 0, 0, 0, 0,
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

  -- La nota deja de ser un cartel y pasa a ser el primer mensaje del chat.
  perform public.nota_como_mensaje(v_pedido.id, p_nota);

  return v_pedido;
end $$;

revoke all on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision, integer) from public;
grant execute on function public.crear_pedido(uuid, jsonb, text, text, text, text, text, integer, double precision, double precision, integer) to authenticated;

-- ============================================================================
-- COMPROBARLO
--
--   select tipo, estado, count(*) from public.pedidos group by 1, 2;
--
-- Y en la app: pedir un envío desde la pestaña Envíos, verlo aparecer en la
-- pestaña Envíos del repartidor, tomarlo, marcar retirado y entregado. El chat
-- tiene que arrancar con la nota que escribió el cliente.
-- ============================================================================
