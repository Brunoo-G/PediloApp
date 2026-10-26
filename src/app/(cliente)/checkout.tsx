/**
 * Checkout.
 *
 * Dos cosas que valen la pena entender antes de tocar esta pantalla:
 *
 * 1. Los precios que se muestran acá son una PREVISUALIZACIÓN. El total de
 *    verdad lo calcula el servidor en `crear_pedido`. Si los dos no coinciden,
 *    manda el servidor — es el único que no se puede falsear desde la consola
 *    del navegador.
 *
 * 2. La dirección se lee del perfil (fuente única de verdad). Se puede cambiar
 *    para ESTE pedido sin pisar la del perfil; para pisarla hay que marcar el
 *    check a propósito. A veces pedís a lo de un amigo una sola vez y perder tu
 *    dirección por eso sería un desastre silencioso.
 */
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Tocable, Txt } from "../../componentes/base";
import { IconoPago, IconoVolver } from "../../componentes/Iconos";
import { useCarrito } from "../../contextos/Carrito";
import { useConfiguracion } from "../../contextos/Configuracion";
import { useSesion } from "../../contextos/Sesion";
import { cobertura, puntoValido } from "../../lib/geo";
import { crearPedido } from "../../lib/pedidos";
import { buscarCupon, tituloCupon } from "../../lib/cupones";
import { calcularPrecio, formatPrecio } from "../../lib/precios";
import { supabase } from "../../lib/supabase";
import type { Comercio, Cupon } from "../../lib/tipos";
import { Propinas } from "../../componentes/Propinas";
import { color, espacio, METODOS_PAGO, metodoVigente, radio, sombras, texto } from "../../theme/tokens";

const TOPE_NOTA = 200;

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { perfil, session, esAnonimo, entrarConGoogle, actualizarPerfil } = useSesion();
  const { radioEnvioKm, tarifaServicio, envioBase } = useConfiguracion();
  const { carrito, subtotal, vaciar } = useCarrito();

  const [local, setLocal] = useState<Comercio | null>(null);
  const [direccion, setDireccion] = useState("");
  const [guardarDireccion, setGuardarDireccion] = useState(false);
  const [nota, setNota] = useState("");
  const [pago, setPago] = useState<string>("efectivo");
  const [efectivoCon, setEfectivoCon] = useState("");
  const [cupon, setCupon] = useState("");
  const [cuponEncontrado, setCuponEncontrado] = useState<Cupon | null>(null);
  const [buscandoCupon, setBuscandoCupon] = useState(false);
  const [tocado, setTocado] = useState(false);
  /** 0 = sin propina. Los montos los maneja `Propinas`. */
  const [propina, setPropina] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  /**
   * Para pedir hace falta cuenta de verdad. Una sesión anónima de las viejas no
   * alcanza: `crear_pedido` la rechaza en la base. Se chequea acá también para
   * decírselo ANTES de que llene la dirección y elija cómo paga, no después.
   */
  const sinCuenta = !session || esAnonimo;

  useEffect(() => {
    if (!perfil) return;
    setDireccion(perfil.direccion ?? "");
    setPago(metodoVigente(perfil.metodo_pago));
    // Una cuenta recién creada con Google no trae dirección. La primera que
    // escriba queda como la suya, tildado de entrada: si no, termina con una
    // cuenta sin dirección y volviendo a escribirla en cada pedido.
    if (!(perfil.direccion ?? "").trim()) setGuardarDireccion(true);
  }, [perfil?.id]);

  useEffect(() => {
    if (!carrito.comercioId) return;
    supabase
      .from("comercios")
      .select("*")
      .eq("id", carrito.comercioId)
      .single()
      .then(({ data }) => setLocal((data ?? null) as unknown as Comercio | null));
  }, [carrito.comercioId]);

  // Los cupones viven en la base, no en el código. Se consulta con un respiro
  // para no pegarle a Supabase en cada tecla.
  useEffect(() => {
    const codigo = cupon.trim();
    if (!codigo) {
      setCuponEncontrado(null);
      setBuscandoCupon(false);
      return;
    }
    setBuscandoCupon(true);
    const t = setTimeout(async () => {
      setCuponEncontrado(await buscarCupon(codigo));
      setBuscandoCupon(false);
    }, 400);
    return () => clearTimeout(t);
  }, [cupon]);

  const miPunto = puntoValido(perfil?.lat, perfil?.lng);
  const zona = useMemo(
    () => cobertura(miPunto, puntoValido(local?.lat, local?.lng), radioEnvioKm, local?.radio_envio_km),
    [miPunto, local, radioEnvioKm]
  );

  const precio = calcularPrecio({
    lineas: carrito.items.map((i) => ({ precio: i.precio, cantidad: i.cantidad })),
    // El envío lo pone Pedilo, no el local: es Pedilo quien pone el repartidor.
    costoEnvio: envioBase,
    cupon: cuponEncontrado,
    tarifa: tarifaServicio,
    propina,
  });

  const direccionCambiada = direccion.trim() !== (perfil?.direccion ?? "").trim();
  const direccionOk = direccion.trim().length >= 5;
  const efectivoOk =
    pago !== "efectivo" || efectivoCon === "" || Number(efectivoCon) >= precio.total;
  const vuelto =
    pago === "efectivo" && efectivoCon !== "" && Number(efectivoCon) >= precio.total
      ? Number(efectivoCon) - precio.total
      : null;

  const cuponEscrito = cupon.trim().length > 0;
  const cuponOk = !!cuponEncontrado;
  const fueraDeZona = zona.enZona === false;

  // Un código escrito que no existe frena la confirmación a propósito. Si el
  // pedido saliera igual, el cliente pagaría el precio de lista creyendo que
  // le aplicaron el descuento, y se enteraría cuando llega el repartidor.
  // Para seguir sin cupón, se borra el campo.
  const cuponInvalido = cuponEscrito && !buscandoCupon && !cuponOk;

  async function confirmar() {
    setTocado(true);
    setErrorServidor(null);
    if (!direccionOk || !efectivoOk || fueraDeZona || cuponInvalido || buscandoCupon || !carrito.comercioId)
      return;

    if (sinCuenta) return;

    setEnviando(true);

    if (guardarDireccion && direccionCambiada) {
      await actualizarPerfil({ direccion: direccion.trim() });
    }

    const r = await crearPedido({
      comercioId: carrito.comercioId,
      items: carrito.items,
      direccion: direccion.trim(),
      metodoPago: pago,
      nota: nota.trim(),
      cupon: cuponEncontrado?.codigo,
      efectivoCon: pago === "efectivo" && efectivoCon ? Number(efectivoCon) : null,
      lat: perfil?.lat ?? null,
      lng: perfil?.lng ?? null,
      propina,
      telefono: perfil?.telefono ?? "",
    });

    setEnviando(false);

    if (!r.ok) {
      setErrorServidor(r.mensaje);
      return;
    }

    vaciar();
    router.replace("/(cliente)/pedidos");
  }

  if (carrito.items.length === 0) {
    return (
      <View style={e.centro}>
        <Txt v="head">Tu carrito está vacío</Txt>
        <View style={{ flexDirection: "row", marginTop: espacio.lg, paddingHorizontal: espacio.xxl }}>
          <Boton onPress={() => router.replace("/(cliente)")}>Ver locales</Boton>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={() => router.back()}>
          <View style={e.volver}>
            <IconoVolver size={22} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }}>
            Datos de entrega
          </Txt>
          {!!local && (
            <Txt v="cap" style={{ color: "#9A9A9A" }} numberOfLines={1}>
              Pedido de {local.nombre}
            </Txt>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------ zona -------------------------------- */}
        {fueraDeZona && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
            <Txt v="label" style={{ color: color.danger }}>
              Este local no llega hasta tu dirección
            </Txt>
            <Txt v="cap" style={{ color: color.danger, marginTop: 4 }}>
              {zona.detalle}
            </Txt>
          </View>
        )}
        {zona.enZona === null && (
          <Tocable onPress={() => router.push("/(cliente)/direccion")} suave>
            <View style={[e.aviso, { backgroundColor: color.brandWash }]}>
              <Txt v="label" style={{ color: color.brandInk }}>
                Marcá tu ubicación en el mapa
              </Txt>
              <Txt v="cap" style={{ color: color.brandInk, marginTop: 4 }}>
                Sin el pin no podemos confirmar que este local llegue hasta tu casa.
              </Txt>
            </View>
          </Tocable>
        )}

        {/* --------------------------- dirección ------------------------------ */}
        <Txt v="cap" style={{ marginBottom: 6 }}>
          Dirección de envío
        </Txt>
        <TextInput
          value={direccion}
          onChangeText={setDireccion}
          placeholder="Calle, número, piso/depto"
          placeholderTextColor={color.n400}
          style={[e.input, tocado && !direccionOk && { borderColor: color.danger }]}
        />
        {tocado && !direccionOk && (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            Ingresá una dirección válida.
          </Txt>
        )}

        {direccionCambiada && direccionOk && (
          <Tocable onPress={() => setGuardarDireccion((v) => !v)}>
            <View style={[e.check, guardarDireccion && { backgroundColor: color.brandWash }]}>
              <View style={[e.casilla, guardarDireccion && { backgroundColor: color.brandInk, borderColor: color.brandInk }]}>
                {guardarDireccion && (
                  <Txt v="cap" style={{ color: color.white, fontSize: 12 }}>
                    ✓
                  </Txt>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="label" style={{ color: guardarDireccion ? color.brandInk : color.n900 }}>
                  Guardar como mi dirección
                </Txt>
                <Txt v="cap" style={{ marginTop: 2 }}>
                  {!(perfil?.direccion ?? "").trim()
                    ? "Es la primera que cargás, así no la escribís de nuevo en cada pedido."
                    : guardarDireccion
                      ? "Se va a actualizar en toda la app."
                      : "Si no la marcás, se usa sólo para este pedido."}
                </Txt>
              </View>
            </View>
          </Tocable>
        )}

        {/* El celular ya está en el perfil (es obligatorio desde octubre): acá
            no se vuelve a pedir ni se explica. El contacto del día a día con
            el repartidor sigue siendo el chat del pedido. */}

        {/* ------------------------------ pago -------------------------------- */}
        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: espacio.sm }}>
          Método de pago
        </Txt>
        <View style={{ gap: espacio.sm }}>
          {METODOS_PAGO.map((m) => {
            const sel = pago === m.id;
            return (
              <Tocable key={m.id} onPress={() => setPago(m.id)} suave>
                <View style={[e.opcion, sel && e.opcionSel]}>
                  <View style={[e.iconoPago, sel && { backgroundColor: color.brandWash }]}>
                    <IconoPago metodo={m.id} size={20} color={sel ? color.brandInk : color.n600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="label">{m.label}</Txt>
                    <Txt v="cap">{m.desc}</Txt>
                  </View>
                  <View style={[e.radio, sel && { borderWidth: 6, borderColor: color.brandInk }]} />
                </View>
              </Tocable>
            );
          })}
        </View>

        {pago === "efectivo" && (
          <>
            <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
              ¿Con cuánto pagás? (opcional)
            </Txt>
            <TextInput
              value={efectivoCon}
              onChangeText={(t) => setEfectivoCon(t.replace(/[^0-9]/g, ""))}
              placeholder={`Total: ${formatPrecio(precio.total)}`}
              placeholderTextColor={color.n400}
              inputMode="numeric"
              style={[e.input, tocado && !efectivoOk && { borderColor: color.danger }]}
            />
            {tocado && !efectivoOk && (
              <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
                El monto tiene que ser mayor o igual al total.
              </Txt>
            )}
            {vuelto !== null && (
              <Txt v="cap" style={{ color: color.brandInk, marginTop: 6 }}>
                Tu vuelto: {formatPrecio(vuelto)}
              </Txt>
            )}
          </>
        )}

        {/* ----------------------------- cupón -------------------------------- */}
        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          ¿Tenés un código de descuento?
        </Txt>
        <TextInput
          value={cupon}
          onChangeText={(t) => setCupon(t.toUpperCase())}
          placeholder="Ej: BIENVENIDO"
          placeholderTextColor={color.n400}
          autoCapitalize="characters"
          style={[
            e.input,
            { letterSpacing: 1 },
            // Mientras busca, el borde queda neutro: marcarlo en rojo antes de saber
          // la respuesta es acusar al cliente de tipear mal mientras tipea.
          cuponEscrito && !buscandoCupon && { borderColor: cuponOk ? color.brandInk : color.danger },
          ]}
        />
        {cuponEscrito && (
          <Txt
            v="cap"
            style={{ marginTop: 6, color: buscandoCupon ? color.n600 : cuponOk ? color.brandInk : color.danger }}
          >
            {buscandoCupon
              ? "Buscando…"
              : cuponEncontrado
                ? `✓ ${tituloCupon(cuponEncontrado)} — ${cuponEncontrado.descripcion}`
                : "Cupón inválido"}
          </Txt>
        )}
        {cuponInvalido && (
          <Txt v="cap" style={{ color: color.n600, marginTop: 2 }}>
            Revisá el código o borralo para seguir sin descuento.
          </Txt>
        )}

        {/* ------------------------------ nota -------------------------------- */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: espacio.lg, marginBottom: 6 }}>
          <Txt v="cap">Nota para la entrega (opcional)</Txt>
          <Txt v="cap" style={{ color: nota.length >= TOPE_NOTA - 20 ? color.danger : color.n400 }}>
            {nota.length}/{TOPE_NOTA}
          </Txt>
        </View>
        <TextInput
          value={nota}
          onChangeText={(t) => setNota(t.slice(0, TOPE_NOTA))}
          placeholder="Ej: tocar timbre 2 veces, portón negro"
          placeholderTextColor={color.n400}
          multiline
          style={[e.input, { minHeight: 70, textAlignVertical: "top" }]}
        />
        <Txt v="cap" style={{ marginTop: 6 }}>
          Las aclaraciones de cada producto ya viajan con el pedido.
        </Txt>

        {/*
          ---------------------------- propina -------------------------------

          Va acá, después de la nota y antes del resumen, por dónde está la
          cabeza del cliente: recién terminó de pensar en la entrega —el timbre,
          el portón— y todavía no vio el total. Es el momento en que el
          repartidor es una persona y no un renglón.

          Toda la propina es del repartidor. Lo dice la pantalla porque si no se
          dice, la sospecha razonable es que se la queda la plataforma.
        */}
        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          Propina para el repartidor (opcional)
        </Txt>
        <Propinas valor={propina} onCambiar={setPropina} />

        <Txt v="cap" style={{ marginTop: 6 }}>
          {propina > 0
            ? `${formatPrecio(propina)} para el repartidor. Es toda suya: Pedilo no se queda con nada.`
            : "Se la lleva entera el repartidor que te entregue el pedido."}
        </Txt>

        {/* ---------------------------- resumen ------------------------------- */}
        <View style={e.resumen}>
          <Txt v="micro" style={{ marginBottom: espacio.md }}>
            Resumen
          </Txt>

          {carrito.items.map((i) => (
            <View key={i.productoId} style={{ marginBottom: espacio.sm }}>
              <View style={e.fila}>
                <Txt v="cap" style={{ flex: 1, paddingRight: espacio.md }} numberOfLines={1}>
                  {i.cantidad}× {i.nombre}
                </Txt>
                <Txt v="cap">{formatPrecio(i.precio * i.cantidad)}</Txt>
              </View>
              {!!i.nota && (
                <Txt v="cap" style={{ color: color.brandInk, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                  ↳ {i.nota}
                </Txt>
              )}
            </View>
          ))}

          <View style={{ borderTopWidth: 1, borderTopColor: color.n200, paddingTop: espacio.md, marginTop: espacio.sm }}>
            <View style={e.fila}>
              <Txt v="body" style={{ color: color.n600 }}>
                Subtotal
              </Txt>
              <Txt v="body">{formatPrecio(precio.subtotal)}</Txt>
            </View>

            {precio.descuento > 0 && (
              <View style={[e.fila, { marginTop: 6 }]}>
                <Txt v="body" style={{ color: color.brandInk, flex: 1 }} numberOfLines={1}>
                  {precio.promoLabel}
                </Txt>
                <Txt v="body" style={{ color: color.brandInk }}>
                  −{formatPrecio(precio.descuento)}
                </Txt>
              </View>
            )}

            <View style={[e.fila, { marginTop: 6 }]}>
              <Txt v="body" style={{ color: precio.envioGratis ? color.brandInk : color.n600 }}>
                Envío
              </Txt>
              <Txt v="body" style={{ color: precio.envioGratis ? color.brandInk : color.n900 }}>
                {precio.envioGratis ? "Gratis" : formatPrecio(precio.envio)}
              </Txt>
            </View>

            {precio.propina > 0 && (
              <View style={[e.fila, { marginTop: espacio.sm }]}>
                <Txt v="body" style={{ color: color.n600 }}>
                  Propina
                </Txt>
                <Txt v="body">{formatPrecio(precio.propina)}</Txt>
              </View>
            )}

            {precio.tarifa > 0 && (
              <View style={[e.fila, { marginTop: 6 }]}>
                <Txt v="body" style={{ color: color.n600 }}>
                  Tarifa de servicio
                </Txt>
                <Txt v="body">{formatPrecio(precio.tarifa)}</Txt>
              </View>
            )}

            <View style={[e.fila, { marginTop: espacio.md, alignItems: "baseline" }]}>
              <Txt v="head">Total</Txt>
              <Txt v="title">{formatPrecio(precio.total)}</Txt>
            </View>
          </View>
        </View>

        {errorServidor && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {errorServidor}
            </Txt>
          </View>
        )}

        {/*
          El portero. Va abajo de todo y no al entrar a la pantalla a propósito:
          quien llegó hasta acá ya armó el carrito y está decidido, que es el
          momento en que crear una cuenta cuesta menos. Pedírsela al entrar al
          checkout sería frenarlo antes de que sepa cuánto va a pagar.
        */}
        {sinCuenta ? (
          <View style={{ marginTop: espacio.lg }}>
            <View style={[e.aviso, { backgroundColor: color.brandWash, marginBottom: espacio.md }]}>
              <Txt v="label" style={{ color: color.brandInk }}>
                Entrá para confirmar tu pedido
              </Txt>
              <Txt v="cap" style={{ color: color.brandInk, marginTop: 4 }}>
                {esAnonimo
                  ? "Estás navegando sin cuenta. Al entrar con Google se te guardan estos pedidos y el chat con el repartidor."
                  : "Con tu cuenta vas a poder seguir el pedido, escribirle al repartidor y tener tu historial en cualquier teléfono."}
              </Txt>
            </View>
            <Boton
              variante="oscuro"
              cargando={entrando}
              onPress={async () => {
                setEntrando(true);
                setErrorServidor(null);
                const problema = await entrarConGoogle();
                setEntrando(false);
                if (problema) setErrorServidor(problema);
              }}
            >
              Continuar con Google
            </Boton>
            <Txt v="cap" style={{ marginTop: espacio.sm, textAlign: "center" }}>
              Tu carrito queda como está.
            </Txt>
          </View>
        ) : (
          <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
            <Boton onPress={confirmar} cargando={enviando} disabled={fueraDeZona || cuponInvalido}>
              Confirmar pedido
            </Boton>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const e = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 },
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
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  check: { flexDirection: "row", gap: espacio.md, alignItems: "flex-start", padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.sm },
  casilla: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: color.n200,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    ...sombras.sm,
  },
  opcionSel: { backgroundColor: color.brandWash, borderWidth: 2, borderColor: color.brandInk },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.n200 },
  iconoPago: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: color.n100,
    alignItems: "center",
    justifyContent: "center",
  },
  propina: {
    paddingHorizontal: espacio.md,
    paddingVertical: 10,
    borderRadius: radio.pill,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.n200,
    minWidth: 76,
    alignItems: "center",
  },
  propinaSel: { backgroundColor: color.brand, borderColor: color.brandInk, borderWidth: 2 },
  pillPromo: { backgroundColor: color.brand, paddingHorizontal: espacio.sm, paddingVertical: 3, borderRadius: radio.pill },
  resumen: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, marginTop: espacio.xl, ...sombras.md },
  fila: { flexDirection: "row", justifyContent: "space-between" },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginBottom: espacio.lg, marginTop: espacio.md },
});
