-- ============================================================================
-- MIGRACIÓN 13 — envío $1.500 y tarifa de servicio $450
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- No cambia nada del esquema: son dos números de la tabla `configuracion`. Está
-- como archivo y no como dos líneas sueltas para que quede registrado cuándo y
-- por qué cambiaron los precios, que es exactamente el dato que uno busca seis
-- meses después cuando los números no cierran.
--
-- Antes: envío $900, tarifa $300. Los dos eran valores de arranque puestos para
-- ver la app funcionando, no decisiones comerciales.
--
-- El envío sigue siendo uno solo para toda la plataforma. Más adelante va a
-- salir de la distancia que tenga que recorrer el repartidor; hasta entonces,
-- cambiarlo es cambiar esta fila.
-- ============================================================================

insert into public.configuracion (clave, valor, descripcion)
values
  ('envio_base', '1500',
   'Lo que paga el cliente por el envío, en pesos. Lo cobra Pedilo, que pone el repartidor. Provisorio hasta calcularlo por distancia.'),
  ('tarifa_servicio_monto', '450',
   'Cargo fijo de la plataforma por pedido, en pesos. 0 para no cobrarlo.')
on conflict (clave) do update
  set valor = excluded.valor,
      actualizado = now();

-- Los pedidos viejos NO se tocan: cada uno guardó el envío y la tarifa que se
-- le cobraron al cliente ese día, y un pedido es un documento histórico.

select clave, valor from public.configuracion
 where clave in ('envio_base', 'tarifa_servicio_monto', 'tarifa_servicio_pct', 'reparto_pct_envio')
 order by clave;
