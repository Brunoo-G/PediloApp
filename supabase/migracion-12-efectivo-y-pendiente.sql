-- ============================================================================
-- MIGRACIÓN 12 — separar lo que el repartidor ya cobró en mano
--
-- Correr en Supabase → SQL Editor. Es idempotente. Va después de la 11.
--
-- EL PROBLEMA
--
-- "Saldo a pagar" mezclaba dos platas que no son lo mismo.
--
-- En un pedido en **efectivo**, el repartidor cobra todo el total en la puerta.
-- Ahí mismo, sin que nadie transfiera nada, ya se quedó con su parte del envío
-- y con la propina entera: esa plata está en su bolsillo.
--
-- En un pedido con **tarjeta**, no tocó un peso. Toda su parte se la debe
-- Pedilo.
--
-- Sumar las dos y llamarlas "saldo a pagar" hace que Pedilo pague dos veces lo
-- de los pedidos en efectivo. Esta migración las separa.
--
-- NO HACE FALTA UNA COLUMNA NUEVA
--
-- Ya está el dato: `pedidos.metodo_pago`. Un pedido entregado y en efectivo es
-- un pedido cobrado en mano.
--
-- La salvedad, y conviene tenerla escrita: eso da por hecho que si el pedido se
-- entregó, el repartidor efectivamente cobró. Es cierto en la enorme mayoría de
-- los casos y es la suposición correcta para arrancar; el día que haya entregas
-- sin cobrar (un cliente que no tenía el billete) va a hacer falta que el
-- repartidor lo marque, y ahí sí una columna.
--
-- LA OTRA MITAD DE LA CUENTA
--
-- En un pedido en efectivo el repartidor NO cobró sólo lo suyo: también tiene
-- en la mano la plata del local (el subtotal), la tarifa de servicio y la parte
-- del envío que le toca a Pedilo. Eso es `a_rendir`, y es al revés: lo que él
-- le debe a Pedilo.
--
-- Casi siempre `a_rendir` es bastante más grande que `pendiente`, así que en un
-- cierre real el repartidor termina entregando plata, no recibiéndola. Se
-- devuelve el número para que la app pueda decirlo en vez de dejar que se
-- descubra a fin de mes.
-- ============================================================================

create or replace function public.resumen_repartidor(p_dias integer default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_desde   timestamptz;
  v_pct     numeric;
  v_r       record;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  v_desde := case when p_dias is null then '-infinity'::timestamptz
                  else date_trunc('day', now()) - make_interval(days => greatest(0, p_dias - 1)) end;

  select coalesce((select valor::numeric from public.configuracion where clave = 'reparto_pct_envio'), 0)
    into v_pct;

  select
    count(*)                                                    as entregas,
    coalesce(sum(propina), 0)                                   as propinas,
    coalesce(sum(costo_envio), 0)                               as envios,
    coalesce(sum(round(costo_envio * v_pct / 100.0)), 0)        as parte_envios,

    -- Lo mismo, pero sólo sobre lo que se pagó en efectivo: eso ya lo tiene él.
    count(*) filter (where metodo_pago = 'efectivo')            as entregas_efectivo,
    coalesce(sum(propina) filter (where metodo_pago = 'efectivo'), 0)
                                                                as propinas_efectivo,
    coalesce(sum(round(costo_envio * v_pct / 100.0)) filter (where metodo_pago = 'efectivo'), 0)
                                                                as parte_envios_efectivo,

    -- Y la plata ajena que quedó en su bolsillo en esos mismos pedidos.
    coalesce(sum(total - round(costo_envio * v_pct / 100.0) - propina)
             filter (where metodo_pago = 'efectivo'), 0)        as a_rendir
    into v_r
    from public.pedidos
   where repartidor_id = v_usuario
     and estado = 'Entregado'
     and coalesce(entregado_en, creado_en) >= v_desde;

  return jsonb_build_object(
    'desde',                 case when p_dias is null then null else v_desde end,
    'dias',                  p_dias,
    'entregas',              v_r.entregas,
    'propinas',              v_r.propinas,
    'envios',                v_r.envios,
    'pct_envio',             v_pct,
    'parte_envios',          v_r.parte_envios,
    -- Todo lo que ganó, sin importar cómo le llegó.
    'saldo',                 v_r.parte_envios + v_r.propinas,

    'entregas_efectivo',     v_r.entregas_efectivo,
    'propinas_efectivo',     v_r.propinas_efectivo,
    'parte_envios_efectivo', v_r.parte_envios_efectivo,
    -- De lo que ganó, esto ya se lo llevó en la mano.
    'cobrado_en_mano',       v_r.parte_envios_efectivo + v_r.propinas_efectivo,
    -- Y esto es lo único que Pedilo le tiene que transferir.
    'pendiente',             (v_r.parte_envios + v_r.propinas)
                             - (v_r.parte_envios_efectivo + v_r.propinas_efectivo),
    -- Plata de Pedilo y del local que quedó en su bolsillo.
    'a_rendir',              v_r.a_rendir
  );
end $$;

revoke all on function public.resumen_repartidor(integer) from public;
grant execute on function public.resumen_repartidor(integer) to authenticated;
