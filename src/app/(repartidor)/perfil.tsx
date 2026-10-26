/**
 * El perfil del repartidor.
 *
 * Sigue la misma lógica que el perfil del cliente y el "Mi local" del
 * comercio: una cabecera oscura con quién es, lo propio de su trabajo, y
 * después filas que abren cada cosa en su hoja.
 *
 *  - **Tu actividad**: cuánto hizo en el período que elija (Hoy / 7 días / 30
 *    días): entregas completadas, ingreso por envíos y propina, en una fila.
 *  - **Historial de entregas**: la lista completa, delivery y envíos juntos
 *    (`entregas.tsx`).
 *  - **Datos bancarios**: el CBU, CVU o alias donde Pedilo le transfiere su
 *    parte. Tabla propia (`repartidor_cobro`, migración 21) que sólo ve él.
 *  - **Ayuda**: preguntas frecuentes. "Tu cuenta la crea Pedilo", que era una
 *    tarjeta suelta, vive ahora acá.
 *
 * Las tres cifras van en una fila con divisores y los rótulos reservan dos
 * renglones (`minHeight`): "Entregas completadas" no entra en uno y los otros
 * dos sí, y sin esa reserva los números quedan a tres alturas distintas.
 *
 * El de envíos es SU PARTE, no lo que pagó el cliente: mostrar el envío bruto
 * prometería una plata que no le llega entera. El porcentaje va abajo para que
 * se pueda rehacer la cuenta.
 *
 * No hay liquidación ("saldo a pagar", "tenés que rendir"): la cuenta existe
 * en `resumen_repartidor`, pero sin una tabla de pagos los números sólo suben
 * y mienten apenas alguien paga algo. El efectivo se arregla entre personas.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Chip, Dialogo, Txt } from "../../componentes/base";
import { CamposCobro, Fila, Hoja, Preguntas } from "../../componentes/Filas";
import { IconoBanco, IconoChat, IconoReloj } from "../../componentes/Iconos";
import { useSesion } from "../../contextos/Sesion";
import { guardarCobro, leerDatosDeCobro, mostrarCuenta, nombreTipo, type DatosCobro } from "../../lib/cobro";
import { resumenRepartidor, type ResumenRepartidor } from "../../lib/repartos";
import { formatPrecio } from "../../lib/precios";
import { color, espacio, radio, sombras } from "../../theme/tokens";

const PERIODOS = [
  { label: "Hoy", dias: 1 },
  { label: "7 días", dias: 7 },
  { label: "30 días", dias: 30 },
] as const;

export default function PerfilRepartidor() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, perfil, cerrarSesion } = useSesion();
  const miId = session?.user?.id;

  const [periodo, setPeriodo] = useState<ResumenRepartidor | null>(null);
  const [dias, setDias] = useState<number>(1);

  const [hoja, setHoja] = useState<null | "cobro" | "ayuda">(null);
  const [saliendo, setSaliendo] = useState(false);

  const [cobro, setCobro] = useState<DatosCobro | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [titular, setTitular] = useState("");
  const [cuit, setCuit] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!miId) return;
      setPeriodo(null);
      resumenRepartidor(dias).then(setPeriodo);
    }, [miId, dias])
  );

  useFocusEffect(
    useCallback(() => {
      if (!miId) return;
      leerDatosDeCobro({ repartidor: miId }).then(setCobro);
    }, [miId])
  );

  function abrirCobro() {
    setCuenta(cobro ? cobro.valor : "");
    setTitular(cobro?.titular ?? perfil?.nombre?.trim() ?? "");
    setCuit(cobro?.cuit ?? "");
    setErrorCobro(null);
    setHoja("cobro");
  }

  async function guardar() {
    if (!miId || guardando) return;
    setGuardando(true);
    setErrorCobro(null);
    const r = await guardarCobro({ repartidor: miId }, { cuenta, titular, cuit });
    setGuardando(false);
    if (!r.ok) {
      setErrorCobro(r.mensaje);
      return;
    }
    setCobro(r.dato);
    setHoja(null);
    setMensaje("Listo: guardamos tus datos bancarios.");
  }

  const nombre = perfil?.nombre?.trim() || "Repartidor";
  const inicial = nombre.charAt(0).toUpperCase();
  const pct = periodo?.pct_envio;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.n50 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[e.header, { paddingTop: insets.top + espacio.xl }]}>
        <View style={e.avatar}>
          <Txt v="display" style={{ color: color.ink, fontSize: 26 }}>
            {inicial}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }} numberOfLines={1}>
            {nombre}
          </Txt>
          <Txt v="cap" style={{ color: "#C7C7C3" }} numberOfLines={1}>
            {perfil?.email ?? session?.user?.email ?? ""}
          </Txt>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ------------------------ tu actividad -------------------------- */}
        <Txt v="label" style={{ marginBottom: espacio.sm }}>
          Tu actividad
        </Txt>
        <View style={{ flexDirection: "row", gap: espacio.sm, marginBottom: espacio.md }}>
          {PERIODOS.map((p) => (
            <Chip key={p.label} activo={dias === p.dias} onPress={() => setDias(p.dias)}>
              {p.label}
            </Chip>
          ))}
        </View>

        <View style={e.resumen}>
          <Dato rotulo="Entregas completadas" valor={periodo == null ? "—" : String(periodo.entregas)} />
          <View style={e.divisor} />
          <Dato
            rotulo="Ingreso por envíos"
            valor={periodo == null ? "—" : formatPrecio(periodo.parte_envios)}
            pie={periodo ? `${periodo.pct_envio}% de ${formatPrecio(periodo.envios)}` : ""}
          />
          <View style={e.divisor} />
          <Dato
            rotulo="Propina"
            valor={periodo == null ? "—" : formatPrecio(periodo.propinas)}
            pie="Entera para vos"
            destacado
          />
        </View>

        <Txt v="cap" style={{ marginTop: espacio.sm, fontSize: 11 }}>
          Lo que ya cobraste en efectivo y lo que Pedilo te haya pagado se arregla aparte.
        </Txt>

        {!!mensaje && (
          <View style={e.aviso}>
            <Txt v="cap" style={{ color: color.brandInk }}>
              {mensaje}
            </Txt>
          </View>
        )}

        {/* ----------------------------- filas ----------------------------- */}
        <View style={{ marginTop: espacio.lg }}>
          <Fila
            icono={<IconoReloj size={20} color={color.n600} />}
            titulo="Historial de entregas"
            sub="Todo lo que llevaste, delivery y envíos"
            onPress={() => router.navigate("/(repartidor)/entregas")}
          />
          <Fila
            icono={<IconoBanco size={20} color={color.n600} />}
            titulo="Datos bancarios"
            sub={
              cobro
                ? `${nombreTipo(cobro.tipo)} ${mostrarCuenta(cobro)} · ${cobro.titular}`
                : "Sin cargar · cargalos para cobrar tu parte"
            }
            alerta={!cobro}
            onPress={abrirCobro}
          />
          <Fila
            icono={<IconoChat size={20} color={color.n600} />}
            titulo="Ayuda"
            sub="Cobros, efectivo, tu cuenta"
            onPress={() => setHoja("ayuda")}
          />
        </View>

        <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
          <Boton variante="fantasma" onPress={() => setSaliendo(true)} textStyle={{ color: color.danger }}>
            Cerrar sesión
          </Boton>
        </View>
      </ScrollView>

      {/* ============================ COBRO ================================ */}
      <Hoja visible={hoja === "cobro"} onCerrar={() => setHoja(null)} titulo="Datos bancarios">
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Es la cuenta donde Pedilo te transfiere tu parte de los envíos y las propinas. Sólo la ves vos y el
          equipo de Pedilo.
        </Txt>
        <CamposCobro
          cuenta={cuenta}
          titular={titular}
          cuit={cuit}
          onCuenta={(t) => {
            setCuenta(t);
            setErrorCobro(null);
          }}
          onTitular={setTitular}
          onCuit={setCuit}
        />
        {!!errorCobro && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {errorCobro}
            </Txt>
          </View>
        )}
        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardar} cargando={guardando}>
            Guardar
          </Boton>
        </View>
      </Hoja>

      {/* ============================= AYUDA =============================== */}
      <Hoja visible={hoja === "ayuda"} onCerrar={() => setHoja(null)} titulo="¿Necesitás una mano?">
        <Txt v="body" style={{ marginBottom: espacio.md }}>
          Escribinos y lo resolvemos. Mientras tanto, lo que más se pregunta:
        </Txt>
        <Preguntas
          items={[
            [
              "¿Cuánto me queda de cada entrega?",
              pct != null
                ? `El ${pct}% del costo de envío y la propina entera. Lo ves arriba, en "Tu actividad".`
                : 'Tu parte del costo de envío y la propina entera. Lo ves arriba, en "Tu actividad".',
            ],
            ["¿Cuándo cobro?", "Pedilo te transfiere a la cuenta de 'Datos bancarios'. Si no está cargada, no hay a dónde mandarlo."],
            ["Cobré en efectivo, ¿qué hago?", "Lo que cobraste en la puerta se arregla aparte con el equipo de Pedilo."],
            ["Tomé un pedido y no lo puedo llevar", "Escribile al equipo de Pedilo cuanto antes para que lo reasignemos."],
            [
              "Quiero cambiar mi mail o contraseña",
              "Tu cuenta la crea Pedilo: escribile al equipo. Desde la app no se puede, para que nadie se haga pasar por vos y se lleve un pedido.",
            ],
          ]}
        />
        <View style={{ flexDirection: "row", marginTop: espacio.sm }}>
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
          No te van a llegar pedidos nuevos hasta que vuelvas a entrar.
        </Txt>
      </Dialogo>
    </KeyboardAvoidingView>
  );
}

/** Una de las tres columnas del período. Ver el comentario de arriba. */
function Dato({
  rotulo,
  valor,
  pie,
  destacado,
}: {
  rotulo: string;
  valor: string;
  pie?: string;
  destacado?: boolean;
}) {
  return (
    <View style={{ flex: 1, paddingHorizontal: espacio.sm }}>
      <Txt v="cap" style={{ fontSize: 11, lineHeight: 15, minHeight: 30 }} numberOfLines={2}>
        {rotulo}
      </Txt>
      <Txt v="head" style={destacado ? { color: color.brandInk } : undefined} numberOfLines={1}>
        {valor}
      </Txt>
      <Txt v="cap" style={{ fontSize: 10, marginTop: 2, minHeight: 14 }} numberOfLines={1}>
        {pie ?? ""}
      </Txt>
    </View>
  );
}

const e = StyleSheet.create({
  resumen: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: color.white,
    borderRadius: radio.md,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.sm,
    ...sombras.sm,
  },
  divisor: { width: 1, alignSelf: "stretch", backgroundColor: color.n200 },
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
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md, backgroundColor: color.brandWash },
});
