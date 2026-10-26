/**
 * El chat de un pedido: **el cliente y el repartidor**. El local no participa.
 *
 * Está fuera de `(cliente)` y de `(comercio)` a propósito: es literalmente la
 * misma conversación mirada desde dos lados, y tener dos copias sería la forma
 * más rápida de que una diga algo distinto de la otra.
 *
 * Reemplaza al teléfono. Por eso arriba hay una línea que recuerda de qué
 * pedido se está hablando: en un chat sin contexto, "¿ya salió?" no se sabe
 * de qué es.
 *
 * Se puede escribir desde que el pedido existe, haya repartidor o no. Si
 * todavía nadie lo tomó, el mensaje queda esperando y lo lee el que lo tome:
 * "timbre roto, golpear" se acuerda uno al momento de pedir, no cuando el
 * repartidor ya está en la esquina. La pantalla dice en qué situación está,
 * pero no le saca el teclado a nadie.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, InsigniaEstado, Tocable, Txt } from "../componentes/base";
import { IconoVolver } from "../componentes/Iconos";
import { useSesion } from "../contextos/Sesion";
import { enviarMensaje, escucharMensajes, mensajesDelPedido, quienEs, tieneRepartidor } from "../lib/chat";
import { formatPrecio } from "../lib/precios";
import { supabase } from "../lib/supabase";
import type { EstadoPedido, Mensaje, Pedido } from "../lib/tipos";
import { color, espacio, radio, sombras, texto } from "../theme/tokens";

export default function Chat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, rol } = useSesion();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scroll = useRef<ScrollView>(null);
  const miId = session?.user?.id;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
      setPedido((data as unknown as Pedido) ?? null);
      setMensajes(await mensajesDelPedido(id));
      setCargando(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return escucharMensajes(id, (m) => {
      // El propio mensaje ya se agregó al enviarlo; sin este filtro aparece dos
      // veces, una por el optimismo y otra por realtime.
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [mensajes.length]);

  /** Un pedido cerrado se puede leer pero no seguir. */
  const cerrado = useMemo(
    () => pedido?.estado === "Entregado" || pedido?.estado === "Rechazado",
    [pedido?.estado]
  );

  const conRepartidor = tieneRepartidor(pedido?.repartidor_id);

  async function mandar() {
    if (!texto.trim() || !id || !miId || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await enviarMensaje(id, miId, rol, texto);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTexto("");
    setMensajes((prev) => (prev.some((x) => x.id === r.mensaje.id) ? prev : [...prev, r.mensaje]));
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.n50 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={() => router.back()}>
          <View style={e.volver}>
            <IconoVolver size={22} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }}>
            Chat del pedido
          </Txt>
          {!!pedido && (
            <Txt v="cap" style={{ color: "#9A9A9A" }} numberOfLines={1}>
              {formatPrecio(pedido.total)} · {pedido.estado}
            </Txt>
          )}
        </View>
        {!!pedido && <InsigniaEstado estado={pedido.estado as EstadoPedido} />}
      </View>

      {cargando ? (
        <View style={{ paddingVertical: 64 }}>
          <ActivityIndicator color={color.brandInk} />
        </View>
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: espacio.lg, paddingBottom: espacio.lg }}
          showsVerticalScrollIndicator={false}
        >
          {mensajes.length === 0 && (
            <View style={e.vacio}>
              <Txt v="label" style={{ textAlign: "center" }}>
                Todavía no hay mensajes
              </Txt>
              <Txt v="cap" style={{ textAlign: "center", marginTop: 4 }}>
                {conRepartidor
                  ? rol === "cliente"
                    ? "Escribile al repartidor: dónde tocar el timbre, si hay portón, cualquier cosa que le sirva."
                    : "Escribile al cliente si necesitás una referencia para llegar."
                  : "Dejale la referencia ahora —qué timbre, si hay portón, dónde esperarte— y la va a leer el repartidor que tome tu pedido."}
              </Txt>
            </View>
          )}

          {mensajes.map((m, i) => {
            const mio = m.autor_id === miId;
            const mismoAutor = i > 0 && mensajes[i - 1].autor_id === m.autor_id;
            return (
              <View key={m.id} style={{ alignItems: mio ? "flex-end" : "flex-start", marginTop: mismoAutor ? 4 : espacio.md }}>
                {!mismoAutor && (
                  <Txt v="cap" style={{ marginBottom: 3, fontSize: 11 }}>
                    {quienEs(m, miId)}
                  </Txt>
                )}
                <View style={[e.burbuja, mio ? e.mia : e.suya]}>
                  <Txt v="body" style={mio ? { color: color.ink } : undefined}>
                    {m.texto}
                  </Txt>
                </View>
                <Txt v="cap" style={{ fontSize: 10, marginTop: 2, color: color.n400 }}>
                  {new Date(m.creado_en).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </Txt>
              </View>
            );
          })}
        </ScrollView>
      )}

      {!!error && (
        <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
          <Txt v="cap" style={{ color: color.danger }}>
            {error}
          </Txt>
        </View>
      )}

      {cerrado ? (
        <View style={[e.aviso, { backgroundColor: color.n100, marginBottom: insets.bottom + espacio.md }]}>
          <Txt v="cap" style={{ textAlign: "center" }}>
            Este pedido ya terminó. La conversación queda guardada, pero no se puede seguir.
          </Txt>
        </View>
      ) : (
        <View style={[e.barra, { paddingBottom: insets.bottom + espacio.md }]}>
          {/* No hay bloqueo por "todavía no hay repartidor": lo que se escribe
              ahora queda esperando y lo lee el que tome el pedido. */}
          {!conRepartidor && (
            <View style={e.esperando}>
              <Txt v="cap" style={{ textAlign: "center", color: color.brandInk }}>
                Todavía nadie tomó tu pedido. Lo que escribas lo va a leer el repartidor cuando lo tome.
              </Txt>
            </View>
          )}
          <View style={e.fila}>
            <TextInput
              value={texto}
              onChangeText={(t) => setTexto(t.slice(0, 1000))}
              placeholder="Escribí un mensaje"
              placeholderTextColor={color.n400}
              multiline
              style={e.input}
              onSubmitEditing={mandar}
            />
            <View style={{ width: 108 }}>
              <Boton onPress={mandar} cargando={enviando} disabled={!texto.trim()}>
                Enviar
              </Boton>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
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
  volver: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#191919", alignItems: "center", justifyContent: "center" },
  vacio: { paddingVertical: 48, paddingHorizontal: espacio.lg },
  burbuja: { maxWidth: "82%", paddingHorizontal: espacio.md, paddingVertical: 10, borderRadius: radio.md, ...sombras.sm },
  mia: { backgroundColor: color.brand, borderBottomRightRadius: 4 },
  suya: { backgroundColor: color.white, borderBottomLeftRadius: 4 },
  barra: {
    gap: espacio.sm,
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
    backgroundColor: color.n50,
    borderTopWidth: 1,
    borderTopColor: color.n200,
  },
  fila: { flexDirection: "row", alignItems: "flex-end", gap: espacio.sm },
  esperando: {
    backgroundColor: color.brandWash,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: 8,
  },
  input: {
    ...texto.body,
    flex: 1,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  aviso: { marginHorizontal: espacio.lg, padding: espacio.md, borderRadius: radio.sm, marginBottom: espacio.md },
});
