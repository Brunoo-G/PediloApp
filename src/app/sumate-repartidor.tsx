/**
 * "Sumate como repartidor": el formulario para quien quiere repartir con Pedilo.
 *
 * Es el gemelo de `/sumate` (el de los locales). Las cuentas de repartidor no
 * se crean solas: esto manda los datos a `solicitudes_repartidor`
 * (migración 24, sólo inserción) y el equipo los evalúa, contacta y da de alta.
 *
 * Se pide lo justo para decidir y contactar: nombre, mail, celular, zona,
 * con qué reparte y cuándo puede. No se piden DNI ni datos bancarios: eso va
 * después, por fuera de un formulario abierto.
 *
 * Se llega desde el ingreso al panel con "Repartidor" elegido.
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
import { color, espacio, radio, sombras, texto } from "../theme/tokens";

const VEHICULOS = ["Moto", "Bici", "Auto", "A pie"];
const FRANJAS = ["Mañanas", "Tardes", "Noches", "Fines de semana"];
const MAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SumateRepartidor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [nombre, setNombre] = useState("");
  const [vehiculo, setVehiculo] = useState<string | null>(null);
  const [zona, setZona] = useState("");
  const [franjas, setFranjas] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [comentario, setComentario] = useState("");
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const cel = leerCelular(celular);
  const faltas = {
    nombre: nombre.trim().length < 2,
    email: !MAIL_OK.test(email.trim()),
    celular: !cel.ok,
    zona: zona.trim().length < 2,
    vehiculo: !vehiculo,
    franjas: franjas.length === 0,
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
    const { error: e } = await supabase.from("solicitudes_repartidor" as never).insert({
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      telefono: cel.ok ? cel.valor : "",
      zona: zona.trim(),
      vehiculo: vehiculo!,
      disponibilidad: franjas,
      comentario: comentario.trim().slice(0, 600),
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
            ¡Listo, {nombre.trim().split(" ")[0]}!
          </Txt>
          <Txt v="body" style={{ color: "#A8A8A6", marginTop: espacio.sm }}>
            Recibimos tus datos. Los revisamos y te escribimos a {email.trim().toLowerCase()} o por WhatsApp en
            los próximos días.
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
            Repartí con Pedilo
          </Txt>
          <Txt v="body" style={{ color: "#A8A8A6", marginTop: espacio.sm, marginBottom: espacio.xl }}>
            Dejanos tus datos. Los evaluamos y, si está todo bien, te contactamos para crearte la cuenta y empezar a
            repartir.
          </Txt>

          <View style={s.tarjeta}>
            <Campo rotulo="Nombre y apellido" valor={nombre} onCambio={setNombre} placeholder="Como figura en tu DNI" error={tocado && faltas.nombre ? "Escribí tu nombre." : null} autoCapitalize="words" />
            <Campo rotulo="Mail" valor={email} onCambio={setEmail} placeholder="tumail@ejemplo.com" error={tocado && faltas.email ? "Revisá el mail: parece que le falta algo." : null} teclado="email-address" autoCapitalize="none" />
            <Campo rotulo="Celular" valor={celular} onCambio={setCelular} placeholder="11 2345 6789" error={tocado && faltas.celular ? cel.ok ? null : cel.mensaje : null} teclado="phone-pad" />
            <Campo rotulo="Zona donde querés repartir" valor={zona} onCambio={setZona} placeholder="Ej: Palermo, Belgrano, Colegiales" error={tocado && faltas.zona ? "Contanos en qué zona." : null} />

            <Txt v="cap" style={[s.rotulo, { marginTop: espacio.lg }]}>
              ¿Con qué repartís?
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espacio.sm }}>
              {VEHICULOS.map((v) => (
                <Chip key={v} activo={vehiculo === v} onPress={() => setVehiculo(v)}>
                  {v}
                </Chip>
              ))}
            </View>
            {tocado && faltas.vehiculo && (
              <Txt v="cap" style={s.error}>
                Elegí con qué repartís.
              </Txt>
            )}

            <Txt v="cap" style={[s.rotulo, { marginTop: espacio.lg }]}>
              ¿Cuándo podés? Elegí todas las que quieras
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espacio.sm }}>
              {FRANJAS.map((f) => (
                <Chip
                  key={f}
                  activo={franjas.includes(f)}
                  onPress={() => setFranjas((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f]))}
                >
                  {f}
                </Chip>
              ))}
            </View>
            {tocado && faltas.franjas && (
              <Txt v="cap" style={s.error}>
                Elegí al menos una.
              </Txt>
            )}

            <Campo
              rotulo="¿Algo más que quieras contarnos? (opcional)"
              valor={comentario}
              onCambio={setComentario}
              placeholder="Si ya repartiste antes, en qué app, si tenés caja térmica…"
              error={null}
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

          <Tocable onPress={() => router.push("/acceso?rol=repartidor")}>
            <View style={{ paddingVertical: espacio.lg, alignItems: "center" }}>
              <Txt v="cap" style={{ color: "#9A9A9A" }}>
                ¿Ya tenés cuenta de repartidor?{" "}
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
