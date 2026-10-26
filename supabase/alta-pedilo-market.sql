-- ============================================================================
-- DUEÑO DE PEDILO MARKET (22/9/2026)
--
-- La cuenta se crea a mano en Authentication → Users (con "Auto Confirm").
-- Esto hace las dos cosas que la pantalla de Supabase no hace:
--   1. le pone el rol `comercio` al perfil, que es lo que decide a qué app
--      entra cuando inicia sesión;
--   2. la asigna como dueña del local, que es lo que le deja editarlo.
--
-- Si la cuenta no existe, falla a propósito en vez de dejar todo a medias.
-- Se puede correr de nuevo sin problema.
-- ============================================================================

do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = 'market@pedilo.com';
  if v_id is null then
    raise exception 'No existe la cuenta market@pedilo.com. Creala en Authentication > Users con Auto Confirm.';
  end if;

  -- El perfil lo crea un trigger al dar de alta la cuenta, pero por las dudas.
  insert into public.perfiles (id, rol, nombre, email)
  values (v_id, 'comercio', 'Pedilo Market', 'market@pedilo.com')
  on conflict (id) do update
    set rol = 'comercio', nombre = 'Pedilo Market', email = 'market@pedilo.com';

  update public.comercios set dueno_id = v_id where nombre = 'Pedilo Market';
end $$;

select c.nombre, c.categoria, c.aprobado, c.abierto, p.email as dueno, p.rol::text as rol
  from public.comercios c left join public.perfiles p on p.id = c.dueno_id;
