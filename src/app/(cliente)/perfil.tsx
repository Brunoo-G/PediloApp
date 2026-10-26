/**
 * Perfil del cliente.
 *
 * Es una lista de filas, no un formulario. Antes era una tarjeta con el campo
 * de dirección siempre abierto y un botón "Guardar" que había que acordarse de
 * tocar: el 90% de las veces que alguien entra acá es para mirar —"¿qué
 * dirección tengo puesta?"— y no para escribir. Ahora cada cosa se ve de un
 * vistazo con su valor al lado, y editarla abre una hoja.
 *
 * Es además el tercer nivel de jerarquía del sistema de diseño: sin tarjeta ni
 * sombra, sólo divisores. Las tarjetas son para los locales y los productos.
 *
 * La dirección sigue siendo la FUENTE ÚNICA DE VERDAD: la leen el header del
 * home, el checkout y los próximos pedidos. Por eso nunca se guarda vacía.
 */
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Dialogo, Tocable, Txt } from "../../componentes/base";
import {
  IconoCelular,
  IconoChat,
  IconoPago,
  IconoChevron,
  IconoPin,
  IconoSalir,
  IconoTienda,
  IconoTarjeta,
} from "../../componentes/Iconos";
import { useSesion } from "../../contextos/Sesion";
import { puntoValido } from "../../lib/geo";
import { leerCelular, mostrarCelular } from "../../lib/telefono";
import { configuracionOk, diagnosticoConfig } from "../../lib/supabase";
import { color, espacio, METODOS_PAGO, metodoVigente, radio, sombras, texto } from "../../theme/tokens";

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, perfil, actualizarPerfil, cerrarSesion } = useSesion();
  const pin = puntoValido(perfil?.lat, perfil?.lng);

  /** Qué hoja está abierta. Una sola cosa a la vez. */
  const [hoja, setHoja] = useState<null | "direccion" | "celular" | "pago" | "ayuda">(null);
  const [celular, setCelular] = useState("");
  const [direccion, setDireccion] = useState("");
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    setDireccion(perfil?.direccion ?? "");
  }, [perfil?.direccion]);

  useEffect(() => {
    setCelular(perfil?.telefono ? mostrarCelular(perfil.telefono) : "");
  }, [perfil?.telefono]);

  const cel = leerCelular(celular);
  const direccionOk = direccion.trim().length >= 5;
  const metodo = METODOS_PAGO.find((m) => m.id === metodoVigente(perfil?.metodo_pago)) ?? METODOS_PAGO[0];

  async function guardarDireccion() {
    setTocado(true);
    if (!direccionOk) return;
    setGuardando(true);
    await actualizarPerfil({ direccion: direccion.trim() });
    setGuardando(false);
    setHoja(null);
    setTocado(false);
    setAviso("Listo: la dirección quedó actualizada en toda la app.");
  }

  async function guardarCelular() {
    setTocado(true);
    if (!cel.ok) return;
    setGuardando(true);
    await actualizarPerfil({ telefono: cel.valor });
    setGuardando(false);
    setHoja(null);
    setTocado(false);
    setAviso("Listo: guardamos tu celular.");
  }

  async function elegirPago(id: string) {
    setHoja(null);
    await actualizarPerfil({ metodo_pago: id });
  }

  const problema = !configuracionOk ? diagnosticoConfig() : null;
  const inicial = (perfil?.nombre || perfil?.email || "?").charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <View style={[e.header, { paddingTop: insets.top + espacio.xl }]}>
        <View style={e.avatar}>
          <Txt v="display" style={{ color: color.ink, fontSize: 26 }}>
            {inicial}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }} numberOfLines={1}>
            {perfil?.nombre || "Invitado"}
          </Txt>
          <Txt v="cap" style={{ color: "#C7C7C3" }} numberOfLines={1}>
            {perfil?.email || "Todavía no iniciaste sesión"}
          </Txt>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: espacio.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {problema && (
          <View style={[e.tarjeta, { backgroundColor: color.warnWash, marginBottom: espacio.md }]}>
            <Txt v="label" style={{ color: color.warn }}>
              Falta configurar Supabase
            </Txt>
            <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
              {problema}
            </Txt>
          </View>
        )}

        {!session ? (
          <View style={e.tarjeta}>
            <Txt v="head">Todavía no iniciaste sesión</Txt>
            <Txt v="cap" style={{ marginTop: 4 }}>
              Podés mirar todos los locales sin cuenta. Para pedir, guardar tu dirección y seguir tus
              pedidos hace falta entrar.
            </Txt>
            <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
              <Boton onPress={() => router.push("/bienvenida")}>Crear mi cuenta</Boton>
            </View>
          </View>
        ) : (
          <>
            {/*
              Tres filas y nada más.

              "Mi ubicación en el mapa" era una fila aparte y es el mismo dato
              que la dirección: el texto es lo que lee el repartidor y el pin es
              cómo llega. Dos renglones para una sola cosa obligan a entender
              una diferencia que al cliente no le importa. Ahora el pin se
              marca desde la misma hoja y su estado se ve en el subtítulo.

              "Mis pedidos" también se fue: ya hay una pestaña dedicada abajo, y
              un atajo a la pestaña de al lado no es una opción del perfil.
            */}
            <Fila
              icono={<IconoPin size={20} color={color.n600} />}
              titulo="Mi dirección"
              sub={
                perfil?.direccion?.trim()
                  ? `${perfil.direccion.trim()} · ${pin ? "con pin en el mapa" : "sin pin"}`
                  : "Agregá tu dirección"
              }
              onPress={() => setHoja("direccion")}
            />
            <Fila
              icono={<IconoCelular size={20} color={color.n600} />}
              titulo="Mi celular"
              sub={perfil?.telefono ? mostrarCelular(perfil.telefono) : "Agregá tu celular"}
              onPress={() => {
                setTocado(false);
                setHoja("celular");
              }}
            />
            <Fila
              icono={<IconoPago metodo={metodo.id} size={20} color={color.n600} />}
              titulo="Método de pago"
              sub={`${metodo.label} · ${metodo.desc}`}
              onPress={() => setHoja("pago")}
            />
            <Fila
              icono={<IconoChat size={20} color={color.n600} />}
              titulo="Ayuda"
              sub="Escribinos si algo salió mal"
              onPress={() => setHoja("ayuda")}
            />
            {/* Para dueños de locales: el formulario para sumarse a Pedilo.
                Desde ahí también se entra al panel si ya tienen cuenta. */}
            <Fila
              icono={<IconoTienda size={20} color={color.n600} />}
              titulo="Registrar mi negocio"
              sub="Sumá tu local a Pedilo"
              onPress={() => router.push("/sumate")}
            />

            <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
              <Boton
                variante="fantasma"
                onPress={() => setSaliendo(true)}
                textStyle={{ color: color.danger }}
              >
                Cerrar sesión
              </Boton>
            </View>
          </>
        )}


      </ScrollView>

      {/* ---------------------------- la dirección ---------------------------- */}
      <Hoja visible={hoja === "direccion"} onCerrar={() => setHoja(null)} titulo="Tu dirección">
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          La leen el header, el checkout y tus próximos pedidos. Es la que va a leer el repartidor.
        </Txt>
        <TextInput
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Calle, número, piso/depto"
          placeholderTextColor={color.n400}
          style={[e.input, tocado && !direccionOk && { borderColor: color.danger }]}
          accessibilityLabel="Dirección de envío"
          autoFocus
        />
        {tocado && !direccionOk && (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            La dirección no puede quedar vacía.
          </Txt>
        )}
        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardarDireccion} cargando={guardando}>
            Guardar
          </Boton>
        </View>
        <Boton
          variante="fantasma"
          onPress={() => {
            setHoja(null);
            router.push("/(cliente)/direccion");
          }}
          style={{ marginTop: espacio.sm }}
          textStyle={{ color: pin ? color.brandInk : color.n900 }}
        >
          {pin ? "✓ Pin marcado · cambiarlo en el mapa" : "Marcar el pin en el mapa"}
        </Boton>
        <Txt v="cap" style={{ marginTop: 6, fontSize: 11 }}>
          {pin
            ? "El pin decide qué locales llegan hasta tu casa."
            : "Sin el pin no podemos saber qué locales entregan en tu zona."}
        </Txt>
      </Hoja>

      {/* ------------------------------ el celular ---------------------------- */}
      <Hoja visible={hoja === "celular"} onCerrar={() => setHoja(null)} titulo="Tu celular">
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Lo usamos sólo si hay un problema con un pedido. No se lo mostramos al local ni al repartidor.
        </Txt>
        <TextInput
          value={celular}
          onChangeText={setCelular}
          placeholder="11 2345 6789"
          placeholderTextColor={color.n400}
          keyboardType="phone-pad"
          style={[e.input, tocado && !cel.ok && { borderColor: color.danger }]}
          accessibilityLabel="Celular"
          autoFocus
        />
        {tocado && !cel.ok && (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            {cel.mensaje}
          </Txt>
        )}
        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardarCelular} cargando={guardando}>
            Guardar
          </Boton>
        </View>
      </Hoja>

      {/* --------------------------- el medio de pago -------------------------- */}
      <Hoja visible={hoja === "pago"} onCerrar={() => setHoja(null)} titulo="¿Cómo pagás?">
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Es el que viene marcado en el checkout. Podés cambiarlo en cada pedido.
        </Txt>
        <View style={{ gap: espacio.sm }}>
          {METODOS_PAGO.map((m) => {
            const sel = m.id === metodo.id;
            return (
              <Tocable key={m.id} onPress={() => elegirPago(m.id)} etiqueta={m.label} suave>
                <View style={[e.opcion, sel && e.opcionSel]}>
                  <View style={e.iconoFila}>
                    <IconoPago metodo={m.id} size={20} color={sel ? color.brandInk : color.n600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="label">{m.label}</Txt>
                    <Txt v="cap">{m.desc}</Txt>
                  </View>
                  {sel && (
                    <Txt v="label" style={{ color: color.brandInk }}>
                      ✓
                    </Txt>
                  )}
                </View>
              </Tocable>
            );
          })}
        </View>
      </Hoja>

      {/* ------------------------------- ayuda -------------------------------- */}
      <Hoja visible={hoja === "ayuda"} onCerrar={() => setHoja(null)} titulo="¿Necesitás una mano?">
        <Txt v="body" style={{ marginBottom: espacio.md }}>
          Si un pedido llegó mal, tarde o no llegó, escribinos y lo resolvemos.
        </Txt>
        <Txt v="cap">Mientras tanto, dos atajos:</Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          · Con el pedido en curso, el chat de entrega es el camino más rápido: lo lee el repartidor
          que lo tiene en la mano.
        </Txt>
        <Txt v="cap" style={{ marginTop: 4 }}>
          · Si el problema es con lo que trajeron, el local lo ve en su panel.
        </Txt>
        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={() => setHoja(null)}>Entendido</Boton>
        </View>
      </Hoja>

      <Dialogo
        visible={saliendo}
        titulo="¿Cerrar sesión?"
        onCerrar={() => setSaliendo(false)}
        cancelar="Mejor no"
        confirmar={{
          texto: "Sí, cerrar sesión",
          onPress: () => {
            setSaliendo(false);
            cerrarSesion();
          },
        }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Vas a poder seguir mirando los locales, pero para pedir vas a tener que entrar de nuevo.
        </Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          Tu historial de pedidos queda guardado en tu cuenta.
        </Txt>
      </Dialogo>

      <Dialogo
        visible={!!aviso}
        titulo="Guardado"
        onCerrar={() => setAviso(null)}
        cancelar={null}
        confirmar={{ texto: "Dale", onPress: () => setAviso(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {aviso}
        </Txt>
      </Dialogo>
    </View>
  );
}

/** Una fila del perfil: ícono, qué es, qué dice hoy, y la flecha. */
function Fila({
  icono,
  titulo,
  sub,
  onPress,
}: {
  icono: React.ReactNode;
  titulo: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={titulo} suave>
      <View style={e.fila}>
        <View style={e.iconoFila}>{icono}</View>
        <View style={{ flex: 1 }}>
          <Txt v="label">{titulo}</Txt>
          <Txt v="cap" numberOfLines={1}>
            {sub}
          </Txt>
        </View>
        <IconoChevron size={17} color={color.n400} />
      </View>
    </Tocable>
  );
}

/**
 * La hoja que sube desde abajo.
 *
 * Es un `Modal` y no una pantalla nueva porque editar la dirección no es irse
 * a otro lado: se abre, se escribe y se vuelve al mismo lugar.
 */
function Hoja({
  visible,
  onCerrar,
  titulo,
  children,
}: {
  visible: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={e.fondo} onPress={onCerrar}>
        <Pressable style={e.hoja} onPress={() => {}}>
          <View style={e.asa} />
          <Txt v="title" style={{ fontSize: 20, marginBottom: 4 }}>
            {titulo}
          </Txt>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const e = StyleSheet.create({
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.xxl,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.brand, alignItems: "center", justifyContent: "center" },
  tarjeta: { backgroundColor: color.white, borderRadius: radio.md, padding: espacio.lg, ...sombras.sm },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    paddingVertical: espacio.md,
    borderBottomWidth: 1,
    borderBottomColor: color.n200,
  },
  iconoFila: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.n100,
    alignItems: "center",
    justifyContent: "center",
  },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.sm,
    borderWidth: 1.5,
    borderColor: color.n200,
    padding: espacio.md,
  },
  opcionSel: { borderColor: color.brandInk, backgroundColor: color.brandWash },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.42)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    padding: espacio.lg,
    paddingBottom: espacio.xxxl,
  },
  asa: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
});
