/**
 * Novedades: lo que pasó con tus pedidos desde la última vez que miraste.
 *
 * NO ES UN SISTEMA DE NOTIFICACIONES
 *
 * No hay push, no hay una tabla de avisos y no hay nada corriendo cuando la app
 * está cerrada. Esto se arma **al abrir el panel**, con dos consultas a datos
 * que ya existen: los pedidos de la persona y los mensajes de sus chats.
 *
 * Se hizo así a propósito. La alternativa era poner una campana decorativa
 * —con su puntito rojo permanente y sin nada adentro— que es exactamente uno de
 * los hallazgos que anotamos del prototipo. Una campana que abre algo real y
 * modesto es mejor que una que promete lo que no hay.
 *
 * QUÉ CUENTA COMO NOVEDAD
 *
 * Dos cosas, y las dos tienen fecha propia en la base:
 *
 *  - **Un cambio de estado**: el pedido pasó a Preparando, Listo, En camino o
 *    Entregado. La fecha es la columna del estado (`aceptado_en`, `listo_en`,
 *    `retirado_en`, `entregado_en`), no `creado_en`.
 *  - **Un mensaje que no escribiste vos**: el repartidor te contestó.
 *
 * QUÉ ES "NUEVO"
 *
 * Una sola marca guardada en el dispositivo: cuándo abriste el panel la última
 * vez. Todo lo posterior a esa fecha es nuevo. No hace falta una columna
 * `leido` en la base ni marcar mensaje por mensaje.
 *
 * Es por dispositivo, no por cuenta: si abrís en la compu, el teléfono sigue
 * mostrando el puntito. Para un MVP es lo correcto —la marca es "yo ya miré
 * esto acá"— y evita una tabla y una escritura por cada vez que se abre.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { misPedidos } from "./pedidos";
import type { EstadoPedido, Mensaje, PedidoCompleto } from "./tipos";

const CLAVE_VISTO = "pedilo.novedades.visto";

export interface Novedad {
  id: string;
  tipo: "estado" | "mensaje";
  pedidoId: string;
  /** El local: es lo que la persona reconoce. */
  local: string;
  logoUrl: string | null;
  categoria: string;
  titulo: string;
  detalle: string;
  cuando: string;
  nueva: boolean;
}

export interface Novedades {
  lista: Novedad[];
  /** Cuántas son posteriores a la última vez que abrió el panel. */
  sinVer: number;
}

/** Los estados que están vivos: el pedido todavía va a cambiar. */
const EN_CURSO: EstadoPedido[] = ["Pendiente", "Preparando", "Listo", "En camino"];

export function pedidoEnCurso(estado: EstadoPedido): boolean {
  return EN_CURSO.includes(estado);
}

/**
 * Cuándo pasó lo último que le pasó a este pedido, y cómo contarlo.
 *
 * Se mira de atrás para adelante: si está entregado, la novedad es la entrega,
 * no la aceptación. Si el local todavía no lo aceptó, la novedad es que el
 * pedido se hizo.
 */
function ultimoCambio(p: PedidoCompleto): { cuando: string; titulo: string; detalle: string } {
  if (p.estado === "Entregado" && p.entregado_en) {
    return { cuando: p.entregado_en, titulo: "Pedido entregado", detalle: "Que lo disfrutes." };
  }
  if (p.estado === "Rechazado") {
    return {
      cuando: p.aceptado_en ?? p.creado_en,
      titulo: "El local rechazó tu pedido",
      detalle: p.motivo_rechazo || "No dejaron un motivo.",
    };
  }
  if (p.estado === "En camino" && p.retirado_en) {
    return { cuando: p.retirado_en, titulo: "Tu pedido salió", detalle: "El repartidor ya lo tiene." };
  }
  if (p.estado === "Listo" && p.listo_en) {
    return { cuando: p.listo_en, titulo: "Tu pedido está listo", detalle: "Esperando que lo retire el repartidor." };
  }
  if (p.estado === "Preparando" && p.aceptado_en) {
    return { cuando: p.aceptado_en, titulo: "El local aceptó tu pedido", detalle: "Lo están preparando." };
  }
  return { cuando: p.creado_en, titulo: "Pedido enviado", detalle: "Esperando que el local lo acepte." };
}

/**
 * Los mensajes de los chats de esta persona.
 *
 * No filtra por pedido: la política de RLS (`participa_del_pedido`) ya devuelve
 * sólo los de sus propios pedidos. Filtrar acá además sería escribir la misma
 * regla en dos lugares.
 */
async function mensajesRecientes(): Promise<Mensaje[]> {
  const { data, error } = await supabase
    .from("mensajes")
    .select("*")
    .order("creado_en", { ascending: false })
    .limit(40);
  if (error) return [];
  return (data ?? []) as unknown as Mensaje[];
}

export async function ultimaVisita(): Promise<string> {
  try {
    // Sin marca previa, se toma "ahora": alguien que abre la app por primera
    // vez no tiene por qué encontrarse el puntito prendido por pedidos viejos.
    return (await AsyncStorage.getItem(CLAVE_VISTO)) ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export async function marcarVistas(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_VISTO, new Date().toISOString());
  } catch {
    /* si no se puede guardar, lo peor que pasa es que el puntito siga prendido */
  }
}

/**
 * Arma la lista. `miId` es para no contar como novedad lo que escribió uno
 * mismo: tu propio mensaje no es un aviso.
 */
export async function traerNovedades(miId: string | undefined): Promise<Novedades> {
  const [pedidos, mensajes, visto] = await Promise.all([
    misPedidos(),
    mensajesRecientes(),
    ultimaVisita(),
  ]);

  const desde = new Date(visto).getTime();
  const porPedido = new Map(pedidos.map((p) => [p.id, p]));
  const lista: Novedad[] = [];

  for (const p of pedidos) {
    // Los pedidos cerrados hace rato no son novedad. El corte son 2 días:
    // suficiente para ver "te entregaron el de anoche", no tanto como para que
    // el panel sea el historial, que ya tiene su propia pantalla.
    const u = ultimoCambio(p);
    const edad = Date.now() - new Date(u.cuando).getTime();
    if (!pedidoEnCurso(p.estado) && edad > 2 * 24 * 60 * 60 * 1000) continue;

    lista.push({
      id: `estado-${p.id}-${p.estado}`,
      tipo: "estado",
      pedidoId: p.id,
      local: p.comercios?.nombre ?? "Local",
      logoUrl: p.comercios?.logo_url ?? null,
      categoria: p.comercios?.categoria ?? "Todos",
      titulo: u.titulo,
      detalle: u.detalle,
      cuando: u.cuando,
      nueva: new Date(u.cuando).getTime() > desde,
    });
  }

  for (const m of mensajes) {
    if (m.autor_id === miId) continue;
    const p = porPedido.get(m.pedido_id);
    if (!p) continue;
    lista.push({
      id: `msg-${m.id}`,
      tipo: "mensaje",
      pedidoId: m.pedido_id,
      local: p.comercios?.nombre ?? "Local",
      logoUrl: p.comercios?.logo_url ?? null,
      categoria: p.comercios?.categoria ?? "Todos",
      titulo: "Mensaje del repartidor",
      detalle: m.texto,
      cuando: m.creado_en,
      nueva: new Date(m.creado_en).getTime() > desde,
    });
  }

  lista.sort((a, b) => new Date(b.cuando).getTime() - new Date(a.cuando).getTime());
  return { lista, sinVer: lista.filter((n) => n.nueva).length };
}
