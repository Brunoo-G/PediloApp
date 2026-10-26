/**
 * Crear cuenta o ingresar con mail y contraseña (clientes).
 *
 * Es la alternativa a Google de la bienvenida. Dos modos en la misma pantalla,
 * con un selector arriba, porque son las dos caras de la misma puerta y quien
 * se equivoca de modo tiene que poder cambiar sin volver atrás:
 *
 *  - **Crear cuenta**: nombre, mail, celular y contraseña. El celular es
 *    obligatorio (ver `lib/telefono`).
 *  - **Ingresar**: mail y contraseña.
 *
 * Al terminar se manda a la raíz, que decide: si falta la dirección, va al
 * primer paso; si no, al marketplace.
 *
 * Si Supabase tiene activada la confirmación de mail, crear la cuenta no deja
 * adentro: se muestra "revisá tu mail" y, ya confirmado, se ingresa desde acá.
 *
 * Los locales y repartidores NO entran por acá: sus cuentas las crea Pedilo y
 * entran por `/acceso`.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Tocable, Txt } from "../componentes/base";
import { IconoVolver } from "../componentes/Iconos";
import { Marca } from "../componentes/Marca";
import { useSesion } from "../contextos/Sesion";
import { leerCelular } from "../lib/telefono";
import { color, espacio, radio, texto } from "../theme/tokens";

type Modo = "crear" | "ingresar";

const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Cuenta() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ modo?: string }>();
  const { session, esAnonimo, registrarse, iniciarSesion } = useSesion();

  const [modo, setModo] = useState<Modo>(params.modo === "ingresar" ? "ingresar" : "crear");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El mail al que se mandó la confirmación, si Supabase la pide. */
  const [confirmar, setConfirmar] = useState<string | null>(null);

  // Ya tiene sesión (volvió de confirmar el mail en otra pestaña, por ejemplo).
  useEffect(() => {
    if (session && !esAnonimo) router.replace("/");
  }, [session, esAnonimo]);

  const crear = modo === "crear";
  const nombreOk = nombre.trim().length >= 2;
  const mailOk = MAIL_OK.test(email.trim());
  const cel = leerCelular(celular);
  const passOk = password.length >= 6;
  const listo = crear ? nombreOk && mailOk && cel.ok && passOk : mailOk && password.length > 0;

  function cambiarModo(m: Modo) {
    setModo(m);
    setTocado(false);
    setError(null);
  }

  async function enviar() {
    setTocado(true);
    setError(null);
    if (!listo || enviando) return;
    setEnviando(true);

    if (crear) {
      const r = await registrarse({
        nombre,
        email,
        password,
        telefono: cel.ok ? cel.valor : "",
      });
      setEnviando(false);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.confirmar) {
        setConfirmar(email.trim().toLowerCase());
        return;
      }
      router.replace("/");
      return;
    }

    const problema = await iniciarSesion(email, password);
    setEnviando(false);
    if (problema) {
      setError(
        /no confirm/i.test(problema) ? "Todavía no confirmaste tu mail. Buscá el link que te mandamos." : problema
      );
      return;
    }
    router.replace("/");
  }

  /* ------------------------- confirmación de mail ------------------------- */
  if (confirmar) {
    return (
      <View style={[e.pantalla, { paddingTop: insets.top + espacio.xxl }]}>
        <View style={e.centro}>
          <Marca compacto />
          <Txt v="title" style={e.titulo}>
            Revisá tu mail
          </Txt>
          <Txt v="body" style={e.bajada}>
            Te mandamos un link a {confirmar}. Tocalo para confirmar tu cuenta y después ingresá con tu
            contraseña.
          </Txt>
          <View style={{ flexDirection: "row" }}>
            <Boton
              onPress={() => {
                setConfirmar(null);
                setPassword("");
                cambiarModo("ingresar");
              }}
            >
              Ya lo confirmé, ingresar
            </Boton>
          </View>
          <Txt v="cap" style={[e.ayuda, { textAlign: "center", marginTop: espacio.lg }]}>
            ¿No llegó? Fijate en spam o promociones.
          </Txt>
        </View>
      </View>
    );
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

          {/* ------------------------------ modo ------------------------------ */}
          <View style={e.selector}>
            {(["crear", "ingresar"] as Modo[]).map((m) => (
              <Tocable key={m} onPress={() => cambiarModo(m)} style={{ flex: 1 }} etiqueta={m === "crear" ? "Crear cuenta" : "Ingresar"}>
                <View style={[e.opcion, modo === m && e.opcionActiva]}>
                  <Txt v="label" style={{ color: modo === m ? color.ink : "#A8A8A6" }}>
                    {m === "crear" ? "Crear cuenta" : "Ingresar"}
                  </Txt>
                </View>
              </Tocable>
            ))}
          </View>

          {crear && (
            <Campo
              rotulo="Nombre y apellido"
              valor={nombre}
              onCambio={setNombre}
              placeholder="Como querés que te llamen"
              error={tocado && !nombreOk ? "Escribí tu nombre." : null}
              autoCapitalize="words"
            />
          )}

          <Campo
            rotulo="Mail"
            valor={email}
            onCambio={setEmail}
            placeholder="tumail@ejemplo.com"
            error={tocado && !mailOk ? "Revisá el mail: parece que le falta algo." : null}
            teclado="email-address"
            autoCapitalize="none"
          />

          {crear && (
            <Campo
              rotulo="Celular"
              valor={celular}
              onCambio={setCelular}
              placeholder="11 2345 6789"
              error={tocado && !cel.ok ? cel.mensaje : null}
              ayuda="Con código de área. Lo usamos sólo si hay un problema con tu pedido; no se lo mostramos a nadie."
              teclado="phone-pad"
            />
          )}

          <View style={e.filaRotulo}>
            <Txt v="cap" style={e.rotulo}>
              Contraseña
            </Txt>
            <Tocable onPress={() => setVerPassword((v) => !v)} etiqueta={verPassword ? "Ocultar contraseña" : "Ver contraseña"}>
              <Txt v="cap" style={{ color: color.brand }}>
                {verPassword ? "Ocultar" : "Ver"}
              </Txt>
            </Tocable>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={crear ? "Al menos 6 caracteres" : "Tu contraseña"}
            placeholderTextColor="#6E6E6C"
            secureTextEntry={!verPassword}
            autoCapitalize="none"
            autoCorrect={false}
            style={[e.input, tocado && (crear ? !passOk : !password) && e.inputError]}
            accessibilityLabel="Contraseña"
            onSubmitEditing={enviar}
          />
          {tocado && crear && !passOk && (
            <Txt v="cap" style={e.error}>
              La contraseña tiene que tener al menos 6 caracteres.
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
            <Boton onPress={enviar} cargando={enviando} style={!listo && { opacity: 0.55 }}>
              {crear ? "Crear cuenta" : "Ingresar"}
            </Boton>
          </View>

          <Txt v="cap" style={[e.ayuda, { textAlign: "center", marginTop: espacio.lg }]}>
            {crear
              ? "Después te pedimos a dónde te llevamos los pedidos."
              : "¿Te registraste con Google? Volvé y tocá \"Continuar con Google\"."}
          </Txt>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Campo({
  rotulo,
  valor,
  onCambio,
  placeholder,
  error,
  ayuda,
  teclado,
  autoCapitalize = "sentences",
}: {
  rotulo: string;
  valor: string;
  onCambio: (t: string) => void;
  placeholder: string;
  error: string | null;
  ayuda?: string;
  teclado?: "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <View>
      <Txt v="cap" style={[e.rotulo, { marginTop: espacio.lg }]}>
        {rotulo}
      </Txt>
      <TextInput
        value={valor}
        onChangeText={onCambio}
        placeholder={placeholder}
        placeholderTextColor="#6E6E6C"
        keyboardType={teclado}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[e.input, !!error && e.inputError]}
        accessibilityLabel={rotulo}
      />
      {error ? (
        <Txt v="cap" style={e.error}>
          {error}
        </Txt>
      ) : ayuda ? (
        <Txt v="cap" style={[e.ayuda, { marginTop: 6 }]}>
          {ayuda}
        </Txt>
      ) : null}
    </View>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ink },
  centro: { width: "100%", maxWidth: 420, alignSelf: "center" },
  volver: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  titulo: { color: color.white, textAlign: "center", marginTop: espacio.xl },
  bajada: { color: "#A8A8A6", textAlign: "center", marginTop: espacio.sm, marginBottom: espacio.xl },
  selector: {
    flexDirection: "row",
    backgroundColor: color.inkSoft,
    borderWidth: 1,
    borderColor: color.inkBorder,
    borderRadius: radio.pill,
    padding: 4,
    marginTop: espacio.xl,
  },
  opcion: { minHeight: 42, borderRadius: radio.pill, alignItems: "center", justifyContent: "center" },
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
});
