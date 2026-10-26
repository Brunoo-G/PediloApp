-- ============================================================================
-- MIGRACIÓN 25 — Los clientes ven las categorías del local
--
-- La ficha del local (lo que ve el cliente) ahora arranca con la grilla de
-- categorías, con la misma imagen que eligió el local en su catálogo. Hasta
-- acá `comercio_categorias` la leía sólo el dueño (migración 22), así que el
-- cliente no podía ver el ícono o la foto elegidos.
--
-- Esta política agrega LECTURA para cualquiera, sólo de locales aprobados (los
-- mismos que ya se ven en el marketplace). Crear, editar y borrar siguen
-- siendo sólo del dueño. No hay datos privados en la tabla: nombre, imagen y
-- orden de cada categoría.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

drop policy if exists categorias_publicas on public.comercio_categorias;
create policy categorias_publicas on public.comercio_categorias
  for select using (
    exists (select 1 from public.comercios c where c.id = comercio_id and c.aprobado)
  );
