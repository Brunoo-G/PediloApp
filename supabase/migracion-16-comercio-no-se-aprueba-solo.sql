-- ============================================================================
-- MIGRACIÓN 16 — un local no se aprueba solo
--
-- Correr en Supabase → SQL Editor. Es idempotente. Va después de la 15.
--
-- EL MISMO AGUJERO QUE LA 15, EN OTRA TABLA
--
-- `comercios_edita_dueno` dice "el dueño edita su local":
--
--     for update using (dueno_id = auth.uid()) with check (dueno_id = auth.uid())
--
-- Otra vez: correcto por fila, mudo por columna. Y entre las columnas de esa
-- fila está `aprobado`, que es lo único que separa a un local de aparecer en el
-- marketplace. Cualquier comercio con cuenta podía hacer
--
--     update comercios set aprobado = true where id = <el suyo>;
--
-- y publicarse sin que Pedilo lo aprobara. Probado el 16/9 contra la base real:
-- pasaba.
--
-- También estaban abiertas `costo_envio` y `radio_envio_km`, que son las dos
-- palancas del envío. El local ya no las ve en su panel —el envío lo pone
-- Pedilo— pero seguían siendo escribibles desde una consola.
--
-- ES MENOS GRAVE QUE LA 15 Y NO POR ESO SE DEJA
--
-- Para explotarlo hay que tener una cuenta de comercio, y esas las crea el
-- equipo a mano: no es cualquiera con un Gmail. Pero si "aprobado" no se puede
-- confiar, entonces no es un control, es un comentario.
--
-- QUÉ SE LE DEJA EDITAR
--
-- Lo que su panel efectivamente edita —descripción, dirección, tiempo de
-- entrega, abrir/cerrar, logo y portada— más nombre, categoría, teléfono y el
-- punto en el mapa, que hoy no edita pero son datos suyos y el día que se
-- agregue la pantalla no hay que tocar permisos.
--
-- Quedan afuera, y son de Pedilo: `aprobado`, `dueno_id`, `costo_envio`,
-- `radio_envio_km` y `creado_en`.
-- ============================================================================

revoke update on public.comercios from authenticated, anon;

grant update (nombre, descripcion, categoria, direccion, telefono,
              tiempo_entrega, abierto, logo_url, portada_url, lat, lng)
  on public.comercios to authenticated;

-- Nadie crea ni borra locales desde la app. Hoy ya está bloqueado porque no hay
-- política de `insert` ni de `delete` sobre la tabla, pero apoyarse sólo en la
-- ausencia de una política es frágil: el día que alguien agregue una para otra
-- cosa, esto se abre sin que nadie lo note.
revoke insert, delete on public.comercios from authenticated, anon;

-- ============================================================================
-- DE PASO: nadie borra perfiles
--
-- `perfiles` tenía el `delete` concedido a authenticated y anon. No se podía
-- usar porque no hay política de `delete`, misma fragilidad que arriba.
-- ============================================================================

revoke delete on public.perfiles from authenticated, anon;

-- ============================================================================
-- COMPROBARLO
--
-- Con el rol de un dueño de local:
--
--     update comercios set aprobado = true where id = <el suyo>;
--
-- tiene que fallar con "permission denied for table comercios", y guardar la
-- descripción o cerrar el local tiene que seguir andando.
-- ============================================================================
