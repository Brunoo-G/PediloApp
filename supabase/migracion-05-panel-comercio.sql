-- ============================================================================
-- MIGRACIÓN 05 — panel del comercio, roles y repartidores
--
-- Correr en Supabase → SQL Editor, DESPUÉS de migracion-05a-estados.sql y en
-- una ejecución aparte. Es idempotente.
--
-- QUÉ RESUELVE
--
-- Hasta acá el pedido se creaba y no le llegaba a nadie. Esta migración pone
-- del otro lado del mostrador: quién es el comercio, qué puede hacer con un
-- pedido, y por dónde pasa el pedido hasta la puerta del cliente.
--
-- LOS ESTADOS
--
--   Pendiente   el comercio todavía no lo vio
--   Preparando  el comercio lo aceptó y lo está haciendo
--   Listo       está listo, esperando que lo retire el repartidor   ← NUEVO
--   En camino   el repartidor lo retiró
--   Entregado   llegó
--   Rechazado   el comercio no lo tomó (siempre con motivo)
--
-- "Listo" es nuevo porque Pedilo entrega con repartidores propios: hay un
-- momento real en que la comida está pronta y todavía no la levantó nadie, y
-- sin ese estado el comercio no tiene cómo avisar que ya puede pasar el cadete.
--
-- LOS REPARTIDORES
--
-- La pantalla del repartidor viene después, pero la base la prevé desde ahora:
-- agregar una columna a una tabla vacía cuesta nada, y hacerlo cuando ya hay
-- pedidos reales obliga a decidir qué pasa con los viejos.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN UPDATE SUELTO
--
-- El cambio de estado no es "escribir una columna": es una máquina de estados.
-- De Pendiente se puede ir a Preparando o a Rechazado, nunca a Entregado.
-- Un rechazo necesita motivo. Sólo el comercio acepta, sólo el repartidor
-- marca En camino. Si eso lo decide la app, alcanza con abrir la consola del
-- navegador para marcar un pedido como entregado sin haberlo entregado.
-- Por eso va todo en `cambiar_estado_pedido`, del lado del servidor.
-- ============================================================================

-- ------------------------------------------------- antes de empezar --------
-- Los valores nuevos de los enums viven en migracion-05a-estados.sql y tienen
-- que estar COMMITEADOS antes de llegar acá. Si falta alguno, este bloque lo
-- dice con todas las letras en vez de dejar un error de Postgres a medio
-- camino y la base a mitad de camino.

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'estado_pedido' and e.enumlabel = 'Listo')
     or not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                     where t.typname = 'rol_usuario' and e.enumlabel = 'repartidor') then
    raise exception 'Primero corré migracion-05a-estados.sql (y dejá que termine), después este archivo.';
  end if;
end $$;

-- -------------------------------------------------------------- pedidos ----

alter table public.pedidos
  add column if not exists repartidor_id uuid references public.perfiles(id) on delete set null;

-- Marcas de tiempo. No son adorno: con esto se contesta "cuánto tardó el local
-- en aceptar" y "cuánto estuvo la comida esperando al cadete", que es lo que
-- después permite prometer un tiempo de entrega que se cumpla.
alter table public.pedidos add column if not exists aceptado_en  timestamptz;
alter table public.pedidos add column if not exists listo_en     timestamptz;
alter table public.pedidos add column if not exists retirado_en  timestamptz;
alter table public.pedidos add column if not exists entregado_en timestamptz;

comment on column public.pedidos.repartidor_id is
  'Quién lo lleva. NULL mientras nadie lo tomó.';

create index if not exists pedidos_repartidor_idx on public.pedidos (repartidor_id, creado_en desc);

-- Los pedidos que el comercio tiene que mirar ahora. La lista del panel entra
-- por acá, así que conviene que sea un índice y no un scan.
-- Se define por descarte y no listando los estados activos: así el predicado
-- no nombra 'Listo' y el índice sigue sirviendo si mañana aparece un estado
-- nuevo en el medio.
create index if not exists pedidos_pendientes_idx on public.pedidos (comercio_id, creado_en desc)
  where estado not in ('Entregado', 'Rechazado');

-- ------------------------------------------------------------- permisos ----

create or replace function public.mi_rol()
returns rol_usuario
language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), 'cliente'::rol_usuario);
$$;

-- El comercio necesita ver los renglones del pedido (qué preparar) y el
-- repartidor también (para controlar la entrega). La política vieja sólo
-- contemplaba cliente y comercio.
drop policy if exists items_ver on public.pedido_items;
create policy items_ver on public.pedido_items for select using (
  exists (
    select 1 from public.pedidos p
     where p.id = pedido_id
       and (p.cliente_id = auth.uid()
            or public.es_dueno(p.comercio_id)
            or p.repartidor_id = auth.uid())
  )
);

drop policy if exists pedidos_ver on public.pedidos;
create policy pedidos_ver on public.pedidos for select using (
  cliente_id = auth.uid()
  or public.es_dueno(comercio_id)
  or repartidor_id = auth.uid()
  -- Un repartidor libre ve lo que está listo y todavía no tomó nadie: es la
  -- bolsa de trabajo. Sin esto no tendría cómo elegir un pedido.
  or (repartidor_id is null and estado = 'Listo' and public.mi_rol() = 'repartidor')
);

-- El estado ya no se cambia con un update directo: se cambia con la función de
-- abajo, que es la única que conoce las reglas. Sacamos la política vieja.
drop policy if exists pedidos_estado on public.pedidos;

-- El comercio sí puede editar su propia ficha y su carta desde el panel; eso
-- ya estaba contemplado en las políticas de `comercios` y `productos`.

-- ------------------------------------------------- cambiar_estado_pedido ---

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
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  v_rol := public.mi_rol();
  v_es_dueno := public.es_dueno(v_pedido.comercio_id);
  v_nuevo := p_estado::estado_pedido;

  -- Un pedido terminado no se reabre. Si el comercio se equivocó, se arregla
  -- por teléfono, no cambiando la historia.
  if v_pedido.estado in ('Entregado', 'Rechazado') then
    raise exception 'El pedido ya está %, no se puede cambiar', v_pedido.estado using errcode = 'P0001';
  end if;

  -- ------------------------------------------------- quién puede qué ------
  if v_nuevo in ('Preparando', 'Listo', 'Rechazado') then
    if not v_es_dueno and v_rol <> 'admin' then
      raise exception 'Sólo el local puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;

  elsif v_nuevo in ('En camino', 'Entregado') then
    if v_rol not in ('repartidor', 'admin') and not v_es_dueno then
      raise exception 'Sólo el repartidor puede marcar el pedido como %', v_nuevo using errcode = 'P0001';
    end if;
    -- Un repartidor sólo toca lo suyo, o toma uno que esté libre.
    if v_rol = 'repartidor'
       and v_pedido.repartidor_id is not null
       and v_pedido.repartidor_id <> v_usuario then
      raise exception 'Ese pedido lo está llevando otro repartidor' using errcode = 'P0001';
    end if;

  else
    raise exception 'Estado no válido: %', p_estado using errcode = 'P0001';
  end if;

  -- --------------------------------------------- transiciones permitidas ---
  if not (
       (v_pedido.estado = 'Pendiente'  and v_nuevo in ('Preparando', 'Rechazado'))
    or (v_pedido.estado = 'Preparando' and v_nuevo in ('Listo', 'Rechazado'))
    or (v_pedido.estado = 'Listo'      and v_nuevo = 'En camino')
    or (v_pedido.estado = 'En camino'  and v_nuevo = 'Entregado')
  ) then
    raise exception 'No se puede pasar de % a %', v_pedido.estado, v_nuevo using errcode = 'P0001';
  end if;

  -- Rechazar sin decir por qué deja al cliente sin nada que hacer con la
  -- información. El motivo es obligatorio.
  if v_nuevo = 'Rechazado' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Para rechazar hay que poner un motivo' using errcode = 'P0001';
  end if;

  update public.pedidos set
    estado         = v_nuevo,
    motivo_rechazo = case when v_nuevo = 'Rechazado' then left(trim(p_motivo), 200) else motivo_rechazo end,
    -- El repartidor queda pegado al pedido en el momento en que lo levanta.
    repartidor_id  = case when v_nuevo = 'En camino' and v_rol = 'repartidor'
                          then v_usuario else repartidor_id end,
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

-- ------------------------------------------------- alta de un comercio -----
-- Los comercios no se auto-registran: el equipo crea la cuenta y la vincula.
-- Esto es para correr a mano desde el SQL Editor, una vez por local:
--
--   1. Authentication → Users → Add user → email y contraseña del local
--   2. Acá: select public.vincular_comercio('local@mail.com', 'Burger Bros');
--
-- Deja el perfil con rol 'comercio' y lo pone como dueño del local.

create or replace function public.vincular_comercio(p_email text, p_nombre_local text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_usuario uuid; v_comercio public.comercios;
begin
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    return 'No existe ningún usuario con el mail ' || p_email ||
           '. Crealo primero en Authentication → Users → Add user.';
  end if;

  select * into v_comercio from public.comercios where nombre = p_nombre_local;
  if not found then
    return 'No existe ningún local que se llame "' || p_nombre_local || '".';
  end if;

  -- El perfil puede no existir todavía si el usuario nunca entró a la app.
  insert into public.perfiles (id, rol, email)
  values (v_usuario, 'comercio', lower(trim(p_email)))
  on conflict (id) do update set rol = 'comercio';

  update public.comercios set dueno_id = v_usuario where id = v_comercio.id;

  return 'Listo: ' || p_email || ' ahora administra ' || v_comercio.nombre ||
         '. Puede entrar a la app con ese mail y su contraseña.';
end $$;

revoke all on function public.vincular_comercio(text, text) from public;

-- ------------------------------------------------------------- realtime ----
-- Sin esto el panel no se entera de nada: Supabase no publica los cambios de
-- una tabla hasta que se la agrega a mano a la publicación. Es el error
-- clásico de "el realtime no anda" cuando el código está bien.
--
-- REPLICA IDENTITY FULL hace que el evento traiga la fila entera y no sólo la
-- clave. La app actualiza la tarjeta con lo que viene en el mensaje; sin esto
-- tendría que volver a consultar la base en cada cambio.

alter table public.pedidos replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
exception when undefined_object then
  -- La publicación no existe (Postgres suelto, no Supabase). No es un error.
  raise notice 'No hay publicación supabase_realtime; salteado.';
end $$;
