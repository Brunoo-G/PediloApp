-- ============================================================================
-- MIGRACIÓN 27 — Por ahora todo se paga al recibir: efectivo, QR o transferencia
--
-- Decisión de Bruno (14/10): se sacan Tarjeta y Mercado Pago hasta que haya
-- cobro online de verdad. Los medios nuevos son `qr` y `transferencia`, los
-- dos al recibir el pedido o el artículo (envíos), igual que el efectivo.
--
-- 1. `etiqueta_pago` conoce los dos nombres nuevos ("QR", "Transferencia").
--    Los viejos siguen ahí para que los pedidos anteriores se lean bien.
-- 2. `sellar_pago` (el trigger que pone la etiqueta) ahora además RECHAZA un
--    pedido nuevo con otro medio: la app ya no los ofrece, pero una versión
--    vieja instalada en un teléfono sí, y no queremos pedidos con "Tarjeta".
--    También corre cuando se escribe `pago_label`: `crear_pedido` la pisa con
--    un CASE propio después del insert, y sin esto quedaría "qr" en crudo.
-- 3. Los perfiles que tenían guardado tarjeta/Mercado Pago pasan a efectivo.
--
-- Liquidación del repartidor (`resumen_repartidor`): no cambia. Sólo el
-- efectivo queda en la mano del repartidor; QR y transferencia se tratan como
-- se trataba la tarjeta (la plata no la tiene él).
--
-- Se puede correr dos veces sin romper nada.
-- ============================================================================

create or replace function public.etiqueta_pago(p_metodo text)
returns text language sql immutable as $$
  select case lower(coalesce(p_metodo, ''))
           when 'efectivo'      then 'Efectivo'
           when 'qr'            then 'QR'
           when 'transferencia' then 'Transferencia'
           when 'tarjeta'       then 'Tarjeta'
           when 'debito'        then 'Tarjeta de débito'
           when 'credito'       then 'Tarjeta de crédito'
           when 'mercadopago'   then 'Mercado Pago'
           else coalesce(nullif(p_metodo, ''), 'A convenir')
         end;
$$;

create or replace function public.sellar_pago()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and lower(coalesce(new.metodo_pago, '')) not in ('efectivo', 'qr', 'transferencia') then
    raise exception 'Por ahora se paga sólo al recibir: efectivo, QR o transferencia.' using errcode = 'P0001';
  end if;
  new.pago_label := public.etiqueta_pago(new.metodo_pago);
  if new.pago_estado is null then
    new.pago_estado := 'pendiente';
  end if;
  return new;
end $$;

drop trigger if exists al_guardar_pago on public.pedidos;
create trigger al_guardar_pago
  before insert or update of metodo_pago, pago_label on public.pedidos
  for each row execute function public.sellar_pago();

update public.perfiles
   set metodo_pago = 'efectivo'
 where metodo_pago is not null
   and metodo_pago not in ('efectivo', 'qr', 'transferencia');
