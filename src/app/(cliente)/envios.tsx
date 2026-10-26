/**
 * Envíos del cliente: mandar algo de un punto a otro.
 *
 * Es un servicio distinto del delivery y por eso tiene pestaña propia, otro
 * color y otro vocabulario: acá no hay "local", hay **retiro** y **entrega**.
 * Comparten la tabla `pedidos` en la base porque para el repartidor son el
 * mismo trabajo, pero para el cliente son dos cosas y mezclarlas en "Tus
 * pedidos" habría sido ahorrarnos una pestaña a costa de que no se entienda
 * ninguna de las dos.
 *
 * El violeta es la señal. No aparece en ningún otro lado de la app, así que
 * verlo ya es saber de qué se trata antes de leer una palabra.
 *
 * "Nuevo envío" va fijo abajo, como la barra de "Ver carrito", pero a
 * diferencia de ésa no desaparece nunca: el carrito se muestra cuando hay algo
 * adentro, y acá la acción principal de la pantalla es siempre la misma. Si se
 * fuera con el scroll, alguien con diez envíos en el historial tendría que
 * subir hasta arriba para pedir el once.
 *
 * Activos / Historial copian a "Tus pedidos" a propósito: son dos pestañas del
 * mismo cliente y se tienen que manejar igual.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Chip, Dialogo, EstadoVacio, Txt } from "../../componentes/base";
import { AvisoEstado } from "../../componentes/AvisoEstado";
import { ParadasEnvio, ProgresoEnvio, SelloEnvio, TONO_ENVIO } from "../../componentes/Envio";
import { useSesion } from "../../contextos/Sesion";
import { cancelarEnvio, misEnvios, quienRecibe, type Envio } from "../../lib/envios";
import { fechaCorta, formatPrecio } from "../../lib/precios";
import { supabase } from "../../lib/supabase";
import { color, espacio, radio, sombras } from "../../theme/tokens";

export default function Envios() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSesion();

  const [envios, setEnvios] = useState<Envio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [cancelando, setCancelando] = useState<Envio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"activos" | "historial">("activos");

  const traer = useCallback(async () => {
    if (!session?.user?.id) {
      setEnvios([]);
      setCargando(false);
      return;
    }
    setEnvios(await misEnvios());
    setCargando(false);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  /*
    En vivo: cuando un repartidor toma el envío, lo retira o lo entrega, el
    mensaje de estado de la tarjeta cambia solo, sin tener que tirar para
    actualizar. Es lo que hace que esperar no sea mirar una pantalla quieta.
  */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const canal = supabase
      .channel("mis-envios")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: `cliente_id=eq.${uid}` }, () => traer())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [session?.user?.id, traer]);

  async function confirmarCancelar() {
    if (!cancelando) return;
    const r = await cancelarEnvio(cancelando.id);
    setCancelando(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    traer();
  }

  const activos = envios.filter((e) => e.estado === "Pendiente" || e.estado === "En camino");
  const cerrados = envios.filter((e) => e.estado === "Entregado" || e.estado === "Rechazado");
  const lista = filtro === "activos" ? activos : cerrados;

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      {/* El header es violeta, no negro: es la marca del servicio. */}
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Txt v="display" style={{ color: color.white, fontSize: 26 }}>
          Enviar artículo
        </Txt>
        <Txt v="cap" style={{ color: "#C7C7C3", marginTop: 4 }}>
          Un repartidor retira algo en una dirección y lo lleva a otra. No hace falta que sea de
          ningún local.
        </Txt>
      </View>

      <ScrollView
        // Lugar abajo para que la barra fija no tape la última tarjeta.
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: 110 }}
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
        {!session ? (
          <View style={e.tarjeta}>
            <Txt v="head">Para pedir un envío hace falta cuenta</Txt>
            <Txt v="cap" style={{ marginTop: 4 }}>
              Es la misma cuenta con la que pedís comida. Sin ella no hay a quién avisarle cuando el
              repartidor llegue.
            </Txt>
            <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
              <Boton onPress={() => router.push("/bienvenida")}>Crear mi cuenta</Boton>
            </View>
          </View>
        ) : cargando ? (
          <View style={{ gap: espacio.md }}>
            {[0, 1].map((i) => (
              <View key={i} style={{ height: 150, borderRadius: radio.md, backgroundColor: color.n100 }} />
            ))}
          </View>
        ) : envios.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no mandaste nada"
            sub="Sirve para las llaves que te olvidaste, el regalo que no llegaste a entregar o los papeles que tenés que mandar a la otra punta."
            icono="Todos"
          />
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: espacio.sm, marginBottom: espacio.lg }}>
              <Chip activo={filtro === "activos"} onPress={() => setFiltro("activos")}>
                {`Activos (${activos.length})`}
              </Chip>
              <Chip activo={filtro === "historial"} onPress={() => setFiltro("historial")}>
                {`Historial (${cerrados.length})`}
              </Chip>
            </View>

            {lista.length === 0 ? (
              <EstadoVacio
                titulo={filtro === "activos" ? "Nada en camino" : "Historial vacío"}
                sub={
                  filtro === "activos"
                    ? "Cuando pidas un envío lo vas a poder seguir desde acá."
                    : "Los envíos entregados o cancelados van a quedar guardados acá."
                }
                icono="Todos"
              />
            ) : (
              <View style={{ gap: espacio.md }}>
                {lista.map((en) =>
                  filtro === "activos" ? (
                    <TarjetaEnvio
                      key={en.id}
                      envio={en}
                      onChat={() => router.push({ pathname: "/chat", params: { id: en.id } })}
                      onCancelar={() => setCancelando(en)}
                    />
                  ) : (
                    <TarjetaEnvio key={en.id} envio={en} />
                  )
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Fija, siempre. Ver el comentario de arriba. */}
      <View style={[e.barra, { bottom: espacio.md }]}>
        <Boton onPress={() => router.push("/(cliente)/envio-nuevo")} style={e.cta} textStyle={{ color: color.white }}>
          Nuevo envío
        </Boton>
      </View>

      <Dialogo
        visible={!!cancelando}
        titulo="¿Cancelar el envío?"
        onCerrar={() => setCancelando(null)}
        cancelar="No, dejalo"
        confirmar={{ texto: "Sí, cancelar", onPress: confirmarCancelar }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Todavía no lo tomó ningún repartidor, así que se puede cancelar sin costo.
        </Txt>
      </Dialogo>

      <Dialogo
        visible={!!error}
        titulo="No se pudo cancelar"
        onCerrar={() => setError(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setError(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {error}
        </Txt>
      </Dialogo>
    </View>
  );
}

function TarjetaEnvio({
  envio,
  onChat,
  onCancelar,
}: {
  envio: Envio;
  onChat?: () => void;
  onCancelar?: () => void;
}) {
  const cancelado = envio.estado === "Rechazado";
  const recibe = quienRecibe(envio);

  return (
    <View style={e.tarjeta}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.sm }}>
        <SelloEnvio tono={TONO_ENVIO.cliente} />
        <Txt v="cap" style={{ flex: 1 }} numberOfLines={1}>
          {fechaCorta(envio.creado_en)}
        </Txt>
        <Txt v="price">{formatPrecio(envio.total)}</Txt>
      </View>

      {!cancelado && <EstadoEnvio envio={envio} />}

      {cancelado ? (
        <View style={[e.cancelado, { marginTop: espacio.md }]}>
          <Txt v="label" style={{ color: color.danger }}>
            Cancelado
          </Txt>
          <Txt v="cap" style={{ color: color.danger, marginTop: 2 }}>
            {envio.motivo_rechazo || "No se llegó a hacer."}
          </Txt>
        </View>
      ) : (
        <View style={{ marginTop: espacio.md }}>
          <ProgresoEnvio estado={envio.estado} tono={TONO_ENVIO.cliente} />
        </View>
      )}

      <View style={{ marginTop: espacio.lg }}>
        <ParadasEnvio
          tono={TONO_ENVIO.cliente}
          retiro={envio.retiro_direccion ?? ""}
          entrega={envio.direccion}
        />
      </View>

      {!!recibe && (
        <View style={e.nota}>
          <Txt v="cap" style={{ color: color.brandInk }}>
            {recibe.rotulo}: <Txt v="cap" style={{ color: color.brandInk, fontWeight: "700" }}>{recibe.texto}</Txt>
          </Txt>
        </View>
      )}

      {/* Lo que paga: el mismo resumen que en un pedido, sin "Productos". */}
      <View style={e.detalle}>
        <FilaPago etiqueta="Envío" valor={formatPrecio(envio.costo_envio)} />
        <FilaPago etiqueta="Tarifa de servicio" valor={formatPrecio(envio.tarifa_servicio)} />
        {envio.propina > 0 && <FilaPago etiqueta="Propina al repartidor" valor={formatPrecio(envio.propina)} />}
        <View style={e.totalFila}>
          <Txt v="label">Total</Txt>
          <Txt v="price">{formatPrecio(envio.total)}</Txt>
        </View>
        <Txt v="cap" style={{ marginTop: 2 }}>
          {envio.pago_label}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
        {!!onCancelar && envio.estado === "Pendiente" && !envio.repartidor_id && (
          <Boton variante="peligro" onPress={onCancelar}>
            Cancelar
          </Boton>
        )}
        {!!onChat && (
          <Boton variante="fantasma" onPress={onChat}>
            Chat de entrega
          </Boton>
        )}
      </View>

    </View>
  );
}

/**
 * El mensaje de "qué está pasando", arriba de la tarjeta. Mientras se espera
 * (buscando repartidor, yendo a retirar, en camino) el punto late: le dice a
 * la persona que la app está trabajando y no colgada. Entregado no late.
 */
function mensajeDeEstado(envio: Envio): { titulo: string; detalle: string; esperando: boolean } {
  if (envio.estado === "Pendiente" && !envio.repartidor_id)
    return {
      titulo: "Estamos buscando un repartidor",
      detalle: "Te avisamos acá apenas alguien lo tome. Mientras tanto lo podés cancelar sin costo.",
      esperando: true,
    };
  if (envio.estado === "Pendiente")
    return {
      titulo: "El repartidor está en camino a retirar tu envío",
      detalle: `Ya lo tomó y está yendo a ${envio.retiro_direccion || "la dirección de retiro"}.`,
      esperando: true,
    };
  if (envio.estado === "En camino")
    return {
      titulo: "Tu envío está en camino",
      detalle: `El repartidor ya lo retiró y lo lleva a ${envio.direccion}.`,
      esperando: true,
    };
  return { titulo: "Entregado", detalle: "El repartidor lo dejó en destino.", esperando: false };
}

function EstadoEnvio({ envio }: { envio: Envio }) {
  return <AvisoEstado {...mensajeDeEstado(envio)} />;
}

function FilaPago({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: espacio.sm }}>
      <Txt v="cap">{etiqueta}</Txt>
      <Txt v="cap" style={{ color: color.n900 }}>
        {valor}
      </Txt>
    </View>
  );
}

const e = StyleSheet.create({
  detalle: { marginTop: espacio.md, backgroundColor: color.n50, borderRadius: radio.sm, padding: espacio.md, gap: 4 },
  totalFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: 1,
    borderTopColor: color.n200,
    marginTop: 6,
    paddingTop: 8,
  },
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  barra: { position: "absolute", left: espacio.lg, right: espacio.lg, flexDirection: "row" },
  cta: { backgroundColor: color.ink, shadowColor: color.ink },
  tarjeta: { backgroundColor: color.white, borderRadius: radio.md, padding: espacio.lg, ...sombras.sm },
  nota: {
    backgroundColor: color.brandWash,
    borderRadius: radio.sm,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  cancelado: { backgroundColor: color.dangerWash, borderRadius: radio.sm, padding: espacio.md },
});
