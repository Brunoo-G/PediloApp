import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { IconoTab, TAB_APAGADO } from "../../componentes/IconosTab";
import { useSesion } from "../../contextos/Sesion";
import { color, fuente } from "../../theme/tokens";

/**
 * Menú inferior. Va en negro con el verde de marca en el activo, igual que el
 * header: son las dos superficies oscuras de la app y le dan carácter.
 */
export default function LayoutCliente() {
  const { rolListo, rol, session, esAnonimo, perfilCompleto } = useSesion();

  /*
    UN COMERCIO O UN REPARTIDOR ACÁ ES UN ERROR DE RUTA, NO UNA VISITA
 
    Los grupos de expo-router no salen en la URL, así que `(cliente)/pedidos` y
    `(comercio)/pedidos` son los dos `/pedidos`. Mientras se navega con los
    botones no pasa nada —la raíz manda a cada uno a su grupo con el nombre
    completo— pero al RECARGAR la página, expo-router resuelve la URL sola y
    elige el primero que coincide, que es éste. Resultado: un comercio recargaba
    su panel de pedidos y aparecía en el marketplace, como cliente.
 
    Estaba desde antes de los envíos y no se notaba porque nadie recarga; con
    `/envios` en los dos lados era cuestión de tiempo. Se arregla acá y sirve
    para las tres rutas que se pisan: pedidos, perfil y envíos.
  */
  if (!rolListo) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }
  // El destino va con el nombre del grupo completo. Mandarlos a "/" los hacía
  // rebotar entre la raíz y este layout hasta que React cortaba con
  // "maximum update depth": "/" también es una ruta ambigua.
  if (rol === "comercio") return <Redirect href="/(comercio)/pedidos" />;
  if (rol === "repartidor") return <Redirect href="/(repartidor)" />;

  // Sin cuenta no se entra al marketplace (no hay modo invitado), y con cuenta
  // a medias —sin celular o sin dirección— primero se completa. Esto cubre a
  // quien llega por una URL directa o recarga la página.
  if (!session || esAnonimo) return <Redirect href="/bienvenida" />;
  if (!perfilCompleto) return <Redirect href="/primer-paso" />;

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
        options={{ title: "Inicio", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="casa" tinta={c as string} activo={focused} /> }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{ title: "Pedidos", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="bolsa" tinta={c as string} activo={focused} /> }}
      />
      {/*
        "Enviar artículo" (antes "Envíos") va tercero, después de Pedidos: es un
        servicio aparte, no un paso del delivery.
      */}
      <Tabs.Screen
        name="envios"
        options={{
          title: "Enviar artículo",
          tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="envio" tinta={c as string} activo={focused} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: "Perfil", tabBarIcon: ({ color: c, focused }) => <IconoTab tipo="persona" tinta={c as string} activo={focused} /> }}
      />
      {/* La ficha del local se abre desde el home, no es una pestaña. */}
      <Tabs.Screen name="local/[id]" options={{ href: null }} />
      <Tabs.Screen name="categoria" options={{ href: null }} />
      {/* El detalle del producto: se abre desde el home o desde la carta. */}
      <Tabs.Screen name="producto/[id]" options={{ href: null }} />
      <Tabs.Screen name="direccion" options={{ href: null }} />
      <Tabs.Screen name="carrito" options={{ href: null }} />
      <Tabs.Screen name="checkout" options={{ href: null }} />
      <Tabs.Screen name="envio-nuevo" options={{ href: null }} />
      {/* Remis se sacó (14/10). Si el archivo remis.tsx sigue en la carpeta,
          esto lo esconde de la barra; el archivo sólo redirige a Inicio. */}
      <Tabs.Screen name="remis" options={{ href: null }} />
    </Tabs>
  );
}
