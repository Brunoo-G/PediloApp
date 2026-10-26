-- ============================================================================
-- MIGRACIÓN 19 — En un envío se pide QUIÉN RECIBE, no qué se manda
--
-- Antes el formulario de envío pedía "qué mandás" y ese texto se guardaba en
-- `nota` y además se mandaba como primer mensaje del chat
-- (`nota_como_mensaje`). Bruno lo cambió: lo que el repartidor necesita en la
-- puerta es el NOMBRE de quien recibe, y eso es un dato del envío, no una
-- conversación. Así que:
--
--   1. `pedidos.recibe`: columna nueva, texto corto (hasta 80).
--   2. `crear_envio` cambia de firma: `p_nota` sale, entra `p_recibe`
--      (obligatorio, mínimo 2 letras). Ya NO escribe nada en el chat.
--
-- Se hace DROP + CREATE y no `create or replace` porque cambian los
-- parámetros: con `or replace` Postgres dejaría las dos versiones vivas
-- (sobrecarga) y la vieja seguiría mandando la nota al chat si alguien la
-- llama.
--
-- Los pedidos de LOCALES no cambian: su nota sigue yendo al chat
-- (`crear_pedido` no se toca). Los envíos viejos conservan su `nota`, y la app
-- la sigue mostrando si no tienen `recibe`.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

alter table public.pedidos add column if not exists recibe text;

alter table public.pedidos drop constraint if exists pedidos_recibe_largo;
alter table public.pedidos add constraint pedidos_recibe_largo
  check (recibe is null or length(recibe) <= 80);

drop function if exists public.crear_envio(text, text, text, text, double precision, double precision, double precision, double precision, integer, integer);

create function public.crear_envio(
  p_retiro_direccion text,
  p_direccion        text,
  p_recibe           text default '',
  p_metodo_pago      text default 'efectivo',
  p_retiro_lat       double precision default null,
  p_retiro_lng       double precision default null,
  p_lat              double precision default null,
  p_lng              double precision default null,
  p_efectivo_con     integer default null,
  p_propina          integer default 0
) returns public.pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario   uuid := auth.uid();
  v_anonimo   boolean;
  v_retiro    text;
  v_entrega   text;
  v_envio     integer;
  v_tarifa    integer;
  v_propina   integer;
  v_total     integer;
  v_pedido    public.pedidos;
  v_recibe    text;
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión para pedir un envío' using errcode = 'P0001';
  end if;

  v_anonimo := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if v_anonimo then
    raise exception 'Para pedir un envío hace falta una cuenta' using errcode = 'P0001';
  end if;

  v_retiro  := trim(coalesce(p_retiro_direccion, ''));
  v_entrega := trim(coalesce(p_direccion, ''));
  if length(v_retiro) < 5 then
    raise exception 'Falta la dirección de retiro' using errcode = 'P0001';
  end if;
  if length(v_entrega) < 5 then
    raise exception 'Falta la dirección de entrega' using errcode = 'P0001';
  end if;
  -- Mandar algo a la misma dirección de la que se retira no es un envío; es un
  -- error de tipeo que el repartidor descubre en la puerta.
  if lower(v_retiro) = lower(v_entrega) then
    raise exception 'El retiro y la entrega son la misma dirección' using errcode = 'P0001';
  end if;

  -- El repartidor tiene que saber a quién darle el paquete en la puerta.
  v_recibe := left(trim(coalesce(p_recibe, '')), 80);
  if length(v_recibe) < 2 then
    raise exception 'Falta el nombre de quien recibe' using errcode = 'P0001';
  end if;

  select coalesce((select valor::integer from public.configuracion where clave = 'envio_base'), 0),
         coalesce((select valor::integer from public.configuracion where clave = 'tarifa_servicio_monto'), 0)
    into v_envio, v_tarifa;

  v_envio   := greatest(0, v_envio);
  v_tarifa  := greatest(0, v_tarifa);
  v_propina := least(greatest(0, coalesce(p_propina, 0)), 100000);
  v_total   := v_envio + v_tarifa + v_propina;

  if p_metodo_pago = 'efectivo' and p_efectivo_con is not null and p_efectivo_con < v_total then
    raise exception 'El monto en efectivo es menor al total del envío' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    cliente_id, comercio_id, tipo, estado,
    subtotal, descuento, costo_envio, tarifa_servicio, propina, total,
    retiro_direccion, retiro_lat, retiro_lng,
    direccion, lat, lng, telefono, nota, recibe,
    metodo_pago, pago_label, efectivo_con, vuelto
  ) values (
    v_usuario, null, 'envio', 'Pendiente',
    0, 0, v_envio, v_tarifa, v_propina, v_total,
    v_retiro, p_retiro_lat, p_retiro_lng,
    v_entrega, p_lat, p_lng, '', '', v_recibe,
    p_metodo_pago,
    case p_metodo_pago
      when 'efectivo' then 'Efectivo'
      when 'debito'   then 'Tarjeta de débito'
      when 'credito'  then 'Tarjeta de crédito'
      else p_metodo_pago end,
    p_efectivo_con,
    case when p_metodo_pago = 'efectivo' and p_efectivo_con is not null
         then p_efectivo_con - v_total else null end
  ) returning * into v_pedido;

  return v_pedido;
end $$;

revoke all on function public.crear_envio(text, text, text, text, double precision, double precision, double precision, double precision, integer, integer) from public;
grant execute on function public.crear_envio(text, text, text, text, double precision, double precision, double precision, double precision, integer, integer) to authenticated;

-- Que la API vea la columna y la firma nuevas sin esperar.
notify pgrst, 'reload schema';
