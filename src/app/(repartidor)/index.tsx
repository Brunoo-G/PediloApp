/**
 * Delivery: los pedidos de locales, del lado del repartidor.
 *
 * Tres pestañas: **En espera** (lo que los locales ya terminaron y nadie tomó),
 * **En curso** (lo que tiene él, hasta tres viajes) e **Historial** (lo que ya
 * entregó). Antes "en curso" y "en espera" iban en la misma lista, uno abajo
 * del otro, y el historial en una pestaña "Entregas" aparte; con tres viajes
 * encima la bolsa quedaba a dos pantallas de scroll y el historial en otro
 * lado. Ahora cada trabajo —Delivery y Envíos— tiene sus tres cosas en el
 * mismo lugar, y la plata se fue al perfil.
 *
 * Arranca en "En curso" si tiene algo en la mano, y si no en "En espera": lo
 * primero que busca al abrir es lo que está haciendo, y si no está haciendo
 * nada, qué puede hacer.
 *
 * Cada tarjeta se lee de arriba abajo en el orden del viaje: de dónde lo saco,
 * a dónde lo llevo, qué cobro, y abajo de todo los dos botones anchos —chat y
 * la acción— para el pulgar. Las direcciones abren el mapa de un toque: nadie
 * copia y pega una dirección con el casco puesto.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccionesViaje } from "../../componentes/AccionesViaje";
import { Boton, Dialogo, EstadoVacio, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import {
  EncabezadoRepartidor,
  PestanasRepartidor,
  textoDeViajes,
  type PestanaRepartidor,
} from "../../componentes/EncabezadoRepartidor";
import { IconoMoto } from "../../componentes/Iconos";
import { misEnviosEnCurso } from "../../lib/envios";
import { useSesion } from "../../contextos/Sesion";
import { cambiarEstado, resumenDelPago } from "../../lib/pedidos";
import { fechaCorta, formatPrecio } from "../../lib/precios";
import {
  accionDelRepartidor,
  misEntregas,
  misRepartos,
  pedidosDisponibles,
  seCobroEnEfectivo,
  soltarPedido,
  tomarPedido,
  TOPE_VIAJES,
  type PedidoParaRepartir,
} from "../../lib/repartos";
import { supabase } from "../../lib/supabase";
import { color, espacio, radio, sombras } from "../../theme/tokens";

/**
 * Abre la dirección en el mapa del teléfono.
 *
 * Se usa la URL universal de Google Maps en vez de los esquemas nativos
 * (`comgooglemaps://`, `maps://`) a propósito: la universal funciona en
 * Android, en iOS y en el navegador, y si el repartidor tiene la app instalada
 * el sistema la abre igual. Un esquema nativo que no está instalado no hace
 * nada, y "no hace nada" es lo peor que puede pasarle a un botón.
 */
function abrirEnMapa(direccion: string) {
  const q = encodeURIComponent(direccion.trim());
  if (!q) return;
  const url = `https://www.google.com/maps/search/?api=1&query=${q}`;
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  Linking.openURL(url).catch(() => {});
}

export default function Viaje() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSesion();
  const miId = session?.user?.id;

  const [viajes, setViajes] = useState<PedidoParaRepartir[]>([]);
  const [disponibles, setDisponibles] = useState<PedidoParaRepartir[]>([]);
  const [entregados, setEntregados] = useState<PedidoParaRepartir[]>([]);
  /** null hasta la primera carga: ahí se elige dónde arrancar. */
  const [pestana, setPestana] = useState<PestanaRepartidor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Los envíos que tiene tomados. No se muestran acá —son otra pestaña— pero
   * ocupan lugar en el tope, así que el encabezado tiene que contarlos. Sin
   * esto decía "1 de 3" mientras la base le rechazaba el cuarto viaje.
   */
  const [enviosEnCurso, setEnviosEnCurso] = useState(0);

  const traer = useCallback(async () => {
    if (!miId) return;
    const [mios, envios, bolsa, hechos] = await Promise.all([
      misRepartos(miId),
      misEnviosEnCurso(miId),
      pedidosDisponibles(),
      misEntregas(miId, "delivery"),
    ]);
    setViajes(mios);
    setEnviosEnCurso(envios.length);
    // La bolsa se trae igual con la mochila llena: la pestaña muestra cuántos
    // hay esperando, y eso sirve para decidir apurarse con lo que tiene.
    setDisponibles(bolsa);
    setEntregados(hechos);
    setPestana((p) => p ?? (mios.length > 0 ? "curso" : "espera"));
    setCargando(false);
  }, [miId]);

  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  /**
   * Cuando un local marca un pedido como listo, aparece solo en la lista.
   *
   * Sin esto el repartidor tendría que tirar para abajo cada treinta segundos
   * para ver si hay trabajo, que es la clase de cosa que se deja de hacer a la
   * media hora.
   */
  useEffect(() => {
    if (!miId) return;
    const canal = supabase
      .channel("repartos")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => traer())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [miId, traer]);

  async function conRefresco(id: string, fn: () => Promise<{ ok: boolean; mensaje?: string }>) {
    if (trabajando) return;
    setTrabajando(id);
    setError(null);
    const r = await fn();
    setTrabajando(null);
    if (!r.ok && r.mensaje) setError(r.mensaje);
    // Siempre se refresca, incluso al fallar: si se lo ganó otro, la lista que
    // está viendo ya es vieja y hay que decírselo mostrándole la de verdad.
    traer();
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  const lugares = TOPE_VIAJES - viajes.length - enviosEnCurso;

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <EncabezadoRepartidor
        icono={<IconoMoto size={26} color={color.brand} />}
        titulo="Delivery"
        bajada="Pedidos de locales: retirás en el local y los llevás a la puerta del cliente."
        pastilla={textoDeViajes(viajes.length, enviosEnCurso, TOPE_VIAJES, "envío")}
      />

      <PestanasRepartidor
        activa={pestana ?? "espera"}
        onCambiar={setPestana}
        cuentas={{ espera: disponibles.length, curso: viajes.length }}
        tinta={color.ink}
      />

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: insets.bottom + 40 }}
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
        showsVerticalScrollIndicator={false}
      >
        {!!error && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash, marginBottom: espacio.md }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {error}
            </Txt>
          </View>
        )}

        {/* ------------------------------- en curso ------------------------- */}
        {pestana === "curso" &&
          (viajes.length === 0 ? (
            <EstadoVacio
              titulo="No tenés pedidos en curso"
              sub={
                disponibles.length > 0
                  ? `${disponibles.length === 1 ? "Hay 1 pedido esperando" : `Hay ${disponibles.length} pedidos esperando`} en "En espera".`
                  : "Cuando tomes un pedido lo vas a ver acá, con las dos direcciones y el chat."
              }
              icono="Restaurante"
            />
          ) : (
            <>
              <Txt v="cap" style={{ marginBottom: espacio.md }}>
                {viajes.length} {viajes.length === 1 ? "pedido" : "pedidos"} ·{" "}
                {viajes.filter((v) => v.estado === "En camino").length} ya retirado
                {viajes.filter((v) => v.estado === "En camino").length === 1 ? "" : "s"}
              </Txt>
              <View style={{ gap: espacio.md }}>
                {viajes.map((p) => (
                  <TarjetaViaje
                    key={p.id}
                    p={p}
                    ocupado={trabajando === p.id}
                    alChat={() => router.push({ pathname: "/chat", params: { id: p.id } })}
                    alSoltar={() => conRefresco(p.id, () => soltarPedido(p.id))}
                    alAvanzar={() => {
                      const a = accionDelRepartidor(p.estado);
                      if (!a) return;
                      conRefresco(p.id, async () => {
                        const r = await cambiarEstado(p.id, a.a);
                        return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
                      });
                    }}
                  />
                ))}
              </View>
            </>
          ))}

        {/* ------------------------------ en espera ------------------------- */}
        {pestana === "espera" && (
          <>
            {lugares <= 0 ? (
              <View style={[e.aviso, { backgroundColor: color.n100, marginBottom: espacio.md }]}>
                <Txt v="cap" style={{ textAlign: "center" }}>
                  Llegaste al tope: {TOPE_VIAJES} viajes en curso. Entregá alguno y se te libera un lugar.
                  {enviosEnCurso > 0 ? " El tope cuenta los pedidos y los envíos juntos." : ""}
                </Txt>
              </View>
            ) : (
              <Txt v="cap" style={{ marginBottom: espacio.md }}>
                {viajes.length + enviosEnCurso > 0
                  ? `Te ${lugares === 1 ? "queda" : "quedan"} ${lugares} ${lugares === 1 ? "lugar" : "lugares"} de ${TOPE_VIAJES}. Si alguno te queda de paso, levantalo.`
                  : "Los pedidos que los locales ya terminaron y todavía no levantó nadie."}
              </Txt>
            )}

            {disponibles.length === 0 ? (
              <EstadoVacio
                titulo="No hay nada para llevar"
                sub="Cuando un local termine un pedido va a aparecer acá solo. No hace falta que recargues."
                icono="Restaurante"
              />
            ) : (
              <View style={{ gap: espacio.md }}>
                {disponibles.map((p) => (
                  <View key={p.id} style={e.tarjeta}>
                    <Encabezado p={p} derecha={formatPrecio(p.costo_envio)} />
                    <Direccion rotulo="Retirás en" texto={p.comercios?.direccion} />
                    <Direccion rotulo="Entregás en" texto={p.direccion} />
                    {p.propina > 0 && (
                      <View style={[e.aviso, { backgroundColor: color.brandWash, marginTop: espacio.md }]}>
                        <Txt v="cap" style={{ color: color.brandInk }}>
                          Dejó {formatPrecio(p.propina)} de propina
                        </Txt>
                      </View>
                    )}
                    {/* Con el tope lleno se ve igual, pero sin el botón: la base
                        lo rechazaría y un botón que siempre falla enseña a no
                        tocarlo. */}
                    {lugares > 0 && (
                      <View style={{ marginTop: espacio.md }}>
                        <Boton
                          onPress={() =>
                            conRefresco(p.id, async () => {
                              const r = await tomarPedido(p.id);
                              if (r.ok) setPestana("curso");
                              return r;
                            })
                          }
                          cargando={trabajando === p.id}
                        >
                          Tomar este pedido
                        </Boton>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ------------------------------ historial ------------------------- */}
        {pestana === "historial" &&
          (entregados.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no entregaste pedidos"
              sub="Los pedidos de locales que entregues van a quedar guardados acá. Lo que ganaste está en tu perfil."
              icono="Restaurante"
            />
          ) : (
            <>
              <Txt v="cap" style={{ marginBottom: espacio.md }}>
                {entregados.length === 1 ? "Tu última entrega de delivery" : `Tus últimas ${entregados.length} entregas de delivery`}. Lo que ganaste está en tu perfil.
              </Txt>
              <View style={{ gap: espacio.md }}>
                {entregados.map((p) => (
                  <TarjetaHistorial key={p.id} p={p} />
                ))}
              </View>
            </>
          ))}
      </ScrollView>
    </View>
  );
}

/* --------------------------------- partes -------------------------------- */

function Encabezado({ p, derecha }: { p: PedidoParaRepartir; derecha: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
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
        <Txt v="cap">{esperando(p.listo_en)}</Txt>
      </View>
      <Txt v="price">{derecha}</Txt>
    </View>
  );
}

/**
 * Una dirección del viaje.
 *
 * Dice "Dirección:" con todas las letras y es tocable entera: el objetivo es
 * que un repartidor con el casco puesto toque una vez y le abra el mapa, no que
 * seleccione un texto para copiarlo.
 */
function Direccion({
  rotulo,
  texto,
  actual,
  hecho,
}: {
  rotulo: string;
  texto?: string | null;
  actual?: boolean;
  hecho?: boolean;
}) {
  const valor = (texto ?? "").trim();
  const hay = valor.length > 0;

  return (
    <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.md }}>
      <View style={{ alignItems: "center", paddingTop: 6 }}>
        <View style={[e.punto, hecho ? e.puntoHecho : actual ? e.puntoActual : e.puntoFuturo]} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="cap" style={{ color: actual ? color.brandInk : color.n600 }}>
          {rotulo}
        </Txt>
        {hay ? (
          <Tocable onPress={() => abrirEnMapa(valor)}>
            <View style={e.direccion}>
              <View style={{ flex: 1 }}>
                <Txt v="body" numberOfLines={2}>
                  Dirección: {valor}
                </Txt>
              </View>
              <Txt v="cap" style={{ color: color.brandInk }}>
                Mapa →
              </Txt>
            </View>
          </Tocable>
        ) : (
          <Txt v="body" style={{ color: color.n600 }}>
            Dirección: sin cargar
          </Txt>
        )}
      </View>
    </View>
  );
}

function TarjetaViaje({
  p,
  ocupado,
  alChat,
  alSoltar,
  alAvanzar,
}: {
  p: PedidoParaRepartir;
  ocupado: boolean;
  alChat: () => void;
  alSoltar: () => void;
  alAvanzar: () => void;
}) {
  const retirado = p.estado === "En camino";
  const accion = accionDelRepartidor(p.estado);
  const [soltando, setSoltando] = useState(false);

  return (
    <View style={[e.tarjeta, retirado && e.tarjetaEnMano]}>
      <Encabezado p={p} derecha={formatPrecio(p.costo_envio)} />

      <Direccion
        rotulo={`Retirás en ${p.comercios?.nombre ?? "el local"}`}
        texto={p.comercios?.direccion}
        actual={!retirado}
        hecho={retirado}
      />
      <Direccion rotulo="Entregás al cliente" texto={p.direccion} actual={retirado} />

      {!!p.nota && (
        <View style={[e.aviso, { backgroundColor: color.brandWash, marginTop: espacio.md }]}>
          <Txt v="cap" style={{ color: color.brandInk }}>
            Nota del cliente: “{p.nota}”
          </Txt>
        </View>
      )}

      {/* Lo que tiene que cobrar —o no— en la puerta. Con Mercado Pago sin
          aprobar va en ámbar: no es un error, pero conviene mirarlo antes de
          entregar. */}
      {(() => {
        const pago = resumenDelPago(p);
        return (
          <View
            style={[
              e.aviso,
              { backgroundColor: pago.alerta ? color.warnWash : color.n100, marginTop: espacio.md },
            ]}
          >
            <Txt v="cap" style={pago.alerta ? { color: color.warn } : undefined}>
              {pago.enPuerta && p.metodo_pago === "efectivo"
                ? `Cobrás ${formatPrecio(p.total)} en efectivo${
                    p.vuelto != null && p.vuelto > 0 ? ` · llevá ${formatPrecio(p.vuelto)} de vuelto` : ""
                  }.`
                : pago.enPuerta
                  ? `Cobrás ${formatPrecio(p.total)} · ${pago.texto}`
                  : pago.texto}
            </Txt>
          </View>
        );
      })()}

      {p.propina > 0 && (
        <View style={[e.aviso, { backgroundColor: color.brandWash, marginTop: espacio.md }]}>
          <Txt v="cap" style={{ color: color.brandInk }}>
            {formatPrecio(p.propina)} de propina, entera para vos.
          </Txt>
        </View>
      )}

      <AccionesViaje
        paso={
          retirado
            ? { actual: 2, total: 2, texto: "llevalo al cliente" }
            : { actual: 1, total: 2, texto: `retiralo en ${p.comercios?.nombre ?? "el local"}` }
        }
        accion={
          accion
            ? {
                texto: retirado ? "Ya entregué el pedido" : "Ya retiré el pedido",
                detalle: retirado ? `en ${p.direccion}` : `en ${p.comercios?.nombre ?? "el local"}`,
                onPress: alAvanzar,
                cargando: ocupado,
              }
            : undefined
        }
        onChat={alChat}
        // Soltar sólo antes de retirar: con la comida en la mochila no hay
        // botón que arregle devolverla, eso se habla por el chat.
        soltar={!retirado ? { texto: "No lo puedo llevar", onPress: () => setSoltando(true) } : undefined}
      />

      <Dialogo
        visible={soltando}
        titulo="¿Dejás este pedido?"
        onCerrar={() => setSoltando(false)}
        cancelar="Lo llevo"
        confirmar={{
          texto: "Sí, dejarlo",
          onPress: () => {
            setSoltando(false);
            alSoltar();
          },
        }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm, color: color.n600 }}>
          Vuelve a la lista de disponibles para que lo tome otro repartidor.
        </Txt>
      </Dialogo>
    </View>
  );
}

/**
 * Una entrega ya hecha. Viene de la vieja pestaña "Entregas".
 *
 * Cada renglón dice cuánto salió el envío, si dejó propina y cómo se pagó. "Sin
 * propina" se escribe en vez de dejar el lugar vacío: un renglón en blanco se
 * lee como un error de la app, no como un cliente que no dejó nada.
 */
function TarjetaHistorial({ p }: { p: PedidoParaRepartir }) {
  return (
    <View style={e.historial}>
      <ImagenSmart
        uri={p.comercios?.logo_url}
        categoria={p.comercios?.categoria ?? "Todos"}
        style={e.logoChico}
        iconoSize={18}
      />
      <View style={{ flex: 1 }}>
        <Txt v="label" numberOfLines={1}>
          {p.comercios?.nombre ?? "Local"}
        </Txt>
        <Txt v="cap" numberOfLines={1}>
          {fechaCorta(p.entregado_en ?? p.creado_en)} · {p.direccion}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          <View style={e.pill}>
            <Txt v="cap" style={{ fontSize: 11 }}>Envío {formatPrecio(p.costo_envio)}</Txt>
          </View>
          <View style={[e.pill, p.propina > 0 && { backgroundColor: color.brandWash }]}>
            <Txt v="cap" style={{ fontSize: 11, color: p.propina > 0 ? color.brandInk : color.n600 }}>
              {p.propina > 0 ? `Propina ${formatPrecio(p.propina)}` : "Sin propina"}
            </Txt>
          </View>
          <View style={e.pill}>
            <Txt v="cap" style={{ fontSize: 11 }}>
              {seCobroEnEfectivo(p.metodo_pago) ? "Cobrado en mano" : p.pago_label}
            </Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

/** "Listo hace 6 min". Es la señal de cuál agarrar primero. */
function esperando(listoEn: string | null): string {
  if (!listoEn) return "Listo para retirar";
  const min = Math.max(0, Math.round((Date.now() - new Date(listoEn).getTime()) / 60000));
  if (min < 1) return "Listo recién";
  if (min === 1) return "Listo hace 1 min";
  return `Listo hace ${min} min`;
}

const e = StyleSheet.create({
  tarjeta: { backgroundColor: color.white, borderRadius: radio.md, padding: espacio.lg, ...sombras.sm },
  tarjetaEnMano: { borderWidth: 2, borderColor: color.brand },
  historial: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    ...sombras.sm,
  },
  logoChico: { width: 34, height: 34, borderRadius: radio.sm, overflow: "hidden" },
  pill: { backgroundColor: color.n50, borderRadius: radio.pill, paddingHorizontal: espacio.sm, paddingVertical: 3 },
  logo: { width: 40, height: 40, borderRadius: radio.sm, overflow: "hidden" },
  aviso: { padding: espacio.md, borderRadius: radio.sm },
  direccion: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    backgroundColor: color.n50,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: 10,
    marginTop: 2,
  },
  punto: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
  puntoActual: { backgroundColor: color.brand, borderColor: color.brandInk },
  puntoHecho: { backgroundColor: color.n200, borderColor: color.n200 },
  puntoFuturo: { backgroundColor: color.white, borderColor: color.n200 },
});
