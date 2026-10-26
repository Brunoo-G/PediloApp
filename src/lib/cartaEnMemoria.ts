/**
 * La última carta que cargó el catálogo, en memoria.
 *
 * El editor de producto la usa para abrir AL INSTANTE con los datos del
 * producto tocado, en vez de esperar a pedir el local y la carta entera al
 * servidor (que era la demora al pasar de un producto a otro). Igual los pide
 * de fondo para tener lo último, pero la pantalla ya está lista.
 *
 * `categorias` es la lista completa que ve el catálogo (las de los productos
 * y las creadas a mano, aunque estén vacías), para que el formulario ofrezca
 * las mismas.
 *
 * No persiste nada: es una variable de módulo que vive mientras la app está
 * abierta. Si no hay nada recordado, el editor carga como siempre.
 */
import type { Comercio, ProductoConFotos } from "./tipos";

let ultima: { local: Comercio; productos: ProductoConFotos[]; categorias: string[] } | null = null;

export function recordarCarta(local: Comercio, productos: ProductoConFotos[], categorias: string[]) {
  ultima = { local, productos, categorias };
}

export function cartaRecordada() {
  return ultima;
}
