/**
 * Sesión y perfil del usuario.
 *
 * Para usar Pedilo hace falta cuenta: no hay modo invitado. Se entra con
 * Google o con mail y contraseña, y en los dos casos se pide el celular, que
 * es lo único que tiene Pedilo para ubicar a alguien si un pedido se traba.
 *
 * Un perfil está **completo** cuando tiene celular y dirección. Hasta entonces
 * la raíz lo manda al primer paso (`primer-paso.tsx`).
 *
 * La regla de "sin cuenta no se pide" vive además en `crear_pedido`, en la
 * base (migración 14).
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, configuracionOk } from "../lib/supabase";
import { entrarConGoogle } from "../lib/google";
import { celularValido } from "../lib/telefono";
import type { Perfil, RolUsuario } from "../lib/tipos";

interface Ctx {
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  /**
   * El rol manda para dónde va la app: un comercio entra a su panel, no al
   * marketplace. Sin perfil todavía se asume cliente, que es el caso común y
   * el menos dañino si nos equivocamos.
   */
  rol: RolUsuario;
  /**
   * true cuando ya sabemos el rol: o no hay sesión, o el perfil terminó de
   * cargar (haya venido o no). Sin esto la raíz no puede distinguir "todavía
   * no sé" de "es cliente", y un comercio ve el marketplace por un segundo
   * antes de saltar a su panel.
   */
  rolListo: boolean;
  /** true cuando el usuario entró y ya cargó su celular y su dirección. */
  perfilCompleto: boolean;
  /** true si la sesión es anónima (de las viejas). No alcanza para pedir. */
  esAnonimo: boolean;
  /**
   * true cuando la persona puede pedir: tiene cuenta de verdad y dirección.
   * Es la misma condición que valida `crear_pedido` en la base.
   */
  puedePedir: boolean;
  /**
   * Entra con Google.
   *
   * Si ya hay una sesión anónima, en vez de crear una cuenta nueva se le
   * **vincula** la identidad de Google: así la persona conserva los pedidos y
   * los chats que ya tenía. Esa es la razón de que las sesiones anónimas sigan
   * habilitadas en Supabase aunque ya no sirvan para pedir.
   *
   * Devuelve un mensaje si falló, o null si arrancó bien. Ojo: en web esto
   * redirige, así que "salió bien" significa "se fue a Google", no "ya entró".
   */
  entrarConGoogle: () => Promise<string | null>;
  /**
   * Acceso con mail y contraseña, para comercios y repartidores. Las cuentas
   * las crea el equipo a mano: nadie se registra solo como local, porque
   * verificar que alguien es dueño de un negocio no lo hace un formulario.
   *
   * Devuelve un mensaje si falló, o null si entró.
   */
  iniciarSesion: (email: string, password: string) => Promise<string | null>;
  /**
   * Crea una cuenta de cliente con mail y contraseña. El nombre y el celular
   * viajan en los metadatos del usuario y el trigger de la base los copia al
   * perfil (migración 23); igual se guardan acá si ya hay sesión.
   *
   * `confirmar: true` cuando Supabase pide confirmar el mail antes de entrar.
   */
  registrarse: (datos: {
    nombre: string;
    email: string;
    password: string;
    telefono: string;
  }) => Promise<{ error: string | null; confirmar?: boolean }>;
  refrescarPerfil: () => Promise<void>;
  actualizarPerfil: (campos: Partial<Perfil>) => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const SesionCtx = createContext<Ctx | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [perfilCargado, setPerfilCargado] = useState(false);

  // Supabase marca las sesiones anónimas en el propio usuario.
  const anonimo = !!session?.user?.is_anonymous;

  useEffect(() => {
    if (!configuracionOk) {
      setCargando(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function cargarPerfil(uid: string) {
    const { data } = await supabase.from("perfiles").select("*").eq("id", uid).single();
    setPerfil((data as unknown as Perfil) ?? null);
    // Se marca aunque no haya venido nada: "no tiene perfil" también es saber.
    setPerfilCargado(true);
  }

  useEffect(() => {
    if (session?.user?.id) {
      setPerfilCargado(false);
      cargarPerfil(session.user.id);
    } else {
      setPerfil(null);
      setPerfilCargado(false);
    }
  }, [session?.user?.id]);

  const valor = useMemo<Ctx>(
    () => ({
      session,
      perfil,
      cargando,
      rol: perfil?.rol ?? "cliente",
      rolListo: !cargando && (!session || perfilCargado),
      perfilCompleto: !!perfil && perfil.direccion.trim().length >= 5 && celularValido(perfil.telefono),
      esAnonimo: anonimo,
      puedePedir:
        !!session &&
        !anonimo &&
        !!perfil &&
        perfil.direccion.trim().length >= 5 &&
        celularValido(perfil.telefono),

      entrarConGoogle: async () => {
        const { error } = await entrarConGoogle(!!session && anonimo);
        if (!error) return null;
        const m = error.message ?? "";
        if (/provider.*not enabled|unsupported provider/i.test(m)) {
          return "Falta activar Google en Supabase: Authentication → Sign In / Providers → Google.";
        }
        if (/identity.*already|already linked|manual linking/i.test(m)) {
          // Vincular falló porque esa cuenta de Google ya es de otro usuario.
          // No es un error del que haya que hacerse cargo acá: se entra normal.
          const { error: e2 } = await entrarConGoogle(false);
          return e2 ? e2.message : null;
        }
        return m || "No se pudo entrar con Google. Probá de nuevo.";
      },

      iniciarSesion: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) {
          // El mensaje de Supabase es el mismo para "mail que no existe" y
          // "contraseña equivocada", y está bien que así sea: decir cuál de
          // las dos falló le regala a cualquiera una lista de mails válidos.
          if (/invalid login credentials/i.test(error.message)) {
            return "Mail o contraseña incorrectos.";
          }
          if (/email not confirmed/i.test(error.message)) {
            return "Esa cuenta todavía no confirmó el mail.";
          }
          return error.message;
        }
        setSession(data.session);
        if (data.session?.user?.id) await cargarPerfil(data.session.user.id);
        return null;
      },

      registrarse: async ({ nombre, email, password, telefono }) => {
        const mail = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { full_name: nombre.trim(), telefono } },
        });
        if (error) {
          const m = error.message ?? "";
          if (/already registered|already exists/i.test(m)) {
            return { error: "Ya hay una cuenta con ese mail. Ingresá con tu contraseña." };
          }
          if (/password/i.test(m) && /(6|characters|weak|short)/i.test(m)) {
            return { error: "La contraseña tiene que tener al menos 6 caracteres." };
          }
          if (/invalid.*email|email.*invalid/i.test(m)) return { error: "Ese mail no parece válido." };
          if (/signups? not allowed|disabled/i.test(m)) {
            return { error: "Falta activar el registro con mail en Supabase: Authentication → Sign In / Providers → Email." };
          }
          return { error: m || "No pudimos crear la cuenta. Probá de nuevo." };
        }
        // Supabase devuelve un usuario sin identidades cuando el mail ya existe
        // y está confirmado (no lo dice como error para no revelar mails).
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return { error: "Ya hay una cuenta con ese mail. Ingresá con tu contraseña." };
        }
        if (!data.session) return { error: null, confirmar: true };

        setSession(data.session);
        const uid = data.session.user.id;
        // Por si el trigger todavía no copia el celular (migración 23 sin correr).
        await supabase
          .from("perfiles")
          .update({ nombre: nombre.trim(), telefono } as never)
          .eq("id", uid);
        await cargarPerfil(uid);
        return { error: null };
      },

      refrescarPerfil: async () => {
        if (session?.user?.id) await cargarPerfil(session.user.id);
      },
      /**
       * Fuente única de verdad: acá se escribe la dirección y todas las
       * pantallas la leen de este perfil. Nada de copias locales que después
       * se desincronizan.
       */
      actualizarPerfil: async (campos) => {
        const uid = session?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("perfiles")
          .update(campos as never)
          .eq("id", uid)
          .select()
          .single();
        if (data) {
          setPerfil(data as unknown as Perfil);
          return;
        }

        // El update no encontró fila. El trigger `al_crear_usuario` debería
        // haberla creado al registrarse, así que llegar acá significa que algo
        // falló del lado de la base. Se intenta crearla en vez de devolver un
        // "guardado" mudo: el síntoma sería una persona escribiendo su
        // dirección tres veces sin entender por qué no se guarda.
        const { data: creado } = await supabase
          .from("perfiles")
          // OJO: acá NO va `rol`. Desde la migración 15 la app no tiene permiso
          // de escritura sobre esa columna —ni en update ni en insert— para que
          // nadie pueda darse de alta ya siendo repartidor. El valor lo pone el
          // default de la tabla, que es 'cliente', y la política lo vuelve a
          // exigir. Si alguien lo agrega acá, este insert empieza a fallar con
          // "permission denied".
          .insert({
            id: uid,
            nombre: (session?.user?.user_metadata?.full_name as string) ?? "",
            email: session?.user?.email ?? "",
            ...campos,
          } as never)
          .select()
          .single();
        if (creado) setPerfil(creado as unknown as Perfil);
      },
      cerrarSesion: async () => {
        await supabase.auth.signOut();
        setPerfil(null);
      },
    }),
    [session, perfil, cargando, perfilCargado, anonimo]
  );

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>;
}

export function useSesion() {
  const c = useContext(SesionCtx);
  if (!c) throw new Error("useSesion tiene que usarse dentro de <SesionProvider>");
  return c;
}
