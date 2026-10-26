/**
 * Envíos: mandar una cosa de un punto a otro, sin local de por medio.
 *
 * Viven en la misma tabla que los pedidos (`pedidos.tipo = 'envio'`) porque
 * para el repartidor son el mismo trabajo y así reusan el chat, la máquina de
 * estados, el tope de tres viajes y la liquidación. El razonamiento completo
 * está en `supabase/migracion-18-envios.sql`.
 *
 * Lo que NO comparten es la pantalla: el cliente los pide en su propia pestaña
 * y el repartidor los ve en la suya, con otro color. Este archivo existe para
 * que esa separación sea obvia también leyendo el código: si una consulta no
 * dice `tipo`, está mal.
 */
import { supabase } from "./supabase";
import type { Pedido } from "./tipos";

/** Un envío tal como lo ve el cliente o el repartidor. Sin local, sin ítems. */
export type Envio = Pedido;

export type ResultadoEnvio =
  | { ok: true; envio: Envio }
  | { ok: false; error: string };

export interface DatosEnvio {
  retiroDireccion: string;
  retiroLat: number | null;
  retiroLng: number | null;
  direccion: string;
  lat: number | null;
  lng: number | null;
  /** Nombre de quien recibe. Queda en el envío, no va al chat. */
  recibe: string;
  metodoPago: string;
  efectivoCon: number | null;
  propina: number;
}

/**
 * Crea el envío.
 *
 * El precio no se manda: lo calcula `crear_envio` en la base, por la misma
 * razón que en los pedidos —la clave publicable viaja en el bundle, así que
 * cualquier total que mandara la app sería una sugerencia—.
 */
export async function crearEnvio(d: DatosEnvio): Promise<ResultadoEnvio> {
  const { data, error } = await supabase.rpc("crear_envio" as never, {
    p_retiro_direccion: d.retiroDireccion.trim(),
    p_direccion: d.direccion.trim(),
    p_recibe: d.recibe.trim().slice(0, 80),
    p_metodo_pago: d.metodoPago,
    p_retiro_lat: d.retiroLat,
    p_retiro_lng: d.retiroLng,
    p_lat: d.lat,
    p_lng: d.lng,
    p_efectivo_con: d.efectivoCon,
    p_propina: d.propina,
  } as never);

  if (error) return { ok: false, error: limpiar(error.message) };
  return { ok: true, envio: data as unknown as Envio };
}

/** Los envíos del cliente en sesión, del más nuevo al más viejo. */
export async function misEnvios(): Promise<Envio[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .eq("tipo", "envio")
    .order("creado_en", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as unknown as Envio[];
}

/**
 * Cancela un envío que todavía no tomó nadie.
 *
 * La regla de hasta cuándo se puede vive en `cancelar_envio`, no acá: si
 * estuviera en la app, alguien podría saltearla desde una consola.
 */
export async function cancelarEnvio(id: string): Promise<ResultadoEnvio> {
  const { data, error } = await supabase.rpc("cancelar_envio" as never, { p_pedido_id: id } as never);
  if (error) return { ok: false, error: limpiar(error.message) };
  return { ok: true, envio: data as unknown as Envio };
}

/* ---------------------------- lado del repartidor ------------------------ */

/**
 * La bolsa de envíos: los que nadie tomó todavía.
 *
 * No filtra por repartidor: RLS ya devuelve sólo los que están disponibles a
 * quien tiene rol repartidor. El `tipo` sí se filtra, porque la misma tabla
 * trae también los pedidos a locales y son otra pestaña.
 *
 * Ordenados por antigüedad: el que está esperando hace más rato va primero.
 */
export async function enviosDisponibles(): Promise<Envio[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .eq("tipo", "envio")
    .is("repartidor_id", null)
    .eq("estado", "Pendiente")
    .order("creado_en", { ascending: true })
    .limit(30);

  if (error) return [];
  return (data ?? []) as unknown as Envio[];
}

/** Los envíos que este repartidor tiene en la mano. */
export async function misEnviosEnCurso(repartidorId: string): Promise<Envio[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("*")
    .eq("tipo", "envio")
    .eq("repartidor_id", repartidorId)
    .in("estado", ["Pendiente", "En camino"])
    .order("creado_en", { ascending: true })
    .limit(10);

  if (error) return [];
  return (data ?? []) as unknown as Envio[];
}

/**
 * Qué botón mostrarle al repartidor según dónde está el envío.
 *
 * Un envío no pasa por la cocina: se toma, se retira y se entrega. Por eso los
 * estados intermedios del local no aparecen por ningún lado.
 */
export function accionDelEnvio(e: Envio): { texto: string; estado: "En camino" | "Entregado" } | null {
  if (e.estado === "Pendiente") return { texto: "Lo retiré", estado: "En camino" };
  if (e.estado === "En camino") return { texto: "Lo entregué", estado: "Entregado" };
  return null;
}

/**
 * A quién se entrega, para mostrar en la tarjeta.
 *
 * Los envíos nuevos traen `recibe`. Los anteriores a la migración 19 no lo
 * tienen: esos muestran lo que se había escrito en `nota`, con otro rótulo.
 */
export function quienRecibe(e: Envio): { rotulo: string; texto: string } | null {
  const r = (e.recibe ?? "").trim();
  if (r) return { rotulo: "Recibe", texto: r };
  const n = (e.nota ?? "").trim();
  if (n) return { rotulo: "Nota", texto: n };
  return null;
}

/** Un envío cancelado por el cliente, para no llamarlo "rechazado". */
export function fueCancelado(e: Envio): boolean {
  return e.estado === "Rechazado";
}

/**
 * Los mensajes de Postgres vienen con el prefijo del motor.
 * El texto después del prefijo ya está escrito para que lo lea una persona.
 */
function limpiar(mensaje: string): string {
  return mensaje.replace(/^.*?(?:ERROR|error):\s*/i, "").trim() || "No se pudo completar";
}
