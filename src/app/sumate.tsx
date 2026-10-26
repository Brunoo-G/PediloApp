/**
 * "Sumá tu local": el formulario para que un negocio nos pida el alta.
 *
 * Los locales no se registran solos (verificar que alguien es dueño de un
 * negocio no lo hace un formulario). Esto manda los datos a la tabla
 * `solicitudes_comercio`, que ya existe con inserción abierta, y el equipo de
 * Pedilo la evalúa, contacta y crea la cuenta. Son los mismos campos que
 * definimos para esa tabla: nombre del local, rubro, quién contacta, mail,
 * celular y una descripción.
 *
 * Se llega desde el perfil del cliente ("Registrar mi negocio") y desde el
 * acceso de locales y repartidores ("¿Todavía no tenés cuenta?").
 */
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Chip, Tocable, Txt } from "../componentes/base";
import { IconoVolver } from "../componentes/Iconos";
import { Palabra } from "../componentes/Marca";
import { supabase } from "../lib/supabase";
import { leerCelular } from "../lib/telefono";
import { CATEGORIAS, color, espacio, radio, sombras, texto } from "../theme/tokens";

const RUBROS = [...CATEGORIAS.filter((c) => c !== "Todos"), "Otro"];
const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Sumate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [local, setLocal] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [contacto, setContacto] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const cel = leerCelular(celular);
  const faltas = {
    local: local.trim().length < 2,
    rubro: !rubro,
    contacto: contacto.trim().length < 2,
    email: !MAIL_OK.test(email.trim()),
    celular: !cel.ok,
    descripcion: descripcion.trim().length < 10,
  };
  const listo = !Object.values(faltas).some(Boolean);

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function enviar() {
    setTocado(true);
    setError(null);
    if (!listo || enviando) return;
    setEnviando(true);
    const { error: e } = await supabase.from("solicitudes_comercio" as never).insert({
      nombre_local: local.trim(),
      rubro: rubro!,
      contacto: contacto.trim(),
      email: email.trim().toLowerCase(),
      telefono: cel.ok ? cel.valor : "",
      descripcion: descripcion.trim(),
    } as never);
    setEnviando(false);
    if (e) {
      setError("No pudimos mandar la solicitud. Revisá la conexión y probá de nuevo.");
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <View style={[s.pantalla, { paddingTop: insets.top + espacio.xxl, paddingHorizontal: espacio.lg }]}>
        <View style={s.centro}>
          <Palabra alto={34} />
          <Txt v="title" style={{ color: color.white, marginTop: espacio.xl }}>
            ¡Listo, {contacto.trim().split(" ")[0]}!
          </Txt>
          <Txt v="body" style={{ color: "#A8A8A6", marginTop: espacio.sm }}>
            Recibimos los datos de {local.trim()}. Los revisamos y te escribimos a {email.trim().toLowerCase()} o
            por WhatsApp en los próximos días para darte de alta.
          </Txt>
          <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
            <Boton onPress={volver}>Volver</Boton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + espacio.md,
          paddingBottom: insets.bottom + espacio.xxxl,
          paddingHorizontal: espacio.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.centro}>
          <Tocable onPress={volver} etiqueta="Volver">
            <View style={s.volver}>
              <IconoVolver size={24} color={color.white} />
            </View>
          </Tocable>

          <Txt v="title" style={{ color: color.white, marginTop: espacio.sm }}>
            Sumá tu local a Pedilo
          </Txt>
          <Txt v="body" style={{ color: "#A8A8A6", marginTop: espacio.sm, marginBottom: espacio.xl }}>
            Contanos de tu negocio. Lo evaluamos y, si está todo bien, te creamos la cuenta para que cargues tu
            catálogo y empieces a recibir pedidos.
          </Txt>

          <View style={s.tarjeta}>
            <Campo rotulo="Nombre del local" valor={local} onCambio={setLocal} placeholder="Ej: Pizzería Don Luis" error={tocado && faltas.local ? "Escribí el nombre del local." : null} />

            <Txt v="cap" style={[s.rotulo, { marginTop: espacio.lg }]}>
              Rubro
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espacio.sm }}>
              {RUBROS.map((r) => (
                <Chip key={r} activo={rubro === r} onPress={() => setRubro(r)}>
                  {r}
                </Chip>
              ))}
            </View>
            {tocado && faltas.rubro && (
              <Txt v="cap" style={s.error}>
                Elegí un rubro.
              </Txt>
            )}

            <Campo rotulo="Tu nombre" valor={contacto} onCambio={setContacto} placeholder="Nombre y apellido" error={tocado && faltas.contacto ? "Escribí tu nombre." : null} autoCapitalize="words" />
            <Campo rotulo="Mail" valor={email} onCambio={setEmail} placeholder="tumail@ejemplo.com" error={tocado && faltas.email ? "Revisá el mail: parece que le falta algo." : null} teclado="email-address" autoCapitalize="none" />
            <Campo rotulo="Celular" valor={celular} onCambio={setCelular} placeholder="11 2345 6789" error={tocado && faltas.celular ? cel.ok ? null : cel.mensaje : null} teclado="phone-pad" />
            <Campo
              rotulo="Contanos de tu local"
              valor={descripcion}
              onCambio={setDescripcion}
              placeholder="Dirección, horarios, qué vendés, si ya hacés delivery…"
              error={tocado && faltas.descripcion ? "Contanos un poco más (dirección y qué vendés)." : null}
              multilinea
            />

            {!!error && (
              <View style={s.aviso}>
                <Txt v="cap" style={{ color: color.danger }}>
                  {error}
                </Txt>
              </View>
            )}

            <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
              <Boton onPress={enviar} cargando={enviando} style={!listo && { opacity: 0.55 }}>
                Mandar solicitud
              </Boton>
            </View>
          </View>

          <Tocable onPress={() => router.push("/acceso")}>
            <View style={{ paddingVertical: espacio.lg, alignItems: "center" }}>
              <Txt v="cap" style={{ color: "#9A9A9A" }}>
                ¿Ya tenés cuenta de local o repartidor?{" "}
                <Txt v="cap" style={{ color: color.brand }}>
                  Ingresá al panel
                </Txt>
              </Txt>
            </View>
          </Tocable>
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
  teclado,
  autoCapitalize = "sentences",
  multilinea,
}: {
  rotulo: string;
  valor: string;
  onCambio: (t: string) => void;
  placeholder: string;
  error: string | null;
  teclado?: "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words";
  multilinea?: boolean;
}) {
  return (
    <View>
      <Txt v="cap" style={[s.rotulo, { marginTop: espacio.lg }]}>
        {rotulo}
      </Txt>
      <TextInput
        value={valor}
        onChangeText={onCambio}
        placeholder={placeholder}
        placeholderTextColor={color.n400}
        keyboardType={teclado}
        autoCapitalize={autoCapitalize}
        autoCorrect={!teclado}
        multiline={multilinea}
        style={[s.input, multilinea && { minHeight: 96, textAlignVertical: "top" }, !!error && { borderColor: color.danger }]}
        accessibilityLabel={rotulo}
      />
      {!!error && (
        <Txt v="cap" style={s.error}>
          {error}
        </Txt>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.ink },
  centro: { width: "100%", maxWidth: 460, alignSelf: "center" },
  volver: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  tarjeta: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, paddingTop: espacio.sm, ...sombras.md },
  rotulo: { marginBottom: 6 },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  error: { color: color.danger, marginTop: 6 },
  aviso: { backgroundColor: color.dangerWash, padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.lg },
});
