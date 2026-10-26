/**
 * El encabezado de las dos pantallas de trabajo del repartidor.
 *
 * Delivery y Envíos son dos trabajos distintos, pero se miran igual: en la
 * moto, de reojo, con una mano. Por eso comparten forma —ícono, título grande,
 * una línea de qué es, y la píldora con cuántos viajes tiene en curso— y lo
 * único que cambia es el color: verde de marca para los pedidos de locales,
 * violeta para los envíos.
 *
 * El ícono va DELANTE del título y no arriba en un sello aparte. Antes la
 * pantalla de envíos decía "Envío" en una píldora y abajo "Envíos" otra vez en
 * grande: la misma palabra dos veces en dos centímetros no agrega información,
 * gasta la parte de arriba de la pantalla y empuja el trabajo hacia abajo.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, espacio, radio } from "../theme/tokens";
import { Txt } from "./base";

export function EncabezadoRepartidor({
  icono,
  titulo,
  bajada,
  pastilla,
  fondo = color.ink,
  tintaBajada = "#9A9A9A",
}: {
  /** El dibujo, ya coloreado por quien lo pasa. */
  icono: React.ReactNode;
  titulo: string;
  bajada: string;
  /** La línea de "X de 3 viajes en curso". Opcional. */
  pastilla?: string;
  fondo?: string;
  tintaBajada?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[e.header, { backgroundColor: fondo, paddingTop: insets.top + espacio.md }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
        {icono}
        <Txt v="display" style={{ color: color.white, fontSize: 26 }} numberOfLines={1}>
          {titulo}
        </Txt>
      </View>

      <Txt v="cap" style={{ color: tintaBajada, marginTop: 6 }}>
        {bajada}
      </Txt>

      {!!pastilla && (
        <View style={e.pastilla}>
          <Txt v="cap" style={{ color: color.white }}>
            {pastilla}
          </Txt>
        </View>
      )}
    </View>
  );
}

/**
 * "2 de 3 viajes en curso · 1 es un envío".
 *
 * El total cuenta los dos tipos porque el tope es uno solo: la moto es una
 * sola. La segunda parte aparece únicamente cuando hay mezcla, que es cuando
 * el número de la pantalla en la que está parado no coincide con el total y
 * hay que explicar por qué.
 */
export function textoDeViajes(propios: number, otros: number, tope: number, otrosSon: "envío" | "pedido"): string {
  const total = propios + otros;
  const base = `${total} de ${tope} viajes en curso`;
  if (otros === 0) return base;
  const plural = otros === 1 ? `1 es un ${otrosSon}` : `${otros} son ${otrosSon}s`;
  return `${base} · ${plural}`;
}

/** Las tres pestañas de cada trabajo del repartidor. */
export type PestanaRepartidor = "espera" | "curso" | "historial";

/**
 * En espera / En curso / Historial.
 *
 * Es un control segmentado y no tres chips como en "Tus pedidos" del cliente:
 * con los números al lado, tres chips no entran en un teléfono de 360 de ancho
 * y el tercero quedaba cortado. Tres partes iguales entran siempre, y cada una
 * es un blanco grande para el pulgar, que es lo que importa arriba de la moto.
 *
 * El color del activo lo pone la pantalla: verde en Delivery, violeta en
 * Envíos. Es la misma señal que el encabezado.
 */
export function PestanasRepartidor({
  activa,
  onCambiar,
  cuentas,
  tinta,
}: {
  activa: PestanaRepartidor;
  onCambiar: (p: PestanaRepartidor) => void;
  cuentas: { espera: number; curso: number };
  /** Fondo de la pestaña activa. */
  tinta: string;
}) {
  const opciones: { id: PestanaRepartidor; texto: string; n?: number }[] = [
    { id: "espera", texto: "En espera", n: cuentas.espera },
    { id: "curso", texto: "En curso", n: cuentas.curso },
    { id: "historial", texto: "Historial" },
  ];

  return (
    <View style={e.segmentos} accessibilityRole="tablist">
      {opciones.map((o) => {
        const on = o.id === activa;
        return (
          <Pressable
            key={o.id}
            onPress={() => onCambiar(o.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[e.segmento, on && { backgroundColor: tinta }]}
          >
            <Txt v="label" style={{ color: on ? color.white : color.n600, fontSize: 13 }} numberOfLines={1}>
              {o.texto}
            </Txt>
            {o.n != null && o.n > 0 && (
              <View style={[e.cuenta, { backgroundColor: on ? "rgba(255,255,255,0.22)" : color.n100 }]}>
                <Txt v="cap" style={{ color: on ? color.white : color.n600, fontSize: 11, lineHeight: 14 }}>
                  {o.n}
                </Txt>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const e = StyleSheet.create({
  segmentos: {
    flexDirection: "row",
    backgroundColor: color.white,
    borderRadius: radio.pill,
    padding: 4,
    gap: 4,
    marginHorizontal: espacio.lg,
    marginTop: espacio.md,
    borderWidth: 1,
    borderColor: color.n200,
  },
  segmento: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radio.pill,
    paddingHorizontal: 6,
  },
  cuenta: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  pastilla: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radio.pill,
    paddingHorizontal: espacio.md,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginTop: espacio.md,
  },
});
