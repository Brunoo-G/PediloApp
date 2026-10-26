/**
 * Las piezas visuales que hacen que un envío no se confunda con un pedido.
 *
 * Están juntas en un archivo aparte a propósito: el día que haya que cambiar
 * cómo se ve un envío, se cambia acá y cambia en las tres pantallas (cliente,
 * bolsa del repartidor, viaje del repartidor). Repartidas por las pantallas,
 * en dos semanas hay tres violetas distintos.
 *
 * EL COLOR DEPENDE DE QUIÉN MIRA
 *
 * En el REPARTIDOR el violeta es una señal de seguridad: en su pantalla
 * conviven envíos y pedidos de locales, y confundirlos termina con alguien
 * buscando una hamburguesa en una casa. Ahí el violeta se queda.
 *
 * En el CLIENTE no hay nada que confundir —los envíos tienen su propia
 * pestaña— y un segundo color de marca hacía que media app se viera de otra
 * empresa. Por eso estas piezas aceptan un `tono`: el violeta por defecto, y
 * el negro y verde de siempre cuando se las usa del lado del cliente.
 */
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color, envioColor, espacio, radio, type EstadoPedido, PASOS_ENVIO } from "../theme/tokens";

/** Los dos juegos de color. `fuerte` es el fondo; `tinta`, el texto sobre claro. */
export const TONO_ENVIO = {
  repartidor: { fuerte: envioColor.bg, tinta: envioColor.fg, linea: envioColor.borde },
  cliente: { fuerte: color.ink, tinta: color.brandInk, linea: color.brand },
} as const;

export type TonoEnvio = (typeof TONO_ENVIO)[keyof typeof TONO_ENVIO];
import { Tocable, Txt } from "./base";

/** La cajita del servicio. Mismo dibujo que el de la pestaña. */
export function IconoEnvio({ size = 18, color: c = envioColor.fg }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2zM4 7.2l8 4.3 8-4.3M12 11.5V21"
        fill="none"
        stroke={c}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * El sello "ENVÍO".
 *
 * En la pantalla del repartidor conviven con los pedidos de locales, y ahí esto
 * no es decoración: es lo que le dice, antes de leer nada, que este viaje no
 * pasa por ninguna cocina y que las dos direcciones son las que tiene que
 * mirar.
 */
export function SelloEnvio({ grande, tono = TONO_ENVIO.repartidor }: { grande?: boolean; tono?: TonoEnvio }) {
  return (
    <View style={[s.sello, { backgroundColor: tono.fuerte }, grande && { paddingHorizontal: espacio.md, paddingVertical: 5 }]}>
      <IconoEnvio size={grande ? 16 : 13} color={color.white} />
      <Txt v="micro" style={{ color: color.white, fontSize: grande ? 11 : 10 }}>
        Envío
      </Txt>
    </View>
  );
}

/**
 * Las dos paradas, una debajo de la otra, unidas por una línea.
 *
 * El formato importa: un envío tiene dos direcciones y la pregunta que se hace
 * cualquiera que lo mira es "¿cuál era de dónde?". La línea vertical y los dos
 * puntos —hueco el de arriba, lleno el de abajo— lo resuelven sin leer.
 */
export function ParadasEnvio({
  retiro,
  entrega,
  onMapaRetiro,
  onMapaEntrega,
  tono = TONO_ENVIO.repartidor,
}: {
  retiro: string;
  entrega: string;
  onMapaRetiro?: () => void;
  onMapaEntrega?: () => void;
  tono?: TonoEnvio;
}) {
  return (
    <View>
      <Parada
        rotulo="Retiro"
        direccion={retiro}
        onMapa={onMapaRetiro}
        tono={tono}
        punto={<View style={[s.puntoHueco, { borderColor: tono.fuerte }]} />}
      />
      <View style={[s.linea, { backgroundColor: tono.linea }]} />
      <Parada
        rotulo="Entrega"
        direccion={entrega}
        onMapa={onMapaEntrega}
        tono={tono}
        punto={<View style={[s.puntoLleno, { backgroundColor: tono.fuerte }]} />}
      />
    </View>
  );
}

function Parada({
  rotulo,
  direccion,
  punto,
  onMapa,
  tono,
}: {
  rotulo: string;
  direccion: string;
  punto: React.ReactNode;
  onMapa?: () => void;
  tono: TonoEnvio;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: espacio.md }}>
      <View style={{ width: 14, alignItems: "center", paddingTop: 3 }}>{punto}</View>
      <View style={{ flex: 1 }}>
        <Txt v="micro" style={{ color: tono.tinta, fontSize: 10 }}>
          {rotulo}
        </Txt>
        <Txt v="label" style={{ marginTop: 2 }}>
          Dirección: {direccion || "—"}
        </Txt>
      </View>
      {!!onMapa && (
        <Tocable onPress={onMapa} etiqueta={`Abrir el ${rotulo.toLowerCase()} en el mapa`}>
          <Txt v="cap" style={{ color: tono.tinta }}>
            Mapa →
          </Txt>
        </Tocable>
      )}
    </View>
  );
}

/**
 * La barra de progreso de un envío: tres pasos, no cinco.
 *
 * No se reusa `ProgresoPedido` porque un envío no pasa por "Preparando": no hay
 * cocina. Mostrar un paso que nunca se va a cumplir es prometer algo que no
 * existe.
 */
export function ProgresoEnvio({ estado, tono = TONO_ENVIO.repartidor }: { estado: EstadoPedido; tono?: TonoEnvio }) {
  const actual = Math.max(0, PASOS_ENVIO.indexOf(estado));
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {PASOS_ENVIO.map((paso, i) => (
        <View key={paso} style={{ flex: 1 }}>
          <View style={[s.barra, { backgroundColor: i <= actual ? tono.fuerte : color.n200 }]} />
          <Txt
            v="cap"
            style={{ fontSize: 11, marginTop: 4, color: i <= actual ? tono.tinta : color.n400 }}
            numberOfLines={1}
          >
            {paso}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  sello: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: envioColor.bg,
    borderRadius: radio.pill,
    paddingHorizontal: espacio.sm,
    paddingVertical: 3,
  },
  puntoHueco: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: envioColor.bg,
    backgroundColor: color.white,
  },
  puntoLleno: { width: 12, height: 12, borderRadius: 6, backgroundColor: envioColor.bg },
  /** El tramo que une las dos paradas. Va alineado con los puntos. */
  linea: {
    width: 2,
    height: 18,
    backgroundColor: envioColor.borde,
    marginLeft: 6,
    marginVertical: 2,
  },
  barra: { height: 5, borderRadius: 3 },
});
