/**
 * Historial de pedidos.
 *
 * Separado en Activos e Historial desde el principio: con treinta pedidos, los
 * entregados intercalados entre los que están en camino hacen que no se
 * entienda nada. Fue uno de los hallazgos de la auditoría del prototipo.
 *
 * Cada tarjeta se lee en el orden en que a uno le surgen las preguntas: qué
 * pedí, a dónde va, cómo lo pago y cuánto salió cada cosa. El detalle del pago
 * está abierto, no escondido detrás de un "ver más": el número que más se mira
 * es el total, pero el que genera desconfianza es el que no se explica.
 *
 * Arriba a la derecha, donde antes estaba el cartel del estado, está el chat.
 * El estado ya lo dice la barra de progreso con todas las letras, así que el
 * cartel era una segunda copia del mismo dato ocupando el lugar más valioso de
 * la tarjeta. El chat se puede abrir desde que el pedido existe.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvisoEstado } from "../../componentes/AvisoEstado";
import { Boton, Chip, Dialogo, EstadoVacio, ImagenSmart, InsigniaEstado, ProgresoPedido, Tocable, Txt } from "../../componentes/base";
import { IconoChat } from "../../componentes/Iconos";
import { useCarrito } from "../../contextos/Carrito";
import { useSesion } from "../../contextos/Sesion";
import { cancelarPedido, misPedidos, MOTIVO_CANCELO_CLIENTE, resumenDelPago } from "../../lib/pedidos";
import { fechaCorta, formatPrecio } from "../../lib/precios";
import { supabase } from "../../lib/supabase";
import type { PedidoCompleto, ProductoConFotos } from "../../lib/tipos";
import { color, espacio, radio, sombras } from "../../theme/tokens";

export default function Pedidos() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSesion();
  const carrito = useCarrito();

  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [filtro, setFiltro] = useState<"activos" | "historial">("activos");
  /** El pedido que se está por repetir, ya resuelto contra la carta de hoy. */
  const [repetir, setRepetir] = useState<Repeticion | null>(null);
  const [repitiendo, setRepitiendo] = useState<string | null>(null);
  /** Pedidos con el detalle desplegado. */
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternarDetalle = (id: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const [avisoRepetir, setAvisoRepetir] = useState<string | null>(null);
  /** El pedido que se está por cancelar (diálogo de confirmación). */
  const [cancelando, setCancelando] = useState<PedidoCompleto | null>(null);
  const [cancelandoYa, setCancelandoYa] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  async function confirmarCancelar() {
    if (!cancelando) return;
    setCancelandoYa(true);
    const r = await cancelarPedido(cancelando.id);
    setCancelandoYa(false);
    setCancelando(null);
    if (!r.ok) {
      setErrorCancelar(r.mensaje);
      return;
    }
    traer();
  }

  const traer = useCallback(async () => {
    if (!session) {
      setPedidos([]);
      setCargando(false);
      return;
    }
    setPedidos(await misPedidos());
    setCargando(false);
  }, [session]);

  // Al volver a esta pestaña se recarga: el comercio pudo haber cambiado el
  // estado mientras el cliente miraba otra pantalla.
  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  /**
   * Seguimiento en vivo.
   *
   * Cuando el local acepta el pedido o el repartidor sale, la barra de
   * progreso se mueve sola. Es la diferencia entre una app que te deja
   * esperando sin saber y una que te va contando.
   *
   * El filtro por cliente_id se pone acá además de RLS: realtime manda el
   * evento por el canal y no queremos despertar la pantalla de todo el mundo
   * cada vez que se mueve un pedido ajeno.
   */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const canal = supabase
      .channel("mis-pedidos")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `cliente_id=eq.${uid}` },
        (msg) => {
          const nuevo = msg.new as PedidoCompleto;
          setPedidos((prev) =>
            prev.map((p) => (p.id === nuevo.id ? { ...p, ...nuevo } : p))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos", filter: `cliente_id=eq.${uid}` },
        () => traer()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [session?.user?.id, traer]);

  const activos = pedidos.filter((p) => p.estado !== "Entregado" && p.estado !== "Rechazado");
  const historial = pedidos.filter((p) => p.estado === "Entregado" || p.estado === "Rechazado");
  const lista = filtro === "activos" ? activos : historial;

  /**
   * Repetir un pedido.
   *
   * No alcanza con copiar los renglones viejos: la carta cambió. Un producto
   * puede no estar más, estar desactivado o valer otra cosa, y el precio que
   * vale es el de hoy —el pedido viejo es un recuerdo, no una reserva—. Así
   * que se busca cada renglón en la carta actual **por id** (el nombre puede
   * haber cambiado), se arma el carrito con lo que sobrevive y se avisa por lo
   * que falta, en vez de agregar a medias sin decir nada.
   *
   * Las aclaraciones de cada renglón viajan también: quien pidió "sin sal" la
   * semana pasada la sigue queriendo.
   */
  async function prepararRepetir(p: PedidoCompleto) {
    if (!p.comercio_id || repitiendo) return;
    setRepitiendo(p.id);

    const { data } = await supabase
      .from("productos")
      .select("*, producto_fotos(*)")
      .eq("comercio_id", p.comercio_id)
      .eq("activo", true);
    const catalogo = (data ?? []) as unknown as ProductoConFotos[];

    const lineas: { producto: ProductoConFotos; cantidad: number; nota?: string }[] = [];
    const faltan: string[] = [];

    for (const it of p.pedido_items) {
      const prod =
        catalogo.find((c) => c.id === it.producto_id) ?? catalogo.find((c) => c.nombre === it.nombre);
      if (!prod) {
        faltan.push(it.nombre);
        continue;
      }
      lineas.push({ producto: prod, cantidad: it.cantidad, nota: it.nota });
    }

    setRepitiendo(null);

    if (lineas.length === 0) {
      setAvisoRepetir(
        `${p.comercios?.nombre ?? "El local"} ya no tiene ninguno de esos productos. Entrá a la carta para ver qué hay ahora.`
      );
      return;
    }

    const rep: Repeticion = {
      comercioId: p.comercio_id,
      comercioNombre: p.comercios?.nombre ?? "",
      lineas,
      faltan,
    };

    // Si hay un carrito de otro local, se pregunta antes de pisarlo.
    const hayOtro =
      carrito.cantidadTotal > 0 && carrito.carrito.comercioId !== p.comercio_id;
    if (hayOtro) {
      setRepetir(rep);
      return;
    }
    cargar(rep);
  }

  function cargar(rep: Repeticion) {
    carrito.cargarPedido(rep.comercioId, rep.comercioNombre, rep.lineas);
    setRepetir(null);
    if (rep.faltan.length > 0) {
      setAvisoRepetir(
        rep.faltan.length === 1
          ? `Pusimos todo en el carrito menos “${rep.faltan[0]}”: el local ya no lo tiene.`
          : `Pusimos en el carrito lo que sigue estando. Quedaron afuera ${rep.faltan.length} productos que el local ya no tiene: ${rep.faltan.join(", ")}.`
      );
    }
    router.push("/(cliente)/carrito");
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + espacio.lg, paddingHorizontal: espacio.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await traer();
              setRefrescando(false);
            }}
            tintColor={color.brandInk}
          />
        }
      >
        <Txt v="display" style={{ marginBottom: espacio.lg }}>
          Tus pedidos
        </Txt>

        {pedidos.length > 0 && (
          <View style={{ flexDirection: "row", gap: espacio.sm, marginBottom: espacio.lg }}>
            <Chip activo={filtro === "activos"} onPress={() => setFiltro("activos")}>
              {`Activos (${activos.length})`}
            </Chip>
            <Chip activo={filtro === "historial"} onPress={() => setFiltro("historial")}>
              {`Historial (${historial.length})`}
            </Chip>
          </View>
        )}

        {cargando ? (
          <View style={{ gap: espacio.md }}>
            {[0, 1].map((i) => (
              <View key={i} style={{ height: 180, borderRadius: radio.md, backgroundColor: color.n100 }} />
            ))}
          </View>
        ) : pedidos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía nada"
            sub="Cuando hagas tu primer pedido lo vas a ver acá, con su estado en vivo."
            icono="Restaurante"
          />
        ) : lista.length === 0 ? (
          <EstadoVacio
            titulo={filtro === "activos" ? "Nada en curso" : "Historial vacío"}
            sub={
              filtro === "activos"
                ? "No tenés pedidos en camino ahora mismo."
                : "Acá van a quedar los entregados y los rechazados."
            }
            icono="Restaurante"
          />
        ) : (
          <View style={{ gap: espacio.md }}>
            {lista.map((p) => (
              <View key={p.id} style={e.tarjeta}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md, marginBottom: espacio.sm }}>
                  <ImagenSmart
                    uri={p.comercios?.logo_url}
                    categoria={p.comercios?.categoria ?? "Todos"}
                    style={e.logo}
                    iconoSize={20}
                  />
                  <View style={{ flex: 1 }}>
                    <Txt v="head" numberOfLines={1}>
                      {p.comercios?.nombre ?? "Local"}
                    </Txt>
                    <Txt v="cap">
                      {fechaCorta(p.creado_en)} · {p.pedido_items.reduce((s, i) => s + i.cantidad, 0)} productos
                    </Txt>
                  </View>
                  {/*
                    El rechazado no tiene a quién escribirle: no va a haber
                    repartidor. Ahí sí queda el cartel, que es la única forma de
                    ver el estado cuando la barra de progreso no se dibuja.
                  */}
                  {p.estado === "Rechazado" ? (
                    <InsigniaEstado estado={p.estado} />
                  ) : (
                    <Tocable onPress={() => router.push({ pathname: "/chat", params: { id: p.id } })}>
                      <View style={[e.chat, { flexDirection: "row", alignItems: "center", gap: 5 }]}>
                        <IconoChat size={15} color={color.brandInk} />
                        <Txt v="cap" style={{ color: color.brandInk }}>
                          Chat
                        </Txt>
                      </View>
                    </Tocable>
                  )}
                </View>

                {(() => {
                  const m = mensajeDelPedido(p);
                  return m ? <AvisoEstado {...m} /> : null;
                })()}

                <ProgresoPedido estado={p.estado} />

                {p.estado === "Rechazado" &&
                  (p.motivo_rechazo === MOTIVO_CANCELO_CLIENTE ? (
                    <View style={[e.rechazo]}>
                      <Txt v="label" style={{ color: color.danger }}>
                        Cancelaste este pedido
                      </Txt>
                      <Txt v="cap" style={{ color: color.danger, marginTop: 2 }}>
                        No se te cobró nada.
                      </Txt>
                    </View>
                  ) : (
                    <View style={[e.rechazo]}>
                      <Txt v="label" style={{ color: color.danger }}>
                        El local no pudo tomar el pedido
                      </Txt>
                      <Txt v="cap" style={{ color: color.danger, marginTop: 2 }}>
                        {p.motivo_rechazo || "No indicaron el motivo."} No se te cobró nada.
                      </Txt>
                    </View>
                  ))}

                <View style={{ borderTopWidth: 1, borderTopColor: color.n200, marginTop: espacio.md, paddingTop: espacio.md }}>
                  {p.pedido_items.map((it) => (
                    <View key={it.id} style={{ marginBottom: 6 }}>
                      <View style={e.itemFila}>
                        <Txt v="body" style={{ flex: 1 }} numberOfLines={2}>
                          <Txt v="body" style={{ color: color.n600 }}>{it.cantidad}×</Txt> {it.nombre}
                        </Txt>
                        <Txt v="body" style={e.itemPrecio}>{formatPrecio(it.precio * it.cantidad)}</Txt>
                      </View>
                      {!!it.nota && (
                        <Txt v="cap" style={{ color: color.brandInk, fontSize: 12 }} numberOfLines={2}>
                          ↳ {it.nota}
                        </Txt>
                      )}
                    </View>
                  ))}

                  {!!p.nota && (
                    <Txt v="cap" style={{ marginTop: 4, fontStyle: "italic" }} numberOfLines={2}>
                      “{p.nota}”
                    </Txt>
                  )}

                  {/*
                    3. Detalle del pago.

                    Las tres primeras líneas siempre están, incluso en cero: un
                    envío que dice "Gratis" tranquiliza, un envío que no aparece
                    hace dudar. La propina y el descuento son la excepción —
                    sin cupón no hay descuento que mostrar, y una línea en $0
                    parecería que se perdió una promoción o que no dejó propina
                    quien nunca quiso dejarla.
                  */}
                  <View style={e.detalle}>
                    <Fila etiqueta="Productos" valor={formatPrecio(p.subtotal)} />
                    <Fila
                      etiqueta="Envío"
                      valor={p.costo_envio === 0 ? "Gratis" : formatPrecio(p.costo_envio)}
                      destacado={p.costo_envio === 0}
                    />
                    <Fila etiqueta="Tarifa de servicio" valor={formatPrecio(p.tarifa_servicio)} />
                    {p.propina > 0 && (
                      <Fila etiqueta="Propina al repartidor" valor={formatPrecio(p.propina)} />
                    )}
                    {p.descuento > 0 && (
                      <Fila
                        etiqueta={p.promo_label ? `Descuento · ${p.promo_label}` : "Descuento"}
                        valor={`−${formatPrecio(p.descuento)}`}
                        destacado
                      />
                    )}

                    <View style={e.totalFila}>
                      <Txt v="label">Total</Txt>
                      <Txt v="price">{formatPrecio(p.total)}</Txt>
                    </View>
                  </View>
                  {/*
                    La cuenta se ve siempre (productos, envío, tarifa, propina,
                    descuento y total). Lo que va plegado es la dirección y la
                    forma de pago, que se miran poco.
                  */}
                  <Tocable onPress={() => alternarDetalle(p.id)} etiqueta={abiertos.has(p.id) ? "Ocultar dirección y pago" : "Ver dirección y pago"}>
                    <View style={e.resumenTotal}>
                      <Txt v="cap">{p.pago_label}</Txt>
                      <Txt v="cap" style={{ color: color.brandInk }}>
                        {abiertos.has(p.id) ? "Ocultar dirección y pago" : "Ver dirección y pago"}
                      </Txt>
                    </View>
                  </Tocable>
                  {resumenDelPago(p).alerta && !abiertos.has(p.id) && (
                    <Txt v="cap" style={{ color: color.warn, marginTop: 2 }}>
                      {resumenDelPago(p).texto}
                    </Txt>
                  )}
                  {abiertos.has(p.id) && (
                  <>
                  {/* 1. Dirección */}
                  <Txt v="cap" style={{ marginTop: espacio.md, color: color.n600 }}>
                    Dirección
                  </Txt>
                  <Txt v="body" numberOfLines={2}>
                    {p.direccion}
                  </Txt>

                  {/* 2. Forma de pago */}
                  <Txt v="cap" style={{ marginTop: espacio.sm, color: color.n600 }}>
                    Forma de pago
                  </Txt>
                  <Txt v="body">{p.pago_label}</Txt>
                  {resumenDelPago(p).alerta && (
                    <Txt v="cap" style={{ color: color.warn, marginTop: 2 }}>
                      {resumenDelPago(p).texto}
                    </Txt>
                  )}

                  </>
                  )}

                  {/* Cancelar: sólo mientras el local no lo aceptó. Con Mercado
                      Pago ya aprobado no (hay plata que devolver: chat). */}
                  {p.estado === "Pendiente" && !(p.metodo_pago === "mercadopago" && p.pago_estado === "aprobado") && (
                    <View style={{ flexDirection: "row", marginTop: espacio.md }}>
                      <Boton variante="peligro" onPress={() => setCancelando(p)}>
                        Cancelar pedido
                      </Boton>
                    </View>
                  )}

                  {(p.estado === "Entregado" || p.estado === "Rechazado") && !!p.comercio_id && (
                    <View style={{ flexDirection: "row", marginTop: espacio.md }}>
                      <Boton
                        variante="fantasma"
                        onPress={() => prepararRepetir(p)}
                        cargando={repitiendo === p.id}
                        textStyle={{ color: color.brandInk }}
                      >
                        Repetir pedido
                      </Boton>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ------------------------- cancelar pedido -------------------------- */}
      <Dialogo
        visible={!!cancelando}
        titulo="¿Cancelar el pedido?"
        onCerrar={() => setCancelando(null)}
        cancelar="No, dejalo"
        cargando={cancelandoYa}
        confirmar={{ texto: "Sí, cancelar", onPress: confirmarCancelar }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {cancelando?.comercios?.nombre ?? "El local"} todavía no empezó a prepararlo, así que se cancela sin costo.
        </Txt>
      </Dialogo>
      <Dialogo
        visible={!!errorCancelar}
        titulo="No se pudo cancelar"
        onCerrar={() => setErrorCancelar(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setErrorCancelar(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {errorCancelar}
        </Txt>
      </Dialogo>

      {/* ------------------- repetir con carrito de otro local ------------- */}
      <Dialogo
        visible={!!repetir}
        titulo="¿Vaciar el carrito que tenías?"
        onCerrar={() => setRepetir(null)}
        cancelar="No, dejalo"
        confirmar={{ texto: "Vaciar y repetir", onPress: () => repetir && cargar(repetir) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Tenés {carrito.cantidadTotal} {carrito.cantidadTotal === 1 ? "producto" : "productos"} de{" "}
          <Txt v="body" style={{ fontWeight: "800" }}>
            {carrito.carrito.comercioNombre}
          </Txt>
          , y un pedido es de un solo local.
        </Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          Si seguís, ese carrito se vacía y en su lugar va el pedido de {repetir?.comercioNombre}.
        </Txt>
      </Dialogo>

      {/* --------------------- qué no se pudo repetir --------------------- */}
      <Dialogo
        visible={!!avisoRepetir}
        titulo="La carta cambió"
        onCerrar={() => setAvisoRepetir(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setAvisoRepetir(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {avisoRepetir}
        </Txt>
      </Dialogo>
    </View>
  );
}

/** Un pedido viejo, ya cruzado contra la carta de hoy. */
interface Repeticion {
  comercioId: string;
  comercioNombre: string;
  lineas: { producto: ProductoConFotos; cantidad: number; nota?: string }[];
  faltan: string[];
}

/**
 * Una línea del detalle del pago. Etiqueta a la izquierda, número a la derecha,
 * alineados por la base para que los números formen una columna aunque las
 * etiquetas tengan largos distintos.
 */
function Fila({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <View style={e.fila}>
      <Txt v="cap" style={[{ flex: 1 }, destacado && { color: color.brandInk }]} numberOfLines={1}>
        {etiqueta}
      </Txt>
      <Txt v="cap" style={destacado ? { color: color.brandInk } : undefined}>
        {valor}
      </Txt>
    </View>
  );
}

/**
 * Qué decirle al cliente mientras espera, según en qué anda el pedido. Si un
 * repartidor ya lo tomó pero todavía no lo retiró, se dice eso: "está en
 * camino a retirar tu pedido". Entregado y rechazado no llevan aviso (ya lo
 * dicen la insignia y el recuadro rojo).
 */
function mensajeDelPedido(p: { estado: string; repartidor_id?: string | null; comercios?: { nombre?: string } | null }) {
  const local = p.comercios?.nombre ?? "el local";
  if (p.estado === "Pendiente")
    return { titulo: `Esperando que ${local} confirme tu pedido`, detalle: "Suele tardar unos minutos.", esperando: true };
  if ((p.estado === "Preparando" || p.estado === "Listo") && p.repartidor_id)
    return {
      titulo: "El repartidor está en camino a retirar tu pedido",
      detalle: `Va a buscarlo a ${local}.`,
      esperando: true,
    };
  if (p.estado === "Preparando")
    return { titulo: `${local} está preparando tu pedido`, detalle: "Cuando esté listo, un repartidor lo pasa a buscar.", esperando: true };
  if (p.estado === "Listo")
    return { titulo: "Tu pedido está listo", detalle: "Estamos buscando un repartidor para que lo retire.", esperando: true };
  if (p.estado === "En camino")
    return { titulo: "Tu pedido está en camino", detalle: "El repartidor ya lo retiró y va para tu casa.", esperando: true };
  return null;
}

const e = StyleSheet.create({
  itemFila: { flexDirection: "row", alignItems: "flex-start", gap: espacio.md },
  itemPrecio: { fontVariant: ["tabular-nums"] },
  resumenTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: espacio.md,
    paddingTop: espacio.md,
    borderTopWidth: 1,
    borderTopColor: color.n200,
  },
  tarjeta: { backgroundColor: color.white, borderRadius: radio.md, padding: espacio.lg, ...sombras.sm },
  logo: { width: 40, height: 40, borderRadius: radio.sm, overflow: "hidden" },
  rechazo: { backgroundColor: color.dangerWash, borderRadius: radio.sm, padding: espacio.md, marginTop: espacio.md },
  chat: {
    paddingHorizontal: espacio.md,
    paddingVertical: 9,
    borderRadius: radio.pill,
    backgroundColor: color.brandWash,
    borderWidth: 1.5,
    borderColor: color.brand,
  },
  detalle: {
    marginTop: espacio.md,
    backgroundColor: color.n50,
    borderRadius: radio.sm,
    padding: espacio.md,
    gap: 4,
  },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: espacio.sm },
  totalFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: 1,
    borderTopColor: color.n200,
    marginTop: 6,
    paddingTop: 8,
  },
});
