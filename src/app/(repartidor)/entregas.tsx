/**
 * Historial de entregas del repartidor: delivery y envíos en una sola lista.
 *
 * Se abre desde el Perfil con "Ver historial". Ya NO es una pestaña de la barra
 * de abajo: en `_layout` va con `href: null`, así que existe como pantalla pero
 * no ocupa lugar en la barra. La barra queda en Delivery, Envíos y Perfil.
 *
 * El archivo conserva el nombre `entregas.tsx` a propósito: era la vieja
 * pestaña "Entregas", y reusar el nombre hace que al copiar esta versión
 * encima de la anterior la pestaña desaparezca sola, sin tener que borrar nada.
 *
 * Vuelve con `navigate` al perfil y no con `back()`: dentro de las pestañas,
 * `back()` lleva a la primera pestaña (Delivery), no a donde estaba.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, EstadoVacio, Tocable, Txt } from "../../componentes/base";
import { FilaEntrega } from "../../componentes/FilaEntrega";
import { IconoVolver } from "../../componentes/Iconos";
import { useSesion } from "../../contextos/Sesion";
import { misEntregas, type PedidoParaRepartir } from "../../lib/repartos";
import { color, espacio, radio } from "../../theme/tokens";

type Filtro = "todos" | "delivery" | "envio";

export default function HistorialRepartidor() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSesion();
  const miId = session?.user?.id;

  const [todas, setTodas] = useState<PedidoParaRepartir[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const traer = useCallback(async () => {
    if (!miId) return;
    setTodas(await misEntregas(miId, "todos"));
    setCargando(false);
  }, [miId]);

  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  const deDelivery = todas.filter((p) => p.tipo !== "envio");
  const deEnvios = todas.filter((p) => p.tipo === "envio");
  const lista = filtro === "todos" ? todas : filtro === "envio" ? deEnvios : deDelivery;

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={() => router.navigate("/(repartidor)/perfil")} etiqueta="Volver al perfil">
          <View style={e.volver}>
            <IconoVolver size={20} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }}>
            Historial de entregas
          </Txt>
          <Txt v="cap" style={{ color: "#9A9A9A" }}>
            Delivery y envíos, del más nuevo al más viejo
          </Txt>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: insets.bottom + 40 }}
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
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espacio.sm, marginBottom: espacio.lg }}>
          <Chip activo={filtro === "todos"} onPress={() => setFiltro("todos")}>
            {`Todo (${todas.length})`}
          </Chip>
          <Chip activo={filtro === "delivery"} onPress={() => setFiltro("delivery")}>
            {`Delivery (${deDelivery.length})`}
          </Chip>
          <Chip activo={filtro === "envio"} onPress={() => setFiltro("envio")}>
            {`Envíos (${deEnvios.length})`}
          </Chip>
        </View>

        {cargando ? (
          <View style={{ gap: espacio.md }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ height: 88, borderRadius: radio.md, backgroundColor: color.n100 }} />
            ))}
          </View>
        ) : lista.length === 0 ? (
          <EstadoVacio
            titulo="Todavía nada acá"
            sub="Cuando entregues un pedido o un envío va a quedar guardado en esta lista."
            icono="Restaurante"
          />
        ) : (
          <View style={{ gap: espacio.md }}>
            {lista.map((p) => (
              <FilaEntrega key={p.id} p={p} />
            ))}
          </View>
        )}
      </ScrollView>
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
  volver: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
});
