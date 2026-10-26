/**
 * La ficha del local: lo que el cliente ve antes de entrar a la carta.
 *
 * Arriba de todo está el interruptor de abrir y cerrar, porque es lo único de
 * esta pantalla que se toca más de una vez por mes. Cerrar el local es una
 * decisión de las nueve de la noche cuando ya no dan las manos, y tiene que
 * estar a un tap de distancia, no al final de un formulario.
 *
 * Lo demás se completa una vez y se olvida, así que va en filas —como el
 * perfil del cliente— y cada una abre lo suyo:
 *
 *  - **Horarios de atención**: era un bloque de siete días abierto en el medio
 *    de la pantalla, con "Copiar a todos los días" al final, que es justo lo
 *    último que se ve cuando ya cargaste todo a mano. Ahora es una fila con el
 *    resumen ("Lun a Vie 09:00–23:00") y el editor se abre aparte, con el
 *    atajo de copiar ARRIBA, donde sirve.
 *  - **Datos de cobro**: el CBU, CVU o alias donde Pedilo le transfiere lo que
 *    vende. Vive en otra tabla (`comercio_cobro`) porque `comercios` la lee
 *    cualquiera.
 *  - **Ayuda**.
 *
 * La descripción del local se sacó: el marketplace ya no la muestra, y un
 * campo que se llena y no aparece en ningún lado es una tarea sin premio.
 *
 * El envío no aparece en ninguna forma. No es un campo que el local edite —lo
 * cobra Pedilo, que pone el repartidor— y tampoco es información que le sirva
 * acá: no le entra ni le sale un peso por eso, y un número ajeno en el medio de
 * su ficha sólo invita a preguntar por qué no lo puede tocar. Si algún día le
 * hace falta, el lugar es Ingresos, no esta pantalla.
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Dialogo, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import { EncabezadoComercio, RADIO_ENCABEZADO } from "../../componentes/EncabezadoComercio";
import {
  IconoBanco,
  IconoChat,
  IconoChevron,
  IconoCerrar,
  IconoLapiz,
  IconoPin,
  IconoReloj,
} from "../../componentes/Iconos";
import {
  guardarDatosDeCobro,
  leerCuenta,
  misDatosDeCobro,
  mostrarCuenta,
  nombreTipo,
  type DatosCobro,
} from "../../lib/cobro";
import { useSesion } from "../../contextos/Sesion";
import {
  elegirImagen,
  guardarComercio,
  guardarHorarios,
  horariosDelComercio,
  miComercio,
  normalizarHora,
  subirImagenDelLocal,
} from "../../lib/catalogo";
import { estadoApertura } from "../../lib/precios";
import type { Comercio, ComercioHorario } from "../../lib/tipos";
import { color, espacio, radio, sombras, texto } from "../../theme/tokens";

/**
 * Los días, en el orden en que la gente piensa la semana.
 *
 * `n` es el número que guarda Postgres y que usa `Date.getDay()`, donde el 0 es
 * el domingo. Se muestran de lunes a domingo igual: nadie planifica su semana
 * empezando por el domingo, y el orden de la base no tiene por qué ser el orden
 * de la pantalla.
 */
const DIAS = [
  { n: 1, nombre: "Lunes" },
  { n: 2, nombre: "Martes" },
  { n: 3, nombre: "Miércoles" },
  { n: 4, nombre: "Jueves" },
  { n: 5, nombre: "Viernes" },
  { n: 6, nombre: "Sábado" },
  { n: 0, nombre: "Domingo" },
] as const;

interface Tramo {
  abre: string;
  cierra: string;
}

interface DiaEditable {
  activo: boolean;
  /**
   * Uno o más rangos. Dos existen para el local que cierra al mediodía:
   * "09:00 a 13:00" y "17:00 a 23:00" son dos tramos del mismo día, no un
   * rango largo con un agujero. `estadoApertura` ya sabe leerlos —pregunta si
   * la hora cae en ALGUNO— así que acá sólo hace falta poder cargarlos.
   */
  tramos: Tramo[];
}

/** Más de tres tramos en un día es un local con un problema, no un horario. */
const MAX_TRAMOS = 3;

/** Un local nuevo arranca sin horario fijo: manda sólo el interruptor. */
function diasVacios(): Record<number, DiaEditable> {
  const r: Record<number, DiaEditable> = {};
  for (const d of DIAS) r[d.n] = { activo: false, tramos: [{ abre: "", cierra: "" }] };
  return r;
}

/** Arma el estado editable a partir de lo que está guardado. */
function diasDesdeFilas(filas: ComercioHorario[]): Record<number, DiaEditable> {
  const base = diasVacios();
  for (const h of [...filas].sort((a, b) => a.abre.localeCompare(b.abre))) {
    const dia = base[h.dia_semana];
    const tramo = { abre: h.abre.slice(0, 5), cierra: h.cierra.slice(0, 5) };
    if (!dia.activo) base[h.dia_semana] = { activo: true, tramos: [tramo] };
    else if (dia.tramos.length < MAX_TRAMOS) dia.tramos.push(tramo);
  }
  return base;
}

/**
 * "Lun a Vie 09:00–23:00 · Sáb 10:00–14:00 · Dom cerrado".
 *
 * Es lo que se lee en la fila sin abrir el editor. Los días seguidos con el
 * mismo horario se juntan, que es como lo diría una persona: nadie dice
 * "lunes de 9 a 23, martes de 9 a 23, miércoles de 9 a 23".
 */
function resumenHorarios(filas: ComercioHorario[]): string {
  if (filas.length === 0) return "Sin horario: abrís y cerrás con el interruptor";
  const dias = diasDesdeFilas(filas);
  const corto: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };
  const texto = (n: number) =>
    dias[n].activo ? dias[n].tramos.map((t) => `${t.abre}–${t.cierra}`).join(", ") : "cerrado";

  const grupos: { desde: number; hasta: number; txt: string }[] = [];
  for (const d of DIAS) {
    const t = texto(d.n);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.txt === t) ultimo.hasta = d.n;
    else grupos.push({ desde: d.n, hasta: d.n, txt: t });
  }
  return grupos
    .map((g) => `${corto[g.desde]}${g.desde !== g.hasta ? ` a ${corto[g.hasta]}` : ""} ${g.txt}`)
    .join(" · ");
}

export default function MiLocal() {
  const insets = useSafeAreaInsets();
  const { session, cerrarSesion } = useSesion();

  const [local, setLocal] = useState<Comercio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<"logo" | "portada" | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [direccion, setDireccion] = useState("");
  const [tiempo, setTiempo] = useState("");
  const [dias, setDias] = useState<Record<number, DiaEditable>>(diasVacios);
  const [horariosGuardados, setHorariosGuardados] = useState<ComercioHorario[]>([]);

  /** Qué hoja está abierta. Una sola a la vez. */
  const [hoja, setHoja] = useState<null | "datos" | "horarios" | "cobro" | "ayuda">(null);
  const [guardandoHorarios, setGuardandoHorarios] = useState(false);
  const [errorHorarios, setErrorHorarios] = useState<string | null>(null);

  const [cobro, setCobro] = useState<DatosCobro | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [titular, setTitular] = useState("");
  const [cuit, setCuit] = useState("");
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  const [saliendo, setSaliendo] = useState(false);

  const traer = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    const c = await miComercio(uid);
    setLocal(c);
    if (c) {
      setDireccion(c.direccion ?? "");
      setTiempo(c.tiempo_entrega ?? "");

      const [filas, datos] = await Promise.all([horariosDelComercio(c.id), misDatosDeCobro(c.id)]);
      setHorariosGuardados(filas);
      setDias(diasDesdeFilas(filas));
      setCobro(datos);
    }
    setCargando(false);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  /**
   * Abrir y cerrar se guarda solo, al toque. Es la excepción a la regla de
   * "un botón de guardar": nadie cierra el local y después busca un botón.
   */
  async function alternarAbierto() {
    if (!local) return;
    const nuevo = !local.abierto;
    setLocal({ ...local, abierto: nuevo });
    setError(null);
    const r = await guardarComercio(local.id, { abierto: nuevo });
    if (!r.ok) {
      setLocal({ ...local, abierto: !nuevo });
      setError(r.mensaje);
    }
  }

  async function cambiarImagen(cual: "logo" | "portada") {
    if (!local) return;
    setError(null);
    const img = await elegirImagen(cual === "logo");
    if (!img) return;
    setSubiendo(cual);
    const r = await subirImagenDelLocal(local.id, cual, img);
    setSubiendo(null);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setLocal({ ...local, [cual === "logo" ? "logo_url" : "portada_url"]: r.dato });
  }

  function prenderDia(n: number, activo: boolean) {
    setDias((prev) => ({ ...prev, [n]: { ...prev[n], activo } }));
    setMensaje(null);
  }

  function cambiarTramo(n: number, i: number, cambio: Partial<Tramo>) {
    setDias((prev) => ({
      ...prev,
      [n]: { ...prev[n], tramos: prev[n].tramos.map((t, k) => (k === i ? { ...t, ...cambio } : t)) },
    }));
    setMensaje(null);
  }

  function agregarTramo(n: number) {
    setDias((prev) => {
      const dia = prev[n];
      if (dia.tramos.length >= MAX_TRAMOS) return prev;
      return { ...prev, [n]: { ...dia, tramos: [...dia.tramos, { abre: "", cierra: "" }] } };
    });
    setError(null);
    setMensaje(null);
  }

  function quitarTramo(n: number, i: number) {
    setDias((prev) => {
      const tramos = prev[n].tramos.filter((_, k) => k !== i);
      // Nunca cero: un día prendido sin ningún rango no se puede guardar ni
      // explicar. Si quiere sacar el único que queda, lo que quiere es apagar
      // el día.
      return { ...prev, [n]: { ...prev[n], tramos: tramos.length ? tramos : [{ abre: "", cierra: "" }] } };
    });
    setMensaje(null);
  }

  /**
   * Copia el horario del primer día prendido a los otros seis.
   *
   * Es el atajo que evita escribir "09:00" y "23:00" catorce veces. La mayoría
   * de los locales abre lo mismo casi todos los días y después apaga el que
   * cierra, que son dos toques en vez de doce campos.
   */
  function aplicarATodos() {
    const modelo = DIAS.map((d) => dias[d.n]).find(
      (d) => d.activo && d.tramos.some((t) => t.abre && t.cierra)
    );
    if (!modelo) {
      setErrorHorarios("Primero cargá el horario de un día y después copialo al resto.");
      return;
    }
    const tramos = modelo.tramos.filter((t) => t.abre && t.cierra).map((t) => ({ ...t }));
    const nuevos: Record<number, DiaEditable> = {};
    for (const d of DIAS) nuevos[d.n] = { activo: true, tramos: tramos.map((t) => ({ ...t })) };
    setDias(nuevos);
    setErrorHorarios(null);
  }

  /**
   * Valida y arma los tramos que van a la base.
   *
   * Devuelve un mensaje de error en vez de tirar: la pantalla lo muestra arriba
   * del botón. Un día prendido con la hora mal escrita frena el guardado
   * entero; guardar "lo que se entienda" y descartar el resto en silencio es
   * cómo un local termina cerrado un viernes sin saber por qué.
   */
  function tramosParaGuardar(): { tramos: { dia_semana: number; abre: string; cierra: string }[] } | { error: string } {
    const salida: { dia_semana: number; abre: string; cierra: string }[] = [];
    for (const d of DIAS) {
      const dia = dias[d.n];
      if (!dia.activo) continue;
      const nombre = d.nombre.toLowerCase();
      const aperturas = new Set<string>();

      for (const t of dia.tramos) {
        const abre = normalizarHora(t.abre);
        const cierra = normalizarHora(t.cierra);
        if (!abre || !cierra) return { error: `Revisá el horario del ${nombre}: se escribe como 09:00.` };
        if (abre === cierra) {
          return { error: `El ${nombre} abre y cierra a la misma hora. Si abrís todo el día, apagá ese día y dejá el local abierto.` };
        }
        // La tabla tiene una clave única por (local, día, hora de apertura):
        // dos tramos que arrancan a la misma hora fallarían al guardar con un
        // error de Postgres que no le dice nada a nadie.
        if (aperturas.has(abre)) {
          return { error: `El ${nombre} tiene dos rangos que abren a las ${abre}. Juntalos en uno.` };
        }
        aperturas.add(abre);
        salida.push({ dia_semana: d.n, abre, cierra });
      }
    }
    return { tramos: salida };
  }

  /** Dirección y demora. Los horarios y el cobro se guardan desde sus hojas. */
  async function guardar() {
    if (!local || guardando) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    if (!direccion.trim()) {
      setError("Escribí la dirección del local: es a donde va el repartidor a retirar.");
      setGuardando(false);
      return;
    }
    const r = await guardarComercio(local.id, {
      direccion: direccion.trim(),
      tiempo_entrega: tiempo.trim() || "30-45 min",
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setLocal(r.dato);
    setHoja(null);
    setMensaje("Listo, los cambios ya se ven en el marketplace.");
  }

  /** Abre la hoja con lo que está guardado: si la cerraron sin guardar, no queda nada a medias. */
  function abrirDatos() {
    if (!local) return;
    setDireccion(local.direccion ?? "");
    setTiempo(local.tiempo_entrega ?? "");
    setError(null);
    setMensaje(null);
    setHoja("datos");
  }

  async function guardarLosHorarios() {
    if (!local || guardandoHorarios) return;
    const armado = tramosParaGuardar();
    if ("error" in armado) {
      setErrorHorarios(armado.error);
      return;
    }
    setGuardandoHorarios(true);
    setErrorHorarios(null);
    const rh = await guardarHorarios(local.id, armado.tramos);
    setGuardandoHorarios(false);
    if (!rh.ok) {
      setErrorHorarios(rh.mensaje);
      return;
    }
    setHorariosGuardados(armado.tramos.map((t, idx) => ({ id: String(idx), comercio_id: local.id, ...t })));
    setHoja(null);
    setMensaje("Listo: el horario ya se ve en el marketplace.");
  }

  /** Cerrar el editor sin guardar vuelve a lo que estaba: no queda nada a medias. */
  function cerrarHorarios() {
    setDias(diasDesdeFilas(horariosGuardados));
    setErrorHorarios(null);
    setHoja(null);
  }

  function abrirCobro() {
    setCuenta(cobro ? cobro.valor : "");
    setTitular(cobro?.titular ?? "");
    setCuit(cobro?.cuit ?? "");
    setErrorCobro(null);
    setHoja("cobro");
  }

  async function guardarCobro() {
    if (!local || guardandoCobro) return;
    setGuardandoCobro(true);
    setErrorCobro(null);
    const r = await guardarDatosDeCobro(local.id, { cuenta, titular, cuit });
    setGuardandoCobro(false);
    if (!r.ok) {
      setErrorCobro(r.mensaje);
      return;
    }
    setCobro(r.dato);
    setHoja(null);
    setMensaje("Listo: guardamos tus datos de cobro.");
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  if (!local) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: espacio.xxl, backgroundColor: color.n50 }}>
        <Txt v="head" style={{ textAlign: "center" }}>
          Tu cuenta todavía no está vinculada a un local
        </Txt>
        <Txt v="cap" style={{ textAlign: "center", marginTop: espacio.sm }}>
          Avisale al equipo de Pedilo y lo vinculan en un minuto.
        </Txt>
        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton variante="fantasma" onPress={cerrarSesion}>
            Cerrar sesión
          </Boton>
        </View>
      </View>
    );
  }

  /**
   * Lo que ve el cliente **en este momento**, que es la misma cuenta que hace
   * el marketplace: el interruptor Y el horario.
   *
   * Se muestra porque fue exactamente la confusión que nos comimos: el local
   * prendía el interruptor, el cliente lo seguía viendo cerrado, y desde acá
   * parecía que el botón estaba roto. Lo que pasaba era que había un horario
   * cargado que no lo incluía. Si el interruptor y la realidad no coinciden,
   * hay que decirlo acá, no dejar que lo descubra un cliente.
   */
  const apertura = estadoApertura(local.abierto, horariosGuardados);
  const contradice = local.abierto && !apertura.abierto;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.n50 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/*
        La portada sube por debajo del encabezado. Si arrancara justo abajo,
        las esquinas redondeadas del encabezado dejarían ver el fondo claro de
        la pantalla contra una portada oscura: dos triangulitos blancos.
      */}
      <View style={{ zIndex: 2, elevation: 2 }}>
        <EncabezadoComercio titulo="Mi local" />
      </View>

      <ScrollView
        style={{ marginTop: -RADIO_ENCABEZADO }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ----------------------------- portada ---------------------------- */}
        <View>
          <ImagenSmart uri={local.portada_url} categoria={local.categoria} style={e.portada} iconoSize={44} />
          <View style={e.sobrePortada}>
            <Tocable onPress={() => cambiarImagen("portada")}>
              <View style={e.botonFoto}>
                <IconoLapiz size={13} color={color.white} />
                <Txt v="cap" style={{ color: color.white }}>
                  {subiendo === "portada" ? "Subiendo…" : local.portada_url ? "Cambiar portada" : "Poner portada"}
                </Txt>
              </View>
            </Tocable>
          </View>
        </View>

        <View style={{ padding: espacio.lg, marginTop: -34 }}>
          {/* ------------------------------ logo ---------------------------- */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: espacio.md }}>
            <Tocable onPress={() => cambiarImagen("logo")}>
              <View>
                <ImagenSmart uri={local.logo_url} categoria={local.categoria} style={e.logo} iconoSize={28} />
                <View style={e.lapiz}>
                  {subiendo === "logo" ? (
                    <Txt v="cap" style={{ color: color.white, fontSize: 11 }}>
                      …
                    </Txt>
                  ) : (
                    <IconoLapiz size={13} color={color.white} />
                  )}
                </View>
              </View>
            </Tocable>
            <View style={{ flex: 1, paddingBottom: espacio.sm }}>
              <Txt v="head" numberOfLines={1}>
                {local.nombre}
              </Txt>
              <Txt v="cap">{local.categoria}</Txt>
            </View>
          </View>

          {/* --------------------------- abierto ---------------------------- */}
          <View style={[e.interruptor, local.abierto ? e.abierto : e.cerrado]}>
            <View style={{ flex: 1 }}>
              <Txt v="label" style={{ color: local.abierto ? color.brandInk : color.danger }}>
                {local.abierto ? "Abierto — recibiendo pedidos" : "Cerrado"}
              </Txt>
              <Txt v="cap" style={{ marginTop: 2 }}>
                {local.abierto
                  ? "El cliente puede pedir ahora mismo."
                  : "Pueden ver tu carta, pero no pedir. Se guarda solo."}
              </Txt>
            </View>
            <Switch
              value={local.abierto}
              onValueChange={alternarAbierto}
              trackColor={{ false: color.n200, true: color.brand }}
              thumbColor={color.white}
              accessibilityLabel={local.abierto ? "Cerrar el local" : "Abrir el local"}
            />
          </View>

          {contradice && (
            <View style={[e.aviso, { backgroundColor: color.warnWash, marginTop: espacio.sm }]}>
              <Txt v="label" style={{ color: color.warn }}>
                El cliente te ve cerrado igual
              </Txt>
              <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
                Tenés el interruptor en abierto, pero estás fuera del horario que cargaste en Horarios de atención
                {apertura.abreA ? `. Volvés a abrir a las ${apertura.abreA}` : ""}. Si hoy abrís
                igual, cambiá el horario de hoy o apagá el día.
              </Txt>
            </View>
          )}

          {!!error && (
            <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
              <Txt v="cap" style={{ color: color.danger }}>
                {error}
              </Txt>
            </View>
          )}
          {!!mensaje && (
            <View style={[e.aviso, { backgroundColor: color.brandWash }]}>
              <Txt v="cap" style={{ color: color.brandInk }}>
                {mensaje}
              </Txt>
            </View>
          )}

          {/* ----------------------------- filas ----------------------------- */}
          <View style={{ marginTop: espacio.lg }}>
            <Fila
              icono={<IconoPin size={20} color={color.n600} />}
              titulo="Dirección y tiempo de entrega"
              sub={
                local.direccion?.trim()
                  ? `${local.direccion.trim()} · ${local.tiempo_entrega || "30-45 min"}`
                  : "Sin dirección · cargala para que el repartidor sepa dónde retirar"
              }
              alerta={!local.direccion?.trim()}
              onPress={abrirDatos}
            />
            <Fila
              icono={<IconoReloj size={20} color={color.n600} />}
              titulo="Horarios de atención"
              sub={resumenHorarios(horariosGuardados)}
              onPress={() => setHoja("horarios")}
            />
            <Fila
              icono={<IconoBanco size={20} color={color.n600} />}
              titulo="Datos de cobro"
              sub={
                cobro
                  ? `${nombreTipo(cobro.tipo)} ${mostrarCuenta(cobro)} · ${cobro.titular}`
                  : "Sin cargar · cargalos para cobrar lo que vendas"
              }
              alerta={!cobro}
              onPress={abrirCobro}
            />
            <Fila
              icono={<IconoChat size={20} color={color.n600} />}
              titulo="Ayuda"
              sub="Pedidos, pagos, tu cuenta"
              onPress={() => setHoja("ayuda")}
            />
          </View>

          <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
            <Boton variante="fantasma" onPress={() => setSaliendo(true)} textStyle={{ color: color.danger }}>
              Cerrar sesión
            </Boton>
          </View>
        </View>
      </ScrollView>

      {/* ============================ HORARIOS ============================= */}
      <Modal visible={hoja === "horarios"} animationType="slide" onRequestClose={cerrarHorarios}>
        <View style={{ flex: 1, backgroundColor: color.n50 }}>
          <View style={[e.cabezaHoja, { paddingTop: insets.top + espacio.md }]}>
            <View style={{ flex: 1 }}>
              <Txt v="title" style={{ color: color.white, fontSize: 20 }}>
                Horarios de atención
              </Txt>
              <Txt v="cap" style={{ color: "#C7C7C3", marginTop: 2 }}>
                Fuera de estos rangos el cliente te ve cerrado.
              </Txt>
            </View>
            <Tocable onPress={cerrarHorarios} etiqueta="Cerrar sin guardar">
              <View style={e.cerrarHoja}>
                <IconoCerrar size={18} color={color.white} />
              </View>
            </Tocable>
          </View>

          <ScrollView contentContainerStyle={{ padding: espacio.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
            {/*
              El atajo va ARRIBA. Al final de la lista era lo último que se veía,
              cuando ya habías escrito los siete días a mano: justo cuando dejaba
              de servir. Acá se usa como se piensa: cargo el lunes, copio, y
              después apago el día que cierro.
            */}
            <View style={e.atajo}>
              <View style={{ flex: 1 }}>
                <Txt v="label">¿Abrís igual casi todos los días?</Txt>
                <Txt v="cap" style={{ marginTop: 2 }}>
                  Cargá un día, copialo al resto y después apagá el que cerrás.
                </Txt>
              </View>
              <Boton variante="fantasma" onPress={aplicarATodos}>
                Copiar a todos
              </Boton>
            </View>

            {!!errorHorarios && (
              <View style={[e.aviso, { backgroundColor: color.dangerWash, marginTop: espacio.md }]}>
                <Txt v="cap" style={{ color: color.danger }}>
                  {errorHorarios}
                </Txt>
              </View>
            )}

            <View style={{ marginTop: espacio.md, gap: espacio.sm }}>
              {DIAS.map((d) => {
                const dia = dias[d.n];
                return (
                  <View key={d.n} style={[e.dia, dia.activo && e.diaActivo]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.sm }}>
                      <Switch
                        value={dia.activo}
                        onValueChange={(v) => prenderDia(d.n, v)}
                        trackColor={{ false: color.n200, true: color.brand }}
                        thumbColor={color.white}
                        accessibilityLabel={dia.activo ? `Cerrar los ${d.nombre}` : `Abrir los ${d.nombre}`}
                      />
                      <Txt v="label" style={{ flex: 1 }} numberOfLines={1}>
                        {d.nombre}
                      </Txt>
                      {!dia.activo && (
                        <Txt v="cap" style={{ color: color.n400 }}>
                          Cerrado
                        </Txt>
                      )}
                    </View>

                    {dia.activo && (
                      <View style={{ gap: espacio.sm, marginTop: espacio.sm }}>
                        {dia.tramos.map((t, i) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <TextInput
                              value={t.abre}
                              onChangeText={(v) => cambiarTramo(d.n, i, { abre: v })}
                              onBlur={() => cambiarTramo(d.n, i, { abre: normalizarHora(t.abre) ?? t.abre })}
                              placeholder="09:00"
                              placeholderTextColor={color.n400}
                              inputMode="numeric"
                              maxLength={5}
                              style={e.hora}
                              accessibilityLabel={`Hora de apertura del ${d.nombre.toLowerCase()}, rango ${i + 1}`}
                            />
                            <Txt v="cap">a</Txt>
                            <TextInput
                              value={t.cierra}
                              onChangeText={(v) => cambiarTramo(d.n, i, { cierra: v })}
                              onBlur={() => cambiarTramo(d.n, i, { cierra: normalizarHora(t.cierra) ?? t.cierra })}
                              placeholder="13:00"
                              placeholderTextColor={color.n400}
                              inputMode="numeric"
                              maxLength={5}
                              style={e.hora}
                              accessibilityLabel={`Hora de cierre del ${d.nombre.toLowerCase()}, rango ${i + 1}`}
                            />
                            {dia.tramos.length > 1 && (
                              <Tocable
                                onPress={() => quitarTramo(d.n, i)}
                                etiqueta={`Sacar el rango ${i + 1} del ${d.nombre.toLowerCase()}`}
                              >
                                <View style={e.quitar}>
                                  <IconoCerrar size={14} color={color.danger} />
                                </View>
                              </Tocable>
                            )}
                          </View>
                        ))}

                        {dia.tramos.length < MAX_TRAMOS && (
                          <Tocable
                            onPress={() => agregarTramo(d.n)}
                            etiqueta={`Agregar otro rango el ${d.nombre.toLowerCase()}`}
                          >
                            <Txt v="cap" style={{ color: color.brandInk, paddingVertical: 6 }}>
                              + Agregar otro rango
                            </Txt>
                          </Tocable>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <Txt v="cap" style={{ marginTop: espacio.md, color: color.n400, fontSize: 11 }}>
              Si cerrás al mediodía, cargá dos rangos: "09:00 a 13:00" y "17:00 a 23:00". Si cerrás
              después de medianoche poné el cierre igual: "20:00 a 02:00" es hasta las dos de la
              mañana. Si no cargás ningún día, manda sólo el interruptor.
            </Txt>
          </ScrollView>

          <View style={[e.barraHoja, { paddingBottom: insets.bottom + espacio.md }]}>
            <Boton onPress={guardarLosHorarios} cargando={guardandoHorarios}>
              Guardar horarios
            </Boton>
          </View>
        </View>
      </Modal>

      {/* ========================= DIRECCIÓN Y TIEMPO ====================== */}
      <Hoja visible={hoja === "datos"} onCerrar={() => setHoja(null)} titulo="Dirección y tiempo de entrega">
        <Txt v="cap" style={{ marginBottom: 6 }}>
          Dirección
        </Txt>
        <TextInput
          value={direccion}
          onChangeText={(t) => {
            setDireccion(t);
            setError(null);
          }}
          placeholder="Calle y número"
          placeholderTextColor={color.n400}
          style={e.input}
          accessibilityLabel="Dirección del local"
        />
        <Txt v="cap" style={{ marginTop: 6 }}>
          Es a donde va el repartidor a retirar los pedidos.
        </Txt>

        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          Tiempo de entrega
        </Txt>
        <TextInput
          value={tiempo}
          onChangeText={setTiempo}
          placeholder="30-45 min"
          placeholderTextColor={color.n400}
          style={e.input}
          accessibilityLabel="Tiempo de entrega"
        />
        <Txt v="cap" style={{ marginTop: 6 }}>
          Se muestra tal cual lo escribas. Poné un rango con el que puedas cumplir un viernes a la
          noche, no un martes a las tres de la tarde.
        </Txt>

        {!!error && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash, marginTop: espacio.md }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {error}
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardar} cargando={guardando}>
            Guardar
          </Boton>
        </View>
      </Hoja>

      {/* ============================ COBRO ================================ */}
      <Hoja visible={hoja === "cobro"} onCerrar={() => setHoja(null)} titulo="Datos de cobro">
        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Es la cuenta donde Pedilo te transfiere lo que vendés. Sólo la ves vos y el equipo de
          Pedilo: los clientes y los repartidores no.
        </Txt>

        <Txt v="cap" style={{ marginBottom: 6 }}>
          CBU, CVU o alias
        </Txt>
        <TextInput
          value={cuenta}
          onChangeText={(t) => {
            setCuenta(t);
            setErrorCobro(null);
          }}
          placeholder="0000003100… o mi.local.pedilo"
          placeholderTextColor={color.n400}
          autoCapitalize="none"
          autoCorrect={false}
          style={e.input}
          accessibilityLabel="CBU, CVU o alias"
        />
        {/* Se dice qué se entendió mientras se escribe: si pegó un CBU y la app
            lee "alias", algo se copió mal y conviene verlo antes de guardar. */}
        {cuenta.trim().length >= 6 &&
          (() => {
            const leida = leerCuenta(cuenta);
            return (
              <Txt v="cap" style={{ marginTop: 6, color: leida.ok ? color.brandInk : color.n400 }}>
                {leida.ok ? `✓ Es un ${nombreTipo(leida.tipo)}` : leida.mensaje}
              </Txt>
            );
          })()}

        <Txt v="cap" style={{ marginTop: espacio.md, marginBottom: 6 }}>
          Titular de la cuenta
        </Txt>
        <TextInput
          value={titular}
          onChangeText={setTitular}
          placeholder="Nombre o razón social"
          placeholderTextColor={color.n400}
          style={e.input}
          accessibilityLabel="Titular de la cuenta"
        />

        <Txt v="cap" style={{ marginTop: espacio.md, marginBottom: 6 }}>
          CUIT (opcional)
        </Txt>
        <TextInput
          value={cuit}
          onChangeText={(t) => setCuit(t.replace(/[^0-9-]/g, "").slice(0, 13))}
          placeholder="20-12345678-9"
          placeholderTextColor={color.n400}
          inputMode="numeric"
          style={e.input}
          accessibilityLabel="CUIT"
        />

        {!!errorCobro && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash, marginTop: espacio.md }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {errorCobro}
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardarCobro} cargando={guardandoCobro}>
            Guardar
          </Boton>
        </View>
      </Hoja>

      {/* ============================= AYUDA =============================== */}
      <Hoja visible={hoja === "ayuda"} onCerrar={() => setHoja(null)} titulo="¿Necesitás una mano?">
        <Txt v="body" style={{ marginBottom: espacio.md }}>
          Escribinos y lo resolvemos. Mientras tanto, lo que más se pregunta:
        </Txt>
        {[
          ["Me entró un pedido y no lo puedo hacer", "Rechazalo desde Pedidos y elegí el motivo: al cliente le llega enseguida y no se le cobra nada."],
          ["El cliente me ve cerrado y estoy abierto", "Fijate el horario de hoy: fuera de ese rango manda el horario, aunque el interruptor esté prendido."],
          ["¿Cuándo cobro lo que vendí?", "Pedilo te transfiere a la cuenta de 'Datos de cobro'. Si no está cargada, no hay a dónde mandarlo."],
          ["Quiero cambiar mi mail o contraseña", "Escribile al equipo: desde la app no se puede, para que nadie se haga pasar por tu local."],
        ].map(([pregunta, respuesta]) => (
          <View key={pregunta} style={{ marginBottom: espacio.md }}>
            <Txt v="label">{pregunta}</Txt>
            <Txt v="cap" style={{ marginTop: 2 }}>
              {respuesta}
            </Txt>
          </View>
        ))}
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
          Si hay pedidos entrando, no te van a llegar hasta que vuelvas a entrar.
        </Txt>
      </Dialogo>
    </KeyboardAvoidingView>
  );
}

/** Una fila: ícono, qué es, qué dice hoy, y la flecha. Igual que en el perfil del cliente. */
function Fila({
  icono,
  titulo,
  sub,
  onPress,
  alerta,
}: {
  icono: React.ReactNode;
  titulo: string;
  sub: string;
  onPress: () => void;
  /** Algo que falta completar: el subtítulo va en ámbar. */
  alerta?: boolean;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={titulo} suave>
      <View style={e.fila}>
        <View style={[e.iconoFila, alerta && { backgroundColor: color.warnWash }]}>{icono}</View>
        <View style={{ flex: 1 }}>
          <Txt v="label">{titulo}</Txt>
          <Txt v="cap" numberOfLines={2} style={alerta ? { color: color.warn } : undefined}>
            {sub}
          </Txt>
        </View>
        <IconoChevron size={17} color={color.n400} />
      </View>
    </Tocable>
  );
}

/** La hoja que sube desde abajo, para lo que se edita en un momento. */
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
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const e = StyleSheet.create({
  portada: { width: "100%", height: 190 + RADIO_ENCABEZADO },
  sobrePortada: {
    position: "absolute",
    top: RADIO_ENCABEZADO,
    right: 0,
    padding: espacio.lg,
    alignItems: "flex-end",
  },
  botonFoto: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: espacio.md,
    paddingVertical: 8,
    borderRadius: radio.pill,
  },
  logo: {
    width: 78,
    height: 78,
    borderRadius: radio.md,
    backgroundColor: color.white,
    borderWidth: 3,
    borderColor: color.n50,
  },
  lapiz: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  interruptor: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    borderRadius: radio.md,
    padding: espacio.md,
    marginTop: espacio.lg,
    borderWidth: 1.5,
  },
  abierto: { backgroundColor: color.brandWash, borderColor: color.brand },
  cerrado: { backgroundColor: color.dangerWash, borderColor: color.danger },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.lg },
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
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.42)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    padding: espacio.lg,
    paddingBottom: espacio.xxxl,
    maxHeight: "88%",
  },
  asa: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  cabezaHoja: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  cerrarHoja: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  atajo: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    ...sombras.sm,
  },
  barraHoja: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    paddingHorizontal: espacio.lg,
    paddingTop: espacio.md,
    backgroundColor: color.n50,
    borderTopWidth: 1,
    borderTopColor: color.n200,
  },
  dia: {
    backgroundColor: color.white,
    borderRadius: radio.sm,
    borderWidth: 1.5,
    borderColor: color.n200,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
  },
  quitar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.dangerWash,
    alignItems: "center",
    justifyContent: "center",
  },
  diaActivo: { borderColor: color.brand, backgroundColor: color.brandWash },
  hora: {
    ...texto.body,
    /*
      Ancho fijo, no `flex: 1`. En web un TextInput es un <input>, que trae un
      ancho intrínseco de ~180px; con flex el renglón del día se salía de la
      pantalla y el campo de cierre quedaba cortado contra el borde.
    */
    width: 74,
    textAlign: "center",
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: color.white,
  },
});
