/**
 * Envíos, del lado del repartidor.
 *
 * Pestaña aparte de "Delivery" porque es OTRO trabajo, no otra vista del mismo.
 * Un pedido de local sale de una cocina que ya lo tiene listo; un envío sale de
 * la casa de alguien que lo está esperando en la puerta, las dos direcciones
 * las escribió un vecino y no hay nadie en el medio que confirme nada. Mezclar
 * los dos en una lista es cómo alguien termina yendo a buscar una hamburguesa a
 * un departamento.
 *
 * Todo lo violeta de esta pantalla es eso: la señal de que no es un pedido.
 *
 * EL TOPE ES COMPARTIDO
 *
 * Los tres viajes a la vez cuentan pedidos **y** envíos juntos: la moto es una
 * sola. Por eso el cartel de arriba dice el total y no "3 envíos más".
 *
 * Las mismas tres pestañas que Delivery —En espera, En curso, Historial— con el
 * violeta en la activa. Ver `PestanasRepartidor`.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Dialogo, EstadoVacio, Txt } from "../../componentes/base";
import { IconoEnvio, ParadasEnvio, SelloEnvio } from "../../componentes/Envio";
import {
  EncabezadoRepartidor,
  PestanasRepartidor,
  textoDeViajes,
  type PestanaRepartidor,
} from "../../componentes/EncabezadoRepartidor";
import { useSesion } from "../../contextos/Sesion";
import {
  accionDelEnvio,
  enviosDisponibles,
  misEnviosEnCurso,
  quienRecibe,
  type Envio,
} from "../../lib/envios";
import { cambiarEstado, resumenDelPago } from "../../lib/pedidos";
import { fechaCorta, formatPrecio } from "../../lib/precios";
import { AccionesViaje } from "../../componentes/AccionesViaje";
import { misEntregas, misRepartos, seCobroEnEfectivo, soltarPedido, tomarPedido, TOPE_VIAJES } from "../../lib/repartos";
import { color, envioColor, espacio, radio, sombras } from "../../theme/tokens";

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

export default function EnviosRepartidor() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSesion();
  const miId = session?.user?.id;

  const [mios, setMios] = useState<Envio[]>([]);
  const [bolsa, setBolsa] = useState<Envio[]>([]);
  const [entregados, setEntregados] = useState<Envio[]>([]);
  const [pestana, setPestana] = useState<PestanaRepartidor | null>(null);
  const [pedidosEnMano, setPedidosEnMano] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soltando, setSoltando] = useState<Envio | null>(null);

  const traer = useCallback(async () => {
    if (!miId) return;
    // Los pedidos de locales se cuentan para el tope, aunque no se muestren acá.
    const [m, b, p, h] = await Promise.all([
      misEnviosEnCurso(miId),
      enviosDisponibles(),
      misRepartos(miId),
      misEntregas(miId, "envio"),
    ]);
    setMios(m);
    setBolsa(b);
    setPedidosEnMano(p.length);
    setEntregados(h);
    setPestana((x) => x ?? (m.length > 0 ? "curso" : "espera"));
    setCargando(false);
  }, [miId]);

  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  const enCurso = mios.length + pedidosEnMano;
  const hayLugar = enCurso < TOPE_VIAJES;

  async function tomar(e: Envio) {
    setTrabajando(e.id);
    const r = await tomarPedido(e.id);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.mensaje);
      traer();
      return;
    }
    setPestana("curso");
    traer();
  }

  async function avanzar(e: Envio) {
    const accion = accionDelEnvio(e);
    if (!accion) return;
    setTrabajando(e.id);
    const r = await cambiarEstado(e.id, accion.estado);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    traer();
  }

  async function confirmarSoltar() {
    if (!soltando) return;
    const id = soltando.id;
    setSoltando(null);
    setTrabajando(id);
    const r = await soltarPedido(id);
    setTrabajando(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    traer();
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <EncabezadoRepartidor
        icono={<IconoEnvio size={26} color={color.white} />}
        titulo="Envíos"
        bajada="No son de locales: alguien manda algo de una dirección a otra. Retirás donde te dicen y lo llevás."
        pastilla={textoDeViajes(mios.length, pedidosEnMano, TOPE_VIAJES, "pedido")}
        fondo={envioColor.bg}
        tintaBajada="#CFC9F5"
      />

      <PestanasRepartidor
        activa={pestana ?? "espera"}
        onCambiar={setPestana}
        cuentas={{ espera: bolsa.length, curso: mios.length }}
        tinta={envioColor.bg}
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
            tintColor={envioColor.fg}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {cargando ? (
          <View style={{ gap: espacio.md }}>
            {[0, 1].map((i) => (
              <View key={i} style={{ height: 180, borderRadius: radio.md, backgroundColor: color.n100 }} />
            ))}
          </View>
        ) : pestana === "curso" ? (
          mios.length === 0 ? (
            <EstadoVacio
              titulo="No tenés envíos en curso"
              sub={
                bolsa.length > 0
                  ? `${bolsa.length === 1 ? "Hay 1 envío esperando" : `Hay ${bolsa.length} envíos esperando`} en "En espera".`
                  : "Cuando tomes un envío lo vas a ver acá, con las dos direcciones y el chat."
              }
              icono="Todos"
            />
          ) : (
            <View style={{ gap: espacio.md }}>
              {mios.map((en) => (
                <Tarjeta
                  key={en.id}
                  envio={en}
                  trabajando={trabajando === en.id}
                  onChat={() => router.push({ pathname: "/chat", params: { id: en.id } })}
                  onAccion={() => avanzar(en)}
                  onSoltar={en.estado === "Pendiente" ? () => setSoltando(en) : undefined}
                />
              ))}
            </View>
          )
        ) : pestana === "historial" ? (
          entregados.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no entregaste envíos"
              sub="Los envíos que entregues van a quedar guardados acá. Lo que ganaste está en tu perfil."
              icono="Todos"
            />
          ) : (
            <>
              <Txt v="cap" style={{ marginBottom: espacio.md }}>
                {entregados.length === 1 ? "Tu último envío entregado" : `Tus últimos ${entregados.length} envíos entregados`}. Lo que ganaste está en tu perfil.
              </Txt>
              <View style={{ gap: espacio.md }}>
                {entregados.map((en) => (
                  <Hecho key={en.id} envio={en} />
                ))}
              </View>
            </>
          )
        ) : (
          <>
            {!hayLugar && (
              <View style={[e.aviso, { backgroundColor: color.warnWash, marginBottom: espacio.md }]}>
                <Txt v="label" style={{ color: color.warn }}>
                  Tenés {TOPE_VIAJES} viajes en curso
                </Txt>
                <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
                  Entregá alguno y podés tomar otro. El tope cuenta los pedidos de locales y los
                  envíos juntos: la moto es una sola.
                </Txt>
              </View>
            )}
            {bolsa.length === 0 ? (
              <EstadoVacio
                titulo="No hay envíos ahora"
                sub="Cuando alguien pida uno va a aparecer acá solo, no hace falta que recargues."
                icono="Todos"
              />
            ) : (
              <View style={{ gap: espacio.md }}>
                {bolsa.map((en) => (
                  <Tarjeta
                    key={en.id}
                    envio={en}
                    trabajando={trabajando === en.id}
                    onTomar={hayLugar ? () => tomar(en) : undefined}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Dialogo
        visible={!!soltando}
        titulo="¿Soltar este envío?"
        onCerrar={() => setSoltando(null)}
        cancelar="No"
        confirmar={{ texto: "Soltarlo", onPress: confirmarSoltar }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Vuelve a la lista para que lo tome otro. Se puede hasta que lo retirás, no después.
        </Txt>
      </Dialogo>

      <Dialogo
        visible={!!error}
        titulo="No se pudo"
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

function Tarjeta({
  envio,
  trabajando,
  onTomar,
  onAccion,
  onChat,
  onSoltar,
}: {
  envio: Envio;
  trabajando?: boolean;
  onTomar?: () => void;
  onAccion?: () => void;
  onChat?: () => void;
  onSoltar?: () => void;
}) {
  const accion = accionDelEnvio(envio);
  const pago = resumenDelPago(envio);
  const recibe = quienRecibe(envio);

  return (
    <View style={e.tarjeta}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.sm }}>
        <SelloEnvio />
        <Txt v="cap" style={{ flex: 1 }} numberOfLines={1}>
          {fechaCorta(envio.creado_en)}
        </Txt>
        {envio.estado === "En camino" && (
          <View style={e.chipEstado}>
            <Txt v="cap" style={{ color: envioColor.fg, fontSize: 11 }}>
              En camino
            </Txt>
          </View>
        )}
      </View>

      <View style={{ marginTop: espacio.lg }}>
        <ParadasEnvio
          retiro={envio.retiro_direccion ?? ""}
          entrega={envio.direccion}
          onMapaRetiro={() => abrirEnMapa(envio.retiro_direccion ?? "")}
          onMapaEntrega={() => abrirEnMapa(envio.direccion)}
        />
      </View>

      {!!recibe && (
        <View style={e.nota}>
          <Txt v="micro" style={{ color: envioColor.fg, fontSize: 10 }}>
            {recibe.rotulo}
          </Txt>
          <Txt v="label" style={{ color: envioColor.fg, marginTop: 2 }}>
            {recibe.texto}
          </Txt>
        </View>
      )}

      {/* La plata: lo que cobra en la puerta y lo que es suyo. */}
      <View style={e.plata}>
        <View style={{ flex: 1 }}>
          <Txt v="cap" style={[{ fontSize: 11 }, pago.alerta && { color: color.warn }]}>
            {pago.enPuerta ? "Cobrás en mano" : pago.texto}
          </Txt>
          <Txt v="head" style={{ marginTop: 2 }}>
            {pago.enPuerta ? formatPrecio(envio.total) : pago.alerta ? "Todavía no pagó" : "Ya está pago"}
          </Txt>
        </View>
        {envio.propina > 0 && (
          <View style={e.chipPropina}>
            <Txt v="cap" style={{ color: envioColor.fg, fontSize: 11 }}>
              Propina {formatPrecio(envio.propina)}
            </Txt>
          </View>
        )}
      </View>

      {!!onTomar ? (
        <View style={{ flexDirection: "row", marginTop: espacio.md }}>
          <Boton onPress={onTomar} cargando={trabajando} style={e.cta} textStyle={{ color: color.white }}>
            Tomar este envío
          </Boton>
        </View>
      ) : (
        <AccionesViaje
          paso={
            onAccion && accion
              ? envio.estado === "En camino"
                ? { actual: 2, total: 2, texto: "llevalo a destino" }
                : { actual: 1, total: 2, texto: "retiralo en la dirección de retiro" }
              : undefined
          }
          accion={
            onAccion && accion
              ? {
                  texto: envio.estado === "En camino" ? "Ya entregué el paquete" : "Ya retiré el paquete",
                  detalle:
                    envio.estado === "En camino"
                      ? `${recibe ? `a ${recibe.texto} · ` : ""}en ${envio.direccion}`
                      : `en ${envio.retiro_direccion ?? "el retiro"}`,
                  onPress: onAccion,
                  cargando: trabajando,
                }
              : undefined
          }
          onChat={onChat}
          soltar={onSoltar ? { texto: "No lo puedo llevar", onPress: onSoltar } : undefined}
          estiloAccion={{ fondo: envioColor.bg, tinta: color.white }}
        />
      )}
    </View>
  );
}

/** Un envío ya entregado: de dónde a dónde, cuándo, y la plata. */
function Hecho({ envio }: { envio: Envio }) {
  return (
    <View style={[e.tarjeta, { padding: espacio.md }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.sm }}>
        <SelloEnvio />
        <Txt v="cap" style={{ flex: 1 }} numberOfLines={1}>
          {fechaCorta(envio.entregado_en ?? envio.creado_en)}
        </Txt>
      </View>
      <Txt v="cap" style={{ marginTop: espacio.sm }} numberOfLines={1}>
        De {envio.retiro_direccion ?? "—"}
      </Txt>
      <Txt v="cap" numberOfLines={1}>
        A {envio.direccion}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: espacio.sm }}>
        <View style={e.pill}>
          <Txt v="cap" style={{ fontSize: 11 }}>Envío {formatPrecio(envio.costo_envio)}</Txt>
        </View>
        <View style={[e.pill, envio.propina > 0 && { backgroundColor: envioColor.wash }]}>
          <Txt v="cap" style={{ fontSize: 11, color: envio.propina > 0 ? envioColor.fg : color.n600 }}>
            {envio.propina > 0 ? `Propina ${formatPrecio(envio.propina)}` : "Sin propina"}
          </Txt>
        </View>
        <View style={e.pill}>
          <Txt v="cap" style={{ fontSize: 11 }}>
            {seCobroEnEfectivo(envio.metodo_pago) ? "Cobrado en mano" : envio.pago_label}
          </Txt>
        </View>
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  pill: { backgroundColor: color.n50, borderRadius: radio.pill, paddingHorizontal: espacio.sm, paddingVertical: 3 },
  tarjeta: {
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.lg,
    borderLeftWidth: 4,
    borderLeftColor: envioColor.bg,
    ...sombras.sm,
  },
  nota: {
    backgroundColor: envioColor.wash,
    borderRadius: radio.sm,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  plata: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: color.n200,
    marginTop: espacio.md,
    paddingTop: espacio.md,
  },
  chipEstado: {
    backgroundColor: envioColor.wash,
    borderRadius: radio.pill,
    paddingHorizontal: espacio.sm,
    paddingVertical: 3,
  },
  chipPropina: {
    backgroundColor: envioColor.wash,
    borderRadius: radio.pill,
    paddingHorizontal: espacio.md,
    paddingVertical: 4,
  },
  aviso: { padding: espacio.md, borderRadius: radio.sm },
  cta: { backgroundColor: envioColor.bg, shadowColor: envioColor.bg },
});
