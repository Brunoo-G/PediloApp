import { useFonts } from "expo-font";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from "@expo-google-fonts/figtree";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CarritoProvider } from "../contextos/Carrito";
import { ConfiguracionProvider } from "../contextos/Configuracion";
import { SesionProvider } from "../contextos/Sesion";
import { color } from "../theme/tokens";

export default function RootLayout() {
  const [fuentesListas] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  // Sin las fuentes cargadas el texto salta de una tipografía a otra al montar.
  // Un instante en blanco se nota menos que ese salto.
  if (!fuentesListas) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SesionProvider>
        <ConfiguracionProvider>
        <CarritoProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.n50 },
              animation: "slide_from_right",
            }}
          />
        </CarritoProvider>
        </ConfiguracionProvider>
      </SesionProvider>
    </SafeAreaProvider>
  );
}
