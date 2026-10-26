/**
 * Remis se sacó de la app (14/10). Este archivo queda sólo para que la ruta
 * no aparezca como pestaña ni muestre nada: redirige a Inicio. Se puede
 * borrar junto con la línea `name="remis"` de `(cliente)/_layout.tsx`.
 */
import { Redirect } from "expo-router";

export default function Remis() {
  return <Redirect href="/(cliente)" />;
}
