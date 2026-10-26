/**
 * El chat de un pedido.
 *
 * Reemplaza al teléfono. Antes el checkout pedía un celular para "llamarte si
 * pasa algo"; ahora la conversación va pegada al pedido, queda escrita, y nadie
 * tiene que darle su número a un desconocido.
 *
 * Son dos personas: **el cliente y el repartidor asignado**. El local no está,
 * ni para leer — su canal con el cliente es el estado del pedido.
 *
 * El cliente puede escribir desde que hizo el pedido, aunque todavía no haya
 * repartidor asignado. Antes la pantalla bloqueaba el cuadro de texto hasta que
 * alguien tomara el pedido, y estaba mal: el momento en que uno se acuerda de
 * "el timbre no anda, golpeá la puerta" es justo cuando acaba de pedir, no
 * veinte minutos después. El mensaje queda esperando y lo lee el repartidor
 * cuando toma el pedido.
 *
 * `tieneRepartidor` ya no decide si se puede escribir: sólo cambia lo que dice
 * la pantalla, porque no es lo mismo dejar una nota que estar conversando.
 */
import { supabase } from "./supabase";
import type { Mensaje, RolUsuario } from "./tipos";

export async function mensajesDelPedido(pedidoId: string): Promise<Mensaje[]> {
  const { data, error } = await supabase
    .from("mensajes")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("creado_en");

  if (error) return [];
  return (data ?? []) as unknown as Mensaje[];
}

export type ResultadoMensaje = { ok: true; mensaje: Mensaje } | { ok: false; error: string };

export async function enviarMensaje(
  pedidoId: string,
  autorId: string,
  autorRol: RolUsuario,
  texto: string
): Promise<ResultadoMensaje> {
  const limpio = texto.trim().slice(0, 1000);
  if (!limpio) return { ok: false, error: "Escribí algo antes de enviar." };

  const { data, error } = await supabase
    .from("mensajes")
    .insert({ pedido_id: pedidoId, autor_id: autorId, autor_rol: autorRol, texto: limpio } as never)
    .select()
    .single();

  if (error) {
    const m = error.message ?? "";
    if (/row-level security|policy/i.test(m)) {
      return { ok: false, error: "Ya no podés escribir en este pedido." };
    }
    if (/relation .*mensajes.* does not exist|schema cache/i.test(m)) {
      return { ok: false, error: "Falta correr supabase/migracion-07-chat-sin-telefonos.sql." };
    }
    return { ok: false, error: "No se pudo enviar. Probá de nuevo." };
  }
  return { ok: true, mensaje: data as unknown as Mensaje };
}

/**
 * Se suscribe a los mensajes nuevos de un pedido.
 *
 * Devuelve la función para cortar la suscripción: hay que llamarla al
 * desmontar, o cada vez que se abre un chat queda un canal abierto de más.
 */
export function escucharMensajes(pedidoId: string, alLlegar: (m: Mensaje) => void): () => void {
  const canal = supabase
    .channel(`chat-${pedidoId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "mensajes", filter: `pedido_id=eq.${pedidoId}` },
      (msg) => alLlegar(msg.new as Mensaje)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}

/** "Vos", "El repartidor", "El cliente" — quién habla, desde el lado que mira. */
export function quienEs(m: Mensaje, miId: string | undefined): string {
  if (m.autor_id === miId) return "Vos";
  switch (m.autor_rol) {
    case "repartidor":
      return "El repartidor";
    case "admin":
      return "Pedilo";
    default:
      return "El cliente";
  }
}

/**
 * Si el pedido ya tiene repartidor asignado.
 *
 * No habilita ni bloquea nada: el cliente escribe igual. Sirve para elegir las
 * palabras — "el repartidor lo va a leer cuando tome tu pedido" mientras nadie
 * lo tomó, y una conversación normal después.
 */
export function tieneRepartidor(repartidorId: string | null | undefined): boolean {
  return !!repartidorId;
}
