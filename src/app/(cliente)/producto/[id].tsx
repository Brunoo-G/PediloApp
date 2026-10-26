/**
 * El detalle de un producto.
 *
 * Esta pantalla no existía: desde la carta se agregaba de un toque y la foto
 * grande, la descripción completa y la aclaración no se veían por ningún lado.
 * El toque rápido sigue estando en la carta —es lo que más se usa— y esto es
 * para el otro momento: cuando alguien quiere mirar qué es antes de comprarlo.
 *
 * LA ACLARACIÓN VA ACÁ Y NO EN EL CHECKOUT
 *
 * "Que las bananas estén verdes" pertenece a las bananas, no al pedido. El
 * carrito ya guarda una nota por renglón (`cambiarNota`), así que esto sólo la
 * pide en el momento en que la persona está pensando en ese producto.
 *
 * EL BOTÓN DICE EL TOTAL
 *
 * "Agregar 2 · $3.800" y no "Agregar": el precio unitario ya está arriba, y lo
 * que se quiere saber antes de tocar es cuánto se suma al carrito.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Dialogo, EstadoVacio, ImagenSmart, Tocable, Txt } from "../../../componentes/base";
import { IconoVolver } from "../../../componentes/Iconos";
import { useCarrito } from "../../../contextos/Carrito";
import { estadoApertura, formatPrecio } from "../../../lib/precios";
import { supabase } from "../../../lib/supabase";
import type { ComercioConProductos, ProductoConFotos } from "../../../lib/tipos";
import { color, espacio, LLENO, radio, sombras, texto } from "../../../theme/tokens";

type Fila = ProductoConFotos & { comercios: ComercioConProductos };

export default function DetalleProducto() {
  const { width: anchoFoto } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const carrito = useCarrito();

  const [p, setP] = useState<Fila | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState(0);
  const [cambiarDeLocal, setCambiarDeLocal] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("productos")
      .select("*, producto_fotos(*), comercios(*, comercio_horarios(*))")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setP((data ?? null) as unknown as Fila | null);
        setCargando(false);
      });
  }, [id]);

  const local = p?.comercios ?? null;
  const apertura = useMemo(
    () => (local ? estadoApertura(local.abierto, local.comercio_horarios ?? []) : { abierto: false, abreA: null, cierraA: null }),
    [local]
  );
  const fotos = useMemo(
    () => [...(p?.producto_fotos ?? [])].sort((a, b) => a.orden - b.orden),
    [p]
  );

  if (cargando) {
    return (
      <View style={e.centro}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }
  if (!p || !local) {
    return (
      <View style={e.centro}>
        <EstadoVacio titulo="Producto no encontrado" sub="Puede que el local lo haya sacado de la carta." />
      </View>
    );
  }

  /**
   * Agregar la cantidad elegida.
   *
   * `agregar` suma de a uno porque es lo que hace la carta; para las demás
   * unidades se usa `cambiarCantidad`. Así el carrito sigue teniendo una sola
   * puerta de entrada, que es la que revisa que el local sea el mismo.
   */
  function agregar() {
    if (!p || !local) return;
    if (!apertura.abierto) return;
    const motivo = carrito.agregar(local.id, local.nombre, p);
    if (motivo === "OTRO_LOCAL") {
      setCambiarDeLocal(true);
      return;
    }
    if (motivo) {
      setProblema(motivo);
      return;
    }
    terminar();
  }

  function terminar() {
    if (!p) return;
    if (cantidad > 1) carrito.cambiarCantidad(p.id, cantidad - 1);
    if (nota.trim()) carrito.cambiarNota(p.id, nota.trim());
    router.back();
  }

  function confirmarCambioDeLocal() {
    if (!p || !local) return;
    carrito.reiniciarCon(local.id, local.nombre, p);
    setCambiarDeLocal(false);
    terminar();
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {/* ------------------------------ fotos ----------------------------- */}
        <View style={{ aspectRatio: 1, backgroundColor: color.n100 }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(ev) => {
              const ancho = ev.nativeEvent.layoutMeasurement.width || 1;
              setFoto(Math.round(ev.nativeEvent.contentOffset.x / ancho));
            }}
            style={LLENO}
          >
            {(fotos.length ? fotos : [null]).map((f, i) => (
              // Ancho en píxeles, no "100%": adentro de un ScrollView horizontal
              // el porcentaje se mide contra el contenido (que no tiene ancho)
              // y la foto quedaba en 0 — se veía el gris de fondo.
              <View key={f?.id ?? i} style={{ width: anchoFoto, height: anchoFoto }}>
                <ImagenSmart uri={f?.url} categoria={local.categoria} style={LLENO} iconoSize={72} />
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(`/(cliente)/local/${local.id}`))}
            style={[e.volver, { top: insets.top + 8 }]}
            accessibilityLabel="Volver"
          >
            <IconoVolver size={22} color={color.ink} />
          </Pressable>

          {/* Los puntitos sólo aparecen cuando hay más de una foto: con una
              sola serían un control que no controla nada. */}
          {fotos.length > 1 && (
            <View style={e.puntos}>
              {fotos.map((f, i) => (
                <View key={f.id} style={[e.punto, i === foto && e.puntoActivo]} />
              ))}
            </View>
          )}
        </View>

        <View style={{ padding: espacio.lg }}>
          <Txt v="micro">{p.subcategoria || local.nombre}</Txt>
          <Txt v="display" style={{ fontSize: 24, lineHeight: 29, marginTop: 6 }}>
            {p.nombre}
          </Txt>
          {!!p.descripcion && (
            <Txt v="body" style={{ color: color.n600, marginTop: 6 }}>
              {p.descripcion}
            </Txt>
          )}
          <Txt v="display" style={{ fontSize: 26, marginTop: espacio.md }}>
            {formatPrecio(p.precio)}
          </Txt>

          {!apertura.abierto && (
            <View style={[e.aviso, { backgroundColor: color.warnWash }]}>
              <Txt v="label" style={{ color: color.warn }}>
                {local.nombre} está cerrado{apertura.abreA ? ` · abre a las ${apertura.abreA}` : ""}
              </Txt>
              <Txt v="cap" style={{ color: color.warn, marginTop: 2 }}>
                Podés mirar el precio y la descripción, pero todavía no agregarlo.
              </Txt>
            </View>
          )}

          <View style={e.linea} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
            <View style={{ flex: 1 }}>
              <Txt v="head">Cantidad</Txt>
              <Txt v="cap" style={{ marginTop: 2 }}>
                Se suma al carrito de {local.nombre}
              </Txt>
            </View>
            <View style={e.stepper}>
              <Tocable onPress={() => setCantidad((c) => Math.max(1, c - 1))} etiqueta="Uno menos">
                <View style={e.stepBtn}>
                  <Txt v="head" style={{ color: color.n900 }}>
                    −
                  </Txt>
                </View>
              </Tocable>
              <Txt v="label" style={{ minWidth: 26, textAlign: "center" }}>
                {cantidad}
              </Txt>
              <Tocable onPress={() => setCantidad((c) => Math.min(99, c + 1))} etiqueta="Uno más">
                <View style={[e.stepBtn, { backgroundColor: color.brand }]}>
                  <Txt v="head" style={{ color: color.ink }}>
                    +
                  </Txt>
                </View>
              </Tocable>
            </View>
          </View>

          <View style={e.linea} />

          <Txt v="head">¿Alguna aclaración?</Txt>
          <Txt v="cap" style={{ marginTop: 2, marginBottom: espacio.sm }}>
            Va al local con este producto. Por ejemplo: “que las bananas estén verdes”.
          </Txt>
          <TextInput
            value={nota}
            onChangeText={(t) => setNota(t.slice(0, 140))}
            placeholder="Opcional"
            placeholderTextColor={color.n400}
            style={e.input}
            accessibilityLabel="Aclaración para el local"
          />
        </View>
      </ScrollView>

      <View style={[e.barra, { bottom: insets.bottom + espacio.lg }]}>
        <Boton onPress={agregar} style={!apertura.abierto && { opacity: 0.5 }}>
          {apertura.abierto
            ? `Agregar ${cantidad > 1 ? `${cantidad} · ` : ""}${formatPrecio(p.precio * cantidad)}`
            : "Cerrado ahora"}
        </Boton>
      </View>

      <Dialogo
        visible={cambiarDeLocal}
        titulo="¿Empezar un carrito nuevo?"
        onCerrar={() => setCambiarDeLocal(false)}
        cancelar="No, dejalo"
        confirmar={{ texto: "Vaciar y agregar", onPress: confirmarCambioDeLocal }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Ya tenés {carrito.cantidadTotal} {carrito.cantidadTotal === 1 ? "producto" : "productos"} de{" "}
          <Txt v="body" style={{ fontWeight: "800" }}>
            {carrito.carrito.comercioNombre}
          </Txt>
          .
        </Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          Un pedido es de un solo local, así que para agregar algo de {local.nombre} hay que vaciar
          el otro carrito.
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
    </View>
  );
}

const e = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50, padding: espacio.lg },
  pagina: { width: "100%", aspectRatio: 1 },
  volver: {
    position: "absolute",
    left: espacio.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,.94)",
    ...sombras.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  puntos: { position: "absolute", bottom: espacio.md, alignSelf: "center", flexDirection: "row", gap: 6 },
  punto: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,.55)" },
  puntoActivo: { backgroundColor: color.white, width: 18 },
  linea: { height: 1, backgroundColor: color.n200, marginVertical: espacio.lg },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: color.n100,
    borderRadius: radio.pill,
    padding: 4,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    ...sombras.sm,
  },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
    minHeight: 52,
  },
  barra: { position: "absolute", left: espacio.lg, right: espacio.lg, flexDirection: "row" },
});
