/**
 * Distancias y zona de cobertura.
 *
 * Funciones puras, sin React ni Supabase. La regla de "hasta acá llegamos" vive
 * en un solo lugar: si mañana el radio pasa a ser por local, se cambia acá y
 * todas las pantallas se enteran.
 */

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_KM = 6371;

/**
 * Distancia en línea recta entre dos puntos (fórmula del haversine).
 *
 * OJO: es distancia en línea recta, no de manejo. En una ciudad la calle
 * siempre es más larga que la recta — típicamente entre 20% y 40% más. Para
 * decidir si un local está "en zona" alcanza y sobra; para cobrar el envío por
 * kilómetro habría que usar una API de rutas, que ya cuesta plata.
 */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return RADIO_TIERRA_KM * 2 * Math.asin(Math.sqrt(h));
}

/** "1,2 km" · "850 m" — a menos de 1km la gente piensa en metros. */
export function formatDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export interface Cobertura {
  /** null cuando no se puede saber: falta el pin del cliente o el del local. */
  enZona: boolean | null;
  km: number | null;
  radioKm: number;
  /** Frase lista para mostrar. */
  detalle: string;
}

/**
 * ¿Este local entrega en la dirección del cliente?
 *
 * El radio sale de la configuración global, salvo que el local tenga el suyo
 * cargado. Hoy ninguno lo tiene: la app se prueba en una ciudad chica y un solo
 * número alcanza.
 *
 * Si falta alguna coordenada devuelve `enZona: null` — que NO es lo mismo que
 * "está lejos". Sin datos no se bloquea a nadie: se le pide el pin y listo.
 */
export function cobertura(
  cliente: Punto | null,
  local: Punto | null,
  radioGlobalKm: number,
  radioDelLocalKm?: number | null
): Cobertura {
  const radioKm = radioDelLocalKm ?? radioGlobalKm;

  if (!cliente) return { enZona: null, km: null, radioKm, detalle: "Cargá tu dirección para ver si llegan" };
  if (!local) return { enZona: null, km: null, radioKm, detalle: "Este local todavía no cargó su ubicación" };

  const km = distanciaKm(cliente, local);
  const enZona = km <= radioKm;

  return {
    enZona,
    km,
    radioKm,
    detalle: enZona
      ? `A ${formatDistancia(km)} de tu dirección`
      : `Está a ${formatDistancia(km)}, fuera de la zona de entrega (${radioKm} km)`,
  };
}

/** Coordenada válida y dentro del planeta. Filtra los ceros de datos sin cargar. */
export function puntoValido(lat?: number | null, lng?: number | null): Punto | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // la "isla nula" en el golfo de Guinea
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
