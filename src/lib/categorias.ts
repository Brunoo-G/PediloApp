/**
 * Las categorías del catálogo del local.
 *
 * Una categoría es, para el cliente, el NOMBRE que tiene cada producto en
 * `productos.subcategoria`. Esta tabla (`comercio_categorias`, migración 22)
 * guarda lo que el nombre solo no puede:
 *
 *  - que exista aunque todavía no tenga productos (la tarjeta "+"),
 *  - qué imagen lleva: un dibujo elegido (`icono`) o una foto (`foto_url`).
 *    Sin nada elegido, el catálogo decide solo (foto de un producto o un
 *    dibujo según el nombre).
 *
 * Renombrar cambia el nombre en todos sus productos. Borrar NO borra
 * productos: quedan en "Sin categoría".
 *
 * Si la tabla todavía no existe en la base (la migración no se corrió), no se
 * rompe nada: lo que no puede ir a la base se guarda en el teléfono y, apenas
 * la tabla aparece, se sube y se borra del teléfono.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export interface Categoria {
  nombre: string;
  /** Uno de los dibujos de `ArteSeccion` (`TEMAS`). null = automático. */
  icono: string | null;
  foto_url: string | null;
}

export type ResultadoCategoria = { ok: true; categoria: Categoria } | { ok: false; mensaje: string };

const clave = (comercioId: string) => `pedilo.categorias.${comercioId}`;
const TABLA = "comercio_categorias";

export function normalizarCategoria(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** "  bebidas   frías " → "Bebidas frías": primera en mayúscula, espacios limpios. */
export function prolijarCategoria(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const mismo = (a: string, b: string) => normalizarCategoria(a) === normalizarCategoria(b);

/* ---------------------------- en el teléfono ----------------------------- */

async function locales(comercioId: string): Promise<Categoria[]> {
  try {
    const crudo = await AsyncStorage.getItem(clave(comercioId));
    const lista = crudo ? JSON.parse(crudo) : [];
    if (!Array.isArray(lista)) return [];
    // La primera versión guardaba sólo nombres.
    return lista
      .map((x) => (typeof x === "string" ? { nombre: x, icono: null, foto_url: null } : x))
      .filter((x) => x && typeof x.nombre === "string");
  } catch {
    return [];
  }
}

async function guardarLocales(comercioId: string, lista: Categoria[]) {
  try {
    if (lista.length) await AsyncStorage.setItem(clave(comercioId), JSON.stringify(lista));
    else await AsyncStorage.removeItem(clave(comercioId));
  } catch {
    /* sin almacenamiento: queda sólo en memoria hasta que se recargue */
  }
}

function faltaLaTabla(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /comercio_categorias/.test(error.message ?? "");
}

/* ------------------------------- leer ------------------------------------ */

export async function misCategorias(comercioId: string): Promise<Categoria[]> {
  const enTelefono = await locales(comercioId);
  const { data, error } = await supabase
    .from(TABLA as never)
    .select("nombre, icono, foto_url, orden, creado_en")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("creado_en", { ascending: true });

  if (error || !Array.isArray(data)) return enTelefono;

  const enBase = (data as unknown as Categoria[]).map((r) => ({
    nombre: r.nombre,
    icono: r.icono ?? null,
    foto_url: r.foto_url ?? null,
  }));

  // La tabla ya existe: lo que había quedado en el teléfono se sube.
  if (enTelefono.length) {
    const faltan = enTelefono.filter((n) => !enBase.some((b) => mismo(b.nombre, n.nombre)));
    if (faltan.length) {
      const { error: e2 } = await supabase
        .from(TABLA as never)
        .insert(faltan.map((c) => ({ comercio_id: comercioId, ...c })) as never);
      if (!e2) {
        await guardarLocales(comercioId, []);
        return [...enBase, ...faltan];
      }
      return [...enBase, ...faltan];
    }
    await guardarLocales(comercioId, []);
  }
  return enBase;
}

/* ------------------------------- validar --------------------------------- */

function validarNombre(nombre: string, existentes: string[], propio?: string): ResultadoCategoria | string {
  const limpio = prolijarCategoria(nombre);
  if (limpio.length < 2) return { ok: false, mensaje: "Escribí un nombre de al menos 2 letras." };
  if (limpio.length > 40) return { ok: false, mensaje: "Que sea más corto: hasta 40 letras." };
  const repetida = existentes.find((x) => mismo(x, limpio) && !(propio && mismo(x, propio)));
  if (repetida) return { ok: false, mensaje: `Ya tenés la categoría "${repetida}".` };
  return limpio;
}

/* ------------------------------- crear ----------------------------------- */

/**
 * Crea una categoría vacía. `existentes` son los nombres que ya se ven en el
 * catálogo (de la tabla y de los productos), para frenar un duplicado antes
 * de ir al servidor.
 */
export async function crearCategoria(
  comercioId: string,
  datos: { nombre: string; icono: string | null; foto_url: string | null },
  existentes: string[]
): Promise<ResultadoCategoria> {
  const v = validarNombre(datos.nombre, existentes);
  if (typeof v !== "string") return v;
  const cat: Categoria = { nombre: v, icono: datos.icono, foto_url: datos.foto_url };

  const { error } = await supabase.from(TABLA as never).insert({ comercio_id: comercioId, ...cat } as never);
  if (!error) return { ok: true, categoria: cat };
  if (error.code === "23505") return { ok: false, mensaje: `Ya tenés la categoría "${v}".` };
  if (faltaLaTabla(error)) {
    const l = await locales(comercioId);
    await guardarLocales(comercioId, [...l.filter((x) => !mismo(x.nombre, v)), cat]);
    return { ok: true, categoria: cat };
  }
  return { ok: false, mensaje: "No pudimos crear la categoría. Revisá la conexión y probá de nuevo." };
}

/* ------------------------------- editar ---------------------------------- */

/**
 * Cambia nombre y/o imagen. Si cambia el nombre, se lo cambia también a sus
 * productos (`idsProductos`), que es lo que ve el cliente.
 */
export async function editarCategoria(
  comercioId: string,
  viejo: string,
  datos: { nombre: string; icono: string | null; foto_url: string | null },
  existentes: string[],
  idsProductos: string[]
): Promise<ResultadoCategoria> {
  const v = validarNombre(datos.nombre, existentes, viejo);
  if (typeof v !== "string") return v;
  const cat: Categoria = { nombre: v, icono: datos.icono, foto_url: datos.foto_url };

  if (v !== viejo && idsProductos.length) {
    const { error } = await supabase
      .from("productos")
      .update({ subcategoria: v } as never)
      .eq("comercio_id", comercioId)
      .in("id", idsProductos);
    if (error) return { ok: false, mensaje: "No pudimos cambiarle el nombre a sus productos. Probá de nuevo." };
  }

  // La fila puede no existir: las categorías que salieron de los productos no
  // tienen una hasta que se les elige imagen.
  const { data, error } = await supabase
    .from(TABLA as never)
    .update(cat as never)
    .eq("comercio_id", comercioId)
    .eq("nombre", viejo)
    .select("nombre");

  if (faltaLaTabla(error)) {
    const l = await locales(comercioId);
    await guardarLocales(comercioId, [...l.filter((x) => !mismo(x.nombre, viejo) && !mismo(x.nombre, v)), cat]);
    return { ok: true, categoria: cat };
  }
  if (error) return { ok: false, mensaje: "No pudimos guardar la categoría. Revisá la conexión y probá de nuevo." };

  if (!Array.isArray(data) || data.length === 0) {
    const { error: e2 } = await supabase.from(TABLA as never).insert({ comercio_id: comercioId, ...cat } as never);
    if (e2 && e2.code !== "23505") {
      return { ok: false, mensaje: "No pudimos guardar la categoría. Revisá la conexión y probá de nuevo." };
    }
  }
  return { ok: true, categoria: cat };
}

/* ------------------------------- borrar ---------------------------------- */

/**
 * Borra la categoría. Sus productos NO se borran: quedan sin categoría, que
 * es fácil de deshacer; borrar productos por borrar una categoría, no.
 */
export async function borrarCategoria(
  comercioId: string,
  nombre: string,
  idsProductos: string[]
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (idsProductos.length) {
    const { error } = await supabase
      .from("productos")
      .update({ subcategoria: "" } as never)
      .eq("comercio_id", comercioId)
      .in("id", idsProductos);
    if (error) return { ok: false, mensaje: "No pudimos mover sus productos. Probá de nuevo." };
  }

  const { error } = await supabase.from(TABLA as never).delete().eq("comercio_id", comercioId).eq("nombre", nombre);
  const l = await locales(comercioId);
  if (l.some((x) => mismo(x.nombre, nombre))) await guardarLocales(comercioId, l.filter((x) => !mismo(x.nombre, nombre)));
  if (error && !faltaLaTabla(error)) {
    return { ok: false, mensaje: "No pudimos borrar la categoría. Revisá la conexión y probá de nuevo." };
  }
  return { ok: true };
}

/**
 * Las categorías de un local para la ficha que ve el cliente (migración 25:
 * lectura pública, sólo de locales aprobados). Sin efectos: no toca lo que el
 * local guardó en su teléfono. Si falla, devuelve [] y la ficha usa los
 * íconos automáticos.
 */
export async function categoriasPublicas(comercioId: string): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from(TABLA as never)
    .select("nombre, icono, foto_url, orden, creado_en")
    .eq("comercio_id", comercioId)
    .order("orden", { ascending: true })
    .order("creado_en", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown as Categoria[]).map((r) => ({
    nombre: r.nombre,
    icono: r.icono ?? null,
    foto_url: r.foto_url ?? null,
  }));
}
