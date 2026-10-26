/**
 * Panel del comercio: los pedidos que entran.
 *
 * Es la pantalla que hace que Pedilo sea un marketplace y no un formulario.
 * Todo lo demás del lado del local (carta, horarios, fotos) puede esperar;
 * esto no, porque sin esto el pedido del cliente no le llega a nadie.
 *
 * Tres decisiones de interfaz que vale la pena explicar:
 *
 * 1. Los pedidos nuevos van arriba y con el borde encendido. Alguien en una
 *    cocina mira esta pantalla de reojo entre dos cosas; tiene que saber si
 *    hay algo que atender sin leer nada.
 *
 * 2. Se refresca solo. Un local no va a estar tirando de la lista para ver si
 *    entró un pedido. Entra por realtime, y hay un refresco cada 30 segundos
 *    por si la conexión se cayó sin avisar.
 *
 * 3. Las notas de cada producto se muestran siempre, sin tener que abrir nada.
 *    "Sin cebolla" escondido detrás de un tap es "sin cebolla" que se cocina
 *    con cebolla.
 *
 * No hay chat de este lado a propósito: la conversación del pedido es entre el
 * cliente y el repartidor. El canal del local con el cliente es el estado —
 * acepta, marca listo, o rechaza con un motivo que el cliente lee. Una bandeja
 * de mensajes más para atender en plena cocina no ayuda a nadie.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, EstadoVacio, InsigniaEstado, Tocable, Txt } from "../../componentes/base";
import { IconoChat, IconoPin, IconoTelefono } from "../../componentes/Iconos";
import { EncabezadoComercio } from "../../componentes/EncabezadoComercio";
import { useSesion } from "../../contextos/Sesion";
import { accionesDelComercio, cambiarEstado, pedidosDelComercio, resumenDelPago } from "../../lib/pedidos";
import { fechaCorta, formatPrecio } from "../../lib/precios";
import { supabase } from "../../lib/supabase";
import type { EstadoPedido, PedidoCompleto } from "../../lib/tipos";
import { color, espacio, radio, sombras, texto } from "../../theme/tokens";

/** Lo que el local tiene que atender ahora, contra lo que ya cerró. */
const ACTIVOS: EstadoPedido[] = ["Pendiente", "Preparando", "Listo", "En camino"];

const MOTIVOS = [
  "No tenemos stock de algo del pedido",
  "Estamos cerrando por hoy",
  "La cocina está desbordada",
  "La dirección está fuera de nuestra zona",
];

export default function PanelPedidos() {
  const insets = useSafeAreaInsets();
  const { perfil } = useSesion();

  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [solapa, setSolapa] = useState<"activos" | "historial">("activos");
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<PedidoCompleto | null>(null);
  const [motivo, setMotivo] = useState("");

  // Para no pisar la lista con una respuesta vieja si llegan dos cargas juntas.
  const ultimaCarga = useRef(0);

  const cargar = useCallback(async () => {
    const marca = ++ultimaCarga.current;
    const datos = await pedidosDelComercio();
    if (marca === ultimaCarga.current) setPedidos(datos);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Realtime: el pedido aparece sin que nadie toque nada. El refresco cada 30
  // segundos es la red de seguridad para cuando el socket se cae en silencio,
  // que en una cocina con wifi malo pasa más de lo que uno quisiera.
  useEffect(() => {
    const canal = supabase
      .channel("pedidos-del-local")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => cargar())
      .subscribe();

    const reloj = setInterval(cargar, 30000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(reloj);
    };
  }, [cargar]);

  const { activos, historial } = useMemo(() => {
    const a = pedidos.filter((p) => ACTIVOS.includes(p.estado));
    const h = pedidos.filter((p) => !ACTIVOS.includes(p.estado));
    return { activos: a, historial: h };
  }, [pedidos]);

  const nuevos = activos.filter((p) => p.estado === "Pendiente").length;
  const lista = solapa === "activos" ? activos : historial;

  async function mover(p: PedidoCompleto, a: EstadoPedido, motivoTexto?: string) {
    setTrabajando(p.id);
    setError(null);
    const r = await cambiarEstado(p.id, a, motivoTexto);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    // Optimista: la fila se actualiza ya, y realtime confirma un instante después.
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...r.pedido } : x)));
    setRechazando(null);
    setMotivo("");
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      {/* ------------------------------- header ------------------------------ */}
      <EncabezadoComercio
        titulo="Pedidos"
        derecha={
          nuevos > 0 ? (
            <View style={e.aviso}>
              <Txt v="cap" style={{ color: color.ink }}>
                {nuevos} nuevo{nuevos > 1 ? "s" : ""}
              </Txt>
            </View>
          ) : undefined
        }
      />

      {/* ------------------------------ solapas ------------------------------ */}
      <View style={e.solapas}>
        <Solapa
          label="Activos"
          cantidad={activos.length}
          alerta={nuevos}
          activa={solapa === "activos"}
          onPress={() => setSolapa("activos")}
        />
        <Solapa
          label="Historial"
          cantidad={historial.length}
          activa={solapa === "historial"}
          onPress={() => setSolapa("historial")}
        />
      </View>

      {!!error && (
        <View style={e.errorBarra}>
          <Txt v="cap" style={{ color: color.danger, flex: 1 }}>
            {error}
          </Txt>
          <Tocable onPress={() => setError(null)}>
            <Txt v="cap" style={{ color: color.danger }}>
              Cerrar
            </Txt>
          </Tocable>
        </View>
      )}

      {cargando ? (
        <View style={{ paddingVertical: 64 }}>
          <ActivityIndicator color={color.brandInk} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espacio.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await cargar();
                setRefrescando(false);
              }}
              tintColor={color.brandInk}
            />
          }
        >
          {lista.length === 0 ? (
            <EstadoVacio
              titulo={solapa === "activos" ? "No hay pedidos ahora" : "Todavía no cerraste ningún pedido"}
              sub={
                solapa === "activos"
                  ? "Cuando entre uno nuevo aparece acá solo, no hace falta recargar."
                  : "Los pedidos entregados y rechazados quedan guardados acá."
              }
              icono="Restaurante"
            />
          ) : (
            lista.map((p) => (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                trabajando={trabajando === p.id}
                onAvanzar={(a) => mover(p, a)}
                onRechazar={() => {
                  setRechazando(p);
                  setMotivo("");
                }}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* ------------------------ hoja para rechazar ------------------------- */}
      <Modal visible={!!rechazando} transparent animationType="slide" onRequestClose={() => setRechazando(null)}>
        <Pressable style={e.fondo} onPress={() => setRechazando(null)}>
          <Pressable style={[e.hoja, { paddingBottom: insets.bottom + espacio.xl }]} onPress={() => {}}>
            <View style={e.manija} />
            <Txt v="title">Rechazar el pedido</Txt>
            <Txt v="cap" style={{ marginTop: 4, marginBottom: espacio.lg }}>
              El cliente va a ver el motivo. Decirle por qué le permite pedir otra cosa en vez de
              quedarse esperando.
            </Txt>

            <View style={{ gap: espacio.sm, marginBottom: espacio.lg }}>
              {MOTIVOS.map((m) => (
                <Tocable key={m} onPress={() => setMotivo(m)} suave>
                  <View style={[e.motivo, motivo === m && e.motivoSel]}>
                    <Txt v="body" style={{ color: motivo === m ? color.brandInk : color.n900 }}>
                      {m}
                    </Txt>
                  </View>
                </Tocable>
              ))}
            </View>

            <TextInput
              value={motivo}
              onChangeText={(t) => setMotivo(t.slice(0, 200))}
              placeholder="O escribí otro motivo"
              placeholderTextColor={color.n400}
              multiline
              style={[e.input, { minHeight: 64, textAlignVertical: "top" }]}
            />

            <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
              <Boton variante="fantasma" onPress={() => setRechazando(null)}>
                Volver
              </Boton>
              <Boton
                onPress={() => rechazando && mover(rechazando, "Rechazado", motivo)}
                disabled={motivo.trim().length < 3}
                cargando={!!rechazando && trabajando === rechazando.id}
              >
                Rechazar
              </Boton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* -------------------------------- pedazos -------------------------------- */

function Solapa({
  label,
  cantidad,
  alerta = 0,
  activa,
  onPress,
}: {
  label: string;
  cantidad: number;
  alerta?: number;
  activa: boolean;
  onPress: () => void;
}) {
  return (
    <Tocable onPress={onPress}>
      <View style={[e.solapa, activa && e.solapaActiva]}>
        <Txt v="label" style={{ color: activa ? color.white : color.n600 }}>
          {label} ({cantidad})
        </Txt>
        {alerta > 0 && (
          <View style={e.punto}>
            <Txt v="cap" style={{ color: color.white, fontSize: 10 }}>
              {alerta}
            </Txt>
          </View>
        )}
      </View>
    </Tocable>
  );
}

function TarjetaPedido({
  pedido: p,
  trabajando,
  onAvanzar,
  onRechazar,
}: {
  pedido: PedidoCompleto;
  trabajando: boolean;
  onAvanzar: (a: EstadoPedido) => void;
  onRechazar: () => void;
}) {
  const { avanzar, puedeRechazar } = accionesDelComercio(p.estado);
  const nuevo = p.estado === "Pendiente";
  /** Sólo números, 10 dígitos (código de área + número). */
  const tel = (p.telefono ?? "").replace(/\D/g, "");
  const telefonoCliente = tel.length === 10 ? tel : null;

  return (
    <View style={[e.tarjeta, nuevo && e.tarjetaNueva]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: espacio.md }}>
        <View style={{ flex: 1 }}>
          <Txt v="head">{formatPrecio(p.total)}</Txt>
          <Txt v="cap">
            {fechaCorta(p.creado_en)} · {p.pago_label}
          </Txt>
        </View>
        <InsigniaEstado estado={p.estado} />
      </View>

      {/* --------------------------- los renglones ------------------------- */}
      <View style={{ marginTop: espacio.md, gap: 4 }}>
        {p.pedido_items?.map((i) => (
          <View key={i.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt v="body" style={{ flex: 1, paddingRight: espacio.md }}>
                {i.cantidad}× {i.nombre}
              </Txt>
              <Txt v="cap">{formatPrecio(i.precio * i.cantidad)}</Txt>
            </View>
            {!!i.nota && (
              <View style={e.nota}>
                <Txt v="cap" style={{ color: color.warn, fontSize: 12 }}>
                  ↳ {i.nota}
                </Txt>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* ------------------------------ entrega ---------------------------- */}
      <View style={e.separador} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <IconoPin size={15} color={color.n600} />
        <Txt v="cap" numberOfLines={2} style={{ flex: 1 }}>
          {p.direccion}
        </Txt>
      </View>
      {!!p.nota && (
        <Txt v="cap" style={{ marginTop: 4, fontStyle: "italic" }} numberOfLines={3}>
          “{p.nota}”
        </Txt>
      )}
      {p.metodo_pago === "efectivo" && p.efectivo_con != null && (
        <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
          Paga con {formatPrecio(p.efectivo_con)} · vuelto {formatPrecio(p.vuelto ?? 0)}
        </Txt>
      )}
      {/* Con Mercado Pago el local necesita saber si la plata entró ANTES de
          ponerse a cocinar. Con efectivo o posnet no hace falta: se cobra en la
          puerta y eso ya lo dice la línea del método. */}
      {resumenDelPago(p).alerta && (
        <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
          {resumenDelPago(p).texto}
        </Txt>
      )}
      {!!p.motivo_rechazo && (
        <Txt v="cap" style={{ color: color.danger, marginTop: 4 }}>
          Rechazado: {p.motivo_rechazo}
        </Txt>
      )}

      {/*
        Contactar al cliente: para cuando falta algo ("no me queda esa leche,
        ¿te mando otra?"). Sólo mientras el pedido está en manos del local y si
        el cliente dejó su celular (es obligatorio desde octubre; los pedidos
        viejos pueden no tenerlo).
      */}
      {telefonoCliente && ["Pendiente", "Preparando", "Listo"].includes(p.estado) && (
        <View style={e.contacto}>
          <Txt v="cap">¿Te falta algún producto? Consultale al cliente si lo reemplazás por otro.</Txt>
          <View style={{ flexDirection: "row", gap: espacio.sm, marginTop: espacio.sm }}>
            <View style={{ flex: 1 }}>
              <Tocable onPress={() => Linking.openURL(`tel:+549${telefonoCliente}`)} etiqueta="Llamar al cliente">
                <View style={[e.botonContacto, { backgroundColor: color.ink, borderColor: color.ink }]}>
                  <IconoTelefono size={16} color={color.white} />
                  <Txt v="label" style={{ color: color.white }}>
                    Llamar
                  </Txt>
                </View>
              </Tocable>
            </View>
            <View style={{ flex: 1 }}>
              <Tocable
                onPress={() => Linking.openURL(`https://wa.me/549${telefonoCliente}`)}
                etiqueta="Escribirle por WhatsApp al cliente"
              >
                <View style={e.botonContacto}>
                  <IconoChat size={16} color={color.ink} />
                  <Txt v="label">WhatsApp</Txt>
                </View>
              </Tocable>
            </View>
          </View>
        </View>
      )}

      {/* ------------------------------ acciones --------------------------- */}
      {(avanzar || puedeRechazar) && (
        <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
          {puedeRechazar && (
            <Boton variante="fantasma" onPress={onRechazar} textStyle={{ color: color.danger }}>
              Rechazar
            </Boton>
          )}
          {avanzar && (
            <Boton onPress={() => onAvanzar(avanzar.a)} cargando={trabajando}>
              {avanzar.label}
            </Boton>
          )}
        </View>
      )}

      {p.estado === "Listo" && (
        <View style={e.espera}>
          <Txt v="cap" style={{ color: color.brandInk }}>
            Esperando que lo retire el repartidor.
          </Txt>
        </View>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  contacto: {
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.md,
    backgroundColor: color.n100,
  },
  botonContacto: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    gap: 6,
    paddingHorizontal: espacio.md,
    paddingVertical: 8,
    borderRadius: radio.pill,
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.n200,
  },
  aviso: { paddingHorizontal: espacio.md, paddingVertical: 7, borderRadius: radio.pill, backgroundColor: color.brand },
  solapas: { flexDirection: "row", gap: espacio.sm, paddingHorizontal: espacio.lg, paddingTop: espacio.lg },
  solapa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: espacio.md,
    paddingVertical: 10,
    borderRadius: radio.pill,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.n200,
  },
  // Elegida = negra con letra blanca, como los Chip del resto de la app.
  solapaActiva: { borderColor: color.ink, backgroundColor: color.ink },
  punto: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: color.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBarra: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.dangerWash,
    marginHorizontal: espacio.lg,
    marginTop: espacio.md,
    padding: espacio.md,
    borderRadius: radio.sm,
  },
  tarjeta: {
    backgroundColor: color.white,
    borderRadius: radio.lg,
    padding: espacio.lg,
    marginBottom: espacio.lg,
    ...sombras.md,
  },
  tarjetaNueva: { borderWidth: 2, borderColor: color.brand },
  nota: { backgroundColor: color.warnWash, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 3 },
  separador: { height: 1, backgroundColor: color.n200, marginVertical: espacio.md },
  espera: {
    backgroundColor: color.brandWash,
    borderRadius: radio.sm,
    padding: espacio.md,
    marginTop: espacio.md,
    alignItems: "center",
  },
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: espacio.lg,
    maxHeight: "88%",
  },
  manija: { width: 40, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  motivo: {
    padding: espacio.md,
    borderRadius: radio.sm,
    borderWidth: 1.5,
    borderColor: color.n200,
    backgroundColor: color.white,
  },
  motivoSel: { borderColor: color.brandInk, backgroundColor: color.brandWash },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
});
