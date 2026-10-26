-- ============================================================================
-- MIGRACIÓN 01 — coordenadas, zona de cobertura y notas por producto
--
-- Correr en Supabase → SQL Editor si ya cargaste schema.sql antes.
-- Si arrancás de cero, schema.sql ya incluye todo esto y esta migración no
-- hace falta (igual es idempotente, no rompe nada si la corrés).
--
-- Qué agrega y por qué:
--
-- 1. lat/lng en perfiles y comercios. Para limitar la distancia de envío no
--    alcanza con el texto de la dirección: hacen falta coordenadas en las dos
--    puntas. El texto sigue existiendo porque es lo que lee el repartidor
--    ("piso 4, depto B" no es una coordenada).
--
-- 2. Tabla `configuracion`. El radio de envío es global por ahora (la app se
--    prueba en una ciudad chica). Vive en la base y no en el código para poder
--    cambiarlo sin volver a publicar la app.
--
-- 3. `comercios.radio_envio_km` nullable. Hoy nadie lo usa: la app cae al radio
--    global. El día que un local necesite el suyo, se le carga y listo — sin
--    migración ni cambio de lógica.
--
-- 4. `pedido_items.nota`. "Sin cebolla" va pegado a la hamburguesa, no perdido
--    en una nota general del pedido. El comercio lo ve al lado del renglón.
-- ============================================================================

alter table public.perfiles  add column if not exists lat double precision;
alter table public.perfiles  add column if not exists lng double precision;

alter table public.comercios add column if not exists lat double precision;
alter table public.comercios add column if not exists lng double precision;

-- Override por local. NULL = usar el radio global de la plataforma.
alter table public.comercios add column if not exists radio_envio_km numeric(5,2)
  check (radio_envio_km is null or radio_envio_km > 0);

-- Nota por renglón del pedido, con el mismo tope que la nota general.
alter table public.pedido_items add column if not exists nota text not null default ''
  check (char_length(nota) <= 140);

-- ------------------------------- configuración -----------------------------

create table if not exists public.configuracion (
  clave       text primary key,
  valor       text not null,
  descripcion text not null default '',
  actualizado timestamptz not null default now()
);

insert into public.configuracion (clave, valor, descripcion) values
  ('radio_envio_km', '8', 'Hasta cuántos kilómetros del local se puede pedir. Es global mientras la app se pruebe en una ciudad chica; cada comercio puede tener el suyo en comercios.radio_envio_km.')
on conflict (clave) do nothing;

alter table public.configuracion enable row level security;

-- La configuración se lee desde la app; se escribe sólo desde el panel de Supabase.
drop policy if exists configuracion_lectura on public.configuracion;
create policy configuracion_lectura on public.configuracion for select using (true);

-- --------------------------- coordenadas de prueba -------------------------
-- Los locales del seed quedan repartidos alrededor del Obelisco para poder
-- probar el radio. Cuando cargues locales reales, pisá estos valores.

update public.comercios set lat = -34.6037 + (random() - 0.5) * 0.09,
                            lng = -58.3816 + (random() - 0.5) * 0.09
where dueno_id is null and lat is null;
