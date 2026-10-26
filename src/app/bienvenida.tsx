/**
 * La primera pantalla: la puerta.
 *
 * Para usar Pedilo hace falta una cuenta, y ésta es la única pantalla que la
 * ofrece. Hay dos formas de crearla:
 *
 *  - **Google**: un toque. Es la principal y por eso va en el botón blanco.
 *  - **Mail y contraseña** (`/cuenta`): para quien no usa Google o no quiere
 *    vincularlo. Ahí se piden nombre, mail, celular y contraseña.
 *
 * Con Google, el celular se pide en el paso siguiente (`primer-paso.tsx`)
 * junto con la dirección: es obligatorio para todos.
 *
 * Ya no hay "Continuar sin sesión". Mirar sin cuenta dejaba gente armando
 * carritos que después no podía confirmar, y pedidos que nadie podía reclamar.
 *
 * LA VUELTA DE GOOGLE
 *
 * En web, Google devuelve a esta misma URL. Por eso el efecto de abajo: apenas
 * aparece una sesión de verdad, esta pantalla se saca del camino y manda a la
 * raíz, que sabe si falta cargar el celular y la dirección.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tocable, Txt } from "../componentes/base";
import { Marca } from "../componentes/Marca";
import { useSesion } from "../contextos/Sesion";
import { color, espacio, radio, TAP_MIN } from "../theme/tokens";

export default function Bienvenida() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, esAnonimo, entrarConGoogle } = useSesion();

  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Volvió de Google con sesión de verdad: esta pantalla ya no pinta nada.
  useEffect(() => {
    if (session && !esAnonimo) router.replace("/");
  }, [session, esAnonimo]);

  async function conGoogle() {
    setEntrando(true);
    setError(null);
    const problema = await entrarConGoogle();
    // En web esto redirige y nunca llegamos acá. En nativo sí: la raíz decide
    // a dónde va según si ya tiene dirección cargada.
    if (problema) {
      setError(problema);
      setEntrando(false);
      return;
    }
    setEntrando(false);
    router.replace("/");
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.ink }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + espacio.xxl,
          paddingBottom: insets.bottom + espacio.xl,
          paddingHorizontal: espacio.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={b.centro}>
          {/*
            Todo el bloque —marca, título y botones— va junto y centrado. Antes
            la marca flotaba arriba y el botón quedaba abajo de todo, con medio
            teléfono de negro en el medio: se leía como una pantalla que todavía
            está cargando algo.
          */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Marca />

            <Txt v="title" style={b.titulo}>
              ¡Bienvenido!
            </Txt>
            <Txt v="body" style={b.bajada}>
              Creá tu cuenta para empezar a pedir en tus locales favoritos.
            </Txt>

          {/*
            El botón de Google se arma a mano en vez de usar <Boton> porque
            necesita un ícono al lado del texto, y en React Native meter una
            <View> adentro de un <Text> funciona a medias en web.

            El círculo con la "G" es un marcador de posición. Google pide que
            se use SU archivo oficial para el botón de "Sign in with Google";
            cuando lo bajemos, se reemplaza este <View> por la imagen y no se
            toca nada más.
          */}
          <Tocable onPress={conGoogle} style={b.google} suave>
            {entrando ? (
              <ActivityIndicator color={color.ink} />
            ) : (
              <>
                <View style={b.g}>
                  <Txt v="label" style={{ color: "#4285F4", fontSize: 15 }}>
                    G
                  </Txt>
                </View>
                <Txt v="label" style={{ color: color.n900, fontSize: 15 }}>
                  Continuar con Google
                </Txt>
              </>
            )}
          </Tocable>

          {!!error && (
            <View style={b.error}>
              <Txt v="cap" style={{ color: "#FF9B93" }}>
                {error}
              </Txt>
            </View>
          )}

          <Tocable onPress={() => router.push("/cuenta")} style={b.conMail} suave etiqueta="Crear cuenta con mail">
            <Txt v="label" style={{ color: color.white, fontSize: 15 }}>
              Crear cuenta con mail
            </Txt>
          </Tocable>

          <View style={b.yaTengo}>
            <Txt v="cap" style={{ color: "#8A8A88" }}>
              ¿Ya tenés cuenta?{" "}
            </Txt>
            <Tocable onPress={() => router.push({ pathname: "/cuenta", params: { modo: "ingresar" } })}>
              <Txt v="label" style={{ color: color.brand }}>
                Ingresá
              </Txt>
            </Tocable>
          </View>

          </View>

          {/* ---------------------- locales y repartidores ------------------- */}
          <View style={b.linea} />

          <View style={b.pie}>
            <Txt v="cap" style={{ color: "#8A8A88" }}>
              ¿Tenés un local o sos repartidor?{" "}
            </Txt>
            <Tocable onPress={() => router.push("/acceso")}>
              <Txt v="label" style={{ color: color.brand }}>
                Ingresá al panel
              </Txt>
            </Tocable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const b = StyleSheet.create({
  /** La app es mobile, pero en una notebook una columna de 1400px es ilegible. */
  centro: { flex: 1, width: "100%", maxWidth: 420, alignSelf: "center" },
  titulo: { color: color.white, textAlign: "center", marginTop: espacio.xxl },
  bajada: {
    color: "#A8A8A6",
    textAlign: "center",
    marginTop: espacio.sm,
    paddingHorizontal: espacio.lg,
    marginBottom: espacio.xxxl,
  },
  google: {
    minHeight: 54,
    borderRadius: radio.pill,
    backgroundColor: color.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espacio.md,
    paddingHorizontal: espacio.lg,
  },
  g: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: color.n200,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    backgroundColor: "#3A1714",
    borderRadius: radio.sm,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  conMail: {
    minHeight: 54,
    borderRadius: radio.pill,
    borderWidth: 1.5,
    borderColor: "#3A3A38",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espacio.lg,
    marginTop: espacio.md,
  },
  yaTengo: {
    minHeight: TAP_MIN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacio.sm,
  },
  linea: { height: 1, backgroundColor: color.inkBorder, marginVertical: espacio.xl },
  pie: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap" },
});
