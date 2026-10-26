import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSesion } from "../contextos/Sesion";
import { color } from "../theme/tokens";

/**
 * Punto de entrada: decide de qué lado del mostrador está el usuario.
 *
 * El orden importa y es éste:
 *
 *  1. **Comercio y repartidor** van a su panel. Si los mandáramos al
 *     marketplace tendrían que buscar cómo llegar a sus propios pedidos, que
 *     es lo único que vinieron a hacer.
 *  2. **Sin cuenta** va a la bienvenida. No hay modo invitado: para usar
 *     Pedilo hay que crearse una cuenta (con Google o con mail).
 *  3. **Cliente con cuenta pero sin celular o sin dirección** va al primer
 *     paso. Sin esos dos datos no se puede pedir, así que dejarlo entrar sería
 *     mandarlo a chocar contra el checkout con el carrito lleno.
 *
 * Se espera a que se sepa el rol antes de decidir: decidir antes hace que la
 * app arranque en una pantalla y salte a otra medio segundo después.
 */
export default function Entrada() {
  const { rolListo, rol, session, esAnonimo, perfilCompleto } = useSesion();

  if (!rolListo) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  if (rol === "comercio") return <Redirect href="/(comercio)/pedidos" />;
  if (rol === "repartidor") return <Redirect href="/(repartidor)" />;

  const conCuenta = !!session && !esAnonimo;
  if (!conCuenta) return <Redirect href="/bienvenida" />;
  if (!perfilCompleto) return <Redirect href="/primer-paso" />;

  return <Redirect href="/(cliente)" />;
}
