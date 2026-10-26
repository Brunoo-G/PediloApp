/**
 * Lo que comparten la ficha del local y la pantalla de una categoría.
 *
 * - `useCartaLocal(id)`: trae el local, sus productos y sus categorías. Guarda
 *   lo último en memoria, así pasar de la ficha a una categoría (y de una
 *   categoría a otra) es instantáneo, sin pantalla de carga.
 * - `useAgregar`: sumar al carrito con los dos diálogos (cambiar de local y
 *   "no se pudo agregar").
 * - Las piezas visuales: tarjetas de categoría (grande y chica), la fila de
 *   producto y la barra flotante del carrito.
 */
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useCarrito } from "../contextos/Carrito";
import { categoriasPublicas, normalizarCategoria, type Categoria } from "../lib/categorias";
import { estadoApertura, formatPrecio } from "../lib/precios";
import { supabase } from "../lib/supabase";
import type { ComercioConProductos, ProductoConFotos } from "../lib/tipos";
import { color, espacio, LLENO, radio, sombras, TAP_MIN } from "../theme/tokens";
import { Boton, Dialogo, ImagenSmart, Tocable, Txt } from "./base";
import { ImagenCategoria } from "./HojaCategoria";

export const TODOS = "Todos";
export const OTROS = "Otros";

export type TarjetaCat = {
  nombre: string;
  cantidad: number;
  icono: string | null;
  foto: string | null;
  fotoProducto: string | null;
};

export type Apertura = { abierto: boolean; abreA: string | null; cierraA: string | null };

export function fotoDe(p: ProductoConFotos) {
  return [...(p.producto_fotos ?? [])].sort((a, b) => a.orden - b.orden)[0]?.url;
}

const clave = (p: ProductoConFotos) => normalizarCategoria((p.subcategoria ?? "").trim() || OTROS);

/** Los productos de una categoría ("Todos" = todos). */
export function productosDe(productos: ProductoConFotos[], categoria: string) {
  if (categoria === TODOS) return productos;
  const k = normalizarCategoria(categoria);
  return productos.filter((p) => clave(p) === k);
}

/* ------------------------------- los datos -------------------------------- */

const memoria = new Map<string, { local: ComercioConProductos | null; elegidas: Categoria[] }>();

export function useCartaLocal(id: string | undefined) {
  const guardado = id ? memoria.get(id) : undefined;
  const [local, setLocal] = useState<ComercioConProductos | null>(guardado?.local ?? null);
  const [elegidas, setElegidas] = useState<Categoria[]>(guardado?.elegidas ?? []);
  const [cargando, setCargando] = useState(!guardado);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    Promise.all([
      supabase.from("comercios").select("*, productos(*, producto_fotos(*)), comercio_horarios(*)").eq("id", id).single(),
      categoriasPublicas(id),
    ]).then(([{ data }, cats]) => {
      if (!vivo) return;
      const l = (data ?? null) as unknown as ComercioConProductos | null;
      memoria.set(id, { local: l, elegidas: cats });
      setLocal(l);
      setElegidas(cats);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const apertura: Apertura = useMemo(
    () => (local ? estadoApertura(local.abierto, local.comercio_horarios ?? []) : { abierto: false, abreA: null, cierraA: null }),
    [local]
  );

  const productos = useMemo(
    () => ((local?.productos ?? []) as ProductoConFotos[]).filter((p) => p.activo).sort((a, b) => a.orden - b.orden),
    [local]
  );

  /**
   * Las categorías que se muestran: las que tienen productos activos, en el
   * orden que les dio el local y con la imagen que eligió. Los productos sin
   * categoría van a "Otros", al final.
   */
  const categorias = useMemo(() => {
    const grupos = new Map<string, TarjetaCat>();
    for (const p of productos) {
      const nombre = (p.subcategoria ?? "").trim() || OTROS;
      const k = normalizarCategoria(nombre);
      const g = grupos.get(k) ?? { nombre, cantidad: 0, icono: null, foto: null, fotoProducto: null };
      g.cantidad += 1;
      if (!g.fotoProducto) g.fotoProducto = fotoDe(p) ?? null;
      grupos.set(k, g);
    }
    const lista: TarjetaCat[] = [];
    for (const c of elegidas) {
      const k = normalizarCategoria(c.nombre);
      const g = grupos.get(k);
      if (!g) continue;
      lista.push({ ...g, icono: c.icono, foto: c.foto_url });
      grupos.delete(k);
    }
    const kOtros = normalizarCategoria(OTROS);
    const otros = grupos.get(kOtros);
    grupos.delete(kOtros);
    return [...lista, ...grupos.values(), ...(otros ? [otros] : [])];
  }, [productos, elegidas]);

  const conCategorias = categorias.some((c) => c.nombre !== OTROS);

  return { local, cargando, apertura, productos, categorias, conCategorias };
}

/* ------------------------------ al carrito -------------------------------- */

/**
 * Sumar un producto, con los avisos. Antes era `Alert.alert`, que en web no
 * hace nada; por eso son `<Dialogo>`. `dialogos` va al final de la pantalla.
 */
export function useAgregar(local: ComercioConProductos | null, apertura: Apertura) {
  const carrito = useCarrito();
  const [cambiarDeLocal, setCambiarDeLocal] = useState<ProductoConFotos | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  function agregar(p: ProductoConFotos) {
    if (!local || !apertura.abierto) return;
    const motivo = carrito.agregar(local.id, local.nombre, p);
    if (motivo === "OTRO_LOCAL") setCambiarDeLocal(p);
    else if (motivo) setProblema(motivo);
  }

  function confirmar() {
    if (!local || !cambiarDeLocal) return;
    carrito.reiniciarCon(local.id, local.nombre, cambiarDeLocal);
    setCambiarDeLocal(null);
  }

  const dialogos = (
    <>
      <Dialogo
        visible={!!cambiarDeLocal}
        titulo="¿Empezar un carrito nuevo?"
        onCerrar={() => setCambiarDeLocal(null)}
        cancelar="No, dejalo"
        confirmar={{ texto: "Vaciar y agregar", onPress: confirmar }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Ya tenés {carrito.cantidadTotal} {carrito.cantidadTotal === 1 ? "producto" : "productos"} de{" "}
          <Txt v="body" style={{ fontWeight: "800" }}>
            {carrito.carrito.comercioNombre}
          </Txt>
          .
        </Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          Un pedido es de un solo local, así que para agregar algo de {local?.nombre} hay que vaciar el otro carrito.
          Lo que tenías no se recupera.
        </Txt>
      </Dialogo>

      <Dialogo
        visible={!!problema}
        titulo="No se pudo agregar"
        onCerrar={() => setProblema(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setProblema(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {problema}
        </Txt>
      </Dialogo>
    </>
  );

  return { agregar, dialogos };
}

/* ---------------------------- piezas visuales ----------------------------- */

const IMAGEN_TODOS = require("../../assets/categorias/todos.png");

/** La imagen de una tarjeta: "Todos" es el plato 3D sobre verde, como en el catálogo del local. */
function ImagenTarjeta({ titulo, cat, todos }: { titulo: string; cat?: TarjetaCat; todos?: boolean }) {
  if (todos)
    return (
      <View style={[LLENO, { backgroundColor: color.brand, alignItems: "center", justifyContent: "center" }]}>
        <Image source={IMAGEN_TODOS} style={{ height: "74%", aspectRatio: 1 }} resizeMode="contain" />
      </View>
    );
  return <ImagenCategoria nombre={titulo} icono={cat?.icono} foto={cat?.foto} fotoDeProducto={cat?.fotoProducto} />;
}

/** Tarjeta de la grilla de la ficha: imagen y nombre (sin cantidad: al cliente no le sirve). */
export function TarjetaCategoria({
  titulo,
  sub,
  cat,
  todos,
  onPress,
}: {
  titulo: string;
  sub?: string;
  cat?: TarjetaCat;
  todos?: boolean;
  onPress: () => void;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={`Categoría ${titulo}`} suave>
      <View>
        <View style={e.imagenCat}>
          <ImagenTarjeta titulo={titulo} cat={cat} todos={todos} />
        </View>
        <Txt v="label" numberOfLines={2} style={e.nombreCelda}>
          {titulo}
        </Txt>
        {!!sub && (
          <Txt v="cap" numberOfLines={1} style={e.subCelda}>
            {sub}
          </Txt>
        )}
      </View>
    </Tocable>
  );
}

export const ANCHO_MINI = 84;

/** Tarjeta chica del carrusel de categorías. `activa` es la que se está viendo. */
export function MiniCategoria({
  titulo,
  cat,
  todos,
  activa,
  onPress,
}: {
  titulo: string;
  cat?: TarjetaCat;
  todos?: boolean;
  activa?: boolean;
  onPress: () => void;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={activa ? `${titulo}, la que estás viendo` : `Categoría ${titulo}`} suave>
      <View style={{ width: ANCHO_MINI }}>
        <View style={[e.imagenCat, e.marcoMini, activa && e.marcoActivo]}>
          <ImagenTarjeta titulo={titulo} cat={cat} todos={todos} />
        </View>
        <Txt
          v="cap"
          numberOfLines={1}
          style={[e.nombreCelda, { color: activa ? color.ink : color.n600, fontWeight: activa ? "800" : "600" }]}
        >
          {titulo}
        </Txt>
      </View>
    </Tocable>
  );
}

/** Un producto en la lista: foto y texto abren el detalle; el + suma sin salir. */
export function FilaProducto({
  p,
  local,
  apertura,
  agregar,
}: {
  p: ProductoConFotos;
  local: ComercioConProductos;
  apertura: Apertura;
  agregar: (p: ProductoConFotos) => void;
}) {
  const router = useRouter();
  const carrito = useCarrito();
  const cantidad = carrito.cantidadDe(p.id);
  return (
    <View style={e.producto}>
      <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={p.nombre}>
        <ImagenSmart uri={fotoDe(p)} categoria={local.categoria} style={e.fotoProducto} iconoSize={26} />
      </Tocable>
      <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={`Ver ${p.nombre}`} style={{ flex: 1 }}>
        <View style={{ gap: 2 }}>
          <Txt v="head" numberOfLines={2}>
            {p.nombre}
          </Txt>
          {!!p.descripcion && (
            <Txt v="cap" numberOfLines={1}>
              {p.descripcion}
            </Txt>
          )}
          <Txt v="price" style={{ marginTop: 4 }}>
            {formatPrecio(p.precio)}
          </Txt>
        </View>
      </Tocable>

      {!apertura.abierto ? (
        <View style={[e.botonRedondo, { backgroundColor: color.n100 }]} />
      ) : cantidad === 0 ? (
        <Tocable onPress={() => agregar(p)} etiqueta={`Agregar ${p.nombre}`}>
          <View style={[e.botonRedondo, { backgroundColor: color.brand }]}>
            <Mas tam={20} />
          </View>
        </Tocable>
      ) : (
        <View style={e.stepper}>
          <Tocable onPress={() => carrito.cambiarCantidad(p.id, -1)} etiqueta={`Quitar uno de ${p.nombre}`}>
            <View style={[e.stepBtn, { backgroundColor: color.white }]}>
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d="M5 12h14" stroke={color.brandInk} strokeWidth={2.8} strokeLinecap="round" />
              </Svg>
            </View>
          </Tocable>
          <Txt v="label" style={{ minWidth: 18, textAlign: "center", color: color.brandInk }}>
            {cantidad}
          </Txt>
          <Tocable onPress={() => agregar(p)} etiqueta={`Agregar otro ${p.nombre}`}>
            <View style={[e.stepBtn, { backgroundColor: color.brand }]}>
              <Mas tam={16} />
            </View>
          </Tocable>
        </View>
      )}
    </View>
  );
}

export function Mas({ tam }: { tam: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color.ink} strokeWidth={2.8} strokeLinecap="round" />
    </Svg>
  );
}

/** La barra flotante "Ver carrito", sólo si el carrito es de este local. */
export function BarraCarrito({ localId }: { localId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const carrito = useCarrito();
  if (carrito.cantidadTotal === 0 || carrito.carrito.comercioId !== localId) return null;
  return (
    <View style={[e.barra, { bottom: insets.bottom + espacio.lg }]}>
      <Boton onPress={() => router.push("/(cliente)/carrito")}>
        {`Ver carrito (${carrito.cantidadTotal})  ·  ${formatPrecio(carrito.subtotal)}`}
      </Boton>
    </View>
  );
}

const e = StyleSheet.create({
  imagenCat: { width: "100%", aspectRatio: 120 / 72, borderRadius: radio.md, overflow: "hidden", backgroundColor: "#F1F1EF" },
  marcoMini: { borderWidth: 2.5, borderColor: "transparent" },
  marcoActivo: { borderColor: color.ink },
  nombreCelda: { textAlign: "center", marginTop: 5, fontSize: 12.5, lineHeight: 16 },
  subCelda: { textAlign: "center", fontSize: 10.5 },
  producto: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.sm + 2,
    ...sombras.sm,
  },
  fotoProducto: { width: 88, height: 88, borderRadius: radio.sm, overflow: "hidden" },
  botonRedondo: { width: TAP_MIN, height: TAP_MIN, borderRadius: TAP_MIN / 2, alignItems: "center", justifyContent: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: color.brandWash, borderRadius: radio.pill, padding: 4 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  barra: { position: "absolute", left: espacio.lg, right: espacio.lg, flexDirection: "row" },
});
