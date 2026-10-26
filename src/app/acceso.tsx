/**
 * Ingreso al panel: locales y repartidores.
 *
 * Mismo diseño que `/cuenta` (la de los clientes): fondo oscuro, marca arriba,
 * un selector y los campos debajo. Acá el selector es **Local / Repartidor**.
 *
 * No hay "crear cuenta" a propósito. Un formulario puede verificar que un mail
 * existe, no que quien lo escribe sea el dueño de un local ni que vaya a tocar
 * el timbre de nadie. Las cuentas las da de alta el equipo de Pedilo; acá sólo
 * se entra.
 *
 * El selector no decide a dónde va cada uno (el rol ya está en el perfil y la
 * raíz manda a cada cual a su panel): cambia los textos y lo que se ofrece a
 * quien todavía no tiene cuenta: para un local, el formulario de alta
 * (`/sumate`); para un repartidor, el suyo (`/sumate-repartidor`).
 *
 * `?rol=repartidor` abre con Repartidor elegido (lo usa el panel del rider
 * cuando se queda sin sesión).
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Tocable, Txt } from "../componentes/base";
import { IconoMoto, IconoTienda, IconoVolver } from "../componentes/Iconos";
import { Marca } from "../componentes/Marca";
import { useSesion } from "../contextos/Sesion";
import { color, espacio, radio, texto } from "../theme/tokens";

type Rol = "local" | "repartidor";

const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const TEXTOS: Record<Rol, { mail: string }> = {
  local: { mail: "El mail de tu local" },
  repartidor: { mail: "Tu mail de repartidor" },
};

export default function Acceso() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rol?: string }>();
  const { iniciarSesion } = useSesion();

  const [rol, setRol] = useState<Rol>(params.rol === "repartidor" ? "repartidor" : "local");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mailOk = MAIL_OK.test(email.trim());
  const listo = mailOk && password.length > 0;
  const t = TEXTOS[rol];

  function cambiarRol(r: Rol) {
    setRol(r);
    setTocado(false);
    setError(null);
  }

  async function entrar() {
    setTocado(true);
    setError(null);
    if (!listo || entrando) return;
    setEntrando(true);
    const problema = await iniciarSesion(email, password);
    setEntrando(false);
    if (problema) {
      setError(problema);
      return;
    }
    // A dónde va después lo decide la raíz, que ya conoce el rol.
    router.replace("/");
  }

  return (
    <KeyboardAvoidingView style={e.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + espacio.md,
          paddingBottom: insets.bottom + espacio.xxxl,
          paddingHorizontal: espacio.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={e.centro}>
          <Tocable onPress={() => (router.canGoBack() ? router.back() : router.replace("/bienvenida"))} etiqueta="Volver">
            <View style={e.volver}>
              <IconoVolver size={24} color={color.white} />
            </View>
          </Tocable>

          <Marca compacto style={{ marginTop: espacio.sm }} />

          {/* ------------------------------ quién entra ------------------------------ */}
          <View style={e.selector}>
            {(["local", "repartidor"] as Rol[]).map((r) => {
              const activo = rol === r;
              const tinta = activo ? color.ink : "#A8A8A6";
              return (
                <Tocable key={r} onPress={() => cambiarRol(r)} style={{ flex: 1 }} etiqueta={r === "local" ? "Soy local" : "Soy repartidor"}>
                  <View style={[e.opcion, activo && e.opcionActiva]}>
                    {r === "local" ? <IconoTienda size={18} color={tinta} /> : <IconoMoto size={20} color={tinta} />}
                    <Txt v="label" style={{ color: tinta }}>
                      {r === "local" ? "Local" : "Repartidor"}
                    </Txt>
                  </View>
                </Tocable>
              );
            })}
          </View>

          <Txt v="cap" style={[e.rotulo, { marginTop: espacio.lg }]}>
            Mail
          </Txt>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            placeholder={t.mail}
            placeholderTextColor="#6E6E6C"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            style={[e.input, tocado && !mailOk && e.inputError]}
            accessibilityLabel="Mail"
          />
          {tocado && !mailOk && (
            <Txt v="cap" style={e.error}>
              Revisá el mail: parece que le falta algo.
            </Txt>
          )}

          <View style={e.filaRotulo}>
            <Txt v="cap" style={e.rotulo}>
              Contraseña
            </Txt>
            <Tocable onPress={() => setVerClave((v) => !v)} etiqueta={verClave ? "Ocultar contraseña" : "Ver contraseña"}>
              <Txt v="cap" style={{ color: color.brand }}>
                {verClave ? "Ocultar" : "Ver"}
              </Txt>
            </Tocable>
          </View>
          <TextInput
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            placeholder="La que te dio el equipo de Pedilo"
            placeholderTextColor="#6E6E6C"
            secureTextEntry={!verClave}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={entrar}
            returnKeyType="go"
            style={[e.input, tocado && !password && e.inputError]}
            accessibilityLabel="Contraseña"
          />
          {tocado && !password && (
            <Txt v="cap" style={e.error}>
              Escribí tu contraseña.
            </Txt>
          )}

          {!!error && (
            <View style={e.aviso}>
              <Txt v="cap" style={{ color: "#FF9B93" }}>
                {error}
              </Txt>
            </View>
          )}

          <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
            <Boton onPress={entrar} cargando={entrando} style={!listo && { opacity: 0.55 }}>
              Ingresar
            </Boton>
          </View>

          {/* ----------------------- todavía no tiene cuenta ----------------------- */}
          {rol === "local" ? (
            <Tocable onPress={() => router.push("/sumate")} suave etiqueta="Sumar mi local a Pedilo">
              <View style={e.sinCuenta}>
                <View style={e.iconoSinCuenta}>
                  <IconoTienda size={20} color={color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="label" style={{ color: color.white }}>
                    ¿Todavía no tenés cuenta?
                  </Txt>
                  <Txt v="cap" style={{ color: "#9A9A9A", marginTop: 2 }}>
                    Mandanos los datos de tu local y te damos de alta.
                  </Txt>
                </View>
                <Txt v="label" style={{ color: color.brand }}>
                  Sumar mi local
                </Txt>
              </View>
            </Tocable>
          ) : (
            <Tocable onPress={() => router.push("/sumate-repartidor")} suave etiqueta="Quiero ser repartidor">
              <View style={e.sinCuenta}>
                <View style={e.iconoSinCuenta}>
                  <IconoMoto size={22} color={color.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="label" style={{ color: color.white }}>
                    ¿Todavía no tenés cuenta?
                  </Txt>
                  <Txt v="cap" style={{ color: "#9A9A9A", marginTop: 2 }}>
                    Dejanos tus datos y te contactamos para que repartas con Pedilo.
                  </Txt>
                </View>
                <Txt v="label" style={{ color: color.brand }}>
                  Quiero repartir
                </Txt>
              </View>
            </Tocable>
          )}

          <Tocable onPress={() => router.replace("/bienvenida")}>
            <View style={{ paddingVertical: espacio.lg, alignItems: "center" }}>
              <Txt v="cap" style={e.ayuda}>
                ¿Querés pedir algo?{" "}
                <Txt v="cap" style={{ color: color.brand }}>
                  Entrá como cliente
                </Txt>
              </Txt>
            </View>
          </Tocable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ink },
  centro: { width: "100%", maxWidth: 420, alignSelf: "center" },
  volver: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  selector: {
    flexDirection: "row",
    backgroundColor: color.inkSoft,
    borderWidth: 1,
    borderColor: color.inkBorder,
    borderRadius: radio.pill,
    padding: 4,
    marginTop: espacio.xl,
  },
  opcion: {
    minHeight: 46,
    borderRadius: radio.pill,
    flexDirection: "row",
    gap: espacio.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  opcionActiva: { backgroundColor: color.brand },
  filaRotulo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: espacio.lg },
  rotulo: { color: "#A8A8A6", marginBottom: 6 },
  input: {
    ...texto.body,
    color: color.white,
    borderWidth: 1.5,
    borderColor: color.inkBorder,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.inkSoft,
  },
  inputError: { borderColor: color.danger },
  error: { color: "#FF9B93", marginTop: 6 },
  ayuda: { color: "#7C7C7A" },
  aviso: { backgroundColor: "#3A1714", borderRadius: radio.sm, padding: espacio.md, marginTop: espacio.lg },
  sinCuenta: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    marginTop: espacio.xl,
    padding: espacio.md,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: color.inkBorder,
    backgroundColor: color.inkSoft,
  },
  iconoSinCuenta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1F2A12",
    alignItems: "center",
    justifyContent: "center",
  },
});
