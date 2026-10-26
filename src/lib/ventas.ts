/**
 * Ingresos del comercio.
 *
 * La cuenta la hace `resumen_ventas` en Postgres, no acá. No es por rendimiento
 * (aunque también): es porque "cuánto cobra el local" es una regla de negocio
 * sobre plata, y esas tienen que vivir en un solo lugar. Si mañana cambia quién
 * paga los cupones, se cambia en la función y todas las pantallas dicen lo
 * mismo el mismo día.
 */
import { supabase } from "./supabase";

export interface ProductoVendido {
  nombre: string;
  unidades: number;
  ingresos: number;
}

export interface DiaVendido {
  /** "2026-09-15" */
  fecha: string;
  ingresos: number;
  pedidos: number;
}

export interface ResumenVentas {
  desde: string;
  dias: number;
  /** Lo que cobra el local: precio de carta, sin envío ni tarifa de servicio. */
  ingresos: number;
  pedidos: number;
  productos_vendidos: number;
  ticket_promedio: number;
  en_curso: number;
  rechazados: number;
  /** Lo que puso Pedilo en cupones. No le resta nada al local. */
  descuentos_pedilo: number;
  top: ProductoVendido[];
  por_dia: DiaVendido[];
}

export type ResultadoVentas =
  | { ok: true; dato: ResumenVentas }
  | { ok: false; mensaje: string };

export async function resumenVentas(dias: number): Promise<ResultadoVentas> {
  const { data, error } = await supabase.rpc("resumen_ventas", { p_dias: dias } as never);

  if (error) {
    const m = error.message ?? "";
    if (/function .*resumen_ventas.* does not exist|schema cache/i.test(m)) {
      return { ok: false, mensaje: "Falta correr supabase/migracion-08-ingresos.sql en Supabase." };
    }
    if (/no administra ningún local/i.test(m)) {
      return { ok: false, mensaje: "Tu cuenta todavía no está vinculada a un local." };
    }
    return { ok: false, mensaje: "No pudimos traer los números. Probá de nuevo." };
  }

  return { ok: true, dato: data as unknown as ResumenVentas };
}
