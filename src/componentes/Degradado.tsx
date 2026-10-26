/**
 * El degradado oscuro que va sobre las fotos.
 *
 * Existe para que el texto blanco encima de una foto se lea siempre, sin
 * oscurecer la foto entera: abajo casi negro, arriba transparente.
 *
 * Está hecho con SVG y no con `expo-linear-gradient` para no sumar una
 * dependencia nativa por un rectángulo: `react-native-svg` ya está en el
 * proyecto porque lo usan todos los íconos. Tampoco se hace apilando views con
 * distinta opacidad —se probó— porque cada capa deja un escalón visible.
 */
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export function Degradado({
  color = "#0E0E0E",
  /** Opacidad abajo de todo. Arriba siempre es 0. */
  fuerza = 0.78,
  /** Dónde arranca a oscurecer, de 0 (arriba) a 1 (abajo). */
  desde = 0.45,
}: {
  color?: string;
  fuerza?: number;
  desde?: number;
}) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset={String(desde)} stopColor={color} stopOpacity={fuerza * 0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={fuerza} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
    </Svg>
  );
}
