/**
 * Crear y leer pedidos.
 *
 * El pedido se crea con la función `crear_pedido` de Postgres, no con un insert
 * desde acá. La app manda qué productos y cuántos; los precios los pone el
 * servidor. Ver el comentario largo en supabase/migracion-02-crear-pedido.sql.
 */
import { supabase } from "./supabase";
import type { ItemCarrito } from "../contextos/Carrito";
import type { EstadoPedido, Pedido, PedidoCompleto } from "./tipos";

export interface DatosPedido {
  comercioId: string;
  items: ItemCarrito[];
  direccion: string;
  metodoPago: string;
  /** Nota para la entrega ("tocar timbre 2 veces"), distinta de las de cada producto. */
  nota?: string;
  cupon?: string;
  efectivoCon?: number | null;
  lat?: number | null;
  lng?: number | null;
  /** Propina para el repartidor, en pesos. */
  propina?: number;
  /** Celular del cliente (sólo números), para que el local pueda llamarlo. */
  telefono?: string;
}

export type ResultadoPedido =
  | { ok: true; pedido: Pedido }
  | { ok: false; mensaje: string };

/**
 * Traduce los errores de Postgres a algo que se pueda leer en pantalla.
 * Los que la función levanta a propósito ya vienen en castellano; el resto
 * son fallas técnicas que no le dicen nada a nadie.
 */
function mensajeDeError(err: { message?: string; code?: string } | null): string {
  const m = err?.message ?? "";
  if (!m) return "No pudimos crear el pedido. Probá de nuevo.";
  // Los `raise exception` de crear_pedido usan errcode P0001 y texto nuestro.
  if (/local|producto|dirección|efectivo|sesión|km/i.test(m)) return m;
  if (/JWT|not authenticated|permission/i.test(m)) {
    return "Se cerró tu sesión. Volvé a entrar y probá de nuevo.";
  }
  if (/function .*crear_pedido.* does not exist/i.test(m)) {
    return "Falta correr supabase/migracion-02-crear-pedido.sql en el SQL Editor de Supabase.";
  }
  return "No pudimos crear el pedido. Probá de nuevo.";
}

export async function crearPedido(d: DatosPedido): Promise<ResultadoPedido> {
  const { data, error } = await supabase.rpc("crear_pedido", {
    p_comercio_id: d.comercioId,
    p_items: d.items.map((i) => ({
      producto_id: i.productoId,
      cantidad: i.cantidad,
      nota: i.nota ?? "",
    })),
    p_direccion: d.direccion,
    p_metodo_pago: d.metodoPago,
    p_nota: d.nota ?? "",
    p_cupon: d.cupon?.trim() || null,
    p_efectivo_con: d.efectivoCon ?? null,
    p_lat: d.lat ?? null,
    p_lng: d.lng ?? null,
    p_propina: Math.max(0, Math.round(d.propina ?? 0)),
    // El celular del perfil viaja con el pedido: es lo que usa el local para
    // llamar si falta algo ("no tengo esa leche, ¿te mando otra?").
    p_telefono: d.telefono ?? "",
  } as never);

  if (error) return { ok: false, mensaje: mensajeDeError(error) };
  return { ok: true, pedido: data as unknown as Pedido };
}

/**
 * Los pedidos del cliente que está en sesión, del más nuevo al más viejo.
 *
 * Sólo los de locales. Los envíos son de la misma tabla pero de otra pestaña, y
 * mezclarlos acá haría que "Tus pedidos" muestre cosas sin local ni productos.
 */
export async function misPedidos(): Promise<PedidoCompleto[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*, pedido_items(*), comercios(nombre, categoria, logo_url)")
    .eq("tipo", "delivery")
    .order("creado_en", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as unknown as PedidoCompleto[];
}

/* ------------------------------ lado del comercio ------------------------ */

/**
 * Los pedidos del local que administra el usuario en sesión.
 *
 * No filtra por comercio: RLS ya sólo devuelve los locales de los que es dueño.
 * Filtrar acá además sería repetir la regla en dos lugares y arriesgarse a que
 * un día digan cosas distintas.
 */
export async function pedidosDelComercio(): Promise<PedidoCompleto[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*, pedido_items(*), comercios(nombre, categoria, logo_url)")
    .eq("tipo", "delivery")
    .order("creado_en", { ascending: false })
    .limit(100);

  if (error) return [];
  return (data ?? []) as unknown as PedidoCompleto[];
}

export type ResultadoEstado =
  | { ok: true; pedido: Pedido }
  | { ok: false; mensaje: string };

/**
 * Mueve un pedido de estado.
 *
 * Las reglas (quién puede, y desde qué estado a cuál) viven en la función
 * `cambiar_estado_pedido` de Postgres, no acá. Esta pantalla sólo pide; el
 * servidor decide. Si la app se equivoca y ofrece un botón que no corresponde,
 * el peor caso es un mensaje de error, no un pedido en un estado imposible.
 */
export async function cambiarEstado(
  pedidoId: string,
  estado: EstadoPedido,
  motivo?: string
): Promise<ResultadoEstado> {
  const { data, error } = await supabase.rpc("cambiar_estado_pedido", {
    p_pedido_id: pedidoId,
    p_estado: estado,
    p_motivo: motivo?.trim() || null,
  } as never);

  if (error) {
    const m = error.message ?? "";
    if (/function .*cambiar_estado_pedido.* does not exist|schema cache/i.test(m)) {
      return { ok: false, mensaje: "Falta correr supabase/migracion-05-panel-comercio.sql en Supabase." };
    }
    // Los `raise exception` de la función ya vienen en castellano.
    if (/local|repartidor|motivo|pedido|sesión|estado/i.test(m)) return { ok: false, mensaje: m };
    return { ok: false, mensaje: "No pudimos cambiar el estado. Probá de nuevo." };
  }
  return { ok: true, pedido: data as unknown as Pedido };
}

/**
 * El cliente cancela su pedido (migración 26). Sólo mientras está Pendiente:
 * la base lo vuelve a controlar y, si el local ya lo aceptó, devuelve el
 * motivo en castellano.
 */
export const MOTIVO_CANCELO_CLIENTE = "Lo canceló el cliente";

export async function cancelarPedido(pedidoId: string): Promise<ResultadoEstado> {
  const { data, error } = await supabase.rpc("cancelar_pedido" as never, { p_pedido_id: pedidoId } as never);
  if (error) {
    const m = error.message ?? "";
    if (/function .*cancelar_pedido.* does not exist|schema cache/i.test(m))
      return { ok: false, mensaje: "Falta correr supabase/migracion-26-cancelar-pedido.sql en Supabase." };
    if (/local|pedido|sesión|pagaste|chat/i.test(m)) return { ok: false, mensaje: m };
    return { ok: false, mensaje: "No pudimos cancelar el pedido. Probá de nuevo." };
  }
  return { ok: true, pedido: data as unknown as Pedido };
}

/** Qué puede hacer el local con un pedido, según cómo esté. */
export function accionesDelComercio(estado: EstadoPedido): {
  avanzar: { a: EstadoPedido; label: string } | null;
  puedeRechazar: boolean;
} {
  switch (estado) {
    case "Pendiente":
      return { avanzar: { a: "Preparando", label: "Aceptar pedido" }, puedeRechazar: true };
    case "Preparando":
      return { avanzar: { a: "Listo", label: "Marcar listo" }, puedeRechazar: true };
    case "Listo":
      // Lo levanta el repartidor, no el local. Se muestra a la espera.
      return { avanzar: null, puedeRechazar: false };
    default:
      return { avanzar: null, puedeRechazar: false };
  }
}

/**
 * Cómo se paga este pedido, en una frase.
 *
 * Existe porque la pregunta cambia según quién mire: el repartidor quiere
 * saber si tiene que cobrar algo en la puerta, el local si puede empezar a
 * cocinar tranquilo, y el cliente qué le van a descontar. Antes cada pantalla
 * armaba su propia frase mirando `metodo_pago === "efectivo"`, y con Mercado
 * Pago eso deja de alcanzar: ahí hay un estado —si la plata entró o no— que un
 * método de pago solo no dice.
 *
 * `alerta` marca el caso incómodo: eligió Mercado Pago y todavía no está
 * aprobado. No es un error, es algo que hay que mirar antes de cocinar.
 */
export function resumenDelPago(p: {
  metodo_pago: string;
  pago_label: string;
  pago_estado?: string | null;
  total?: number;
}): { texto: string; alerta: boolean; enPuerta: boolean } {
  const metodo = (p.metodo_pago || "").toLowerCase();
  const etiqueta = p.pago_label || "A convenir";

  if (metodo === "mercadopago") {
    const estado = p.pago_estado ?? "pendiente";
    if (estado === "aprobado") return { texto: "Pagado con Mercado Pago", alerta: false, enPuerta: false };
    if (estado === "rechazado") return { texto: "Mercado Pago rechazó el pago", alerta: true, enPuerta: false };
    if (estado === "reembolsado") return { texto: "Mercado Pago · reintegrado", alerta: true, enPuerta: false };
    return { texto: "Mercado Pago · pago pendiente", alerta: true, enPuerta: false };
  }

  if (metodo === "efectivo") return { texto: "Efectivo, se cobra en la puerta", alerta: false, enPuerta: true };
  if (metodo === "qr") return { texto: "QR, se paga al recibir", alerta: false, enPuerta: true };
  if (metodo === "transferencia") return { texto: "Transferencia, se paga al recibir", alerta: false, enPuerta: true };
  if (metodo === "tarjeta" || metodo === "debito" || metodo === "credito") {
    return { texto: `${etiqueta}, con posnet en la puerta`, alerta: false, enPuerta: true };
  }
  return { texto: etiqueta, alerta: false, enPuerta: true };
}
