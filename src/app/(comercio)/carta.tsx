/**
 * La carta del local ("Stock de productos").
 *
 * Se entra por **categorías**, como en las apps de súper: una grilla de
 * tarjetas con dibujo (o la foto de un producto de esa categoría, si hay), y
 * adentro de cada una, sus productos. Con cinco productos una lista larga
 * alcanzaba; con doscientos, encontrar la leche entre los detergentes no.
 *
 * Arriba, un buscador. Afuera busca en todo el catálogo; adentro de una
 * categoría, sólo en esa ("Buscar en Bebidas"). Busca por nombre y por
 * descripción, sin importar tildes ni mayúsculas.
 *
 * Al final de la grilla, una tarjeta "+" crea una categoría vacía (tabla
 * `comercio_categorias`, migración 22) para cargarle productos después.
 *
 * Además de las categorías del local hay dos tarjetas fijas:
 *  - **Todos**: la lista completa agrupada, como era antes.
 *  - **Sin stock**: sólo los apagados. Aparece si hay alguno. Es lo que se
 *    busca a la mañana para volver a prender lo que llegó.
 *
 * La operación de todos los días sigue siendo **apagar y prender
 * productos**, y por eso el interruptor sigue en la fila, sin entrar a nada.
 * Cambiar un precio abre el editor, porque un precio cambiado sin querer es
 * peor que dos taps de más.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Boton, Dialogo, EstadoVacio, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import { EncabezadoComercio } from "../../componentes/EncabezadoComercio";
import { IconoCerrar, IconoLapiz, IconoLupa, IconoVolver } from "../../componentes/Iconos";
import { HojaCategoria, ImagenCategoria } from "../../componentes/HojaCategoria";
import { useSesion } from "../../contextos/Sesion";
import { recordarCarta } from "../../lib/cartaEnMemoria";
import {
  borrarCategoria,
  crearCategoria,
  editarCategoria,
  misCategorias,
  normalizarCategoria,
  type Categoria,
} from "../../lib/categorias";
import { cartaDelComercio, guardarProducto, miComercio } from "../../lib/catalogo";
import { formatPrecio } from "../../lib/precios";
import type { Comercio, ProductoConFotos } from "../../lib/tipos";
import { color, espacio, radio, sombras, texto } from "../../theme/tokens";

const SIN_CATEGORIA = "Sin categoría";
/** Las dos tarjetas fijas. Llevan un prefijo que ningún local va a escribir. */
const TODOS = "\u0000todos";
const SIN_STOCK = "\u0000sinstock";

const categoriaDe = (p: ProductoConFotos) => p.subcategoria?.trim() || SIN_CATEGORIA;

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function nombreDeVista(v: string) {
  if (v === TODOS) return "Todos los productos";
  if (v === SIN_STOCK) return "Sin stock";
  return v;
}

export default function Carta() {
  const router = useRouter();
  const { session } = useSesion();

  const [local, setLocal] = useState<Comercio | null>(null);
  const [productos, setProductos] = useState<ProductoConFotos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** La categoría abierta. `null` es la grilla. */
  const [vista, setVista] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  /** Las categorías creadas a mano con "+", aunque todavía no tengan productos. */
  const [creadas, setCreadas] = useState<Categoria[]>([]);
  /** La hoja de categoría abierta: crear una, o editar la que se llama `nombre`. */
  const [hojaCat, setHojaCat] = useState<null | { modo: "crear" } | { modo: "editar"; nombre: string }>(null);
  const [borrando, setBorrando] = useState<null | { nombre: string; guardando: boolean }>(null);

  const traer = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    const c = await miComercio(uid);
    setLocal(c);
    if (c) {
      const [carta, cats] = await Promise.all([cartaDelComercio(c.id), misCategorias(c.id)]);
      setProductos(carta);
      setCreadas(cats);
    }
    setCargando(false);
  }, [session?.user?.id]);

  // Al volver de editar un producto hay que releer: el editor pudo cambiar el
  // precio, el nombre, la categoría o las fotos.
  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  // En Android, "atrás" adentro de una categoría vuelve a la grilla en vez de
  // salir de la pestaña.
  useFocusEffect(
    useCallback(() => {
      if (!vista) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        volver();
        return true;
      });
      return () => sub.remove();
    }, [vista])
  );

  /**
   * Las categorías del local: primero las que tienen productos, en el orden
   * en que las ve el cliente, y después las creadas a mano que siguen vacías.
   */
  const categorias = useMemo(() => {
    const m = new Map<string, ProductoConFotos[]>();
    for (const p of productos) {
      const k = categoriaDe(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    const conProductos = [...m.keys()].map(normalizarCategoria);
    for (const c of creadas) {
      if (!conProductos.includes(normalizarCategoria(c.nombre))) m.set(c.nombre, []);
    }
    return [...m.entries()];
  }, [productos, creadas]);

  /** Lo guardado de una categoría (imagen), si tiene fila propia. */
  const datosDe = useCallback(
    (nombre: string) => creadas.find((c) => normalizarCategoria(c.nombre) === normalizarCategoria(nombre)) ?? null,
    [creadas]
  );
  const productosDe = useCallback((nombre: string) => productos.filter((p) => categoriaDe(p) === nombre), [productos]);
  const fotoDeProductoDe = (nombre: string) =>
    productosDe(nombre).find((p) => p.producto_fotos?.length)?.producto_fotos?.[0]?.url ?? null;

  const nombresDeCategorias = useMemo(
    () => categorias.map(([n]) => n).filter((n) => n !== SIN_CATEGORIA),
    [categorias]
  );

  // El editor abre con esto al instante (ver `lib/cartaEnMemoria`).
  useEffect(() => {
    if (local) recordarCarta(local, productos, nombresDeCategorias);
  }, [local, productos, nombresDeCategorias]);

  const activos = productos.filter((p) => p.activo).length;
  const apagados = productos.length - activos;

  /** Lo que entra en la vista actual, antes de buscar. */
  const enVista = useMemo(() => {
    if (!vista || vista === TODOS) return productos;
    if (vista === SIN_STOCK) return productos.filter((p) => !p.activo);
    return productos.filter((p) => categoriaDe(p) === vista);
  }, [productos, vista]);

  const q = normalizar(busqueda);
  const resultados = useMemo(() => {
    if (!q) return [];
    return enVista.filter((p) => normalizar(`${p.nombre} ${p.descripcion ?? ""}`).includes(q));
  }, [enVista, q]);

  function abrir(v: string) {
    setVista(v);
    setBusqueda("");
  }

  function volver() {
    setVista(null);
    setBusqueda("");
  }

  async function alternar(p: ProductoConFotos) {
    setCambiando(p.id);
    setError(null);
    // Optimista: el interruptor tiene que responder en el acto, no después de
    // ir y volver del servidor. Si falla, se revierte y se avisa.
    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
    const r = await guardarProducto(p.id, { activo: !p.activo });
    setCambiando(null);
    if (!r.ok) {
      setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: p.activo } : x)));
      setError(r.mensaje);
    }
  }

  /** Crear o editar, desde la hoja. Devuelve el error para mostrarlo en la hoja. */
  async function guardarCategoria(c: Categoria): Promise<string | null> {
    if (!local || !hojaCat) return "Falta el local.";
    if (hojaCat.modo === "crear") {
      const r = await crearCategoria(local.id, c, nombresDeCategorias);
      if (!r.ok) return r.mensaje;
      setCreadas((prev) => [...prev, r.categoria]);
      setHojaCat(null);
      // Se entra directo a la categoría nueva: lo que sigue es cargarle productos.
      abrir(r.categoria.nombre);
      return null;
    }

    const viejo = hojaCat.nombre;
    const ids = productosDe(viejo).map((p) => p.id);
    const r = await editarCategoria(local.id, viejo, c, nombresDeCategorias, ids);
    if (!r.ok) return r.mensaje;
    const nuevo = r.categoria.nombre;
    setProductos((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, subcategoria: nuevo } : p)));
    setCreadas((prev) => [
      ...prev.filter(
        (x) => normalizarCategoria(x.nombre) !== normalizarCategoria(viejo) && normalizarCategoria(x.nombre) !== normalizarCategoria(nuevo)
      ),
      r.categoria,
    ]);
    if (vista === viejo) setVista(nuevo);
    setHojaCat(null);
    return null;
  }

  async function confirmarBorrado() {
    if (!local || !borrando || borrando.guardando) return;
    const nombre = borrando.nombre;
    setBorrando({ nombre, guardando: true });
    const ids = productosDe(nombre).map((p) => p.id);
    const r = await borrarCategoria(local.id, nombre, ids);
    if (!r.ok) {
      setBorrando(null);
      setError(r.mensaje);
      return;
    }
    setProductos((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, subcategoria: "" } : p)));
    setCreadas((prev) => prev.filter((x) => normalizarCategoria(x.nombre) !== normalizarCategoria(nombre)));
    setBorrando(null);
    volver();
  }

  function agregar() {
    // Adentro de una categoría, el producto nuevo ya nace en esa categoría.
    const seccion = vista && vista !== TODOS && vista !== SIN_STOCK && vista !== SIN_CATEGORIA ? vista : undefined;
    router.push({ pathname: "/(comercio)/producto", params: { id: "", seccion: seccion ?? "", n: String(Date.now()) } });
  }

  const fila = (p: ProductoConFotos, mostrarCategoria = false) => (
    <View key={p.id} style={[e.fila, !p.activo && e.filaApagada]}>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/(comercio)/producto", params: { id: p.id, seccion: "", n: String(Date.now()) } })
        }
        style={e.tocable}
      >
        <ImagenSmart
          uri={p.producto_fotos?.[0]?.url ?? null}
          categoria={local?.categoria ?? "Todos"}
          style={e.foto}
          iconoSize={20}
        />
        <View style={{ flex: 1 }}>
          <Txt v="label" numberOfLines={1} style={!p.activo ? { color: color.n400 } : undefined}>
            {p.nombre}
          </Txt>
          <Txt v="cap" numberOfLines={1}>
            {formatPrecio(p.precio)}
            {mostrarCategoria ? ` · ${categoriaDe(p)}` : ""}
            {p.producto_fotos?.length ? "" : " · sin foto"}
          </Txt>
          {!p.activo && (
            <Txt v="cap" style={{ color: color.warn, fontSize: 11 }}>
              Sin stock · no se ve en la carta
            </Txt>
          )}
        </View>
      </Pressable>

      <Switch
        value={p.activo}
        onValueChange={() => alternar(p)}
        disabled={cambiando === p.id}
        trackColor={{ false: color.n200, true: color.brand }}
        thumbColor={color.white}
        // Sin esto, en un lector de pantalla los interruptores de la carta se
        // llaman todos igual.
        accessibilityLabel={`${p.activo ? "Sacar" : "Poner"} ${p.nombre} en la carta`}
      />
    </View>
  );

  /** El contenido según dónde está parado: buscando, en la grilla o adentro de una categoría. */
  function contenido() {
    if (productos.length === 0) {
      return (
        <EstadoVacio
          titulo="Tu carta está vacía"
          sub="Agregá el primer producto y va a aparecer en el marketplace al instante."
          icono="Restaurante"
        />
      );
    }

    if (q) {
      return (
        <View>
          <Txt v="cap" style={{ marginBottom: espacio.md }}>
            {resultados.length === 0
              ? `No encontramos "${busqueda.trim()}"${vista ? ` en ${nombreDeVista(vista)}` : ""}.`
              : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}${
                  vista ? ` en ${nombreDeVista(vista)}` : ""
                }`}
          </Txt>
          {resultados.map((p) => fila(p, vista !== null && vista !== TODOS ? false : true))}
        </View>
      );
    }

    if (!vista) {
      return (
        <View>
          <Txt v="head" style={{ marginBottom: espacio.md }}>
            Categorías
          </Txt>
          <View style={e.grilla}>
            <Tarjeta
              titulo="Todos"
              sub={`${productos.length} ${productos.length === 1 ? "producto" : "productos"}`}
              destacada
              onPress={() => abrir(TODOS)}
            />
            {apagados > 0 && (
              <Tarjeta titulo="Sin stock" sub={`${apagados} ${apagados === 1 ? "apagado" : "apagados"}`} alerta onPress={() => abrir(SIN_STOCK)} />
            )}
            {categorias.map(([nombre, items]) => {
              const sinStock = items.filter((p) => !p.activo).length;
              const foto = items.find((p) => p.producto_fotos?.length)?.producto_fotos?.[0]?.url ?? null;
              const datos = datosDe(nombre);
              return (
                <Tarjeta
                  key={nombre}
                  titulo={nombre}
                  sub={
                    items.length === 0
                      ? "Vacía"
                      : sinStock
                        ? `${sinStock} sin stock`
                        : `${items.length} ${items.length === 1 ? "producto" : "productos"}`
                  }
                  subAlerta={sinStock > 0}
                  foto={foto}
                  icono={datos?.icono}
                  fotoCategoria={datos?.foto_url}
                  onPress={() => abrir(nombre)}
                />
              );
            })}
            <View style={e.celda}>
              <Tocable onPress={() => setHojaCat({ modo: "crear" })} etiqueta="Nueva categoría" suave>
                <View>
                  <View style={[e.imagen, e.imagenNueva]}>
                    <Txt v="display" style={{ color: color.brandInk, fontSize: 30, lineHeight: 34 }}>
                      +
                    </Txt>
                  </View>
                  <Txt v="label" numberOfLines={2} style={[e.nombreCelda, { color: color.brandInk }]}>
                    Nueva categoría
                  </Txt>
                </View>
              </Tocable>
            </View>
          </View>
          <Txt v="cap" style={{ marginTop: espacio.sm, fontSize: 11 }}>
            Para mover un producto de categoría, editalo y elegile otra.
          </Txt>
        </View>
      );
    }

    // Adentro de una categoría. "Todos" se muestra agrupado, como el cliente.
    if (vista === TODOS) {
      return categorias.filter(([, items]) => items.length > 0).map(([titulo, items]) => (
        <View key={titulo} style={{ marginBottom: espacio.xl }}>
          <Txt v="micro" style={{ marginBottom: espacio.sm }}>
            {titulo}
          </Txt>
          {items.map((p) => fila(p))}
        </View>
      ));
    }

    if (enVista.length === 0) {
      return (
        <EstadoVacio
          titulo={vista === SIN_STOCK ? "No hay nada sin stock" : "Todavía no tiene productos"}
          sub={
            vista === SIN_STOCK
              ? "Todo lo que cargaste está a la venta."
              : "Tocá \"+ Agregar producto\" y va a quedar en esta categoría."
          }
          icono="Supermercado"
        />
      );
    }
    return <View>{enVista.map((p) => fila(p, vista === SIN_STOCK))}</View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <EncabezadoComercio
        titulo="Stock de productos"
        derecha={
          <View style={e.contador}>
            <Txt v="cap" style={{ color: color.ink }}>
              {activos} en venta
            </Txt>
          </View>
        }
      />

      {/* ------------------- volver + buscador ------------------- */}
      <View style={e.barraBusqueda}>
        {vista && (
          <Tocable onPress={volver} etiqueta="Volver a las categorías">
            <View style={e.volver}>
              <IconoVolver size={20} color={color.n900} />
            </View>
          </Tocable>
        )}
        <View style={e.buscador}>
          <IconoLupa size={18} color={color.n400} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder={vista ? `Buscar en ${nombreDeVista(vista)}` : "Buscar en tu catálogo"}
            placeholderTextColor={color.n400}
            autoCorrect={false}
            returnKeyType="search"
            style={e.inputBusqueda}
            accessibilityLabel="Buscar productos"
          />
          {!!busqueda && (
            <Tocable onPress={() => setBusqueda("")} etiqueta="Borrar la búsqueda">
              <View style={e.borrar}>
                <IconoCerrar size={12} color={color.white} />
              </View>
            </Tocable>
          )}
        </View>
      </View>

      {!!vista && !q && (
        <View style={e.cabezaCategoria}>
          <View style={{ flex: 1 }}>
            <Txt v="head" numberOfLines={1}>
              {nombreDeVista(vista)}
            </Txt>
            <Txt v="cap">
              {enVista.length} {enVista.length === 1 ? "producto" : "productos"}
            </Txt>
          </View>
          {/* Sólo las categorías de verdad se editan: "Todos", "Sin stock" y
              "Sin categoría" son agrupaciones de la app. */}
          {vista !== TODOS && vista !== SIN_STOCK && vista !== SIN_CATEGORIA && (
            <Tocable onPress={() => setHojaCat({ modo: "editar", nombre: vista })} etiqueta="Editar categoría">
              <View style={e.botonEditar}>
                <IconoLapiz size={14} color={color.n900} />
                <Txt v="label" style={{ fontSize: 14 }}>
                  Editar
                </Txt>
              </View>
            </Tocable>
          )}
        </View>
      )}

      {!!error && (
        <View style={e.errorBarra}>
          <Txt v="cap" style={{ color: color.danger, flex: 1 }}>
            {error}
          </Txt>
          <Tocable onPress={() => setError(null)}>
            <Txt v="cap" style={{ color: color.danger }}>
              Cerrar
            </Txt>
          </Tocable>
        </View>
      )}

      {cargando ? (
        <View style={{ paddingVertical: 64 }}>
          <ActivityIndicator color={color.brandInk} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espacio.lg, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await traer();
                setRefrescando(false);
              }}
              tintColor={color.brandInk}
            />
          }
        >
          {contenido()}
        </ScrollView>
      )}

      {local && hojaCat && (
        <HojaCategoria
          visible
          modo={hojaCat.modo}
          comercioId={local.id}
          inicial={
            hojaCat.modo === "crear"
              ? { nombre: "", icono: null, foto_url: null }
              : {
                  nombre: hojaCat.nombre,
                  icono: datosDe(hojaCat.nombre)?.icono ?? null,
                  foto_url: datosDe(hojaCat.nombre)?.foto_url ?? null,
                }
          }
          fotoDeProducto={hojaCat.modo === "editar" ? fotoDeProductoDe(hojaCat.nombre) : null}
          onCerrar={() => setHojaCat(null)}
          onGuardar={guardarCategoria}
          onBorrar={
            hojaCat.modo === "editar"
              ? () => {
                  const nombre = hojaCat.nombre;
                  setHojaCat(null);
                  setBorrando({ nombre, guardando: false });
                }
              : undefined
          }
        />
      )}

      <Dialogo
        visible={!!borrando}
        titulo={borrando ? `¿Borrar "${borrando.nombre}"?` : ""}
        onCerrar={() => setBorrando(null)}
        cancelar="Mejor no"
        cargando={borrando?.guardando}
        confirmar={{ texto: "Sí, borrar", onPress: confirmarBorrado }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {borrando && productosDe(borrando.nombre).length > 0
            ? `Sus ${productosDe(borrando.nombre).length} productos no se borran: quedan en "Sin categoría" y los podés mover a otra cuando quieras.`
            : "Está vacía, así que no se mueve nada."}
        </Txt>
      </Dialogo>

      {/* Flotante: agregar es la única acción que no depende de ningún producto. */}
      <View style={e.barra}>
        <Boton onPress={agregar}>+ Agregar producto</Boton>
      </View>
    </View>
  );
}

/**
 * Una tarjeta de la grilla: la imagen arriba, el nombre y cuántos abajo.
 * `destacada` es "Todos" (verde, como la de promociones de las apps de súper);
 * `alerta` es "Sin stock".
 */
function Tarjeta({
  titulo,
  sub,
  foto,
  icono,
  fotoCategoria,
  destacada,
  alerta,
  subAlerta,
  onPress,
}: {
  titulo: string;
  sub: string;
  /** Foto de un producto de la categoría. */
  foto?: string | null;
  /** Lo que eligió el local en la hoja de la categoría: gana sobre la foto de producto. */
  icono?: string | null;
  fotoCategoria?: string | null;
  destacada?: boolean;
  alerta?: boolean;
  subAlerta?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={e.celda}>
      <Tocable onPress={onPress} etiqueta={`Categoría ${titulo}`} suave>
        <View>
          <View style={[e.imagen, destacada && { backgroundColor: color.brand }, alerta && { backgroundColor: color.warnWash }]}>
            {destacada ? (
              <View style={e.centro}>
                <Image
                  source={require("../../../assets/categorias/todos.png")}
                  style={{ height: "74%", aspectRatio: 1 }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
            ) : alerta ? (
              <View style={e.centro}>
                <Txt v="display" style={{ color: color.warn, fontSize: 20 }}>
                  {sub.split(" ")[0]}
                </Txt>
              </View>
            ) : (
              <ImagenCategoria nombre={titulo} icono={icono} foto={fotoCategoria} fotoDeProducto={foto} />
            )}
          </View>
          <Txt v="label" numberOfLines={2} style={e.nombreCelda}>
            {titulo}
          </Txt>
          <Txt v="cap" numberOfLines={1} style={[e.subCelda, (alerta || subAlerta) && { color: color.warn }]}>
            {sub}
          </Txt>
        </View>
      </Tocable>
    </View>
  );
}

const e = StyleSheet.create({
  contador: { backgroundColor: color.brand, paddingHorizontal: espacio.md, paddingVertical: 6, borderRadius: radio.pill },
  errorBarra: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.dangerWash,
    marginHorizontal: espacio.lg,
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.sm,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.sm,
    ...sombras.sm,
  },
  filaApagada: { backgroundColor: "#F4F4F2" },
  tocable: { flexDirection: "row", alignItems: "center", gap: espacio.md, flex: 1 },
  foto: { width: 52, height: 52, borderRadius: radio.sm, backgroundColor: color.n100 },
  barraBusqueda: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
  },
  volver: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    ...sombras.sm,
  },
  buscador: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    backgroundColor: color.white,
    borderRadius: radio.pill,
    borderWidth: 1.5,
    borderColor: color.n200,
    paddingHorizontal: espacio.md,
    height: 46,
  },
  inputBusqueda: { ...texto.body, flex: 1, minWidth: 0, paddingVertical: 0, color: color.n900 },
  borrar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.n400,
    alignItems: "center",
    justifyContent: "center",
  },
  // Cuatro por fila: con tres, cada tarjeta ocupaba casi un tercio de la
  // pantalla y en un celular entraban seis categorías antes de tener que bajar.
  grilla: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  celda: { width: "25%", paddingHorizontal: 5, marginBottom: espacio.md },
  imagen: {
    width: "100%",
    aspectRatio: 120 / 72,
    borderRadius: radio.md,
    overflow: "hidden",
    backgroundColor: "#F1F1EF",
  },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  cabezaCategoria: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.sm,
  },
  botonEditar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.pill,
    paddingHorizontal: espacio.md,
    paddingVertical: 8,
  },
  imagenNueva: {
    backgroundColor: color.brandWash,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.brandInk,
    alignItems: "center",
    justifyContent: "center",
  },
  nombreCelda: { textAlign: "center", marginTop: 5, fontSize: 12.5, lineHeight: 16 },
  subCelda: { textAlign: "center", fontSize: 10.5 },
  barra: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: espacio.lg,
    paddingVertical: espacio.md,
    backgroundColor: color.n50,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.n200,
  },
});
