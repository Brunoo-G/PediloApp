/**
 * Carrito.
 *
 * Cada renglón tiene su propia nota. "Sin cebolla" pertenece a la hamburguesa,
 * no al pedido entero: cuando pedís cuatro cosas y hay que aclarar sobre dos,
 * una nota general obliga al comercio a leer y adivinar a qué se refiere.
 *
 * No es una pestaña: se llega desde la barra flotante. La pestaña "Pedidos" es
 * el historial.
 */
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, EstadoVacio, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import { IconoVolver } from "../../componentes/Iconos";
import { useCarrito } from "../../contextos/Carrito";
import { calcularPrecio, formatPrecio } from "../../lib/precios";
import { color, espacio, radio, sombras, TAP_MIN, texto } from "../../theme/tokens";

const TOPE_NOTA = 140;

export default function PantallaCarrito() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { carrito, cambiarCantidad, cambiarNota, quitar, cantidadTotal } = useCarrito();

  /** Qué renglón está editando su nota, y el borrador mientras se escribe. */
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");

  // Sin cupón todavía: el carrito muestra el subtotal, y el envío y las promos
  // se resuelven en el checkout, que es donde se elige el cupón.
  const resumen = calcularPrecio({
    lineas: carrito.items.map((i) => ({ precio: i.precio, cantidad: i.cantidad })),
    costoEnvio: 0,
  });

  const enEdicion = carrito.items.find((i) => i.productoId === editando);

  function abrirNota(productoId: string, notaActual: string) {
    setBorrador(notaActual);
    setEditando(productoId);
  }

  function guardarNota() {
    if (editando) cambiarNota(editando, borrador.trim());
    setEditando(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      {/*
        Encabezado con volver, igual al del checkout.
        Antes esta pantalla era un título suelto sin salida: se llega desde la
        barra flotante o desde el ícono del header, y el único camino de vuelta
        era la pestaña de abajo, que además te saca del local que estabas
        mirando. `router.back()` devuelve a donde estabas; si no hay a dónde
        volver (se entró por URL directa) cae al home en vez de no hacer nada.
      */}
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(cliente)"))}>
          <View style={e.volver}>
            <IconoVolver size={20} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }}>
            Tu carrito
          </Txt>
          {!!carrito.comercioNombre && (
            <Txt v="cap" style={{ color: "#9A9A9A" }} numberOfLines={1}>
              {carrito.comercioNombre}
            </Txt>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: espacio.lg, paddingHorizontal: espacio.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

        {cantidadTotal === 0 ? (
          <EstadoVacio
            titulo="Tu carrito está vacío"
            sub="Todavía no agregaste nada. Lo que sumes desde un local va a aparecer acá."
            icono="Supermercado"
          />
        ) : (
          <>
            {/* El nombre del local ya está en el encabezado: no se repite acá. */}
            <View style={{ height: espacio.xs }} />

            <View style={{ gap: espacio.sm }}>
              {carrito.items.map((i) => (
                <View key={i.productoId} style={e.linea}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
                    <ImagenSmart uri={i.fotoUrl} style={e.foto} iconoSize={22} />
                    <View style={{ flex: 1 }}>
                      <Txt v="label" numberOfLines={2}>
                        {i.nombre}
                      </Txt>
                      <Txt v="cap">{formatPrecio(i.precio)} c/u</Txt>
                      <Txt v="price" style={{ marginTop: 4 }}>
                        {formatPrecio(i.precio * i.cantidad)}
                      </Txt>
                    </View>
                    <View style={e.stepper}>
                      <Tocable
                        onPress={() => (i.cantidad === 1 ? quitar(i.productoId) : cambiarCantidad(i.productoId, -1))}
                      >
                        <View style={[e.stepBtn, { backgroundColor: color.white }]}>
                          <Txt v="label" style={{ color: i.cantidad === 1 ? color.danger : color.brandInk }}>
                            {i.cantidad === 1 ? "×" : "−"}
                          </Txt>
                        </View>
                      </Tocable>
                      <Txt v="label" style={{ minWidth: 18, textAlign: "center", color: color.brandInk }}>
                        {i.cantidad}
                      </Txt>
                      <Tocable onPress={() => cambiarCantidad(i.productoId, 1)}>
                        <View style={[e.stepBtn, { backgroundColor: color.brand }]}>
                          <Txt v="label" style={{ color: color.ink }}>
                            +
                          </Txt>
                        </View>
                      </Tocable>
                    </View>
                  </View>

                  {/* ------------------------- la nota ------------------------- */}
                  <Tocable onPress={() => abrirNota(i.productoId, i.nota)}>
                    <View style={[e.notaBtn, i.nota ? e.notaConTexto : e.notaVacia]}>
                      {i.nota ? (
                        <>
                          <Txt v="cap" style={{ color: color.brandInk, flex: 1 }} numberOfLines={2}>
                            “{i.nota}”
                          </Txt>
                          <Txt v="cap" style={{ color: color.brandInk, fontSize: 12 }}>
                            Editar
                          </Txt>
                        </>
                      ) : (
                        <Txt v="cap" style={{ color: color.n600 }}>
                          + Agregar una nota (ej: sin cebolla)
                        </Txt>
                      )}
                    </View>
                  </Tocable>
                </View>
              ))}
            </View>

            <View style={e.resumen}>
              <View style={e.fila}>
                <Txt v="body" style={{ color: color.n600 }}>
                  Subtotal
                </Txt>
                <Txt v="body">{formatPrecio(resumen.subtotal)}</Txt>
              </View>
              <Txt v="cap" style={{ marginTop: espacio.sm }}>
                El envío, la tarifa de servicio y los descuentos se calculan en el siguiente paso.
              </Txt>

              <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
                <Boton variante="fantasma" onPress={() => router.push("/(cliente)")}>
                  Agregar más
                </Boton>
                <Boton onPress={() => router.push("/(cliente)/checkout")}>Continuar</Boton>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* --------------------- hoja para escribir la nota --------------------- */}
      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <Pressable style={e.fondo} onPress={() => setEditando(null)}>
          <Pressable style={[e.hoja, { paddingBottom: insets.bottom + espacio.xl }]} onPress={() => {}}>
            <View style={e.manija} />

            <Txt v="title">Nota para este producto</Txt>
            <Txt v="cap" style={{ marginTop: 4, marginBottom: espacio.lg }} numberOfLines={2}>
              {enEdicion?.nombre}
            </Txt>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Txt v="cap">Aclaración</Txt>
              <Txt v="cap" style={{ color: borrador.length >= TOPE_NOTA - 15 ? color.danger : color.n400 }}>
                {borrador.length}/{TOPE_NOTA}
              </Txt>
            </View>

            <TextInput
              value={borrador}
              onChangeText={(t) => setBorrador(t.slice(0, TOPE_NOTA))}
              placeholder="Ej: sin cebolla, bien cocida, sin sal"
              placeholderTextColor={color.n400}
              multiline
              autoFocus
              style={e.input}
            />

            <Txt v="cap" style={{ marginTop: espacio.sm }}>
              El local la ve al lado de este producto cuando prepara el pedido.
            </Txt>

            <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.xl }}>
              {enEdicion?.nota ? (
                <Boton
                  variante="fantasma"
                  onPress={() => {
                    if (editando) cambiarNota(editando, "");
                    setEditando(null);
                  }}
                  textStyle={{ color: color.danger }}
                >
                  Borrar
                </Boton>
              ) : (
                <Boton variante="fantasma" onPress={() => setEditando(null)}>
                  Cancelar
                </Boton>
              )}
              <Boton onPress={guardarNota}>Guardar</Boton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const e = StyleSheet.create({
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
  },
  volver: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#191919", alignItems: "center", justifyContent: "center" },
  linea: { backgroundColor: color.white, borderRadius: radio.md, padding: espacio.sm + 2, ...sombras.sm },
  foto: { width: 64, height: 64, borderRadius: radio.sm, overflow: "hidden" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: color.brandWash,
    borderRadius: radio.pill,
    padding: 4,
  },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },

  notaBtn: {
    minHeight: 40,
    marginTop: espacio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
    borderRadius: radio.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
  },
  notaVacia: { borderWidth: 1.5, borderColor: color.n200, borderStyle: "dashed" },
  notaConTexto: { backgroundColor: color.brandWash },

  resumen: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, marginTop: espacio.lg, ...sombras.md },
  fila: { flexDirection: "row", justifyContent: "space-between" },

  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.45)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    paddingHorizontal: espacio.xl,
    paddingTop: espacio.md,
  },
  manija: { width: 40, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    minHeight: TAP_MIN + 30,
    textAlignVertical: "top",
    backgroundColor: color.white,
  },
});
