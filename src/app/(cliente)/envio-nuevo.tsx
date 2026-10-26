/**
 * Pedir un envío.
 *
 * Tres datos y nada más: de dónde se retira, a dónde va, y quién lo recibe. El resto
 * —precio, estado, quién lo lleva— lo resuelve el sistema.
 *
 * EL MAPA SE ABRE DESDE LA DIRECCIÓN
 *
 * Las dos direcciones van juntas en una tarjeta de "recorrido" (retiro arriba,
 * entrega abajo, unidas por una línea, como se dibuja un viaje). Cada una
 * tiene a la derecha un botón con un pin que abre el mapa en una hoja de abajo
 * para marcar ESE punto. Antes había un mapa grande fijo en el medio del
 * formulario, con un selector retiro/entrega: ocupaba media pantalla aunque no
 * se usara y había que acordarse qué punto se estaba marcando. Ahora el mapa
 * aparece sólo cuando se lo pide, y ya sabe qué punto es. El pin marcado se
 * ve: el botón pasa a verde con una tilde.
 *
 * LOS PINES SON OPCIONALES, LAS DIRECCIONES NO
 *
 * El texto es lo que el repartidor lee y sin eso no hay envío. El pin ayuda a
 * llegar, y se pide, pero no se exige: alguien que manda algo a una dirección
 * que conoce de memoria no tiene por qué pelearse con un mapa, y si el mapa no
 * carga (pasa) el envío igual tiene que poder salir.
 *
 * QUIÉN RECIBE, NO QUÉ SE MANDA
 *
 * Antes se pedía "qué mandás" y eso arrancaba el chat. Se cambió (migración
 * 19): lo que el repartidor necesita en la puerta es a quién dárselo. El
 * nombre queda en el detalle del envío y NO va al chat — el chat arranca vacío
 * y se usa si hace falta.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Dialogo, Tocable, Txt } from "../../componentes/base";
import { ParadasEnvio, TONO_ENVIO } from "../../componentes/Envio";
import { Propinas } from "../../componentes/Propinas";
import { IconoPago, IconoPin, IconoTilde, IconoVolver } from "../../componentes/Iconos";
import { MapaPin } from "../../componentes/MapaPin";
import { useConfiguracion } from "../../contextos/Configuracion";
import { useSesion } from "../../contextos/Sesion";
import { crearEnvio } from "../../lib/envios";
import { puntoValido, type Punto } from "../../lib/geo";
import { formatPrecio } from "../../lib/precios";
import {
  color,
  espacio,
  METODOS_PAGO,
  radio,
  sombras,
  texto,
} from "../../theme/tokens";

const CENTRO_POR_DEFECTO: Punto = { lat: -34.6037, lng: -58.3816 };

export default function EnvioNuevo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { perfil, session, esAnonimo, entrarConGoogle } = useSesion();
  const { envioBase, tarifaServicio } = useConfiguracion();
  /*
    En un envío la tarifa es sólo el fijo: el porcentaje se calcula sobre el
    subtotal de los productos y acá no hay productos. Es la misma cuenta que
    hace `crear_envio` en la base; esto sólo la muestra antes.
  */
  const tarifa = tarifaServicio.monto;

  const [retiro, setRetiro] = useState("");
  const [entrega, setEntrega] = useState("");
  const [pinRetiro, setPinRetiro] = useState<Punto | null>(null);
  const [pinEntrega, setPinEntrega] = useState<Punto | null>(null);
  /** Qué punto se está marcando en la hoja del mapa (null = cerrada). */
  const [marcando, setMarcando] = useState<"retiro" | "entrega" | null>(null);
  const [centro, setCentro] = useState<Punto>(CENTRO_POR_DEFECTO);
  const [mapaFallo, setMapaFallo] = useState(false);

  function abrirMapa(cual: "retiro" | "entrega") {
    const pin = cual === "retiro" ? pinRetiro : pinEntrega;
    const otro = cual === "retiro" ? pinEntrega : pinRetiro;
    // Arranca donde ya estaba ese pin; si no, cerca del otro punto (casi
    // siempre es el mismo barrio); si no, en el centro.
    setCentro(pin ?? otro ?? centro);
    setMapaFallo(false);
    setMarcando(cual);
  }

  const [recibe, setRecibe] = useState("");
  const [metodo, setMetodo] = useState<string>("efectivo");
  const [propina, setPropina] = useState(0);

  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * La entrega arranca en la dirección de la persona, que es a donde va la
   * mayoría de las cosas que uno se manda a sí mismo. Su pin viene con ella: ya
   * lo cargó una vez y no tiene por qué volver a marcarlo.
   */
  useEffect(() => {
    if (!perfil) return;
    if (!entrega.trim()) setEntrega(perfil.direccion ?? "");
    const p = puntoValido(perfil.lat, perfil.lng);
    if (p && !pinEntrega) {
      setPinEntrega(p);
      setCentro(p);
    }
  }, [perfil?.id]);

  const sinCuenta = !session || esAnonimo;
  const propinaFinal = propina;

  const retiroOk = retiro.trim().length >= 5;
  const entregaOk = entrega.trim().length >= 5;
  const distintas = retiro.trim().toLowerCase() !== entrega.trim().toLowerCase();
  const recibeOk = recibe.trim().length >= 2;
  const listo = retiroOk && entregaOk && distintas && recibeOk;

  const total = envioBase + tarifa + propinaFinal;

  async function pedir() {
    setTocado(true);
    if (!listo || enviando) return;
    if (sinCuenta) return;

    setEnviando(true);
    setError(null);
    const r = await crearEnvio({
      retiroDireccion: retiro,
      retiroLat: pinRetiro?.lat ?? null,
      retiroLng: pinRetiro?.lng ?? null,
      direccion: entrega,
      lat: pinEntrega?.lat ?? null,
      lng: pinEntrega?.lng ?? null,
      recibe,
      metodoPago: metodo,
      efectivoCon: null,
      propina: propinaFinal,
    });
    setEnviando(false);

    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.replace("/(cliente)/envios");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.n50 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(cliente)/envios"))}
          etiqueta="Volver"
        >
          <View style={e.volver}>
            <IconoVolver size={20} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }}>
            Pedir un envío
          </Txt>
          <Txt v="cap" style={{ color: "#C7C7C3" }}>
            Un repartidor lo retira y lo lleva
          </Txt>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------ recorrido ------------------------ */}
        <Txt v="head" style={{ marginBottom: espacio.md }}>
          Recorrido
        </Txt>
        <View style={e.recorrido}>
          <Parada
            rotulo="Se retira en"
            valor={retiro}
            onCambio={setRetiro}
            pin={!!pinRetiro}
            onMapa={() => abrirMapa("retiro")}
            error={tocado && !retiroOk}
            punto={<View style={e.puntoHueco} />}
          />
          <View style={e.uniones}>
            <View style={e.union} />
            <View style={e.divisor} />
          </View>
          <Parada
            rotulo="Se entrega en"
            valor={entrega}
            onCambio={setEntrega}
            pin={!!pinEntrega}
            onMapa={() => abrirMapa("entrega")}
            error={tocado && (!entregaOk || !distintas)}
            punto={<View style={e.puntoLleno} />}
          />
        </View>
        {tocado && !retiroOk ? (
          <Txt v="cap" style={e.error}>
            Escribí de dónde se retira. Es la dirección que el repartidor no conoce.
          </Txt>
        ) : tocado && !entregaOk ? (
          <Txt v="cap" style={e.error}>
            Escribí a dónde va.
          </Txt>
        ) : tocado && !distintas ? (
          <Txt v="cap" style={e.error}>
            El retiro y la entrega son la misma dirección.
          </Txt>
        ) : (
          <Txt v="cap" style={{ marginTop: 6 }}>
            Con el pin marcás el punto exacto en el mapa. Es opcional, pero ayuda al repartidor a llegar.
          </Txt>
        )}

        {/* ----------------------------- quién recibe -------------------- */}
        <Txt v="cap" style={{ marginTop: espacio.xl, marginBottom: 6 }}>
          Quién lo recibe
        </Txt>
        <TextInput
          value={recibe}
          onChangeText={(t) => setRecibe(t.slice(0, 80))}
          placeholder="Nombre y apellido"
          placeholderTextColor={color.n400}
          autoCapitalize="words"
          style={[e.input, tocado && !recibeOk && { borderColor: color.danger }]}
          accessibilityLabel="Nombre de quien recibe"
        />
        {tocado && !recibeOk ? (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            Escribí el nombre de quien lo recibe.
          </Txt>
        ) : (
          <Txt v="cap" style={{ marginTop: 6 }}>
            El repartidor lo va a ver en el detalle del envío para saber a quién dárselo.
          </Txt>
        )}

        {/* ------------------------------- pago --------------------------- */}
        <Txt v="head" style={{ marginTop: espacio.xl, marginBottom: espacio.md }}>
          Cómo pagás
        </Txt>
        <View style={{ gap: espacio.sm }}>
          {METODOS_PAGO.map((m) => (
            <Tocable key={m.id} onPress={() => setMetodo(m.id)} suave>
              <View style={[e.metodo, metodo === m.id && e.metodoActivo]}>
                <View style={e.iconoMetodo}>
                  <IconoPago metodo={m.id} size={20} color={metodo === m.id ? color.brandInk : color.n600} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt v="label">{m.label}</Txt>
                  <Txt v="cap">{m.desc}</Txt>
                </View>
                {metodo === m.id && (
                  <Txt v="label" style={{ color: color.brandInk }}>
                    ✓
                  </Txt>
                )}
              </View>
            </Tocable>
          ))}
        </View>

        {/* ------------------------------ propina ------------------------- */}
        <Txt v="head" style={{ marginTop: espacio.xl, marginBottom: 4 }}>
          Propina
        </Txt>
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Va entera para el repartidor.
        </Txt>
        <Propinas valor={propina} onCambiar={setPropina} />

        {/* ------------------------------ resumen ------------------------- */}
        <View style={e.resumen}>
          <ParadasEnvio retiro={retiro || "…"} entrega={entrega || "…"} tono={TONO_ENVIO.cliente} />
          {recibeOk && (
            <Txt v="cap" style={{ marginTop: espacio.sm }}>
              Recibe: <Txt v="cap" style={{ color: color.n900, fontWeight: "700" }}>{recibe.trim()}</Txt>
            </Txt>
          )}
          <View style={e.linea} />
          <Fila rotulo="Envío" valor={formatPrecio(envioBase)} />
          <Fila rotulo="Tarifa de servicio" valor={formatPrecio(tarifa)} />
          {propinaFinal > 0 && <Fila rotulo="Propina" valor={formatPrecio(propinaFinal)} />}
          <View style={e.linea} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Txt v="head">Total</Txt>
            <Txt v="display" style={{ fontSize: 22, color: color.brandInk }}>
              {formatPrecio(total)}
            </Txt>
          </View>
        </View>

        {sinCuenta ? (
          <View style={[e.aviso, { backgroundColor: color.brandWash }]}>
            <Txt v="label" style={{ color: color.brandInk }}>
              Entrá para pedir el envío
            </Txt>
            <Txt v="cap" style={{ color: color.brandInk, marginTop: 4 }}>
              Hace falta una cuenta para que el repartidor sepa a quién escribirle.
            </Txt>
            <View style={{ flexDirection: "row", marginTop: espacio.md }}>
              <Boton
                onPress={async () => {
                  const problema = await entrarConGoogle();
                  if (problema) setError(problema);
                }}
              >
                Continuar con Google
              </Boton>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
            <Boton
              onPress={pedir}
              cargando={enviando}
              style={[e.cta, !listo && { opacity: 0.55 }]}
              textStyle={{ color: color.white }}
            >
              Pedir el envío
            </Boton>
          </View>
        )}
      </ScrollView>

      {/* ------------------------ hoja del mapa ------------------------ */}
      <Modal visible={!!marcando} transparent animationType="slide" onRequestClose={() => setMarcando(null)}>
        <Pressable style={e.fondo} onPress={() => setMarcando(null)}>
          <Pressable style={[e.hoja, { paddingBottom: insets.bottom + espacio.lg }]} onPress={() => {}}>
            <View style={e.asa} />
            <Txt v="title" style={{ fontSize: 20 }}>
              {marcando === "retiro" ? "¿Dónde se retira?" : "¿Dónde se entrega?"}
            </Txt>
            <Txt v="cap" style={{ marginTop: 2, marginBottom: espacio.md }} numberOfLines={1}>
              {(marcando === "retiro" ? retiro : entrega).trim() || "Mové el mapa hasta dejar el pin en el lugar."}
            </Txt>
            {!!marcando && (
              <MapaPin
                key={`${marcando}:${centro.lat.toFixed(5)},${centro.lng.toFixed(5)}`}
                centro={centro}
                onMover={(p) => {
                  if (marcando === "retiro") setPinRetiro(p);
                  else setPinEntrega(p);
                  setMapaFallo(false);
                }}
                onFallo={() => setMapaFallo(true)}
                altura={360}
              />
            )}
            {mapaFallo && (
              <View style={[e.aviso, { backgroundColor: color.warnWash }]}>
                <Txt v="cap" style={{ color: color.warn }}>
                  No se pudo cargar el mapa. Podés pedir el envío igual con la dirección escrita.
                </Txt>
              </View>
            )}
            <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
              <Boton onPress={() => setMarcando(null)} style={e.cta} textStyle={{ color: color.white }}>
                Listo
              </Boton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Dialogo
        visible={!!error}
        titulo="No se pudo pedir"
        onCerrar={() => setError(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setError(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {error}
        </Txt>
      </Dialogo>
    </KeyboardAvoidingView>
  );
}

/** Una parada del recorrido: el punto, la dirección escrita y el botón del mapa. */
function Parada({
  rotulo,
  valor,
  onCambio,
  pin,
  onMapa,
  error,
  punto,
}: {
  rotulo: string;
  valor: string;
  onCambio: (t: string) => void;
  pin: boolean;
  onMapa: () => void;
  error: boolean;
  punto: React.ReactNode;
}) {
  return (
    <View style={e.parada}>
      <View style={e.columnaPunto}>{punto}</View>
      <View style={{ flex: 1 }}>
        <Txt v="micro" style={{ color: error ? color.danger : color.n600, fontSize: 10.5 }}>
          {rotulo}
        </Txt>
        <TextInput
          value={valor}
          onChangeText={onCambio}
          placeholder="Calle, número, piso/depto"
          placeholderTextColor={color.n400}
          multiline
          style={e.inputParada}
          accessibilityLabel={rotulo}
        />
      </View>
      <Tocable onPress={onMapa} etiqueta={pin ? `${rotulo}: cambiar el punto en el mapa` : `${rotulo}: marcar en el mapa`}>
        <View style={[e.botonPin, pin && e.botonPinListo]}>
          <IconoPin size={18} color={pin ? color.ink : color.n900} />
          {pin && (
            <View style={e.tildePin}>
              <IconoTilde size={9} color={color.white} />
            </View>
          )}
        </View>
      </Tocable>
    </View>
  );
}

function Fila({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
      <Txt v="cap">{rotulo}</Txt>
      <Txt v="cap" style={{ color: color.n900 }}>
        {valor}
      </Txt>
    </View>
  );
}

const e = StyleSheet.create({
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
  },
  volver: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
    minHeight: 52,
  },
  recorrido: {
    backgroundColor: color.white,
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: color.n200,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
  },
  parada: { flexDirection: "row", alignItems: "center", gap: espacio.md, paddingVertical: espacio.xs },
  columnaPunto: { width: 14, alignItems: "center" },
  puntoHueco: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: color.ink },
  puntoLleno: { width: 12, height: 12, borderRadius: 2, backgroundColor: color.ink },
  uniones: { flexDirection: "row", alignItems: "center", gap: espacio.md, height: 10 },
  union: { width: 2, height: 22, marginLeft: 6, backgroundColor: color.n200 },
  divisor: { flex: 1, height: 1, backgroundColor: color.n200, marginLeft: espacio.xs, marginRight: 52 },
  inputParada: { ...texto.body, paddingVertical: 4, paddingHorizontal: 0, minHeight: 30, color: color.n900 },
  botonPin: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.n100,
    alignItems: "center",
    justifyContent: "center",
  },
  botonPinListo: { backgroundColor: color.brand },
  tildePin: {
    position: "absolute",
    right: -2,
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.ink,
    borderWidth: 2,
    borderColor: color.white,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: color.danger, marginTop: 6 },
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.42)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    padding: espacio.lg,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  asa: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  iconoMetodo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.n100,
    alignItems: "center",
    justifyContent: "center",
  },
  metodo: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.sm,
    borderWidth: 1.5,
    borderColor: color.n200,
    padding: espacio.md,
  },
  metodoActivo: { borderColor: color.ink, backgroundColor: color.brandWash },
  resumen: {
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.lg,
    marginTop: espacio.xl,
    ...sombras.sm,
  },
  linea: { height: 1, backgroundColor: color.n200, marginVertical: espacio.md },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md },
  cta: { backgroundColor: color.ink, shadowColor: color.ink },
});
