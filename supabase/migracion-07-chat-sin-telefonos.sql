-- ============================================================================
-- MIGRACIÓN 07 — chat por pedido, y se dejan de pedir teléfonos
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- POR QUÉ
--
-- Pedir el celular tenía dos problemas. Uno de producto: es un campo más en el
-- checkout, y cada campo del checkout es gente que no termina de pedir. Otro
-- más serio: guardar el celular de cada cliente y de cada local es guardar un
-- dato personal que después hay que cuidar, y que no hacía falta para nada
-- salvo "llamar si pasa algo".
--
-- "Llamar si pasa algo" ahora es un chat pegado al pedido, **entre el cliente y
-- el repartidor**. Queda escrito quién dijo qué, nadie tiene que dar su número
-- a un desconocido, y el repartidor puede avisar "estoy en la puerta" o
-- preguntar "¿qué timbre?" sin llamar.
--
-- EL LOCAL NO ESTÁ EN EL CHAT
--
-- Es a propósito. El local ya tiene lo que necesita del pedido (qué preparar y
-- las notas de cada producto) y su canal es el estado: acepta, marca listo o
-- rechaza con motivo. Meterlo en la conversación sería darle una bandeja de
-- mensajes más para atender en plena cocina.
--
-- La consecuencia hay que tenerla presente: mientras el pedido está Pendiente,
-- Preparando o Listo **todavía no hay repartidor asignado**, así que no hay con
-- quién hablar. La app lo dice en vez de mostrar un cuadro de texto que no le
-- llega a nadie.
--
-- LAS COLUMNAS NO SE BORRAN
--
-- `pedidos.telefono` pasa a tener default '' y deja de pedirse. Las columnas
-- `perfiles.telefono` y `comercios.telefono` quedan donde están pero la app no
-- las escribe ni las muestra. Borrarlas de verdad rompería los pedidos viejos
-- que ya tienen el dato, y un `alter table drop column` sobre una tabla en uso
-- es de las pocas cosas que no se pueden deshacer.
--
-- Si más adelante querés borrar lo ya guardado, es una línea:
--   update perfiles set telefono = ''; update comercios set telefono = '';
-- ============================================================================

alter table public.pedidos alter column telefono set default '';
alter table public.pedidos alter column telefono drop not null;

comment on column public.pedidos.telefono is
  'Histórico. La app ya no lo pide: la comunicación va por el chat del pedido.';

-- ============================================================================
-- EL CHAT
--
-- Un hilo por pedido, sin tabla de conversaciones: el pedido ES la
-- conversación. Cuando el pedido termina, el hilo queda como parte del
-- documento histórico, que es exactamente lo que se quiere poder releer si
-- alguien reclama.
-- ============================================================================

create table if not exists public.mensajes (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  autor_id   uuid not null references public.perfiles(id) on delete cascade,
  -- Se guarda el rol del autor en el momento de escribir. Si mañana una
  -- persona cambia de rol, el mensaje viejo tiene que seguir diciendo desde
  -- qué lugar del mostrador se escribió.
  autor_rol  rol_usuario not null,
  texto      text not null check (char_length(trim(texto)) between 1 and 1000),
  creado_en  timestamptz not null default now()
);

create index if not exists mensajes_pedido_idx on public.mensajes (pedido_id, creado_en);

alter table public.mensajes enable row level security;

-- Quién participa de la conversación: el cliente y el repartidor asignado.
-- El local NO, ni para leer: no es su canal, y la dirección y el teléfono de
-- un cliente no tienen por qué pasar por una charla que el comercio pueda ver.
create or replace function public.participa_del_pedido(p_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pedidos p
     where p.id = p_id
       and (p.cliente_id = auth.uid() or p.repartidor_id = auth.uid())
  ) or public.mi_rol() = 'admin';
$$;

drop policy if exists mensajes_ver on public.mensajes;
create policy mensajes_ver on public.mensajes for select
  using (public.participa_del_pedido(pedido_id));

-- Escribir: hay que participar del pedido Y firmar con el propio usuario.
-- Sin la segunda condición, cualquiera de los dos podría mandar un mensaje
-- haciéndose pasar por el otro.
drop policy if exists mensajes_escribir on public.mensajes;
create policy mensajes_escribir on public.mensajes for insert to authenticated
  with check (
    autor_id = auth.uid()
    and autor_rol = public.mi_rol()
    and public.participa_del_pedido(pedido_id)
  );

-- No hay update ni delete a propósito: un chat que se puede editar después no
-- sirve para resolver un "yo te avisé".

-- ------------------------------------------------------------- realtime ----
-- Sin esto el mensaje aparece recién cuando la otra parte recarga, que para un
-- chat es lo mismo que no tenerlo.

alter table public.mensajes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes'
  ) then
    alter publication supabase_realtime add table public.mensajes;
  end if;
exception when undefined_object then
  raise notice 'No hay publicación supabase_realtime; salteado.';
end $$;

-- ------------------------------------------------- crear_pedido sin teléfono
-- Misma función, con p_telefono opcional. Se deja el parámetro para no romper
-- las versiones viejas de la app que todavía lo manden.

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
  v_envio  := case when v_envio_free then 0 else v_comercio.costo_envio end;
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
