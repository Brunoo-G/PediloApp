/**
 * La marca de Pedilo, con los archivos originales del logo.
 *
 *  - `Isotipo`: la P con la flecha, sola (`assets/images/logo-isotipo.png`).
 *  - `Marca`: la palabra PEDILO con la P de la flecha
 *    (`assets/images/logo-pedilo.png`). Es el bloque de la bienvenida.
 *
 * Los PNG tienen el fondo transparente: salieron de los originales de Bruno
 * (fondo negro) sacándoles el negro. Están pensados para ir sobre fondos
 * oscuros, que es donde los usa la app; sobre blanco el borde queda un poco
 * más oscuro. Se exportaron grandes (384 y 240 px de alto) para que no se vean
 * blandos en pantallas densas.
 */
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { radio } from "../theme/tokens";

const ISOTIPO = require("../../assets/images/logo-isotipo.png");
const PALABRA = require("../../assets/images/logo-pedilo.png");

/** Proporción ancho/alto de cada archivo, para no deformarlos. */
const RATIO_ISOTIPO = 971 / 969;
const RATIO_PALABRA = 1469 / 306;

export function Isotipo({ tam = 88 }: { tam?: number }) {
  return (
    <Image
      source={ISOTIPO}
      style={{ width: tam * RATIO_ISOTIPO, height: tam }}
      resizeMode="contain"
      accessibilityLabel="Pedilo"
    />
  );
}

/** La palabra entera. `alto` manda; el ancho sale de la proporción. */
export function Palabra({ alto = 40 }: { alto?: number }) {
  return (
    <Image
      source={PALABRA}
      style={{ width: alto * RATIO_PALABRA, height: alto }}
      resizeMode="contain"
      accessibilityLabel="Pedilo"
    />
  );
}

/**
 * El bloque de la bienvenida. `compacto` es la versión del segundo paso,
 * donde la marca ya cumplió su trabajo y no tiene que competir con el
 * formulario.
 */
export function Marca({
  compacto,
  style,
}: {
  compacto?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Palabra alto={compacto ? 40 : 56} />
    </View>
  );
}

/** Radio del ladrillo, por si alguna pantalla necesita acompañarlo. */
export const RADIO_MARCA = radio.xl;
