-- ============================================================================
-- LIMPIEZA PARA ARRANCAR EL MVP (21/9/2026)
--
-- Borra todos los datos de prueba y deja creada la primera tienda real,
-- "Pedilo Market". Se corrió UNA vez; no es una migración: no cambia la
-- estructura, sólo los datos. Queda en el repo para saber qué se hizo.
--
-- Se conserva:
--   · la estructura completa (tablas, funciones, políticas)
--   · `configuracion` (envío $1500, tarifa $450, % del repartidor, radio)
--   · las cuentas de Bruno: bgonzalez@udesa.edu.ar y bng43482467@gmail.com
--
-- Se borra: pedidos, envíos, ítems, chats, cupones, locales, productos,
-- fotos, horarios, solicitudes, y el resto de las cuentas (clientes de prueba,
-- anónimos, burger@pedilo.ar, juan@pedilo.ar).
--
-- Las fotos subidas a Storage NO se borran desde acá (Supabase no deja borrar
-- `storage.objects` por SQL): quedan huérfanas en el bucket, sin nada que las
-- muestre. Se pueden vaciar a mano desde Storage.
-- ============================================================================

begin;

-- El orden importa: `pedidos` frena el borrado de cuentas y locales
-- (on delete restrict), así que va primero.
delete from public.mensajes;
delete from public.pedido_items;
delete from public.pedidos;
delete from public.cupones;
delete from public.producto_fotos;
delete from public.productos;
delete from public.comercio_horarios;
delete from public.comercios;
delete from public.solicitudes_comercio;

-- Cuentas: todas menos las de Bruno. `perfiles` se va en cascada.
delete from auth.users
 where coalesce(lower(email), '') not in ('bgonzalez@udesa.edu.ar', 'bng43482467@gmail.com');

-- La primera tienda. Sin dueño todavía: se le asigna cuando exista la cuenta
-- con la que va a entrar al panel. Sin horarios: vale el interruptor.
insert into public.comercios (nombre, categoria, descripcion, tiempo_entrega, abierto, aprobado)
values ('Pedilo Market', 'Supermercado', '', '30-45 min', true, true);

commit;

select
  (select count(*) from public.pedidos)   as pedidos,
  (select count(*) from public.productos) as productos,
  (select string_agg(nombre, ', ') from public.comercios) as comercios,
  (select string_agg(email, ', ') from auth.users) as cuentas,
  (select count(*) from public.configuracion) as configuracion;
