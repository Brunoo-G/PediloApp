-- ============================================================================
-- MIGRACIÓN 06 — permisos de Storage para la carta del comercio
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- QUÉ ARREGLA
--
-- La política vieja decía esto:
--
--     create policy subida_autenticada on storage.objects for insert
--       to authenticated with check (bucket_id in ('comercios','productos'));
--
-- O sea: CUALQUIERA con sesión podía subir CUALQUIER archivo a los buckets.
-- Y en Pedilo cualquiera con sesión incluye a todos los clientes, porque la
-- sesión anónima se crea sola al confirmar el primer pedido. Alcanzaba con
-- abrir la consola del navegador para llenar el storage de basura, y eso se
-- paga en la factura.
--
-- Tampoco había política de update ni de delete, así que un comercio no podía
-- reemplazar ni borrar sus propias fotos: sólo acumular.
--
-- CÓMO QUEDA
--
-- Los archivos se guardan con el id del local como primera carpeta:
--
--     comercios/<comercio_id>/logo-1699999999.jpg
--     productos/<comercio_id>/<producto_id>/1699999999.jpg
--
-- y la política exige que esa primera carpeta sea de un local que el usuario
-- administre. Un comercio no puede escribir en la carpeta de otro ni aunque
-- arme el request a mano.
--
-- Leer sigue siendo público: son fotos de vidriera, y que el navegador las
-- pida sin credenciales es justamente lo que las hace rápidas.
-- ============================================================================

-- ------------------------------------------------------------- límites -----
-- 5 MB y sólo imágenes. Sin esto, una foto de 40 MB sacada del celular entra
-- igual, tarda una eternidad en subir y otra en bajar para cada cliente.

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic']
 where id in ('comercios','productos');

-- ------------------------------------------------------------ políticas ----

-- Quién puede escribir en esta carpeta: el dueño del local cuyo id es la
-- primera parte de la ruta. `storage.foldername` devuelve los tramos.
create or replace function public.puede_subir_a(ruta text)
returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare v_id uuid;
begin
  -- Si el primer tramo no es un uuid, no es una ruta nuestra: se rechaza.
  begin
    v_id := (storage.foldername(ruta))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.es_dueno(v_id) or public.mi_rol() = 'admin';
end $$;

drop policy if exists lectura_publica_comercios on storage.objects;
create policy lectura_publica_comercios on storage.objects for select
  using (bucket_id in ('comercios', 'productos'));

-- La vieja política floja. Se va.
drop policy if exists subida_autenticada on storage.objects;

drop policy if exists carta_sube on storage.objects;
create policy carta_sube on storage.objects for insert to authenticated
  with check (bucket_id in ('comercios','productos') and public.puede_subir_a(name));

drop policy if exists carta_reemplaza on storage.objects;
create policy carta_reemplaza on storage.objects for update to authenticated
  using (bucket_id in ('comercios','productos') and public.puede_subir_a(name))
  with check (bucket_id in ('comercios','productos') and public.puede_subir_a(name));

drop policy if exists carta_borra on storage.objects;
create policy carta_borra on storage.objects for delete to authenticated
  using (bucket_id in ('comercios','productos') and public.puede_subir_a(name));

-- ------------------------------------------------ tope de fotos por producto
-- Ya existía un trigger con este nombre en el esquema; se vuelve a crear acá
-- para que la migración sirva también sobre bases viejas que no lo tengan.

create or replace function public.tope_fotos()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.producto_fotos where producto_id = new.producto_id) >= 3 then
    raise exception 'Un producto puede tener hasta 3 fotos' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists tope_fotos_producto on public.producto_fotos;
create trigger tope_fotos_producto before insert on public.producto_fotos
  for each row execute function public.tope_fotos();

-- ------------------------------------------------------------ la carta -----
-- El panel lista los productos ordenados por subcategoría y por `orden`. Sin
-- índice eso es un scan de toda la tabla cada vez que el local abre la carta.

create index if not exists productos_carta_idx
  on public.productos (comercio_id, subcategoria, orden, nombre);
