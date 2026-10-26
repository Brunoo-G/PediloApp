import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { IconoTab, TAB_APAGADO } from "../../componentes/IconosTab";
import { useSesion } from "../../contextos/Sesion";
import { insignia, useConteos } from "../../lib/avisos";
import { color, envioColor, fuente } from "../../theme/tokens";

/**
 * Todo lo que cuelga de acá es sólo para repartidores.
 *
 * Tres pestañas: Delivery, Envíos y Perfil. El repartidor mira esta app parado
 * al lado de la moto, muchas veces con una mano ocupada, y cada pestaña de más
 * es una decisión de más en el peor momento.
 *
 * Delivery y Envíos van separadas porque son otro trabajo: los envíos no pasan
 * por ningún local, las dos direcciones las escribió un vecino y el riesgo de
 * confundirlos con un pedido es que alguien vaya a buscar una hamburguesa a
 * una casa. Cada una tiene adentro sus tres pestañas (En espera / En curso /
 * Historial). Hubo una cuarta, "Entregas", con el historial y la plata: la
 * plata se fue al Perfil y el historial completo se abre desde ahí con "Ver
 * historial". Esa pantalla sigue siendo `entregas.tsx`, pero con `href: null`
 * para que no aparezca en la barra.
 *
 * Por eso además la pestaña de envíos va en VIOLETA y no en el verde de marca:
 * el color solo ya dice en cuál de los dos trabajos está parado.
 *
 * El portero de verdad está en la base: `tomar_pedido` rechaza a quien no tiene
 * rol repartidor, y RLS no le muestra un pedido ajeno aunque se sepa el id.
 * Este chequeo es de interfaz.
 */
/** Lo que espera que alguien lo tome: es lo que cuenta el numerito de cada pestaña. */
const SIN_TOMAR = {
  delivery: { tipo: "delivery" as const, estado: "Listo", sinRepartidor: true },
  envios: { tipo: "envio" as const, estado: "Pendiente", sinRepartidor: true },
};

const BADGE = { backgroundColor: "#E5484D", color: "#FFFFFF", fontFamily: fuente.semibold, fontSize: 11 };

export default function LayoutRepartidor() {
  const { rolListo, rol, session } = useSesion();
  // Antes de los `return` de abajo: los hooks van siempre en el mismo orden.
  const sinTomar = useConteos(SIN_TOMAR, !!session && (rol === "repartidor" || rol === "admin"), "avisos-repartidor");

  if (!rolListo) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  if (!session) return <Redirect href="/acceso?rol=repartidor" />;
  if (rol !== "repartidor" && rol !== "admin") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: color.ink,
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 92 : 72,
          paddingTop: 9,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
        },
        tabBarActiveTintColor: color.brand,
        tabBarInactiveTintColor: TAB_APAGADO,
        tabBarLabelStyle: { fontFamily: fuente.semibold, fontSize: 11.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Delivery",
          tabBarBadge: insignia(sinTomar.delivery),
          tabBarBadgeStyle: BADGE,
          tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="moto" tinta={c as string} activo={focused} />,
        }}
      />
      {/* Los envíos, en su propio color. Ver `componentes/Envio`. */}
      <Tabs.Screen
        name="envios"
        options={{
          title: "Envíos",
          tabBarBadge: insignia(sinTomar.envios),
          tabBarBadgeStyle: BADGE,
          tabBarActiveTintColor: envioColor.borde,
          tabBarIcon: ({ color: c, focused }) => (
            <IconoTab
              tipo="envio"
              tinta={focused ? envioColor.borde : (c as string)}
              activo={focused}
              acento={envioColor.borde}
            />
          ),
        }}
      />
      {/* El historial completo. Se abre desde el perfil; no va en la barra. */}
      <Tabs.Screen name="entregas" options={{ href: null }} />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="persona" tinta={c as string} activo={focused} />,
        }}
      />
    </Tabs>
  );
}
