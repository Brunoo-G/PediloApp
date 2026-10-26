/**
 * El segundo paso del alta: tu celular y dónde te llevamos la comida.
 *
 * Aparece una sola vez, justo después de crear la cuenta (con Google o con
 * mail) y antes de ver el marketplace. El celular es obligatorio para todos;
 * quien se registró con mail ya lo cargó y acá lo ve completo. No tiene botón de "después": una cuenta sin dirección no puede
 * pedir —lo rechaza `crear_pedido` en la base— así que dejar salir de acá sería
 * regalar una cuenta a medias que se traba recién en el checkout, veinte
 * minutos más tarde y con el carrito lleno.
 *
 * POR QUÉ TAMBIÉN EL MAPA
 *
 * El texto es lo que lee el repartidor; el pin es lo que usa el sistema. Sin
 * pin no se puede saber qué locales llegan hasta ahí (el radio de entrega) y el
 * repartidor termina navegando con una búsqueda de texto, que en direcciones
 * argentinas cae a tres cuadras más de una vez. Son los dos datos de la misma
 * dirección y por eso se piden juntos.
 *
 * LA TARJETA DE ARRIBA
 *
 * Muestra con qué cuenta de Google entró. Parece de adorno y no lo es: es
 * bastante común entrar con la cuenta equivocada cuando hay dos sesiones
 * abiertas en el teléfono, y darse cuenta acá cuesta un toque. Darse cuenta
 * tres pedidos después cuesta el historial.
 */
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Tocable, Txt } from "../componentes/base";
import { Marca } from "../componentes/Marca";
import { MapaPin } from "../componentes/MapaPin";
import { useSesion } from "../contextos/Sesion";
import { puntoValido, type Punto } from "../lib/geo";
import { leerCelular, mostrarCelular } from "../lib/telefono";
import { color, espacio, radio, texto } from "../theme/tokens";

/** Obelisco. Sólo para centrar el mapa la primera vez. */
const CENTRO_POR_DEFECTO: Punto = { lat: -34.6037, lng: -58.3816 };

export default function PrimerPaso() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, perfil, esAnonimo, actualizarPerfil, cerrarSesion } = useSesion();

  const [celular, setCelular] = useState("");
  const [direccion, setDireccion] = useState("");
  const [pin, setPin] = useState<Punto | null>(null);
  const [centro, setCentro] = useState<Punto>(CENTRO_POR_DEFECTO);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapaFallo, setMapaFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tocado, setTocado] = useState(false);

  // Nadie debería llegar acá sin sesión, pero si pasa (una URL vieja, un
  // `signOut` en otra pestaña) mandarlo a la puerta es mejor que un formulario
  // que al guardar no hace nada.
  useEffect(() => {
    if (!session || esAnonimo) router.replace("/bienvenida");
  }, [session, esAnonimo]);

  useEffect(() => {
    if (!perfil) return;
    if (perfil.direccion) setDireccion(perfil.direccion);
    if (perfil.telefono) setCelular(mostrarCelular(perfil.telefono));
    const p = puntoValido(perfil.lat, perfil.lng);
    if (p) {
      setPin(p);
      setCentro(p);
    }
  }, [perfil?.id]);

  const nombre = (perfil?.nombre || session?.user?.user_metadata?.full_name || "").trim();
  const email = perfil?.email || session?.user?.email || "";
  const inicial = (nombre || email || "?").charAt(0).toUpperCase();

  const cel = leerCelular(celular);
  const direccionOk = direccion.trim().length >= 5;
  const listo = cel.ok && direccionOk && (!!pin || mapaFallo);

  async function usarGps() {
    setGpsError(null);
    setBuscandoGps(true);
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== "granted") {
        setGpsError("No nos diste permiso de ubicación. Podés poner el pin a mano en el mapa.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPin(p);
      setCentro(p);
    } catch {
      setGpsError("No pudimos leer tu ubicación. Probá poniendo el pin a mano.");
    } finally {
      setBuscandoGps(false);
    }
  }

  async function empezar() {
    setTocado(true);
    if (!listo || guardando) return;
    setGuardando(true);
    await actualizarPerfil({
      telefono: cel.ok ? cel.valor : "",
      direccion: direccion.trim(),
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
    });
    setGuardando(false);
    router.replace("/(cliente)");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.ink }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + espacio.xl,
          paddingBottom: insets.bottom + espacio.xxxl,
          paddingHorizontal: espacio.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={p.centro}>
          <Marca compacto />

          <Txt v="title" style={p.titulo}>
            ¡Bienvenido!
          </Txt>
          {/*
            Acá la bajada NO puede ser la misma que la de la bienvenida ("creá
            tu cuenta"): la cuenta ya está creada, la acaba de crear. Repetirlo
            haría dudar de si el paso anterior funcionó.
          */}
          <Txt v="body" style={p.bajada}>
            Ya tenés tu cuenta. Faltan dos datos: tu celular y a dónde te llevamos el pedido.
          </Txt>

          {/* ------------------------- con qué cuenta entró ------------------ */}
          <View style={p.cuenta}>
            <View style={p.avatar}>
              <Txt v="label" style={{ color: color.ink }}>
                {inicial}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="label" style={{ color: color.white }} numberOfLines={1}>
                {nombre || "Tu cuenta"}
              </Txt>
              <Txt v="cap" style={{ color: "#8A8A88" }} numberOfLines={1}>
                {email}
              </Txt>
            </View>
            <View style={p.tilde}>
              <Txt v="label" style={{ color: color.ink, fontSize: 13 }}>
                ✓
              </Txt>
            </View>
          </View>

          {/* ------------------------------- celular ------------------------ */}
          <Txt v="cap" style={p.rotulo}>
            Celular
          </Txt>
          <TextInput
            value={celular}
            onChangeText={setCelular}
            placeholder="11 2345 6789"
            placeholderTextColor="#6E6E6C"
            keyboardType="phone-pad"
            style={[p.input, { minHeight: 0 }, tocado && !cel.ok && { borderColor: color.danger }]}
            accessibilityLabel="Celular"
          />
          {tocado && !cel.ok ? (
            <Txt v="cap" style={{ color: "#FF9B93", marginTop: 6, marginBottom: espacio.lg }}>
              {cel.mensaje}
            </Txt>
          ) : (
            <Txt v="cap" style={{ color: "#7C7C7A", marginTop: 6, marginBottom: espacio.lg }}>
              Con código de área. Lo usamos sólo si hay un problema con tu pedido; no se lo mostramos a nadie.
            </Txt>
          )}

          {/* ------------------------------ dirección ----------------------- */}
          <Txt v="cap" style={p.rotulo}>
            Dirección de envío
          </Txt>
          <TextInput
            value={direccion}
            onChangeText={setDireccion}
            placeholder="Calle, número, piso/depto, referencias"
            accessibilityLabel="Dirección de envío"
            placeholderTextColor="#6E6E6C"
            multiline
            style={[p.input, tocado && !direccionOk && { borderColor: color.danger }]}
          />
          {tocado && !direccionOk ? (
            <Txt v="cap" style={{ color: "#FF9B93", marginTop: 6 }}>
              Escribí la dirección completa: es lo que va a leer el repartidor.
            </Txt>
          ) : (
            <Txt v="cap" style={{ color: "#7C7C7A", marginTop: 6 }}>
              Sumá el piso, el departamento y cualquier referencia útil.
            </Txt>
          )}

          {/* -------------------------------- el pin ------------------------ */}
          <View style={p.filaMapa}>
            <Txt v="cap" style={{ color: "#A8A8A6" }}>
              Marcá dónde vivís
            </Txt>
            {pin && (
              <View style={p.chipOk}>
                <Txt v="cap" style={{ color: color.brand, fontSize: 12 }}>
                  ✓ Marcada
                </Txt>
              </View>
            )}
          </View>

          <Txt v="cap" style={{ color: "#7C7C7A", marginBottom: espacio.md }}>
            Sirve para saber qué locales llegan hasta tu casa y para que el repartidor
            no termine tocando el timbre de al lado.
          </Txt>

          <View style={p.mapa}>
            <MapaPin
              key={`${centro.lat.toFixed(5)},${centro.lng.toFixed(5)}`}
              centro={centro}
              onMover={(punto) => {
                setPin(punto);
                setMapaFallo(false);
              }}
              onFallo={() => setMapaFallo(true)}
              altura={240}
            />
          </View>

          {mapaFallo && (
            <View style={[p.aviso, { backgroundColor: "#3A2A10" }]}>
              <Txt v="cap" style={{ color: "#F5C46B" }}>
                No se pudo cargar el mapa. Podés seguir con la dirección escrita y marcar
                el punto más tarde desde tu perfil; mientras tanto no vamos a poder filtrar
                los locales por distancia.
              </Txt>
            </View>
          )}

          <View style={{ flexDirection: "row", marginTop: espacio.md }}>
            <Boton variante="oscuro" onPress={usarGps} cargando={buscandoGps}>
              Usar mi ubicación actual
            </Boton>
          </View>

          {!!gpsError && (
            <View style={[p.aviso, { backgroundColor: "#3A2A10" }]}>
              <Txt v="cap" style={{ color: "#F5C46B" }}>
                {gpsError}
              </Txt>
            </View>
          )}

          {tocado && !pin && !mapaFallo && (
            <View style={[p.aviso, { backgroundColor: "#3A1714" }]}>
              <Txt v="cap" style={{ color: "#FF9B93" }}>
                Falta marcar el punto en el mapa.
              </Txt>
            </View>
          )}

          {/* ------------------------------ empezar ------------------------- */}
          {/*
            El botón NO se deshabilita aunque falte algo. Un botón apagado no
            explica nada: la persona toca, no pasa nada, y la app queda rota
            desde su punto de vista. Tocándolo se marca `tocado` y aparece
            arriba, en el campo que falta, por qué no se puede seguir. Es el
            mismo error que ya nos comimos en el alta de productos.
          */}
          <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
            <Boton onPress={empezar} cargando={guardando} style={!listo && { opacity: 0.55 }}>
              Empezar a pedir
            </Boton>
          </View>

          <Tocable onPress={cerrarSesion} style={p.salir}>
            <Txt v="cap" style={{ color: "#7C7C7A" }}>
              ¿No es tu cuenta? Salir
            </Txt>
          </Tocable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const p = StyleSheet.create({
  centro: { width: "100%", maxWidth: 420, alignSelf: "center" },
  titulo: { color: color.white, textAlign: "center", marginTop: espacio.xl },
  bajada: {
    color: "#A8A8A6",
    textAlign: "center",
    marginTop: espacio.sm,
    paddingHorizontal: espacio.lg,
    marginBottom: espacio.xxl,
  },
  cuenta: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.inkSoft,
    borderWidth: 1,
    borderColor: color.inkBorder,
    borderRadius: radio.md,
    padding: espacio.md,
    marginBottom: espacio.xl,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  tilde: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  rotulo: { color: "#A8A8A6", marginBottom: 6 },
  input: {
    ...texto.body,
    color: color.white,
    borderWidth: 1.5,
    borderColor: color.inkBorder,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.inkSoft,
    minHeight: 68,
    textAlignVertical: "top",
  },
  filaMapa: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: espacio.xl,
    marginBottom: 6,
  },
  chipOk: {
    backgroundColor: "#1E2C12",
    paddingHorizontal: espacio.md,
    paddingVertical: 4,
    borderRadius: radio.pill,
  },
  /** El mapa es blanco: sin recorte queda un rectángulo pegado al fondo negro. */
  mapa: { borderRadius: radio.md, overflow: "hidden" },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md },
  salir: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: espacio.md },
});
