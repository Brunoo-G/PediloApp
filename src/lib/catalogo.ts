/**
 * La carta del comercio: productos, fotos y la ficha del local.
 *
 * Todo lo que escribe acá está protegido por RLS: `es_dueno(comercio_id)`.
 * Si un día alguien llama a estas funciones con el id de otro local, la base
 * dice que no. Las validaciones de esta pantalla son para que el error se
 * entienda, no para que el dato esté seguro.
 */
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";
import type { Comercio, ComercioHorario, Producto, ProductoConFotos } from "./tipos";

/* ------------------------------- productos ------------------------------- */

/** Toda la carta del local, activos e inactivos, en el orden en que se muestra. */
export async function cartaDelComercio(comercioId: string): Promise<ProductoConFotos[]> {
  const { data, error } = await supabase
    .from("productos")
    .select("*, producto_fotos(*)")
    .eq("comercio_id", comercioId)
    .order("subcategoria")
    .order("orden")
    .order("nombre");

  if (error) return [];
  return (data ?? []) as unknown as ProductoConFotos[];
}

export interface DatosProducto {
  nombre: string;
  descripcion: string;
  precio: number;
  subcategoria: string;
  activo: boolean;
}

export type Resultado<T> = { ok: true; dato: T } | { ok: false; mensaje: string };

function leer(err: { message?: string } | null, porDefecto: string): string {
  const m = err?.message ?? "";
  if (/precio/i.test(m)) return "El precio tiene que ser mayor a cero.";
  if (/row-level security|policy/i.test(m)) return "Esa carta no es de tu local.";
  if (/3 fotos/i.test(m)) return "Un producto puede tener hasta 3 fotos.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) {
    return "La foto pesa más de 5 MB. Sacale una más chica o bajale la calidad.";
  }
  if (/mime type|not supported/i.test(m)) return "Ese archivo no es una imagen.";
  return m || porDefecto;
}

export async function crearProducto(
  comercioId: string,
  d: DatosProducto
): Promise<Resultado<Producto>> {
  const { data, error } = await supabase
    .from("productos")
    .insert({ ...d, comercio_id: comercioId } as never)
    .select()
    .single();

  if (error) return { ok: false, mensaje: leer(error, "No pudimos crear el producto.") };
  return { ok: true, dato: data as unknown as Producto };
}

export async function guardarProducto(
  id: string,
  d: Partial<DatosProducto>
): Promise<Resultado<Producto>> {
  const { data, error } = await supabase
    .from("productos")
    .update(d as never)
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, mensaje: leer(error, "No pudimos guardar los cambios.") };
  return { ok: true, dato: data as unknown as Producto };
}

/**
 * Sacar un producto de la carta.
 *
 * Ojo: esto borra de verdad. Para "se acabó por hoy" está `activo`, que lo
 * esconde sin perder la descripción, el precio ni las fotos. Los pedidos
 * viejos no se rompen porque `pedido_items` guarda el nombre y el precio
 * copiados: un pedido es un documento histórico, no una referencia.
 */
export async function borrarProducto(id: string): Promise<Resultado<true>> {
  const { error } = await supabase.from("productos").delete().eq("id", id);
  if (error) return { ok: false, mensaje: leer(error, "No pudimos borrar el producto.") };
  return { ok: true, dato: true };
}

/* --------------------------------- fotos --------------------------------- */

/**
 * base64 → bytes, a mano.
 *
 * En web alcanzaría con `fetch(uri).then(r => r.blob())`, pero en React Native
 * eso devuelve blobs que el cliente de Supabase sube vacíos. Pedirle el base64
 * al selector de imágenes y decodificarlo acá es lo único que funciona igual
 * en las tres plataformas.
 */
function base64ABytes(b64: string): Uint8Array {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const limpio = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const largo = Math.floor((limpio.length * 3) / 4);
  const bytes = new Uint8Array(largo);
  let p = 0;
  for (let i = 0; i < limpio.length; i += 4) {
    const a = abc.indexOf(limpio[i]);
    const b = abc.indexOf(limpio[i + 1]);
    const c = abc.indexOf(limpio[i + 2]);
    const d = abc.indexOf(limpio[i + 3]);
    if (p < largo) bytes[p++] = (a << 2) | (b >> 4);
    if (p < largo) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < largo) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

export interface ImagenElegida {
  bytes: Uint8Array;
  extension: string;
  tipo: string;
}

/**
 * Abre la galería y devuelve la imagen lista para subir, o null si la cerró.
 *
 * Se recorta a 4:3 y se comprime antes de salir del teléfono: una foto de
 * cámara moderna son 8 MB que nadie necesita para una miniatura de milanesa,
 * y esos 8 MB los paga el local en datos al subir y el cliente al mirar.
 */
export async function elegirImagen(cuadrada = false, aspecto?: [number, number]): Promise<ImagenElegida | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) return null;

  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: aspecto ?? (cuadrada ? [1, 1] : [4, 3]),
    quality: 0.7,
    base64: true,
  });

  if (r.canceled || !r.assets?.[0]?.base64) return null;
  const a = r.assets[0];
  const tipo = a.mimeType ?? "image/jpeg";
  const extension = tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg";
  return { bytes: base64ABytes(a.base64!), extension, tipo };
}

/**
 * Sube al bucket y devuelve la URL pública.
 *
 * La ruta arranca SIEMPRE con el id del local porque las políticas de Storage
 * miran esa primera carpeta para decidir si dejan escribir. Ver
 * migracion-06-storage-carta.sql.
 */
async function subir(
  bucket: "comercios" | "productos",
  ruta: string,
  img: ImagenElegida
): Promise<Resultado<string>> {
  const { error } = await supabase.storage.from(bucket).upload(ruta, img.bytes, {
    contentType: img.tipo,
    upsert: true,
  });
  if (error) return { ok: false, mensaje: leer(error, "No pudimos subir la foto.") };

  const { data } = supabase.storage.from(bucket).getPublicUrl(ruta);
  return { ok: true, dato: data.publicUrl };
}

export async function subirFotoDeProducto(
  comercioId: string,
  productoId: string,
  img: ImagenElegida
): Promise<Resultado<string>> {
  const ruta = `${comercioId}/${productoId}/${Date.now()}.${img.extension}`;
  const subida = await subir("productos", ruta, img);
  if (!subida.ok) return subida;

  const { data, error } = await supabase
    .from("producto_fotos")
    .insert({ producto_id: productoId, url: subida.dato, orden: Date.now() % 1000 } as never)
    .select()
    .single();

  if (error) return { ok: false, mensaje: leer(error, "La foto subió pero no quedó asociada.") };
  return { ok: true, dato: (data as unknown as { url: string }).url };
}

export async function borrarFoto(fotoId: string): Promise<Resultado<true>> {
  // Se borra la fila, no el archivo del bucket. Un archivo huérfano de 200 KB
  // es más barato que una foto que desaparece de un pedido viejo por un
  // borrado en cascada mal pensado. La limpieza del bucket es tarea aparte.
  const { error } = await supabase.from("producto_fotos").delete().eq("id", fotoId);
  if (error) return { ok: false, mensaje: leer(error, "No pudimos sacar la foto.") };
  return { ok: true, dato: true };
}

export async function subirImagenDelLocal(
  comercioId: string,
  cual: "logo" | "portada",
  img: ImagenElegida
): Promise<Resultado<string>> {
  const ruta = `${comercioId}/${cual}-${Date.now()}.${img.extension}`;
  const subida = await subir("comercios", ruta, img);
  if (!subida.ok) return subida;

  const campo = cual === "logo" ? "logo_url" : "portada_url";
  const { error } = await supabase
    .from("comercios")
    .update({ [campo]: subida.dato } as never)
    .eq("id", comercioId);

  if (error) return { ok: false, mensaje: leer(error, "La imagen subió pero no quedó guardada.") };
  return { ok: true, dato: subida.dato };
}

/**
 * La foto de una categoría del catálogo. Va al bucket del local (la primera
 * carpeta es su id, como pide Storage) y NO se guarda en ninguna tabla acá:
 * la URL la guarda la categoría cuando el local toca "Guardar".
 */
export async function subirImagenDeCategoria(comercioId: string, img: ImagenElegida): Promise<Resultado<string>> {
  const ruta = `${comercioId}/categoria-${Date.now()}.${img.extension}`;
  return subir("comercios", ruta, img);
}

/* ------------------------------- el local -------------------------------- */

/**
 * El local que administra un usuario.
 *
 * Hay que filtrar por `dueno_id` a mano: la política de lectura de `comercios`
 * es pública a propósito (el marketplace muestra todos los locales), así que
 * RLS acá no filtra nada. Confiar en ella sería devolverle al comercio el
 * primer local de la lista, que puede no ser el suyo.
 */
export async function miComercio(usuarioId: string): Promise<Comercio | null> {
  const { data } = await supabase
    .from("comercios")
    .select("*")
    .eq("dueno_id", usuarioId)
    .limit(1)
    .maybeSingle();
  return (data as unknown as Comercio) ?? null;
}

export async function guardarComercio(
  id: string,
  campos: Partial<Comercio>
): Promise<Resultado<Comercio>> {
  const { data, error } = await supabase
    .from("comercios")
    .update(campos as never)
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, mensaje: leer(error, "No pudimos guardar los cambios.") };
  return { ok: true, dato: data as unknown as Comercio };
}

/* -------------------------------- horarios -------------------------------- */

/**
 * Los horarios de un local, uno por día como máximo.
 *
 * La tabla permite varios tramos por día (la clave única es comercio_id + día +
 * hora de apertura), pensando en el local que cierra al mediodía. La pantalla
 * de hoy carga **un solo tramo por día**: es lo que cubre a la mayoría, y
 * duplicar los campos para el caso de la siesta hacía una pantalla de catorce
 * inputs que nadie completa. Si mañana hace falta, el modelo ya lo aguanta sin
 * migración.
 */
export async function horariosDelComercio(comercioId: string): Promise<ComercioHorario[]> {
  const { data } = await supabase
    .from("comercio_horarios")
    .select("*")
    .eq("comercio_id", comercioId)
    .order("dia_semana");
  return (data ?? []) as unknown as ComercioHorario[];
}

/**
 * Reemplaza los horarios del local.
 *
 * Borra y vuelve a insertar en lugar de comparar fila por fila. Son siete
 * filas: el diff no ahorra nada y sí agrega la posibilidad de que queden
 * huérfanas las de un día que se apagó.
 *
 * Que la lista venga vacía es una respuesta válida y significa **sin horario
 * fijo**: manda sólo el interruptor de abierto/cerrado. Es el estado en el que
 * arranca un local nuevo.
 */
export async function guardarHorarios(
  comercioId: string,
  tramos: { dia_semana: number; abre: string; cierra: string }[]
): Promise<Resultado<null>> {
  const { error: errorBorrado } = await supabase
    .from("comercio_horarios")
    .delete()
    .eq("comercio_id", comercioId);
  if (errorBorrado) return { ok: false, mensaje: leer(errorBorrado, "No pudimos guardar los horarios.") };

  if (tramos.length === 0) return { ok: true, dato: null };

  const { error } = await supabase
    .from("comercio_horarios")
    .insert(tramos.map((t) => ({ ...t, comercio_id: comercioId })) as never);
  if (error) return { ok: false, mensaje: leer(error, "No pudimos guardar los horarios.") };
  return { ok: true, dato: null };
}

/**
 * "9" pasa a "09:00", "9.5" a "09:05", "25:99" a null.
 *
 * Se acepta lo que la gente escribe de verdad en un teclado de celular, que
 * casi nunca incluye el cero de adelante ni los dos puntos.
 */
export function normalizarHora(txt: string): string | null {
  const limpio = txt.trim().replace(/[.\s]/g, ":");
  const m = limpio.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
