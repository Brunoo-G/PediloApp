/**
 * El lado del repartidor.
 *
 * Tres verbos: **ver** lo que hay para llevar, **tomar** uno, y moverlo hasta
 * la puerta del cliente. Las reglas de quién puede qué viven en Postgres
 * (`tomar_pedido`, `soltar_pedido`, `cambiar_estado_pedido`); acá sólo se pide.
 *
 * Tomar y salir son dos cosas distintas, y conviene tenerlo claro leyendo este
 * archivo: **tomar** aparta el pedido y el repartidor arranca hacia el local
 * —el cliente no ve ningún cambio, porque para él no cambió nada—, y **En
 * camino** es cuando ya lo tiene encima y salió. El razonamiento largo está en
 * supabase/migracion-10-repartidores.sql.
 */
import { supabase } from "./supabase";
import type { Comercio, Pedido, PedidoItem } from "./tipos";

/**
 * Un pedido mirado desde la moto.
 *
 * Es `PedidoCompleto` más la dirección y las coordenadas del local: el
 * repartidor necesita saber **dónde retirar**, y el cliente nunca necesitó ese
 * dato porque ya estaba mirando la ficha del local.
 */
export type PedidoParaRepartir = Pedido & {
  pedido_items: PedidoItem[];
  comercios: Pick<Comercio, "nombre" | "categoria" | "logo_url" | "direccion" | "lat" | "lng"> | null;
};

/** Lo que el repartidor ve en la consulta: el pedido más los datos del local. */
const CON_LOCAL = "*, pedido_items(*), comercios(nombre, categoria, logo_url, direccion, lat, lng)";

/**
 * La bolsa de trabajo: lo que está listo y todavía no tomó nadie.
 *
 * No filtra por estado ni por repartidor: RLS ya devuelve exactamente eso a un
 * usuario con rol repartidor. Repetir el filtro acá sería escribir la misma
 * regla en dos lugares y arriesgarse a que un día digan cosas distintas.
 *
 * Ordenado por `listo_en`: el que está esperando hace más rato va primero. Es
 * la comida que se está enfriando.
 */
export async function pedidosDisponibles(): Promise<PedidoParaRepartir[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(CON_LOCAL)
    .eq("tipo", "delivery")
    .is("repartidor_id", null)
    .eq("estado", "Listo")
    .order("listo_en", { ascending: true })
    .limit(30);

  if (error) return [];
  return (data ?? []) as unknown as PedidoParaRepartir[];
}

/** Si el repartidor cobró este pedido en mano. */
export function seCobroEnEfectivo(metodoPago: string): boolean {
  return metodoPago === "efectivo";
}

/**
 * Cuántos viajes puede tener en la mano a la vez.
 *
 * El tope de verdad está en `tomar_pedido`, en la base. Este número es sólo
 * para que la pantalla pueda decir "2 de 3" sin preguntar. Si un día cambian,
 * el que manda es el de la base y acá se ve un cartel desactualizado, no un
 * pedido de más.
 */
export const TOPE_VIAJES = 3;

/**
 * Los viajes que el repartidor tiene en la mano.
 *
 * Hasta tres. Ordenados por el que retiró primero: el que ya está en la mochila
 * va arriba, porque es el que hay que entregar antes de que se enfríe.
 */
export async function misRepartos(repartidorId: string): Promise<PedidoParaRepartir[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(CON_LOCAL)
    .eq("tipo", "delivery")
    .eq("repartidor_id", repartidorId)
    .in("estado", ["Listo", "En camino"])
    .order("retirado_en", { ascending: true, nullsFirst: false })
    .order("listo_en", { ascending: true })
    .limit(TOPE_VIAJES);

  if (error) return [];
  return (data ?? []) as unknown as PedidoParaRepartir[];
}

/**
 * Lo que este repartidor ya entregó, de un solo tipo.
 *
 * Antes iba todo junto en la pestaña "Entregas". Ahora cada historial vive en
 * la pestaña de su trabajo —Delivery o Envíos—, así que se pide por tipo. La
 * plata sí sigue junta, en el perfil: `resumen_repartidor` no separa y la
 * persona tampoco cobra separado.
 */
export async function misEntregas(
  repartidorId: string,
  tipo: "delivery" | "envio" | "todos" = "delivery"
): Promise<PedidoParaRepartir[]> {
  let q = supabase
    .from("pedidos")
    .select(CON_LOCAL)
    .eq("repartidor_id", repartidorId)
    .eq("estado", "Entregado");
  // "todos" es el historial del perfil: los dos trabajos en una sola lista.
  if (tipo !== "todos") q = q.eq("tipo", tipo);
  const { data, error } = await q.order("entregado_en", { ascending: false }).limit(tipo === "todos" ? 100 : 50);

  if (error) return [];
  return (data ?? []) as unknown as PedidoParaRepartir[];
}

/**
 * Lo que el repartidor ganó, calculado en el servidor.
 *
 * La distinción que importa: **`saldo` es lo que ganó**, `cobrado_en_mano` es
 * la parte que ya se llevó en el bolsillo en los pedidos en efectivo, y
 * `pendiente` es lo único que Pedilo le tiene que transferir.
 *
 * `a_rendir` va en la dirección contraria y conviene no confundirlo: en un
 * pedido en efectivo el repartidor también cobró el subtotal del local, la
 * tarifa y la parte del envío de Pedilo. Esa plata no es suya, la debe.
 */
export interface ResumenRepartidor {
  dias: number | null;
  /** Pedidos entregados en el período. */
  entregas: number;
  /** Propinas del período. Van enteras al repartidor. */
  propinas: number;
  /** Lo que se le cobró al cliente de envío. No es todo suyo. */
  envios: number;
  /** Qué % del envío le queda. */
  pct_envio: number;
  /** Su parte de los envíos. Es su ingreso por envíos. */
  parte_envios: number;
  /** parte_envios + propinas. Todo lo que ganó, venga como venga. */
  saldo: number;

  /** Cuántas de esas entregas se pagaron en efectivo. */
  entregas_efectivo: number;
  propinas_efectivo: number;
  parte_envios_efectivo: number;
  /** De lo que ganó, lo que ya tiene en la mano. */
  cobrado_en_mano: number;
  /** Lo único que Pedilo le tiene que transferir. */
  pendiente: number;
  /** Plata de Pedilo y del local que quedó en su bolsillo. La debe él. */
  a_rendir: number;
}

const RESUMEN_VACIO: ResumenRepartidor = {
  dias: null, entregas: 0, propinas: 0, envios: 0, pct_envio: 0, parte_envios: 0, saldo: 0,
  entregas_efectivo: 0, propinas_efectivo: 0, parte_envios_efectivo: 0,
  cobrado_en_mano: 0, pendiente: 0, a_rendir: 0,
};

/**
 * Los números del repartidor.
 *
 * Se piden al servidor y no se suman acá sobre `misEntregas` porque esa lista
 * trae como mucho 50 filas: sumar sobre ellas daría un total que se queda corto
 * justo cuando más importa, que es cuando lleva muchos viajes.
 *
 * `dias` null = desde siempre.
 */
export async function resumenRepartidor(dias: number | null = null): Promise<ResumenRepartidor> {
  const { data, error } = await supabase.rpc("resumen_repartidor", { p_dias: dias } as never);
  if (error || !data) return RESUMEN_VACIO;
  return { ...RESUMEN_VACIO, ...(data as unknown as ResumenRepartidor) };
}

export type ResultadoReparto = { ok: true; pedido: Pedido } | { ok: false; mensaje: string };

/**
 * Traduce lo que vuelve de Postgres.
 *
 * Los `raise exception` de las funciones ya están escritos en castellano y para
 * que los lea un repartidor en la calle ("Otro repartidor lo tomó primero"), así
 * que se muestran tal cual. Lo demás son fallas técnicas que no le dicen nada a
 * nadie y se reemplazan por algo accionable.
 */
function mensaje(err: { message?: string } | null, quePasaba: string): string {
  const m = err?.message ?? "";
  if (/function .*(tomar_pedido|soltar_pedido).* does not exist|schema cache/i.test(m)) {
    return "Falta correr supabase/migracion-10-repartidores.sql en Supabase.";
  }
  if (/function .*resumen_repartidor.* does not exist/i.test(m)) {
    return "Falta correr supabase/migracion-11-propinas-y-reparto.sql en Supabase.";
  }
  if (/repartidor|pedido|sesión|listo|retiraste|curso/i.test(m)) return m;
  if (/JWT|not authenticated|permission/i.test(m)) {
    return "Se cerró tu sesión. Volvé a entrar.";
  }
  return `No se pudo ${quePasaba}. Probá de nuevo.`;
}

/** Aparta el pedido para este repartidor. El pedido sigue en Listo. */
export async function tomarPedido(pedidoId: string): Promise<ResultadoReparto> {
  const { data, error } = await supabase.rpc("tomar_pedido", { p_pedido_id: pedidoId } as never);
  if (error) return { ok: false, mensaje: mensaje(error, "tomar el pedido") };
  return { ok: true, pedido: data as unknown as Pedido };
}

/** Lo devuelve a la bolsa. Sólo mientras no lo haya retirado del local. */
export async function soltarPedido(pedidoId: string): Promise<ResultadoReparto> {
  const { data, error } = await supabase.rpc("soltar_pedido", { p_pedido_id: pedidoId } as never);
  if (error) return { ok: false, mensaje: mensaje(error, "soltar el pedido") };
  return { ok: true, pedido: data as unknown as Pedido };
}

/**
 * Qué puede hacer el repartidor con el pedido que tiene, según cómo esté.
 *
 * Las etiquetas están escritas desde donde está parado el repartidor —"Retiré
 * el pedido", no "Marcar en camino"—: él no está pensando en estados, está
 * saliendo del local con una bolsa.
 */
export function accionDelRepartidor(estado: string): { a: "En camino" | "Entregado"; label: string } | null {
  if (estado === "Listo") return { a: "En camino", label: "Retiré el pedido" };
  if (estado === "En camino") return { a: "Entregado", label: "Entregué el pedido" };
  return null;
}
