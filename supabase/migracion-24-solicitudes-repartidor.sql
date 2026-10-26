-- ============================================================================
-- MIGRACIÓN 24 — Solicitudes de repartidores
--
-- El equivalente de `solicitudes_comercio` para quien quiere repartir con
-- Pedilo. La app tiene el formulario en `/sumate-repartidor` (se llega desde
-- el ingreso al panel, con "Repartidor" elegido). El equipo lo ve en
-- Supabase → Table Editor → `solicitudes_repartidor`, lo evalúa, contacta y
-- crea la cuenta.
--
-- Cualquiera puede INSERTAR (no hace falta cuenta) pero nadie puede leer,
-- editar ni borrar desde la app: no hay políticas de select/update/delete.
-- No se pide DNI ni datos sensibles: eso se pide después, por fuera.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create table if not exists public.solicitudes_repartidor (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  email          text not null,
  telefono       text not null,
  zona           text not null,
  vehiculo       text not null,
  disponibilidad text[] not null default '{}',
  comentario     text not null default '',
  estado         estado_solicitud not null default 'nueva',
  notas_internas text not null default '',
  creado_en      timestamptz not null default now(),

  constraint sol_rep_nombre    check (length(trim(nombre)) between 2 and 80),
  constraint sol_rep_email     check (length(email) between 5 and 120),
  constraint sol_rep_telefono  check (telefono ~ '^[0-9]{10}$'),
  constraint sol_rep_zona      check (length(trim(zona)) between 2 and 120),
  constraint sol_rep_vehiculo  check (vehiculo in ('Moto', 'Bici', 'Auto', 'A pie')),
  constraint sol_rep_comentario check (length(comentario) <= 600)
);

alter table public.solicitudes_repartidor enable row level security;

drop policy if exists solicitudes_repartidor_crear on public.solicitudes_repartidor;
create policy solicitudes_repartidor_crear on public.solicitudes_repartidor
  for insert to anon, authenticated
  with check (estado = 'nueva' and notas_internas = '');

-- Supabase da todos los permisos por defecto: se sacan y se deja sólo insertar
-- las columnas del formulario (estado y notas internas quedan para el equipo).
revoke all on table public.solicitudes_repartidor from anon, authenticated;
grant insert (nombre, email, telefono, zona, vehiculo, disponibilidad, comentario)
  on public.solicitudes_repartidor to anon, authenticated;
