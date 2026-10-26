/**
 * Cupones.
 *
 * Son la única fuente de promociones de Pedilo. No hay descuentos automáticos
 * por medio de pago ni envío gratis por monto: cada promo es una fila en la
 * tabla `cupones`, que se crea y se apaga desde el panel de Supabase sin
 * publicar una versión nueva de la app.
 *
 * Que vivan en la base tiene una segunda consecuencia, y es la más importante:
 * el home muestra los cupones que existen de verdad. Deja de ser posible que la
 * pantalla prometa una promo que el checkout no aplica — que fue exactamente
 * uno de los problemas que encontramos en el prototipo.
 */
import { supabase } from "./supabase";
import type { Cupon } from "./tipos";

/**
 * Busca un cupón por código. Devuelve null si no existe, venció, está apagado
 * o se acabaron los usos — la app no necesita distinguir entre esos casos, para
 * el cliente son todos "ese código no sirve".
 *
 * La validación de verdad la hace el servidor al crear el pedido. Esto es sólo
 * para poder mostrar el descuento antes de confirmar.
 */
export async function buscarCupon(codigo: string): Promise<Cupon | null> {
  const limpio = codigo.trim().toUpperCase();
  if (!limpio) return null;

  const { data, error } = await supabase
    .from("cupones")
    .select("*")
    .eq("codigo", limpio)
    .eq("activo", true)
    .maybeSingle();

  if (error || !data) return null;

  const c = data as unknown as Cupon;
  if (c.vence_el && new Date(c.vence_el) <= new Date()) return null;
  if (c.usos_max != null && c.usos >= c.usos_max) return null;
  return c;
}

/** Los cupones vigentes, para mostrarlos como promos en el home. */
export async function cuponesVigentes(): Promise<Cupon[]> {
  const { data, error } = await supabase
    .from("cupones")
    .select("*")
    .eq("activo", true)
    .order("codigo");

  if (error || !data) return [];

  const ahora = new Date();
  return (data as unknown as Cupon[]).filter(
    (c) => (!c.vence_el || new Date(c.vence_el) > ahora) && (c.usos_max == null || c.usos < c.usos_max)
  );
}

/** "20% OFF", "Envío gratis", "15% OFF + envío gratis" */
export function tituloCupon(c: Cupon): string {
  const partes: string[] = [];
  if (c.porcentaje) partes.push(`${c.porcentaje}% OFF`);
  if (c.envio_gratis) partes.push(partes.length ? "envío gratis" : "Envío gratis");
  return partes.join(" + ");
}
