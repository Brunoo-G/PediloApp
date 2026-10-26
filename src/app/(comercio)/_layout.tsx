import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { IconoTab, TAB_APAGADO } from "../../componentes/IconosTab";
import { useSesion } from "../../contextos/Sesion";
import { insignia, useConteos } from "../../lib/avisos";
import { color, fuente } from "../../theme/tokens";

/**
 * Todo lo que cuelga de acá es sólo para comercios.
 *
 * El portero está también en la base (RLS y `cambiar_estado_pedido` no le
 * dejan tocar nada a quien no corresponde). Este chequeo es de interfaz: que
 * nadie vea un panel vacío y crea que se rompió algo.
 *
 * El orden de las pestañas lo eligió el dueño del producto: Ingresos, Pedidos,
 * Catálogo, Mi local.
 *
 * Al abrir la app el comercio igual cae en Pedidos, no en Ingresos: si hay uno
 * esperando que lo acepten, eso es urgente y el número del día no. El orden de
 * la barra es dónde están las cosas; la pantalla de entrada es qué hay que
 * hacer ahora.
 */
/** Pedidos nuevos sin aceptar (RLS deja ver sólo los del propio local). */
const NUEVOS = { pedidos: { tipo: "delivery" as const, estado: "Pendiente" } };

export default function LayoutComercio() {
  const { rolListo, rol, session } = useSesion();
  // Antes de los `return` de abajo: los hooks van siempre en el mismo orden.
  const nuevos = useConteos(NUEVOS, !!session && (rol === "comercio" || rol === "admin"), "avisos-local");

  if (!rolListo) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  if (!session) return <Redirect href="/acceso" />;
  if (rol !== "comercio" && rol !== "admin") return <Redirect href="/(cliente)" />;

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
        name="ingresos"
        options={{ title: "Ingresos", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="ingresos" tinta={c as string} activo={focused} /> }}
      />
      {/* Pedidos es una lista —la comanda— y Catálogo una caja —el stock—:
          cada ícono dice qué hay adentro, y el de la bolsa se queda para el
          cliente, que es quien compra. */}
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarBadge: insignia(nuevos.pedidos),
          tabBarBadgeStyle: { backgroundColor: "#E5484D", color: "#FFFFFF", fontFamily: fuente.semibold, fontSize: 11 },
          tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="carta" tinta={c as string} activo={focused} />,
        }}
      />
      {/* La ruta sigue siendo `carta` —renombrar el archivo rompería los links
          que ya existen—, pero en la barra dice "Catálogo" y adentro el título
          es "Stock de productos". */}
      <Tabs.Screen
        name="carta"
        options={{ title: "Catálogo", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="stock" tinta={c as string} activo={focused} /> }}
      />
      <Tabs.Screen
        name="local"
        options={{ title: "Mi local", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="tienda" tinta={c as string} activo={focused} /> }}
      />
      {/* El editor de producto se abre desde la carta, no es una pestaña. */}
      <Tabs.Screen name="producto" options={{ href: null }} />
    </Tabs>
  );
}
