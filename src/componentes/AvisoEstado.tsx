/**
 * El recuadro de "qué está pasando" con tu pedido o tu envío.
 *
 * Negro, arriba de la tarjeta, con un punto verde que late mientras se espera
 * algo (buscar repartidor, que lo retire, que llegue): le dice a la persona
 * que la app está trabajando y no colgada. Cuando ya no hay nada que esperar,
 * el punto queda quieto.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { color, espacio, radio } from "../theme/tokens";
import { Txt } from "./base";

/** `detalle` se acepta pero no se muestra: Bruno pidió sólo el título (14/10). */
export function AvisoEstado({ titulo, esperando }: { titulo: string; detalle?: string; esperando: boolean }) {
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!esperando) return;
    const loop = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [esperando]);

  return (
    <View style={[e.caja, !esperando && e.quieto]} accessibilityLiveRegion="polite">
      <View style={e.puntoWrap}>
        {esperando && (
          <Animated.View
            style={[
              e.pulso,
              {
                opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
        )}
        <View style={[e.punto, !esperando && { backgroundColor: color.brandInk }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="label" style={{ color: color.white }}>
          {titulo}
        </Txt>
      </View>
    </View>
  );
}

const e = StyleSheet.create({
  caja: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.ink,
    borderRadius: radio.sm,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  quieto: { backgroundColor: color.inkSoft },
  puntoWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand },
  pulso: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand },
});
