-- ============================================================================
-- MIGRACIÓN 20 — Mercado Pago: el camino, todavía sin la API
--
-- Qué resuelve
-- ------------
-- Hasta acá un pedido guardaba CÓMO se iba a pagar (`metodo_pago`) pero no SI
-- se pagó. Con efectivo alcanzaba: se paga en la puerta y el repartidor lo
-- sabe. Con Mercado Pago no: entre "eligió Mercado Pago" y "la plata entró"
-- hay un rato, y el local no puede empezar a cocinar creyendo que ya cobró.
--
-- Entonces:
--   1. `pedidos.pago_estado` — pendiente / aprobado / rechazado / reembolsado.
--   2. `pedidos.pago_ref` — el id del pago del proveedor, para poder rastrearlo.
--   3. `public.etiqueta_pago(text)` — una sola fuente de verdad para el nombre
--      que ve la gente ("Mercado Pago", "Efectivo"…).
--   4. Un trigger que sella esa etiqueta en cada alta o cambio de método, así
--      no hay que tocar `crear_pedido` ni `crear_envio` cada vez que se suma
--      un medio de pago. Antes el `case` estaba copiado en las dos funciones:
--      agregar uno significaba editar las dos y rezar.
--   5. `public.registrar_pago(...)` — lo que va a llamar el webhook de Mercado
--      Pago cuando exista. NO se le da permiso a `authenticated`: si el
--      cliente pudiera marcar su propio pedido como aprobado, la integración
--      no serviría para nada. Sólo `service_role`, que vive en el servidor.
--
-- Lo que NO hace esta migración: cobrar. No hay credenciales ni preferencia de
-- pago todavía. Un pedido con Mercado Pago queda en `pendiente` y la app lo
-- dice con todas las letras, en vez de mostrar un "pagado" que sería mentira.
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

alter table public.pedidos add column if not exists pago_estado text not null default 'pendiente';
alter table public.pedidos add column if not exists pago_ref text;

alter table public.pedidos drop constraint if exists pedidos_pago_estado_valido;
alter table public.pedidos add constraint pedidos_pago_estado_valido
  check (pago_estado in ('pendiente', 'aprobado', 'rechazado', 'reembolsado'));

-- ----------------------------------------------------------------------------
-- El nombre visible de cada medio de pago, en un solo lugar
-- ----------------------------------------------------------------------------
create or replace function public.etiqueta_pago(p_metodo text)
returns text language sql immutable as $$
  select case lower(coalesce(p_metodo, ''))
           when 'efectivo'     then 'Efectivo'
           when 'tarjeta'      then 'Tarjeta'
           when 'debito'       then 'Tarjeta de débito'
           when 'credito'      then 'Tarjeta de crédito'
           when 'mercadopago'  then 'Mercado Pago'
           else coalesce(nullif(p_metodo, ''), 'A convenir')
         end;
$$;

create or replace function public.sellar_pago()
returns trigger language plpgsql as $$
begin
  new.pago_label := public.etiqueta_pago(new.metodo_pago);
  -- El efectivo y la tarjeta al recibir se cobran en la puerta: quedan
  -- pendientes hasta que el pedido se entrega, igual que Mercado Pago hasta
  -- que el webhook confirme.
  if new.pago_estado is null then
    new.pago_estado := 'pendiente';
  end if;
  return new;
end $$;

drop trigger if exists al_guardar_pago on public.pedidos;
create trigger al_guardar_pago
  before insert or update of metodo_pago on public.pedidos
  for each row execute function public.sellar_pago();

-- Los pedidos viejos se quedan con la etiqueta que ya tenían salvo que haya
-- quedado en crudo (un método nuevo guardado antes de esta migración).
update public.pedidos
   set pago_label = public.etiqueta_pago(metodo_pago)
 where pago_label is null
    or pago_label = ''
    or pago_label = metodo_pago;

-- ----------------------------------------------------------------------------
-- Lo que va a llamar el webhook
-- ----------------------------------------------------------------------------
create or replace function public.registrar_pago(
  p_pedido_id uuid,
  p_estado    text,
  p_ref       text default null
) returns public.pedidos
language plpgsql security definer set search_path = public as $$
declare
  v_pedido public.pedidos;
begin
  if p_estado not in ('pendiente', 'aprobado', 'rechazado', 'reembolsado') then
    raise exception 'Estado de pago desconocido: %', p_estado using errcode = 'P0001';
  end if;

  update public.pedidos
     set pago_estado = p_estado,
         pago_ref    = coalesce(p_ref, pago_ref)
   where id = p_pedido_id
  returning * into v_pedido;

  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'P0001';
  end if;

  return v_pedido;
end $$;

-- Nadie del lado del cliente puede marcar su propio pago como aprobado.
revoke all on function public.registrar_pago(uuid, text, text) from public;
revoke all on function public.registrar_pago(uuid, text, text) from anon, authenticated;
grant execute on function public.registrar_pago(uuid, text, text) to service_role;

-- Que la API vea las columnas nuevas sin esperar.
notify pgrst, 'reload schema';

-- ============================================================================
-- COMPROBARLO
--
--   select metodo_pago, pago_label, pago_estado, count(*)
--     from public.pedidos group by 1,2,3;
--
-- Y desde la app: hacer un pedido con Mercado Pago. Tiene que quedar con
-- `pago_label = 'Mercado Pago'` y `pago_estado = 'pendiente'`, y el panel del
-- local tiene que decir "Pago pendiente", no "Ya está pago".
-- ============================================================================
