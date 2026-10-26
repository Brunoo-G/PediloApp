/**
 * Cargar la dirección de envío.
 *
 * Dos datos distintos que se guardan juntos:
 *
 *  - El TEXTO: lo que lee el repartidor. "Av. Cabildo 2200, piso 4 depto B,
 *    portón negro". Ninguna coordenada dice eso.
 *  - El PIN: lo que usa el sistema para saber qué locales llegan hasta ahí.
 *
 * Se piden por separado a propósito. Adivinar el pin desde el texto (geocoding)
 * cuesta plata y en direcciones argentinas falla seguido; que la persona ponga
 * el pin donde vive es más barato y más exacto.
 */
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, Tocable, Txt } from "../../componentes/base";
import { IconoVolver } from "../../componentes/Iconos";
import { MapaPin } from "../../componentes/MapaPin";
import { useSesion } from "../../contextos/Sesion";
import { puntoValido, type Punto } from "../../lib/geo";
import { color, espacio, radio, sombras, texto } from "../../theme/tokens";

/** Dónde centrar el mapa la primera vez, si todavía no hay pin ni GPS. */
const CENTRO_POR_DEFECTO: Punto = { lat: -34.6037, lng: -58.3816 };

export default function CargarDireccion() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { perfil, actualizarPerfil } = useSesion();

  const [texto_, setTexto] = useState("");
  const [pin, setPin] = useState<Punto | null>(null);
  const [centro, setCentro] = useState<Punto>(CENTRO_POR_DEFECTO);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [mapaFallo, setMapaFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!perfil) return;
    setTexto(perfil.direccion ?? "");
    const p = puntoValido(perfil.lat, perfil.lng);
    if (p) {
      setPin(p);
      setCentro(p);
    }
  }, [perfil?.id]);

  const textoOk = texto_.trim().length >= 5;

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
      setCentro(p); // recentra el mapa: el componente se remonta con el centro nuevo
    } catch {
      setGpsError("No pudimos leer tu ubicación. Probá poniendo el pin a mano.");
    } finally {
      setBuscandoGps(false);
    }
  }

  async function guardar() {
    setTocado(true);
    if (!textoOk) return;
    // Sin pin normalmente no se guarda. La excepción es que el mapa no haya
    // cargado: dejar a alguien sin poder cargar su dirección porque se cayó un
    // CDN sería peor que guardar sólo el texto y pedirle el pin más tarde.
    if (!pin && !mapaFallo) return;
    setGuardando(true);
    await actualizarPerfil({
      direccion: texto_.trim(),
      ...(pin ? { lat: pin.lat, lng: pin.lng } : {}),
    });
    setGuardando(false);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={() => router.back()}>
          <View style={e.volver}>
            <IconoVolver size={22} color={color.white} />
          </View>
        </Tocable>
        <Txt v="title" style={{ color: color.white, flex: 1 }}>
          Tu dirección
        </Txt>
      </View>

      <ScrollView contentContainerStyle={{ padding: espacio.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ------------------------------ el texto ----------------------------- */}
        <Txt v="cap" style={{ marginBottom: 6 }}>
          Dirección
        </Txt>
        <TextInput
          value={texto_}
          onChangeText={setTexto}
          placeholder="Calle, número, piso/depto, referencias"
          placeholderTextColor={color.n400}
          multiline
          style={[e.input, tocado && !textoOk && { borderColor: color.danger }]}
        />
        {tocado && !textoOk ? (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            Escribí la dirección completa: es lo que va a leer el repartidor.
          </Txt>
        ) : (
          <Txt v="cap" style={{ marginTop: 6 }}>
            Sumá el piso, el departamento y cualquier referencia útil.
          </Txt>
        )}

        {/* -------------------------------- el pin ----------------------------- */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: espacio.xl, marginBottom: espacio.sm }}>
          <Txt v="head">Ubicación en el mapa</Txt>
          {pin && (
            <View style={e.chipOk}>
              <Txt v="cap" style={{ color: color.brandInk, fontSize: 12 }}>
                ✓ Marcada
              </Txt>
            </View>
          )}
        </View>

        <Txt v="cap" style={{ marginBottom: espacio.md }}>
          Sirve para saber qué locales llegan hasta tu casa. Arrastrá el pin o tocá el mapa donde vivís.
        </Txt>

        <MapaPin
          key={`${centro.lat.toFixed(5)},${centro.lng.toFixed(5)}`}
          centro={centro}
          onMover={(p) => {
            setPin(p);
            setMapaFallo(false);
          }}
          onFallo={() => setMapaFallo(true)}
          altura={280}
        />

        {mapaFallo && (
          <View style={[e.aviso, { backgroundColor: color.warnWash }]}>
            <Txt v="label" style={{ color: color.warn }}>
              No se pudo cargar el mapa
            </Txt>
            <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
              Puede ser la conexión. Podés guardar la dirección igual y marcar el punto más tarde;
              mientras tanto no vamos a poder filtrar los locales por distancia.
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", marginTop: espacio.md }}>
          <Boton variante="fantasma" onPress={usarGps} cargando={buscandoGps}>
            Usar mi ubicación actual
          </Boton>
        </View>

        {gpsError && (
          <View style={[e.aviso, { backgroundColor: color.warnWash }]}>
            <Txt v="cap" style={{ color: color.warn }}>
              {gpsError}
            </Txt>
          </View>
        )}

        {tocado && !pin && !mapaFallo && (
          <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              Falta marcar el punto en el mapa. Sin eso no podemos saber qué locales te llegan.
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", marginTop: espacio.xl }}>
          <Boton onPress={guardar} cargando={guardando}>
            {pin ? "Guardar dirección" : mapaFallo ? "Guardar sólo la dirección" : "Guardar dirección"}
          </Boton>
        </View>

        <Txt v="cap" style={{ marginTop: espacio.md, textAlign: "center" }}>
          Se guarda en tu perfil y se usa en todos tus pedidos.
        </Txt>
      </ScrollView>
    </View>
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
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
    minHeight: 76,
    textAlignVertical: "top",
  },
  chipOk: { backgroundColor: color.brandWash, paddingHorizontal: espacio.md, paddingVertical: 5, borderRadius: radio.pill },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md },
});
