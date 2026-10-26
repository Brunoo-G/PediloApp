-- ============================================================================
-- MIGRACIÓN 26 — El cliente puede cancelar su pedido mientras está Pendiente
--
-- Igual que `cancelar_envio` (migración 18), pero para pedidos a locales:
-- el cliente cancela SÓLO mientras el local no lo aceptó (estado Pendiente).
-- Apenas el local lo pasa a Preparando ya hay cocina en marcha, y desde ahí
-- se habla por el chat.
--
-- Si lo pagó con Mercado Pago y el pago está aprobado no se cancela desde la
-- app: hay plata que devolver y eso lo resuelve el local/equipo.
--
-- El pedido queda "Rechazado" con motivo "Lo canceló el cliente", que es como
-- ya se muestra un envío cancelado. El local lo ve salir de su lista en vivo.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create or replace function public.cancelar_pedido(p_pedido_id uuid)
returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_pedido  public.pedidos;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;
  if v_pedido.cliente_id <> v_usuario then
    raise exception 'Ese pedido no es tuyo' using errcode = 'P0001';
  end if;
  if v_pedido.tipo <> 'delivery' then
    raise exception 'Esto no es un pedido a un local' using errcode = 'P0001';
  end if;
  if v_pedido.estado <> 'Pendiente' then
    raise exception 'El local ya empezó a prepararlo. Escribile por el chat.' using errcode = 'P0001';
  end if;
  if v_pedido.metodo_pago = 'mercadopago' and v_pedido.pago_estado = 'aprobado' then
    raise exception 'Ya lo pagaste con Mercado Pago. Escribile al local por el chat para cancelarlo.' using errcode = 'P0001';
  end if;

  update public.pedidos
     set estado = 'Rechazado', motivo_rechazo = 'Lo canceló el cliente'
   where id = p_pedido_id
  returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.cancelar_pedido(uuid) from public, anon;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
