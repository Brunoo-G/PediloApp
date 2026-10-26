/**
 * A dónde le transfiere Pedilo al local lo que vendió, o al repartidor su parte.
 *
 * Vive en tablas propias (`comercio_cobro` y `repartidor_cobro`, migración 21)
 * y no en `comercios`/`perfiles`, porque esas las lee más gente y un CBU no
 * puede quedar a un `select *` de otro. Sólo el dueño de la fila la ve y edita.
 */
import { supabase } from "./supabase";

export type TipoCuenta = "cbu" | "cvu" | "alias";

export interface DatosCobro {
  tipo: TipoCuenta;
  valor: string;
  titular: string;
  cuit: string;
  actualizado_en?: string;
}

export type ResultadoCobro = { ok: true; dato: DatosCobro } | { ok: false; mensaje: string };

/**
 * Entiende lo que pegó la persona y le dice qué es.
 *
 * Se acepta cualquiera de las tres cosas en el mismo campo —nadie sabe si lo
 * que tiene anotado es un CBU o un CVU, y no tiene por qué saberlo—:
 *
 *  - 22 dígitos que arrancan con 000 → CVU (Mercado Pago, Ualá, billeteras).
 *  - 22 dígitos → CBU, y además se revisan los dos dígitos verificadores.
 *  - Letras, números, puntos y guiones, de 6 a 20 → alias.
 *
 * Los espacios y guiones que traen los CBU copiados de un home banking se
 * sacan antes de mirar.
 */
export function leerCuenta(texto: string): { ok: true; tipo: TipoCuenta; valor: string } | { ok: false; mensaje: string } {
  const crudo = texto.trim();
  if (!crudo) return { ok: false, mensaje: "Escribí tu CBU, CVU o alias." };

  const soloDigitos = crudo.replace(/[\s-]/g, "");
  if (/^[0-9]+$/.test(soloDigitos)) {
    if (soloDigitos.length !== 22) {
      return {
        ok: false,
        mensaje: `Un CBU o CVU tiene 22 números y este tiene ${soloDigitos.length}. Revisá que no falte ni sobre ninguno.`,
      };
    }
    if (soloDigitos.startsWith("000")) return { ok: true, tipo: "cvu", valor: soloDigitos };
    if (!cbuValido(soloDigitos)) {
      return {
        ok: false,
        mensaje: "Ese CBU no da: puede haber dos números cambiados de lugar. Copialo de nuevo desde tu banco.",
      };
    }
    return { ok: true, tipo: "cbu", valor: soloDigitos };
  }

  const alias = crudo.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(alias)) {
    return { ok: false, mensaje: "Un alias sólo lleva letras, números, puntos y guiones. Sin espacios ni tildes." };
  }
  if (alias.length < 6 || alias.length > 20) {
    return { ok: false, mensaje: "Un alias tiene entre 6 y 20 caracteres." };
  }
  return { ok: true, tipo: "alias", valor: alias };
}

/**
 * Los dos dígitos verificadores del CBU.
 *
 * El CBU son dos bloques: 8 dígitos (banco y sucursal, el último verifica) y
 * 14 (la cuenta, el último verifica). Cada verificador sale de multiplicar los
 * dígitos anteriores por 7-1-3-9 en ciclo. Si no cierra, casi seguro hay dos
 * números invertidos, que es el error de tipeo más común.
 */
export function cbuValido(cbu: string): boolean {
  if (!/^[0-9]{22}$/.test(cbu)) return false;
  const d = cbu.split("").map(Number);

  const p1 = [7, 1, 3, 9, 7, 1, 3];
  const s1 = p1.reduce((acc, p, i) => acc + p * d[i], 0);
  if ((10 - (s1 % 10)) % 10 !== d[7]) return false;

  const p2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  const s2 = p2.reduce((acc, p, i) => acc + p * d[8 + i], 0);
  return (10 - (s2 % 10)) % 10 === d[21];
}

/** "0000003100012345678901" → "0000 0031 0001 2345 6789 01", para leerlo. */
export function mostrarCuenta(d: Pick<DatosCobro, "tipo" | "valor">): string {
  if (d.tipo === "alias") return d.valor;
  return d.valor.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function nombreTipo(t: TipoCuenta): string {
  return t === "alias" ? "Alias" : t.toUpperCase();
}

/**
 * De quién es la cuenta. Un local (`comercio_cobro`, la edita el dueño) o un
 * repartidor (`repartidor_cobro`, la edita él). Misma forma, misma validación;
 * cambia sólo la tabla y la columna que dice de quién es.
 */
export type DuenoCobro = { comercio: string } | { repartidor: string };

function destino(d: DuenoCobro): { tabla: string; columna: string; id: string } {
  return "comercio" in d
    ? { tabla: "comercio_cobro", columna: "comercio_id", id: d.comercio }
    : { tabla: "repartidor_cobro", columna: "perfil_id", id: d.repartidor };
}

const COLUMNAS = "tipo, valor, titular, cuit, actualizado_en";

export async function leerDatosDeCobro(dueno: DuenoCobro): Promise<DatosCobro | null> {
  const { tabla, columna, id } = destino(dueno);
  const { data, error } = await supabase
    .from(tabla as never)
    .select(COLUMNAS)
    .eq(columna, id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DatosCobro;
}

export async function guardarCobro(
  dueno: DuenoCobro,
  d: { cuenta: string; titular: string; cuit: string }
): Promise<ResultadoCobro> {
  const cuenta = leerCuenta(d.cuenta);
  if (!cuenta.ok) return cuenta;

  const titular = d.titular.trim();
  if (titular.length < 3) return { ok: false, mensaje: "Escribí a nombre de quién está la cuenta." };

  const cuit = d.cuit.replace(/[\s-]/g, "");
  if (cuit && !/^[0-9]{11}$/.test(cuit)) {
    return { ok: false, mensaje: "El CUIT tiene 11 números. Si no lo tenés a mano, dejalo vacío." };
  }

  const { tabla, columna, id } = destino(dueno);
  const fila = { [columna]: id, tipo: cuenta.tipo, valor: cuenta.valor, titular, cuit };
  const { data, error } = await supabase
    .from(tabla as never)
    .upsert(fila as never, { onConflict: columna })
    .select(COLUMNAS)
    .single();

  if (error) {
    return { ok: false, mensaje: "No pudimos guardar los datos. Revisá la conexión y probá de nuevo." };
  }
  return { ok: true, dato: data as unknown as DatosCobro };
}

/** Los del local. Se mantienen con este nombre porque así los usa `(comercio)/local.tsx`. */
export const misDatosDeCobro = (comercioId: string) => leerDatosDeCobro({ comercio: comercioId });
export const guardarDatosDeCobro = (comercioId: string, d: { cuenta: string; titular: string; cuit: string }) =>
  guardarCobro({ comercio: comercioId }, d);
