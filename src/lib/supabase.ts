/**
 * Cliente de Supabase.
 *
 * Acá viven las cuatro trampas que hicieron perder tiempo en el proyecto
 * anterior. Están resueltas y comentadas para que no vuelvan a aparecer.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import type { Database } from "./tipos";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "";

/**
 * TRAMPA 1 — la URL va SIN `/rest/v1/` al final.
 * Supabase muestra la URL de la API REST en el panel y es tentador copiarla
 * entera. El cliente le agrega el path solo. Si la pegás completa, todas las
 * consultas dan 404 sin decir por qué.
 */
export const urlValida = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim());

/**
 * TRAMPA 2 — la clave nueva tiene prefijo `sb_publishable_`.
 * Reemplaza a la vieja "anon key" (un JWT que empezaba con `eyJ`). Las dos
 * funcionan por ahora, pero la nueva es la que hay que usar en proyectos nuevos.
 */
export const claveValida = key.startsWith("sb_publishable_") || key.startsWith("eyJ");

/** ¿Están las variables de entorno cargadas y con pinta correcta? */
export const configuracionOk = urlValida && claveValida;

/** Mensaje concreto para mostrar en pantalla si algo falta. */
export function diagnosticoConfig(): string | null {
  if (!url) return "Falta EXPO_PUBLIC_SUPABASE_URL en el archivo .env";
  if (!key) return "Falta EXPO_PUBLIC_SUPABASE_KEY en el archivo .env";
  if (url.includes("/rest/v1"))
    return "La URL no lleva /rest/v1/ al final. Dejala en https://TU-PROYECTO.supabase.co";
  if (!urlValida) return `La URL no tiene el formato esperado: ${url}`;
  if (!claveValida) return "La clave debería empezar con sb_publishable_";
  return null;
}

export const supabase = createClient<Database>(url || "https://placeholder.supabase.co", key || "placeholder", {
  auth: {
    /**
     * TRAMPA 3 — en web, `detectSessionInUrl` TIENE que estar en true.
     * El login con Google vuelve con el token en el fragmento de la URL. Si
     * está en false, Supabase no lo lee, la sesión nunca se establece y el
     * usuario queda dando vueltas en la pantalla de login sin ningún error.
     * En nativo va en false porque no hay URL que mirar.
     */
    detectSessionInUrl: Platform.OS === "web",

    /**
     * TRAMPA 4 — en nativo hace falta un storage explícito.
     * React Native no tiene localStorage. Sin esto la sesión no sobrevive al
     * cierre de la app. En web se deja el default (localStorage del navegador).
     */
    storage: Platform.OS === "web" ? undefined : AsyncStorage,

    persistSession: true,
    autoRefreshToken: true,
  },
});
