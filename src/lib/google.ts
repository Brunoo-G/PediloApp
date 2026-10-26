/**
 * Entrar con Google.
 *
 * Son dos caminos distintos y por eso están acá y no metidos en el contexto de
 * sesión, que ya es largo:
 *
 *   * **Web**: Supabase redirige el navegador a Google y Google vuelve a la
 *     app. No hay nada que esperar; la función devuelve y la página se va.
 *   * **Nativo**: se abre el navegador del sistema en una ventana de
 *     autenticación. Cuando Google vuelve al esquema de la app, el sistema
 *     cierra esa ventana y nos devuelve la URL con los tokens, que hay que
 *     canjear a mano. No alcanza con abrir el link y esperar: sin
 *     `openAuthSessionAsync` la ventana queda abierta y la vuelta se pierde.
 *
 * VINCULAR EN VEZ DE CREAR
 *
 * Si la persona ya venía navegando con una sesión anónima, se usa
 * `linkIdentity` en lugar de `signInWithOAuth`: la cuenta de Google se le pega
 * al usuario que ya existe y conserva sus pedidos y sus chats. Con
 * `signInWithOAuth` se crearía un usuario nuevo y lo viejo quedaría huérfano,
 * sin dueño que pueda entrar a verlo.
 *
 * `linkIdentity` necesita "Manual linking" activado en Supabase. Si no lo está,
 * o si esa cuenta de Google ya pertenece a otro usuario, falla — y el contexto
 * de sesión reintenta con el login normal, que es lo correcto: entrar igual es
 * mejor que no entrar.
 */
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

type Resultado = { error: { message: string } | null };

/**
 * A dónde vuelve Google.
 *
 * En web se vuelve a la MISMA pantalla, no a la home: quien toca "continuar con
 * Google" desde el checkout tiene que volver al checkout. El carrito sobrevive
 * igual (está en el dispositivo), pero mandarlo a la home lo obliga a rehacer
 * el camino y es donde se pierde la mitad de la gente.
 *
 * Esto exige que en Supabase → Authentication → URL Configuration esté la URL
 * de la app con comodín (`http://localhost:8081/**`), porque la vuelta no es
 * siempre la misma dirección.
 */
function volverA(): string {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return "";
    return window.location.origin + window.location.pathname;
  }
  return Linking.createURL("/");
}

export async function entrarConGoogle(vincular: boolean): Promise<Resultado> {
  const redirectTo = volverA();

  // ------------------------------------------------------------------ web --
  if (Platform.OS === "web") {
    const opciones = { provider: "google" as const, options: { redirectTo } };
    const { error } = vincular
      ? await supabase.auth.linkIdentity(opciones)
      : await supabase.auth.signInWithOAuth(opciones);
    return { error: error ?? null };
  }

  // --------------------------------------------------------------- nativo --
  // `skipBrowserRedirect` hace que Supabase devuelva la URL en vez de intentar
  // abrirla él: en nativo la tenemos que abrir nosotros, en una ventana de
  // autenticación que sepa volver.
  const opciones = {
    provider: "google" as const,
    options: { redirectTo, skipBrowserRedirect: true },
  };
  const { data, error } = vincular
    ? await supabase.auth.linkIdentity(opciones)
    : await supabase.auth.signInWithOAuth(opciones);

  if (error) return { error };
  if (!data?.url) return { error: { message: "Google no devolvió una dirección para continuar." } };

  const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (r.type !== "success" || !r.url) {
    // Cerró la ventana a propósito. No es un error que haya que mostrar en
    // rojo: quiso salir, y salió.
    return { error: null };
  }

  return { error: (await canjearTokens(r.url)) };
}

/**
 * Convierte la URL de vuelta en una sesión.
 *
 * Supabase puede volver de dos formas según cómo esté configurado el proyecto:
 * con un `code` (PKCE) o con los tokens directamente en el fragmento `#`. Se
 * contemplan las dos porque cuál toca no depende de esta app.
 */
async function canjearTokens(url: string): Promise<{ message: string } | null> {
  const u = new URL(url);

  const code = u.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ?? null;
  }

  const frag = new URLSearchParams(u.hash.replace(/^#/, ""));
  const access_token = frag.get("access_token");
  const refresh_token = frag.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return error ?? null;
  }

  const descripcion = u.searchParams.get("error_description") ?? frag.get("error_description");
  return { message: descripcion || "Google volvió sin datos de sesión." };
}
