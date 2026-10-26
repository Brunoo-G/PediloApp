-- ============================================================================
-- MIGRACIÓN 23 — El celular viaja con la cuenta nueva
--
-- Desde ahora no hay modo invitado: para usar Pedilo hay que crearse una
-- cuenta, con Google o con mail y contraseña. En los dos casos el celular es
-- obligatorio.
--
-- Quien se registra con MAIL escribe su nombre y su celular en el mismo
-- formulario. La app los manda en los metadatos del usuario (`full_name` y
-- `telefono`) y este trigger los copia al perfil cuando se crea la cuenta.
--
-- Hace falta que sea el trigger y no la app: si Supabase pide confirmar el
-- mail, la persona NO tiene sesión hasta confirmar, así que la app no puede
-- escribir en `perfiles`. Sin esto, el celular que cargó se perdía.
--
-- Con Google no viene celular: la app lo pide en el primer paso, junto con la
-- dirección, y no deja entrar al marketplace sin los dos.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create or replace function public.crear_perfil_al_registrarse()
returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.perfiles (id, rol, nombre, email, telefono)
  values (
    new.id,
    'cliente',
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             ''),
    coalesce(new.email, ''),
    -- Sólo números, como los guarda la app (ver src/lib/telefono.ts).
    regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefono', ''), '\D', '', 'g')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();

-- ============================================================================
-- COMPROBARLO
--
-- Crear una cuenta con mail desde la app y mirar:
--   select nombre, email, telefono from public.perfiles order by creado_en desc limit 1;
-- ============================================================================
