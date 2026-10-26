-- ============================================================================
-- PEDILO — VERIFICAR LA INSTALACIÓN
--
-- Pegá TODO este archivo en Supabase → SQL Editor → Run.
--
-- Devuelve una tabla con una fila por cosa a chequear. Mirá la columna
-- "estado": si todas dicen OK, la base está lista y el problema (si hay) está
-- en la app, no acá.
--
-- No modifica nada: sólo lee.
-- ============================================================================

with chequeos as (

  -- ------------------------------------------------------------- tablas ----
  select 1 as orden, 'Tablas creadas' as que,
    (select count(*)::text from information_schema.tables
      where table_schema = 'public'
        and table_name in ('perfiles','comercios','comercio_horarios','productos',
                           'producto_fotos','cupones','pedidos','pedido_items',
                           'solicitudes_comercio','configuracion')) || ' de 10' as valor,
    case when (select count(*) from information_schema.tables
                where table_schema = 'public'
                  and table_name in ('perfiles','comercios','comercio_horarios','productos',
                                     'producto_fotos','cupones','pedidos','pedido_items',
                                     'solicitudes_comercio','configuracion')) = 10
         then 'OK' else 'FALTA — corré instalar.sql' end as estado

  -- ---------------------------------------------------------- coordenadas --
  union all
  select 2, 'Columnas del mapa (migración 01)',
    case when exists (select 1 from information_schema.columns
                       where table_name = 'comercios' and column_name = 'lat')
         then 'lat/lng presentes' else 'no están' end,
    case when exists (select 1 from information_schema.columns
                       where table_name = 'comercios' and column_name = 'lat')
          and exists (select 1 from information_schema.columns
                       where table_name = 'pedido_items' and column_name = 'nota')
         then 'OK' else 'FALTA — corré migracion-01-mapas-y-notas.sql' end

  -- ------------------------------------------------------ crear_pedido -----
  union all
  select 3, 'Función crear_pedido (migración 02)',
    case when exists (select 1 from pg_proc where proname = 'crear_pedido')
         then 'creada' else 'no existe' end,
    case when exists (select 1 from pg_proc where proname = 'crear_pedido')
          and exists (select 1 from pg_proc where proname = 'distancia_km')
         then 'OK' else 'FALTA — corré migracion-02-crear-pedido.sql' end

  -- --------------------------------------------------- insert bloqueado ----
  -- Si quedó viva la política vieja, la app podría insertar pedidos con el
  -- total que quiera. Tiene que estar borrada.
  union all
  select 4, 'Insert directo de pedidos bloqueado',
    case when exists (select 1 from pg_policies
                       where tablename = 'pedidos' and policyname = 'pedidos_crear')
         then 'la política vieja sigue activa' else 'bloqueado' end,
    case when exists (select 1 from pg_policies
                       where tablename = 'pedidos' and policyname = 'pedidos_crear')
         then 'REVISAR — corré migracion-02-crear-pedido.sql' else 'OK' end

  -- ------------------------------------------------------------- RLS -------
  union all
  select 5, 'Row Level Security prendido',
    (select count(*)::text from pg_tables t
      where t.schemaname = 'public' and t.rowsecurity
        and t.tablename in ('perfiles','comercios','productos','pedidos','pedido_items')) || ' de 5',
    case when (select count(*) from pg_tables t
                where t.schemaname = 'public' and t.rowsecurity
                  and t.tablename in ('perfiles','comercios','productos','pedidos','pedido_items')) = 5
         then 'OK' else 'REVISAR — sin RLS los datos quedan abiertos' end

  -- ---------------------------------------------------------- locales ------
  union all
  select 6, 'Locales cargados y aprobados',
    (select count(*)::text from public.comercios where aprobado) || ' locales',
    case when (select count(*) from public.comercios where aprobado) > 0
         then 'OK' else 'FALTA — corré la parte de datos de prueba' end

  union all
  select 7, 'Productos cargados',
    (select count(*)::text from public.productos) || ' productos',
    case when (select count(*) from public.productos) > 0
         then 'OK' else 'FALTA — corré la parte de datos de prueba' end

  -- ------------------------------------------------------ coordenadas ------
  union all
  select 8, 'Locales con ubicación en el mapa',
    (select count(*)::text from public.comercios where lat is not null) || ' de ' ||
    (select count(*)::text from public.comercios),
    case when (select count(*) from public.comercios where lat is null) = 0
              and (select count(*) from public.comercios) > 0
         then 'OK' else 'REVISAR — sin coordenadas no se filtra por distancia' end

  -- ------------------------------------------------------ configuración ----
  union all
  select 9, 'Radio de envío configurado',
    coalesce((select valor || ' km' from public.configuracion where clave = 'radio_envio_km'),
             'no está'),
    case when exists (select 1 from public.configuracion where clave = 'radio_envio_km')
         then 'OK' else 'FALTA — corré migracion-01-mapas-y-notas.sql' end

  -- ------------------------------------------------- tarifa de servicio ----
  -- Es el cargo de la plataforma. Si las dos claves están en 0 no se cobra y
  -- la fila no aparece en el detalle del checkout: eso es válido, no un error.
  union all
  select 10, 'Tarifa de servicio configurada',
    coalesce((select valor from public.configuracion where clave = 'tarifa_servicio_monto'), '?') || ' $ fijo + ' ||
    coalesce((select valor from public.configuracion where clave = 'tarifa_servicio_pct'), '?') || ' %',
    case when exists (select 1 from public.configuracion where clave = 'tarifa_servicio_monto')
          and exists (select 1 from public.configuracion where clave = 'tarifa_servicio_pct')
          and exists (select 1 from information_schema.columns
                       where table_name = 'pedidos' and column_name = 'tarifa_servicio')
         then 'OK' else 'FALTA — corré migracion-04-tarifa-servicio.sql' end

  -- ---------------------------------------------------------- cupón --------
  -- Los cupones son la única fuente de promociones: el home muestra los que
  -- estén activos acá, así que si esta fila dice "ninguno" el carrusel no aparece.
  union all
  select 11, 'Cupones vigentes',
    coalesce((select string_agg(codigo || ' (' ||
                       concat_ws(' + ',
                         case when porcentaje is not null then porcentaje || '% OFF' end,
                         case when envio_gratis then 'envío gratis' end) || ')', ', ' order by codigo)
                from public.cupones
               where activo and (vence_el is null or vence_el > now())), 'ninguno'),
    case when exists (select 1 from public.cupones where activo)
         then 'OK' else 'sin promos — el home no va a mostrar el carrusel' end

  -- --------------------------------------------------------- storage ------
  union all
  select 12, 'Buckets de imágenes',
    (select count(*)::text from storage.buckets where id in ('comercios','productos')) || ' de 2',
    case when (select count(*) from storage.buckets where id in ('comercios','productos')) = 2
         then 'OK' else 'FALTA — corré instalar.sql completo' end

  -- ---------------------------------------------------------- pedidos ------
  union all
  select 13, 'Pedidos creados hasta ahora',
    (select count(*)::text from public.pedidos),
    'informativo'
)

select que as "Qué se chequea", valor as "Valor", estado as "Estado"
from chequeos
order by orden;

-- ============================================================================
-- LO QUE ESTA CONSULTA NO PUEDE VER
--
-- Las sesiones anónimas se prenden desde el panel, no desde SQL:
--   Authentication → Sign In / Providers → "Allow anonymous sign-ins"
--
-- Si está apagado, todo lo de arriba puede dar OK y aun así no vas a poder
-- confirmar un pedido. La app te lo va a decir con ese mismo texto.
-- ============================================================================
