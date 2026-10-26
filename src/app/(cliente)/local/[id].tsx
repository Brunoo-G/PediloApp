/**
 * Ficha del local: la portada de la carta.
 *
 * Arranca como el catálogo del panel del local: la grilla de categorías con
 * su imagen (la que eligió el local o la 3D automática) y, abajo, un carrusel
 * con los productos. Cada categoría se abre en su propia pantalla
 * (`/categoria`), con un carrusel de categorías arriba para saltar de una a
 * otra. Un local sin categorías muestra la lista de productos acá mismo.
 *
 * Un local cerrado igual se puede mirar — la carta y los precios son lo que la
 * gente viene a ver, y muchas veces deciden hoy lo que van a pedir mañana. Lo
 * que se bloquea es agregar al carrito, con el motivo a la vista.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EstadoVacio, ImagenSmart, Tocable, Txt } from "../../../componentes/base";
import {
  BarraCarrito,
  FilaProducto,
  fotoDe,
  Mas,
  TarjetaCategoria,
  TODOS,
  useAgregar,
  useCartaLocal,
} from "../../../componentes/CartaLocal";
import { Degradado } from "../../../componentes/Degradado";
import { IconoReloj, IconoVolver } from "../../../componentes/Iconos";
import { useConfiguracion } from "../../../contextos/Configuracion";
import { useCarrito } from "../../../contextos/Carrito";
import { formatPrecio } from "../../../lib/precios";
import { color, espacio, LLENO, radio, sombras, TAP_MIN } from "../../../theme/tokens";

export default function FichaLocal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const carrito = useCarrito();
  const { envioBase } = useConfiguracion();

  const { local, cargando, apertura, productos, categorias, conCategorias } = useCartaLocal(id);
  const { agregar, dialogos } = useAgregar(local, apertura);

  /** El carrusel: los que tienen foto primero, como "Lo más pedido". */
  const carrusel = useMemo(
    () =>
      [...productos].sort(
        (a, b) => (b.producto_fotos?.length ?? 0) - (a.producto_fotos?.length ?? 0) || a.orden - b.orden
      ),
    [productos]
  );

  function abrir(nombre: string) {
    router.navigate({ pathname: "/(cliente)/categoria", params: { local: id, nombre, n: String(Date.now()) } });
  }

  if (cargando) {
    return (
      <View style={e.centro}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }
  if (!local) {
    return (
      <View style={e.centro}>
        <EstadoVacio titulo="Local no encontrado" sub="Puede que ya no esté disponible." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* ------------------- portada, logo y nombre --------------------- */}
        <View style={{ aspectRatio: 16 / 9 }}>
          <ImagenSmart uri={local.portada_url} categoria={local.categoria} style={LLENO} iconoSize={64} />
          <Degradado fuerza={0.55} desde={0.55} />

          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(cliente)"))}
            style={[e.volver, { top: insets.top + 8 }]}
            accessibilityLabel="Volver"
          >
            <IconoVolver size={22} color={color.ink} />
          </Pressable>

          <View style={e.pastillaWrap}>
            <View style={e.pastilla}>
              <IconoReloj size={13} color={color.white} />
              <Txt v="cap" style={{ color: color.white, fontSize: 12.5 }}>
                {apertura.abierto
                  ? `Abierto${apertura.cierraA ? ` · cierra ${apertura.cierraA}` : ""}`
                  : `Cerrado${apertura.abreA ? ` · abre ${apertura.abreA}` : ""}`}
              </Txt>
            </View>
          </View>
        </View>

        {/* El logo se monta sobre la portada, como en las apps grandes: es lo
            que hace que la ficha se reconozca de un vistazo. */}
        <View style={{ paddingHorizontal: espacio.lg, marginTop: -28 }}>
          <View style={e.logoLocal}>
            <ImagenSmart uri={local.logo_url} categoria={local.categoria} style={{ width: "100%", height: "100%" }} iconoSize={26} />
          </View>
          <Txt v="display" style={{ fontSize: 28, marginTop: espacio.md }} numberOfLines={1}>
            {local.nombre}
          </Txt>
          <View style={e.metaFila}>
            <Txt v="cap">{local.categoria}</Txt>
            <View style={e.puntoSep} />
            <Txt v="cap">{local.tiempo_entrega}</Txt>
            <View style={e.puntoSep} />
            <Txt v="cap">Envío {formatPrecio(envioBase)}</Txt>
          </View>

          {!apertura.abierto && (
            <View style={e.avisoCerrado}>
              <Txt v="label" style={{ color: color.warn }}>
                Cerrado{apertura.abreA ? ` · abre a las ${apertura.abreA}` : ""}
              </Txt>
              <Txt v="cap" style={{ color: color.warn, marginTop: 2 }}>
                Podés mirar la carta, pero todavía no pedir.
              </Txt>
            </View>
          )}

          {!!local.descripcion && (
            <Txt v="body" style={{ color: color.n600, marginTop: espacio.md }}>
              {local.descripcion}
            </Txt>
          )}
        </View>

        {conCategorias ? (
          <>
            {/* -------------------------- categorías -------------------------- */}
            <View style={{ paddingHorizontal: espacio.lg, marginTop: espacio.lg }}>
              <Txt v="title" style={{ marginBottom: espacio.md }}>
                Categorías
              </Txt>
              <View style={e.grilla}>
                <View style={e.celda}>
                  <TarjetaCategoria titulo={TODOS} todos onPress={() => abrir(TODOS)} />
                </View>
                {categorias.map((c) => (
                  <View key={c.nombre} style={e.celda}>
                    <TarjetaCategoria titulo={c.nombre} cat={c} onPress={() => abrir(c.nombre)} />
                  </View>
                ))}
              </View>
            </View>

            {/* ------------------------- el carrusel -------------------------- */}
            {carrusel.length > 0 && (
              <View style={{ marginTop: espacio.md }}>
                <Txt v="title" style={{ paddingHorizontal: espacio.lg, marginBottom: espacio.sm }}>
                  Más artículos
                </Txt>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: espacio.lg, gap: espacio.md, paddingBottom: espacio.sm }}
                >
                  {carrusel.map((p) => (
                    <View key={p.id} style={e.tarjetaProducto}>
                      <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={p.nombre}>
                        <View style={{ width: "100%", aspectRatio: 1 }}>
                          <ImagenSmart uri={fotoDe(p)} categoria={local.categoria} style={LLENO} iconoSize={40} />
                        </View>
                      </Tocable>
                      {apertura.abierto && (
                        <View style={e.masWrap}>
                          <Tocable onPress={() => agregar(p)} etiqueta={`Agregar ${p.nombre}`}>
                            <View style={e.masProducto}>
                              {carrito.cantidadDe(p.id) > 0 ? (
                                <Txt v="label" style={{ color: color.ink }}>
                                  {carrito.cantidadDe(p.id)}
                                </Txt>
                              ) : (
                                <Mas tam={18} />
                              )}
                            </View>
                          </Tocable>
                        </View>
                      )}
                      <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={`Ver ${p.nombre}`}>
                        <View style={{ padding: espacio.sm + 2 }}>
                          <Txt v="label" numberOfLines={2} style={{ height: 36 }}>
                            {p.nombre}
                          </Txt>
                          <Txt v="price" style={{ marginTop: 4 }}>
                            {formatPrecio(p.precio)}
                          </Txt>
                        </View>
                      </Tocable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        ) : (
          /* ------------------ sin categorías: la lista ------------------ */
          <View style={{ paddingHorizontal: espacio.lg, paddingTop: espacio.lg, gap: espacio.sm }}>
            {productos.map((p) => (
              <FilaProducto key={p.id} p={p} local={local} apertura={apertura} agregar={agregar} />
            ))}
            {productos.length === 0 && (
              <EstadoVacio titulo="Nada por acá" sub="Este local todavía no cargó productos." />
            )}
          </View>
        )}
      </ScrollView>

      <BarraCarrito localId={local.id} />
      {dialogos}
    </View>
  );
}

const e = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 },
  // A la derecha: a la izquierda queda tapada por el logo, que se monta sobre la portada.
  pastillaWrap: { position: "absolute", right: espacio.lg, bottom: espacio.md },
  pastilla: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(14,14,14,.55)",
    borderRadius: radio.pill,
    paddingHorizontal: espacio.md,
    paddingVertical: 5,
  },
  metaFila: { flexDirection: "row", alignItems: "center", gap: espacio.sm, marginTop: 4 },
  puntoSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.n200 },
  volver: {
    position: "absolute",
    left: espacio.lg,
    width: TAP_MIN,
    height: TAP_MIN,
    borderRadius: TAP_MIN / 2,
    backgroundColor: "rgba(255,255,255,.94)",
    alignItems: "center",
    justifyContent: "center",
    ...sombras.sm,
  },
  logoLocal: {
    width: 64,
    height: 64,
    borderRadius: radio.md,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: color.white,
    backgroundColor: color.white,
  },
  avisoCerrado: { backgroundColor: color.warnWash, borderRadius: radio.md, padding: espacio.lg, marginTop: espacio.lg },
  grilla: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  celda: { width: "25%", paddingHorizontal: 5, marginBottom: espacio.md },
  tarjetaProducto: { width: 150, backgroundColor: color.white, borderRadius: radio.md, overflow: "hidden", ...sombras.sm },
  masWrap: { position: "absolute", right: espacio.sm, top: 150 - 42 },
  masProducto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
    ...sombras.md,
  },
});
