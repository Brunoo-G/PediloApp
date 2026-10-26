-- ============================================================================
-- MIGRACIÓN 05a — los valores nuevos de los enums
--
-- Correr ANTES de migracion-05-panel-comercio.sql, en su propia ejecución.
-- Es corta a propósito: son tres líneas que TIENEN que ir solas.
--
-- POR QUÉ ESTÁ SEPARADA
--
-- Postgres no deja usar un valor de enum en la misma transacción en la que se
-- lo agrega ("unsafe use of new value ... New enum values must be committed
-- before they can be used"). El editor de Supabase corre todo lo que pegás
-- como una sola transacción, así que si esto viniera junto con el resto, el
-- índice y la política que mencionan 'Listo' harían fallar todo el script.
--
-- Correrla dos veces no hace nada: si los valores ya están, no toca nada.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'rol_usuario' and e.enumlabel = 'repartidor') then
    alter type rol_usuario add value 'repartidor';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'estado_pedido' and e.enumlabel = 'Listo') then
    alter type estado_pedido add value 'Listo' before 'En camino';
  end if;
end $$;

select 'Listo. Ahora sí corré migracion-05-panel-comercio.sql.' as siguiente_paso;
