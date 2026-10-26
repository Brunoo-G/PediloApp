-- ============================================================================
-- MIGRACIÓN 22 — Categorías del local, aunque todavía no tengan productos
--
-- Hasta acá una categoría existía sólo porque algún producto la tenía escrita
-- en `productos.subcategoria`. Eso no alcanza para lo que pidió Bruno: que el
-- local pueda tocar "+" en el catálogo, crear "Congelados" y DESPUÉS cargarle
-- productos. Una categoría vacía no tenía dónde vivir.
--
-- Esta tabla guarda las categorías que el local creó a mano. El catálogo
-- muestra la unión de las dos cosas: las de esta tabla y las que salen de los
-- productos. Los productos siguen guardando el nombre en `subcategoria` como
-- siempre; no se toca nada de lo que lee el cliente.
--
-- Cada categoría puede tener su imagen: un dibujo elegido de la app o una
-- foto propia. Renombrar o borrar una categoría lo hace la app sobre los
-- productos (borrar NO borra productos: quedan en "Sin categoría").
--
-- Sólo el dueño del local la ve y la edita. El nombre no se repite dentro del
-- mismo local, sin importar mayúsculas ("Bebidas" y "bebidas" son la misma).
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create table if not exists public.comercio_categorias (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  nombre      text not null,
  -- La imagen de la tarjeta: un dibujo de la app (`icono`, p. ej. "bebidas")
  -- o una foto subida (`foto_url`). Las dos en null = la elige la app.
  icono       text,
  foto_url    text,
  orden       int  not null default 0,
  creado_en   timestamptz not null default now(),

  constraint categoria_nombre_largo check (length(trim(nombre)) between 2 and 40)
);

-- Por si la tabla se creó con una versión anterior de esta migración.
alter table public.comercio_categorias add column if not exists icono text;
alter table public.comercio_categorias add column if not exists foto_url text;

create unique index if not exists comercio_categorias_nombre_unico
  on public.comercio_categorias (comercio_id, lower(trim(nombre)));

alter table public.comercio_categorias enable row level security;

drop policy if exists categorias_ve_dueno on public.comercio_categorias;
create policy categorias_ve_dueno on public.comercio_categorias
  for select using (public.es_dueno(comercio_id));

drop policy if exists categorias_crea_dueno on public.comercio_categorias;
create policy categorias_crea_dueno on public.comercio_categorias
  for insert with check (public.es_dueno(comercio_id));

drop policy if exists categorias_edita_dueno on public.comercio_categorias;
create policy categorias_edita_dueno on public.comercio_categorias
  for update using (public.es_dueno(comercio_id)) with check (public.es_dueno(comercio_id));

drop policy if exists categorias_borra_dueno on public.comercio_categorias;
create policy categorias_borra_dueno on public.comercio_categorias
  for delete using (public.es_dueno(comercio_id));

revoke all on public.comercio_categorias from anon;
grant select, insert, update, delete on public.comercio_categorias to authenticated;

notify pgrst, 'reload schema';
