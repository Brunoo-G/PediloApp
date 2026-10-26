/**
 * Memoria de "ya vi la bienvenida y elegí mirar sin cuenta".
 *
 * Sin esto la pantalla de bienvenida sería un peaje: aparecería cada vez que la
 * persona abre la app, incluso después de haber dicho explícitamente que quería
 * mirar sin cuenta. Una pared que ya salteaste y te vuelve a aparecer se lee
 * como un error de la app, no como una invitación.
 *
 * Vive en el dispositivo, no en la base: es una preferencia de esta persona en
 * este teléfono y no hay nada que sincronizar. `AsyncStorage` en web usa
 * `localStorage`, así que funciona igual en los dos lados.
 *
 * Se **olvida al cerrar sesión**: quien se va de su cuenta vuelve al principio
 * del embudo, que es lo que espera y además es la única forma de volver a ver
 * el botón de Google sin desinstalar nada.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CLAVE = "pedilo.mirar-sin-cuenta";

/**
 * Nunca tira: si el almacenamiento falla (modo incógnito, permisos), lo peor
 * que pasa es que se vuelva a mostrar la bienvenida. Romper la app por no poder
 * leer una preferencia sería muchísimo peor.
 */
export async function eligioMirarSinCuenta(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE)) === "1";
  } catch {
    return false;
  }
}

export async function recordarMirarSinCuenta(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE, "1");
  } catch {
    /* ver arriba */
  }
}

export async function olvidarMirarSinCuenta(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLAVE);
  } catch {
    /* ver arriba */
  }
}
