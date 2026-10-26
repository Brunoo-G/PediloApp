-- ============================================================================
-- MIGRACIÓN 21 — Dónde cobra cada local y cada repartidor: CBU, CVU o alias
--
-- Pedilo le va a transferir a cada local lo que vendió, y a cada repartidor
-- su parte de los envíos y las propinas. Para eso necesita saber a dónde, y
-- quién es el titular de esa cuenta.
--
-- Son dos tablas con la misma forma: `comercio_cobro` (una fila por local,
-- la edita el dueño) y `repartidor_cobro` (una fila por repartidor, la edita
-- él mismo).
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA EN `comercios`
--
-- `comercios` la puede leer cualquiera: es lo que muestra el marketplace, y su
-- política de lectura es "si está aprobado, lo ve todo el mundo". Una columna
-- `cbu` ahí quedaba a un `select *` de cualquier cliente con la app abierta.
-- La RLS filtra filas, no columnas: no hay forma de publicar el nombre del
-- local y esconder el CBU en la misma fila sin empezar a pelear con grants por
-- columna, que es exactamente el tipo de cosa que se rompe en silencio.
--
-- En una tabla propia, la regla es simple y entera: **sólo la ve y la edita
-- el dueño del local**. Ni los clientes, ni los repartidores, ni otro local.
--
-- QUÉ SE VALIDA ACÁ
--
-- El formato (22 dígitos, o un alias de 6 a 20 caracteres de letras, números,
-- puntos y guiones), no si la cuenta existe: eso lo sabe el banco. La app
-- además revisa los dígitos verificadores del CBU antes de mandar, que es lo
-- que agarra el error de tipeo más común —dos números invertidos—.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create table if not exists public.comercio_cobro (
  comercio_id    uuid primary key references public.comercios(id) on delete cascade,
  tipo           text not null,
  valor          text not null,
  titular        text not null,
  cuit           text not null default '',
  actualizado_en timestamptz not null default now(),

  constraint cobro_tipo_valido check (tipo in ('cbu', 'cvu', 'alias')),
  constraint cobro_valor_formato check (
    (tipo in ('cbu', 'cvu') and valor ~ '^[0-9]{22}$')
    or (tipo = 'alias' and valor ~ '^[a-z0-9.\-]{6,20}$')
  ),
  constraint cobro_titular_largo check (length(trim(titular)) between 3 and 80),
  constraint cobro_cuit_formato check (cuit = '' or cuit ~ '^[0-9]{11}$')
);

alter table public.comercio_cobro enable row level security;

drop policy if exists cobro_ve_dueno on public.comercio_cobro;
create policy cobro_ve_dueno on public.comercio_cobro
  for select using (public.es_dueno(comercio_id));

drop policy if exists cobro_carga_dueno on public.comercio_cobro;
create policy cobro_carga_dueno on public.comercio_cobro
  for insert with check (public.es_dueno(comercio_id));

drop policy if exists cobro_edita_dueno on public.comercio_cobro;
create policy cobro_edita_dueno on public.comercio_cobro
  for update using (public.es_dueno(comercio_id)) with check (public.es_dueno(comercio_id));

-- Sin borrar desde la app: si un local se queda sin datos de cobro, Pedilo no
-- sabe a dónde mandarle la plata. Se cambian, no se sacan.
revoke all on public.comercio_cobro from anon;
revoke delete on public.comercio_cobro from authenticated;
grant select, insert, update on public.comercio_cobro to authenticated;

-- La fecha se pone sola en cada cambio: sirve para saber, ante un reclamo, si
-- una transferencia salió antes o después de que el local cambiara la cuenta.
create or replace function public.cobro_sellar_fecha()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.valor := lower(trim(new.valor));
  new.titular := trim(new.titular);
  return new;
end $$;

drop trigger if exists al_guardar_cobro on public.comercio_cobro;
create trigger al_guardar_cobro
  before insert or update on public.comercio_cobro
  for each row execute function public.cobro_sellar_fecha();

-- ----------------------------------------------------------------------------
-- REPARTIDORES
--
-- La misma idea, pero la fila es de una persona y no de un local: la ve y la
-- edita sólo el propio repartidor (`perfil_id = auth.uid()`). Y además tiene
-- que SER repartidor: un cliente no tiene nada que cobrar y no debería poder
-- dejar una cuenta cargada que después alguien tome por buena.
-- ----------------------------------------------------------------------------

create table if not exists public.repartidor_cobro (
  perfil_id      uuid primary key references public.perfiles(id) on delete cascade,
  tipo           text not null,
  valor          text not null,
  titular        text not null,
  cuit           text not null default '',
  actualizado_en timestamptz not null default now(),

  constraint rcobro_tipo_valido check (tipo in ('cbu', 'cvu', 'alias')),
  constraint rcobro_valor_formato check (
    (tipo in ('cbu', 'cvu') and valor ~ '^[0-9]{22}$')
    or (tipo = 'alias' and valor ~ '^[a-z0-9.\-]{6,20}$')
  ),
  constraint rcobro_titular_largo check (length(trim(titular)) between 3 and 80),
  constraint rcobro_cuit_formato check (cuit = '' or cuit ~ '^[0-9]{11}$')
);

alter table public.repartidor_cobro enable row level security;

drop policy if exists rcobro_ve_el on public.repartidor_cobro;
create policy rcobro_ve_el on public.repartidor_cobro
  for select using (perfil_id = auth.uid());

drop policy if exists rcobro_carga_el on public.repartidor_cobro;
create policy rcobro_carga_el on public.repartidor_cobro
  for insert with check (perfil_id = auth.uid() and public.mi_rol() = 'repartidor');

drop policy if exists rcobro_edita_el on public.repartidor_cobro;
create policy rcobro_edita_el on public.repartidor_cobro
  for update using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid() and public.mi_rol() = 'repartidor');

revoke all on public.repartidor_cobro from anon;
revoke delete on public.repartidor_cobro from authenticated;
grant select, insert, update on public.repartidor_cobro to authenticated;

drop trigger if exists al_guardar_cobro on public.repartidor_cobro;
create trigger al_guardar_cobro
  before insert or update on public.repartidor_cobro
  for each row execute function public.cobro_sellar_fecha();

notify pgrst, 'reload schema';

-- ============================================================================
-- COMPROBARLO
--
--   -- como el dueño: ve la suya / como cualquier otro: 0 filas
--   select * from public.comercio_cobro;
--   -- como el repartidor: ve la suya / como cualquier otro: 0 filas
--   select * from public.repartidor_cobro;
-- ============================================================================
