/**
 * Cálculo de precios y horarios.
 *
 * Funciones puras, sin React y sin Supabase: se pueden testear solas y se usan
 * igual en el carrito, en el checkout y en el panel del comercio. Esa es la
 * razón de que exista este archivo — cuando cada pantalla calculaba su propio
 * total, los números no cerraban entre una y otra.
 */
import type { Cupon } from "./tipos";
import type { ComercioHorario } from "./tipos";

/** $3.200 — formato argentino, sin centavos. */
export function formatPrecio(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

export interface LineaCarrito {
  precio: number;
  cantidad: number;
}

export interface ResumenPrecio {
  subtotal: number;
  descuento: number;
  promoLabel: string | null;
  promoCodigo: string | null;
  envio: number;
  envioGratis: boolean;
  /** Cargo de la plataforma. 0 = no se cobra y no se muestra la fila. */
  tarifa: number;
  propina: number;
  total: number;
}

/** Cómo se cobra la tarifa de servicio. Sale de la tabla `configuracion`. */
export interface TarifaConfig {
  monto: number;
  pct: number;
}

/**
 * Calcula el total de un pedido.
 *
 * No conoce ninguna promoción: recibe el cupón ya buscado (o null) y aplica lo
 * que ese cupón diga. Antes tenía adentro el envío gratis por monto y un
 * descuento por medio de pago; eran decisiones comerciales metidas en el
 * código, y cambiarlas obligaba a publicar la app.
 *
 * Tampoco decide cuánto vale la tarifa de servicio: recibe la configuración ya
 * leída de la base. Sin `tarifa` no cobra nada, que es lo correcto cuando
 * todavía no sabemos cuánto es.
 *
 * Esto es una PREVISUALIZACIÓN. El total que vale lo calcula `crear_pedido` en
 * el servidor, que es el único que no se puede falsear desde la consola.
 */
export function calcularPrecio(opts: {
  lineas: LineaCarrito[];
  costoEnvio: number;
  cupon?: Cupon | null;
  tarifa?: TarifaConfig | null;
  /** Lo que el cliente eligió darle al repartidor. */
  propina?: number;
}): ResumenPrecio {
  const subtotal = opts.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const c = opts.cupon ?? null;

  const descuento = c?.porcentaje ? Math.round((subtotal * c.porcentaje) / 100) : 0;
  const envioGratis = !!c?.envio_gratis;
  const envio = envioGratis ? 0 : opts.costoEnvio;

  // La tarifa se calcula sobre el subtotal SIN descuento, y el envío gratis no
  // la toca: es plata de la plataforma, no del comercio. Misma cuenta que hace
  // `crear_pedido` en el servidor — si cambia una, tiene que cambiar la otra.
  const t = opts.tarifa ?? null;
  const tarifa = t
    ? Math.max(0, Math.round(t.monto) + Math.round((subtotal * t.pct) / 100))
    : 0;

  // La propina se suma al final, después del descuento: un cupón del 20%
  // descuenta la comida, no lo que el cliente decidió darle al repartidor.
  const propina = Math.max(0, Math.round(opts.propina ?? 0));

  return {
    subtotal,
    descuento,
    promoLabel: c?.descripcion ?? null,
    promoCodigo: c?.codigo ?? null,
    envio,
    envioGratis,
    tarifa,
    propina,
    total: Math.max(0, subtotal - descuento) + envio + tarifa + propina,
  };
}

/* ------------------------------- horarios -------------------------------- */

export interface EstadoApertura {
  abierto: boolean;
  /** "19:00" si está cerrado y sabemos cuándo abre. */
  abreA: string | null;
  /**
   * "22:00" si está abierto y hay horario cargado.
   *
   * Sirve para decir "Abierto · cierra 22:00" en la tarjeta: saber que está
   * abierto no alcanza para decidir si conviene pedir ahora o en una hora.
   */
  cierraA: string | null;
}

/**
 * Un local está abierto si el comercio no lo cerró a mano Y estamos dentro del
 * horario de hoy. Si no cargó horarios, vale sólo el interruptor manual.
 *
 * Devuelve además a qué hora abre, para poder decir "Cerrado · abre a las 19:00"
 * en vez de un cartel mudo. Un local cerrado igual se puede mirar: la carta es
 * justamente lo que la gente viene a ver.
 */
export function estadoApertura(
  abiertoManual: boolean,
  horarios: ComercioHorario[] = [],
  ahora: Date = new Date()
): EstadoApertura {
  if (!abiertoManual) return { abierto: false, abreA: proximaApertura(horarios, ahora), cierraA: null };
  if (horarios.length === 0) return { abierto: true, abreA: null, cierraA: null };

  const dia = ahora.getDay();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const deHoy = horarios.filter((h) => h.dia_semana === dia);

  const tramo = deHoy.find((h) => {
    const a = aMinutos(h.abre);
    const c = aMinutos(h.cierra);
    // Un tramo que cruza la medianoche (ej. 20:00 a 02:00) se parte en dos.
    return c > a ? minutosAhora >= a && minutosAhora < c : minutosAhora >= a || minutosAhora < c;
  });

  return tramo
    ? { abierto: true, abreA: null, cierraA: tramo.cierra.slice(0, 5) }
    : { abierto: false, abreA: proximaApertura(horarios, ahora), cierraA: null };
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function proximaApertura(horarios: ComercioHorario[], ahora: Date): string | null {
  if (horarios.length === 0) return null;
  const dia = ahora.getDay();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const hoyMasTarde = horarios
    .filter((h) => h.dia_semana === dia && aMinutos(h.abre) > minutosAhora)
    .sort((a, b) => aMinutos(a.abre) - aMinutos(b.abre))[0];
  if (hoyMasTarde) return hoyMasTarde.abre.slice(0, 5);

  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    const siguiente = horarios
      .filter((h) => h.dia_semana === d)
      .sort((a, b) => aMinutos(a.abre) - aMinutos(b.abre))[0];
    if (siguiente) return siguiente.abre.slice(0, 5);
  }
  return null;
}

/* -------------------------------- fechas --------------------------------- */

/** "Hoy 21:30", "Ayer 14:05", "04/09 19:12" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora}`;
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}
