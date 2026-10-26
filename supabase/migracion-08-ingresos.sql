-- ============================================================================
-- MIGRACIÓN 08 — ingresos del comercio
--
-- Correr en Supabase → SQL Editor. Es idempotente.
--
-- QUÉ COBRA EL LOCAL
--
-- Un pedido de $9.300 no son $9.300 para el local. El total del cliente se
-- reparte en tres plata distintas:
--
--   subtotal           → del LOCAL   (lo que vale su comida)
--   costo_envio        → de PEDILO   (lo cobra el que pone el repartidor)
--   tarifa_servicio    → de PEDILO   (el cargo de la plataforma)
--   descuento de cupón → lo pone PEDILO
--
-- Esa última es la decisión que más importa y conviene que quede escrita:
-- **el cupón lo paga Pedilo, no el comercio.** El local cobra el precio
-- completo de su carta aunque el cliente haya usado BIENVENIDO. La razón es
-- práctica: los cupones son una herramienta de marketing de la plataforma, y
-- si le bajaran los ingresos al local cada vez que Pedilo lanza una promo, el
-- local dejaría de confiar en el número que ve en esta pantalla. Que los
-- números de alguien bajen por una decisión que no tomó es la forma más rápida
-- de perder a un comercio.
--
-- Entonces: ingresos del local = suma de `subtotal` de los pedidos ENTREGADOS.
--
-- POR QUÉ ENTREGADOS Y NO TODOS
--
-- Un pedido en camino todavía puede no llegar. "Ingresos" tiene que querer
-- decir plata que entró, no plata probable. Los que están en curso se cuentan
-- aparte y se muestran como tales.
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA CONSULTA DESDE LA APP
--
-- Tres razones. La cuenta de arriba es una regla de negocio y tiene que vivir
-- en un solo lugar. Traer 30 días de pedidos con sus renglones para sumarlos
-- en el teléfono es mandar miles de filas para mostrar cinco números. Y una
-- función `security definer` puede mirar `pedido_items` sin depender de que
-- las políticas de lectura sigan siendo las de hoy.
-- ============================================================================

create or replace function public.resumen_ventas(p_dias integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_comercio uuid;
  v_desde    timestamptz;
  v_res      jsonb;
begin
  -- El local del usuario en sesión. No se recibe por parámetro a propósito:
  -- si se recibiera, habría que validar que sea suyo, y la forma de no
  -- olvidarse de validar es no darle la oportunidad de mentir.
  select id into v_comercio from public.comercios where dueno_id = auth.uid() limit 1;

  if v_comercio is null then
    if public.mi_rol() = 'admin' then
      raise exception 'Un admin tiene que consultar por comercio, no con esta función' using errcode = 'P0001';
    end if;
    raise exception 'Tu cuenta no administra ningún local' using errcode = 'P0001';
  end if;

  -- p_dias = 1 significa "hoy": desde las 00:00 de hoy, no las últimas 24
  -- horas. Un local que abre a las 19:00 y cierra a las 2:00 quiere ver "hoy",
  -- y "las últimas 24 horas" a las 21:00 le mezclaría la noche de ayer.
  v_desde := case when p_dias <= 1
                  then date_trunc('day', now())
                  else date_trunc('day', now()) - make_interval(days => p_dias - 1) end;

  with pedidos_periodo as (
    select * from public.pedidos
     where comercio_id = v_comercio and creado_en >= v_desde
  ),
  entregados as (
    select * from pedidos_periodo where estado = 'Entregado'
  ),
  renglones as (
    select i.nombre, sum(i.cantidad)::int as unidades, sum(i.precio * i.cantidad)::int as ingresos
      from public.pedido_items i
      join entregados e on e.id = i.pedido_id
     group by i.nombre
  ),
  por_dia as (
    select to_char(date_trunc('day', creado_en), 'YYYY-MM-DD') as fecha,
           sum(subtotal)::int as ingresos,
           count(*)::int      as pedidos
      from entregados
     group by 1 order by 1
  )
  select jsonb_build_object(
    'desde',              v_desde,
    'dias',               p_dias,
    -- Lo que cobra el local: subtotal a precio de carta, sin descuento.
    'ingresos',           coalesce((select sum(subtotal)::int from entregados), 0),
    'pedidos',            (select count(*)::int from entregados),
    'productos_vendidos', coalesce((select sum(unidades) from renglones), 0),
    'ticket_promedio',    case when (select count(*) from entregados) = 0 then 0
                               else round(coalesce((select sum(subtotal) from entregados), 0)::numeric
                                          / (select count(*) from entregados))::int end,
    'en_curso',           (select count(*)::int from pedidos_periodo
                            where estado in ('Pendiente','Preparando','Listo','En camino')),
    'rechazados',         (select count(*)::int from pedidos_periodo where estado = 'Rechazado'),
    -- Cuánto puso Pedilo en cupones sobre pedidos de este local. No le resta
    -- nada al comercio; se muestra para que vea que la promo existió.
    'descuentos_pedilo',  coalesce((select sum(descuento)::int from entregados), 0),
    'top',                coalesce((select jsonb_agg(t) from (
                             select nombre, unidades, ingresos from renglones
                              order by unidades desc, ingresos desc limit 5) t), '[]'::jsonb),
    'por_dia',            coalesce((select jsonb_agg(d) from por_dia d), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.resumen_ventas(integer) from public;
grant execute on function public.resumen_ventas(integer) to authenticated;

-- El índice que usa la consulta de arriba: por local y por fecha.
create index if not exists pedidos_ventas_idx on public.pedidos (comercio_id, creado_en desc, estado);
