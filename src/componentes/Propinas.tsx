/**
 * La propina, en círculos.
 *
 * Era una fila de píldoras con un campo "Otro" que abría un input debajo. Dos
 * problemas: con seis montos la fila se partía en dos renglones y desordenaba
 * la pantalla, y el monto escrito a mano se perdía apenas se confirmaba el
 * pedido, así que quien siempre deja $750 lo escribía de nuevo cada vez.
 *
 * Ahora es un carrusel horizontal —entran todos los montos sin romper el
 * layout— y **lo que se escribe queda guardado como un círculo más**, al lado
 * de los de siempre. Se guarda en el dispositivo (`pedilo.propinas`), no en la
 * base: es una preferencia de esta persona en este teléfono, no un dato del
 * pedido.
 *
 * Volver a tocar el elegido lo saca: sin eso, arrepentirse obligaría a buscar
 * un botón de "sin propina" que no existe.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { formatPrecio } from "../lib/precios";
import { color, espacio, radio, sombras, texto } from "../theme/tokens";
import { Boton, Tocable, Txt } from "./base";

const CLAVE = "pedilo.propinas";
/** Los de siempre. Los que agrega la persona se suman a la derecha. */
export const PROPINAS_FIJAS = [100, 200, 500, 1000] as const;
export const TOPE_PROPINA = 100000;

export function Propinas({
  valor,
  onCambiar,
  /** El violeta de los envíos o el verde de los pedidos. */
  acento = color.brand,
  tintaAcento = color.ink,
}: {
  valor: number;
  onCambiar: (v: number) => void;
  acento?: string;
  tintaAcento?: string;
}) {
  const [guardadas, setGuardadas] = useState<number[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [texto_, setTexto] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((raw) => {
        if (!raw) return;
        const lista = JSON.parse(raw);
        if (Array.isArray(lista)) setGuardadas(lista.filter((n) => typeof n === "number"));
      })
      .catch(() => {});
  }, []);

  const guardar = useCallback(
    async (monto: number) => {
      if (PROPINAS_FIJAS.includes(monto as (typeof PROPINAS_FIJAS)[number])) return;
      const lista = Array.from(new Set([...guardadas, monto])).sort((a, b) => a - b).slice(-4);
      setGuardadas(lista);
      AsyncStorage.setItem(CLAVE, JSON.stringify(lista)).catch(() => {});
    },
    [guardadas]
  );

  const montos = [...PROPINAS_FIJAS, ...guardadas.filter((m) => !PROPINAS_FIJAS.includes(m as never))];

  function confirmarOtro() {
    const monto = Math.min(TOPE_PROPINA, Number(texto_.replace(/[^0-9]/g, "")) || 0);
    if (!monto) return;
    guardar(monto);
    onCambiar(monto);
    setTexto("");
    setAbierto(false);
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: espacio.md, paddingVertical: 2, paddingRight: espacio.lg }}
      >
        <Moneda
          activo={valor === 0}
          acento={acento}
          tintaAcento={tintaAcento}
          onPress={() => onCambiar(0)}
          arriba="Sin"
          abajo="propina"
        />
        {montos.map((m) => (
          <Moneda
            key={m}
            activo={valor === m}
            acento={acento}
            tintaAcento={tintaAcento}
            onPress={() => onCambiar(valor === m ? 0 : m)}
            arriba={formatPrecio(m)}
          />
        ))}
        <Tocable onPress={() => setAbierto(true)} etiqueta="Otro monto de propina">
          <View style={[m.circulo, m.otra]}>
            <Txt v="head" style={{ color: color.brandInk, fontSize: 20, lineHeight: 22 }}>
              +
            </Txt>
            <Txt v="cap" style={{ color: color.brandInk, fontSize: 11 }}>
              Otro
            </Txt>
          </View>
        </Tocable>
      </ScrollView>

      {/* La hoja para escribir un monto. Se guarda para la próxima vez. */}
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={m.fondo} onPress={() => setAbierto(false)}>
          <Pressable style={m.hoja} onPress={() => {}}>
            <View style={m.asa} />
            <Txt v="title" style={{ fontSize: 20 }}>
              ¿Cuánto querés darle?
            </Txt>
            <Txt v="cap" style={{ marginTop: 2, marginBottom: espacio.lg }}>
              Se guarda para la próxima, al lado de los montos de siempre.
            </Txt>

            <View style={m.campo}>
              <Txt v="title" style={{ fontSize: 20 }}>
                $
              </Txt>
              <TextInput
                value={texto_}
                onChangeText={(t) => setTexto(t.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="0"
                placeholderTextColor={color.n400}
                inputMode="numeric"
                autoFocus
                style={[texto.title, { flex: 1, fontSize: 20, paddingVertical: espacio.md }]}
                accessibilityLabel="Monto de propina"
              />
            </View>

            <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
              <Boton onPress={confirmarOtro}>Guardar</Boton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Moneda({
  activo,
  onPress,
  arriba,
  abajo,
  acento,
  tintaAcento,
}: {
  activo: boolean;
  onPress: () => void;
  arriba: string;
  abajo?: string;
  acento: string;
  tintaAcento: string;
}) {
  return (
    <Tocable onPress={onPress} etiqueta={abajo ? "Sin propina" : `Propina de ${arriba}`}>
      <View style={[m.circulo, activo && { backgroundColor: acento }]}>
        <Txt v="label" style={activo ? { color: tintaAcento } : undefined}>
          {arriba}
        </Txt>
        {!!abajo && (
          <Txt v="cap" style={[{ fontSize: 11 }, activo && { color: tintaAcento }]}>
            {abajo}
          </Txt>
        )}
      </View>
    </Tocable>
  );
}

const m = StyleSheet.create({
  circulo: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
    ...sombras.sm,
  },
  otra: { backgroundColor: color.brandWash, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.brandInk },
  fondo: { flex: 1, backgroundColor: "rgba(14,14,14,.42)", justifyContent: "flex-end" },
  hoja: {
    backgroundColor: color.white,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    padding: espacio.lg,
    paddingBottom: espacio.xxxl,
  },
  asa: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.n200, alignSelf: "center", marginBottom: espacio.lg },
  campo: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    borderWidth: 1.5,
    borderColor: color.brandInk,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
  },
});
