/**
 * Pedilo — sistema de diseño
 *
 * Una sola fuente de verdad para color, tipografía, espaciado y sombras.
 * En React Native no hay CSS: acá viven los valores que en el prototipo web
 * estaban en variables CSS.
 */
import { Platform, type ViewStyle, type TextStyle } from "react-native";

/* ------------------------------- color ---------------------------------- */

export const color = {
  /** Verde neón de marca. Sólo como FONDO, siempre con texto negro encima (11.85:1). */
  brand: "#6EE51A",
  /** Verde para TEXTO e íconos sobre fondo claro. 4.99:1 sobre blanco: pasa WCAG AA. */
  brandInk: "#387F0D",
  brandDark: "#2A6108",
  /** Verde muy claro para fondos suaves y estados seleccionados. */
  brandWash: "#F1FCE4",

  /** Negro de marca. No es negro puro: #000 se ve duro en pantalla. */
  ink: "#0E0E0E",
  inkSoft: "#161616",
  inkBorder: "#262626",

  /* Neutrales cálidos. El gris frío por defecto es lo que hacía ver la app genérica. */
  n50: "#FAFAF9",
  n100: "#F4F4F2",
  n200: "#E7E7E4",
  /** Sólo bordes e iconografía decorativa. NUNCA texto: da 2.53:1. */
  n300: "#A3A3A0",
  /**
   * Texto terciario. 5.4:1 sobre blanco.
   *
   * Se oscureció (antes #767572) porque en el teléfono, al sol, los rótulos
   * chicos en este gris se perdían contra el fondo.
   */
  n400: "#6B6A67",
  /** Texto secundario. 8.1:1 sobre blanco. */
  n600: "#4B4A4E",
  n900: "#1A1A1A",

  white: "#FFFFFF",
  danger: "#C6362C",
  dangerWash: "#FDEAEA",
  warn: "#B45309",
  warnWash: "#FEF3E2",
} as const;

/** Estados del pedido. El estado activo usa el verde de marca a propósito. */
export const estadoColor = {
  Pendiente: { bg: "#FEF3E2", fg: "#B45309", dot: "#F59E0B" },
  Preparando: { bg: "#E8F1FE", fg: "#1D4ED8", dot: "#3B82F6" },
  Listo: { bg: "#EDE9FE", fg: "#5B21B6", dot: "#8B5CF6" },
  "En camino": { bg: color.brandWash, fg: color.brandInk, dot: color.brand },
  Entregado: { bg: "#F0F0EE", fg: "#57565A", dot: "#A3A3A0" },
  Rechazado: { bg: "#FDEAEA", fg: "#C6362C", dot: "#DC2626" },
} as const;

export type EstadoPedido = keyof typeof estadoColor;

/**
 * El color de los ENVÍOS.
 *
 * Los envíos y los pedidos a locales conviven en la misma base y en la misma
 * app, y para el repartidor son dos cosas que tiene que poder distinguir de un
 * vistazo desde la moto. El verde de marca es de los pedidos; los envíos usan
 * este violeta y no aparece en ningún otro lado, así que ver violeta ya es
 * saber de qué se trata antes de leer una palabra.
 *
 * `fg` sobre blanco da 8.6:1 y sobre `wash` 7.4:1: pasa AA holgado en los dos.
 */
export const envioColor = {
  bg: "#4436A8",
  fg: "#3B2F93",
  wash: "#EEEBFF",
  borde: "#C9C1F5",
} as const;

/** Los pasos que ve el cliente en un envío. Sin cocina: no hay local. */
export const PASOS_ENVIO: EstadoPedido[] = ["Pendiente", "En camino", "Entregado"];

/**
 * Los pasos que ve el cliente en la barra de progreso.
 *
 * No son todos los estados. "Listo" existe en la base —el local lo marca
 * cuando terminó de cocinar y el pedido queda esperando al repartidor— pero es
 * un paso de la cocina, no del cliente: desde afuera "lo están preparando" y
 * "está hecho esperando que lo retiren" son el mismo minuto de espera, y un
 * paso más en la barra es una promesa más que cumplir.
 *
 * `ProgresoPedido` sabe dónde cae cada estado que no está en esta lista.
 */
export const PASOS_PEDIDO: EstadoPedido[] = ["Pendiente", "Preparando", "En camino", "Entregado"];

/** Cada rubro con su color. Son la identidad visual del home. */
export const categoriaColor: Record<string, { bg: string; fg: string; ring: string }> = {
  Todos: { bg: "#F0F0EE", fg: "#3F3F3F", ring: "#111111" },
  Restaurante: { bg: "#FCEDE6", fg: "#A5391F", ring: "#A5391F" },
  Heladería: { bg: "#FDE7EF", fg: "#9B2F55", ring: "#9B2F55" },
  Supermercado: { bg: "#E9F6E2", fg: "#2E6B2E", ring: "#2E6B2E" },
  Rotisería: { bg: "#FFEFDD", fg: "#8A4B12", ring: "#8A4B12" },
  Farmacia: { bg: "#E7EEFF", fg: "#2A4B9B", ring: "#2A4B9B" },
  Pañalera: { bg: "#EFEAFB", fg: "#5B3D99", ring: "#5B3D99" },
};

export const CATEGORIAS = [
  "Todos",
  "Heladería",
  "Supermercado",
  "Rotisería",
  "Farmacia",
  "Restaurante",
  "Pañalera",
] as const;

/* ----------------------------- tipografía -------------------------------- */

/**
 * Figtree: geométrica humanista, muy parecida a Proxima Nova pero libre.
 * Montserrat (la alternativa anterior) es más ancha y refuerza el look genérico.
 */
export const fuente = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  extrabold: "Figtree_800ExtraBold",
} as const;

/** El problema del prototipo viejo era que todo vivía entre 12 y 15px. */
export const texto = {
  display: { fontFamily: fuente.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: color.n900 },
  title: { fontFamily: fuente.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.35, color: color.n900 },
  head: { fontFamily: fuente.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: color.n900 },
  body: { fontFamily: fuente.regular, fontSize: 15, lineHeight: 21, color: color.n900 },
  price: { fontFamily: fuente.extrabold, fontSize: 17, lineHeight: 20, letterSpacing: -0.2, color: color.n900 },
  label: { fontFamily: fuente.semibold, fontSize: 14, lineHeight: 18, color: color.n900 },
  cap: { fontFamily: fuente.medium, fontSize: 13, lineHeight: 17, color: color.n600 },
  micro: {
    fontFamily: fuente.bold,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    color: color.n600,
  },
} satisfies Record<string, TextStyle>;

/* ------------------------- espaciado y radios ---------------------------- */

/** Escala de 4. Margen lateral de pantalla siempre 16. */
export const espacio = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radio = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Ocupar todo el contenedor. Reemplaza a StyleSheet.absoluteFillObject,
 *  que dejó de estar tipado en RN 0.86. */
export const LLENO = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Mínimo táctil. Todo lo clickeable tiene que llegar acá. */
export const TAP_MIN = 44;

/* -------------------------------- sombras -------------------------------- */

/**
 * En web y iOS se puede sombrear con precisión; Android sólo entiende `elevation`,
 * que es un número y no un color. Por eso cada nivel define las dos cosas.
 */
function sombra(elevation: number, y: number, blur: number, opacity: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: color.ink,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
  })!;
}

export const sombras = {
  sm: sombra(1, 1, 3, 0.06),
  md: sombra(3, 4, 12, 0.09),
  lg: sombra(8, 8, 24, 0.12),
  /** Sólo para el botón de acción principal. */
  brand: Platform.select<ViewStyle>({
    android: { elevation: 6 },
    default: {
      shadowColor: color.brand,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
    },
  })!,
} as const;

/* -------------------------------- motion --------------------------------- */

/** Duraciones en ms. Coinciden con las del prototipo web. */
export const dur = { instant: 100, fast: 180, base: 240, slow: 320 } as const;

/* ---------------------------- reglas del negocio -------------------------- */

/**
 * No hay promociones en el código.
 *
 * Antes vivían acá el envío gratis por monto y un descuento por pagar con
 * Mercado Pago. Las dos se fueron: son decisiones comerciales, no constantes
 * técnicas, y tenerlas hardcodeadas significaba que cambiarlas era publicar una
 * versión nueva de la app.
 *
 * Ahora toda promoción es una fila en la tabla `cupones` de Supabase. Se crea,
 * se cambia y se apaga desde el panel. Un cupón puede dar un porcentaje de
 * descuento, envío gratis, o las dos cosas. Ver src/lib/cupones.ts.
 */

/**
 * Cómo se paga. Por ahora (14/10) TODO se paga al recibir: en efectivo, con un
 * QR o con una transferencia, en la puerta. Tarjeta y Mercado Pago se sacaron
 * de la app hasta que haya cobro online de verdad; la base sigue entendiendo
 * esos valores para los pedidos viejos, pero ya no deja crear pedidos nuevos
 * con ellos (migración 27).
 *
 * Los textos sirven igual para un pedido y para un envío ("al recibir").
 */
export const METODOS_PAGO = [
  { id: "efectivo", label: "Efectivo", desc: "Pagás en efectivo al recibir", emoji: "💵" },
  { id: "qr", label: "QR", desc: "Escaneás un QR al recibir", emoji: "📱" },
  { id: "transferencia", label: "Transferencia", desc: "Transferís al recibir", emoji: "🏦" },
] as const;

/** Si un medio de pago guardado (en el perfil) sigue existiendo; si no, efectivo. */
export function metodoVigente(id: string | null | undefined): string {
  return METODOS_PAGO.some((m) => m.id === id) ? (id as string) : "efectivo";
}

/** Los pagos que se cobran en la puerta. El resto se resuelve antes. */
export const PAGO_EN_PUERTA = ["efectivo", "qr", "transferencia", "tarjeta", "debito", "credito"] as const;
