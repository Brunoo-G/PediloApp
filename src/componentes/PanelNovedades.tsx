/**
 * El panel que abre la campana.
 *
 * Es una hoja que sube desde abajo, no una pantalla: lo que muestra se mira
 * diez segundos y se cierra, y mandar a la persona a otra pantalla la obliga a
 * volver. Tocar un renglón sí navega —al chat o a Mis pedidos— porque ahí ya
 * hay algo que hacer.
 *
 * Se marca todo como visto **al abrir**, no al cerrar ni al tocar cada
 * renglón: el puntito dice "hay algo que no viste", y con haber abierto el
 * panel ya lo viste. Marcar renglón por renglón sería pedirle trabajo a la
 * persona para apagar una luz.
 *
 * Por qué la lista se trae cada vez que se abre y no se cachea: son dos
 * consultas chicas, y un panel de novedades que muestra novedades viejas es
 * peor que uno que tarda 300ms.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSesion } from "../contextos/Sesion";
import { fechaCorta } from "../lib/precios";
import { marcarVistas, traerNovedades, type Novedad } from "../lib/novedades";
import { color, espacio, radio, sombras } from "../theme/tokens";
import { EstadoVacio, ImagenSmart, Tocable, Txt } from "./base";

export function PanelNovedades({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSesion();

  const [lista, setLista] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    setCargando(true);
    traerNovedades(session?.user?.id).then((n) => {
      if (!vivo) return;
      setLista(n.lista);
      setCargando(false);
      // Se marca después de traer, no antes: si la consulta falla, el puntito
      // tiene que seguir prendido.
      marcarVistas();
    });
    return () => {
      vivo = false;
    };
  }, [visible, session?.user?.id]);

  function ir(n: Novedad) {
    onCerrar();
    if (n.tipo === "mensaje") router.push({ pathname: "/chat", params: { id: n.pedidoId } });
    else router.push("/(cliente)/pedidos");
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable style={p.fondo} onPress={onCerrar}>
        <Pressable style={[p.hoja, { paddingBottom: insets.bottom + espacio.lg }]} onPress={() => {}}>
          <View style={p.manija} />

          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Txt v="title">Novedades</Txt>
            <Tocable onPress={onCerrar}>
              <Txt v="label" style={{ color: color.brandInk }}>
                Cerrar
              </Txt>
            </Tocable>
          </View>

          {cargando ? (
            <ActivityIndicator color={color.brandInk} style={{ marginVertical: espacio.xxxl }} />
          ) : lista.length === 0 ? (
            <View style={{ marginVertical: espacio.lg }}>
              <EstadoVacio
                titulo="Todo tranquilo"
                sub="Acá te vamos a avisar cuando el local acepte tu pedido, cuando salga y cuando el repartidor te escriba."
                icono="Restaurante"
              />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: espacio.sm, paddingVertical: espacio.md }}>
                {lista.map((n) => (
                  <Tocable key={n.id} onPress={() => ir(n)} suave>
                    <View style={[p.fila, n.nueva && p.filaNueva]}>
                      <ImagenSmart
                        uri={n.logoUrl}
                        categoria={n.categoria}
                        style={p.logo}
                        iconoSize={16}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Txt v="label" numberOfLines={1} style={{ flex: 1 }}>
                            {n.titulo}
                          </Txt>
                          {n.nueva && <View style={p.punto} />}
                        </View>
                        <Txt v="cap" numberOfLines={2} style={{ marginTop: 1 }}>
                          {n.detalle}
                        </Txt>
                        <Txt v="cap" style={{ fontSize: 11, marginTop: 3, color: color.n400 }} numberOfLines={1}>
                          {n.local} · {fechaCorta(n.cuando)}
                        </Txt>
                      </View>
                    </View>
                  </Tocable>
                ))}
              </View>
            </ScrollView>
          )}

          <Txt v="cap" style={{ fontSize: 11, marginTop: espacio.sm, color: color.n400 }}>
            Por ahora esto se actualiza cuando abrís la app. Los avisos al celular con la app cerrada
            todavía no están.
          </Txt>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const p = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,0.55)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.n50,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
  },
  manija: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.n200,
    alignSelf: "center",
    marginBottom: espacio.md,
  },
  fila: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    ...sombras.sm,
  },
  filaNueva: { borderLeftWidth: 3, borderLeftColor: color.brand },
  logo: { width: 32, height: 32, borderRadius: radio.sm, overflow: "hidden" },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand },
});
