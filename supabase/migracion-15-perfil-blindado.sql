-- ============================================================================
-- MIGRACIÓN 15 — nadie se asciende solo
--
-- Correr en Supabase → SQL Editor. Es idempotente. Va después de la 14.
--
-- ESTO ARREGLA UN AGUJERO REAL, NO ES UNA MEJORA
--
-- Hasta acá, la política de `perfiles` era:
--
--     create policy perfil_propio_update on public.perfiles
--       for update using (id = auth.uid()) with check (id = auth.uid());
--
-- Dice "cada uno edita SU fila", que suena bien, pero no dice nada sobre QUÉ
-- columnas. Y `rol` es una columna de esa fila.
--
-- Como la clave publicable viaja en el bundle de la app, cualquiera que entre
-- con Google podía abrir una consola y hacer:
--
--     update perfiles set rol = 'repartidor' where id = <el suyo>;
--
-- Con eso pasaba a ver, por `pedidos_ver`, **todos los pedidos sin repartidor
-- que estén en Listo** —nombre, dirección y nota de gente que no conoce— y
-- podía tomarlos. Con `rol = 'admin'` era peor: `cambiar_estado_pedido` le
-- deja cambiar el estado de cualquier pedido, `migracion-07` le abre todos los
-- chats y `resumen_ventas` le muestra la facturación de todos los locales.
--
-- No hacía falta ningún truco: una línea desde el navegador.
--
-- CÓMO SE TAPA
--
-- Con permisos por columna, que es la herramienta que Postgres tiene justo
-- para esto. Se saca el permiso de `update` sobre toda la tabla y se devuelve
-- sólo sobre las columnas que la persona sí es dueña de cambiar. `rol` queda
-- afuera: lo cambian las funciones `security definer` (que corren como dueñas
-- de la base y no pasan por estos permisos) o alguien desde el panel.
--
-- Los permisos por columna y las políticas RLS se acumulan: hacen falta los
-- dos. La política sigue diciendo "sólo tu fila"; el permiso agrega "y sólo
-- estas columnas".
-- ============================================================================

revoke update on public.perfiles from authenticated, anon;

grant update (nombre, email, telefono, direccion, metodo_pago, lat, lng)
  on public.perfiles to authenticated;

-- ============================================================================
-- Y DE PASO, PODER CREARSE EL PERFIL
--
-- No había política de `insert` en `perfiles`. En la práctica no hacía falta
-- porque el trigger `al_crear_usuario` (migración 14) crea la fila al
-- registrarse. Pero si ese trigger falla o alguien lo borra sin querer, la
-- persona queda con sesión y sin perfil, y la app le deja escribir la
-- dirección en un formulario que no guarda nada. Un "guardado" mudo es peor
-- que un error.
--
-- El `with check` fija `rol = 'cliente'`: el insert es la otra puerta por
-- donde alguien podría entrar ya siendo repartidor. Y el `grant` no incluye
-- `rol` porque, sin poder escribir esa columna, el valor que entra es el
-- default de la tabla, que también es 'cliente'. Las dos cosas dicen lo mismo
-- a propósito.
-- ============================================================================

drop policy if exists perfil_propio_insert on public.perfiles;
create policy perfil_propio_insert on public.perfiles
  for insert with check (id = auth.uid() and rol = 'cliente');

revoke insert on public.perfiles from authenticated, anon;
grant insert (id, nombre, email, telefono, direccion, metodo_pago, lat, lng)
  on public.perfiles to authenticated;

-- ============================================================================
-- COMPROBARLO
--
-- Después de correr esto, desde la app (con una sesión de cliente) un
--
--     update perfiles set rol = 'admin' where id = auth.uid();
--
-- tiene que fallar con "permission denied for table perfiles", y guardar la
-- dirección tiene que seguir andando igual que antes.
-- ============================================================================
