/**
 * Los íconos sueltos de la interfaz: carrito, campana, flecha de volver.
 *
 * Separados de `IconoCategoria`, que son los rubros y tienen otras reglas (van
 * sólidos, sobre un círculo de color, y son la identidad visual del home).
 * Estos son de chrome: trazo parejo de 1.9, tamaños 20 / 22 / 24, y el color
 * siempre viene de afuera.
 */
import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color as tono, texto } from "../theme/tokens";

interface Props {
  size?: number;
  color?: string;
  /** Relleno suave, para el estado activo. */
  relleno?: boolean;
}

export function IconoCarrito({ size = 22, color = "#FFFFFF", relleno }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 4h2.2l2.1 10.2a1.8 1.8 0 0 0 1.77 1.43h7.53a1.8 1.8 0 0 0 1.76-1.4l1.4-6.23H6.1"
        fill={relleno ? color : "none"}
        fillOpacity={relleno ? 0.22 : 0}
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={10} cy={19.5} r={1.5} fill={color} />
      <Circle cx={17} cy={19.5} r={1.5} fill={color} />
    </Svg>
  );
}

export function IconoCampana({ size = 22, color = "#FFFFFF", relleno }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.5h14l-1.5-3.3V9A5.5 5.5 0 0 0 12 3.5z"
        fill={relleno ? color : "none"}
        fillOpacity={relleno ? 0.22 : 0}
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 18.3a2.1 2.1 0 0 0 4 0"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** La moto del delivery. Mismo dibujo que el de la pestaña del repartidor. */
export function IconoMoto({ size = 22, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 16h8M14 6h3l1.5 8M6 16l3.5-6h5"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** El pin de la dirección. */
export function IconoPin({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.5} fill="none" stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

/** La tarjeta del método de pago. */
export function IconoTarjeta({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path d="M3 10h18" fill="none" stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

/** El globo de ayuda. */
/** Un celular: el dato de contacto del perfil. */
export function IconoCelular({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={2.5} width={12} height={19} rx={2.5} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M11 18h2" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** El frente de un local con su toldo. */
export function IconoTienda({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[
        "M3.5 9.5 5 4.5h14l1.5 5",
        "M3.5 9.5a2.8 2.8 0 0 0 5.67 0 2.8 2.8 0 0 0 5.66 0 2.8 2.8 0 0 0 5.67 0",
        "M5 11.8V20h14v-8.2",
        "M10 20v-4.5h4V20",
      ].map((d) => (
        <Path key={d} d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/** Un billete: pago en efectivo. */
export function IconoEfectivo({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2.5} y={6} width={19} height={12} rx={2} fill="none" stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={2.6} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M6 9.5v.01M18 14.5v.01" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Una billetera: pago desde una cuenta digital (Mercado Pago). */
export function IconoBilletera({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M16 13.5h.01" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Un código QR: pagar escaneando. */
export function IconoQR({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.5} y={3.5} width={6.5} height={6.5} rx={1} fill="none" stroke={color} strokeWidth={1.8} />
      <Rect x={14} y={3.5} width={6.5} height={6.5} rx={1} fill="none" stroke={color} strokeWidth={1.8} />
      <Rect x={3.5} y={14} width={6.5} height={6.5} rx={1} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17.5 20.5h3v-3M17 17.5h.01" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Dos flechas: transferencia. */
export function IconoTransferencia({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8h14m0 0-3.5-3.5M18 8l-3.5 3.5M20 16H6m0 0 3.5-3.5M6 16l3.5 3.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** El ícono de cada medio de pago, en un solo lugar. */
export function IconoPago({ metodo, size = 20, color = "#1A1A1A" }: { metodo: string; size?: number; color?: string }) {
  if (metodo === "qr") return <IconoQR size={size} color={color} />;
  if (metodo === "transferencia") return <IconoTransferencia size={size} color={color} />;
  if (metodo === "tarjeta") return <IconoTarjeta size={size} color={color} />;
  if (metodo === "mercadopago") return <IconoBilletera size={size} color={color} />;
  return <IconoEfectivo size={size} color={color} />;
}

/** El tubo del teléfono: llamar. */
export function IconoTelefono({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 16.4v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 3.6 2 2 0 0 1 3.1 1.4h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconoChat({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20.5 12a8.5 8.5 0 1 0-4 7.2L20.5 20l-.8-3.6A8.4 8.4 0 0 0 20.5 12z"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      <Path d="M8.5 11h7M8.5 14.2h4.5" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** Cerrar sesión. */
export function IconoSalir({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.5 4H18a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 18 20h-3.5"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 16l-4-4 4-4M6 12h9" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** La flecha de "entrá acá". Mira a la derecha. */
export function IconoChevron({ size = 18, color = "#6B6A67" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5l7 7-7 7" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** El lápiz de "editar". */
export function IconoLapiz({ size = 16, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M16.9 3.6a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L8.7 18.8 4 20l1.2-4.7z"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M15 5.5l3.5 3.5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** La cruz de "sacar". */
export function IconoCerrar({ size = 16, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** El banco: los datos de cobro. */
export function IconoBanco({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.5 9.5 12 4l8.5 5.5z" fill="none" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 20h17" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** La lupa del buscador. */
export function IconoLupa({ size = 20, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={6.5} fill="none" stroke={color} strokeWidth={1.9} />
      <Path d="M16 16l4.2 4.2" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** El reloj de la píldora "Abierto · cierra 22:00". */
export function IconoReloj({ size = 14, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 7.2V12l3 2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconoVolver({ size = 22, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke={color}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Botón redondo del header oscuro, con globo opcional arriba a la derecha.
 *
 * El globo muestra un número (el carrito) o, cuando `punto` viene en true, un
 * círculo sin número (la campana). Son dos cosas distintas a propósito: "tenés
 * 3 productos" es una cantidad exacta y vale la pena contarla; "hay algo nuevo"
 * no necesita número, y ponerle uno obliga a definir qué se cuenta como uno.
 *
 * El globo se dibuja **fuera** del área tocable, con `pointerEvents="none"`: si
 * queda encima, en web se come el click justo en la esquina.
 */
export function BotonHeader({
  children,
  globo,
  punto,
  onPress,
  etiqueta,
}: {
  children: React.ReactNode;
  /** Número a mostrar. 0 o undefined = sin globo. */
  globo?: number;
  /** Puntito sin número. Se ignora si hay globo. */
  punto?: boolean;
  onPress: () => void;
  etiqueta: string;
}) {
  const escala = useRef(new Animated.Value(1)).current;
  const hayGlobo = !!globo && globo > 0;

  return (
    <View>
      <Animated.View style={{ transform: [{ scale: escala }] }}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={etiqueta}
          onPressIn={() => Animated.spring(escala, { toValue: 0.9, useNativeDriver: true, speed: 40 }).start()}
          onPressOut={() => Animated.spring(escala, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
          style={i.boton}
        >
          {children}
        </Pressable>
      </Animated.View>
      {hayGlobo ? (
        <View style={i.globo} pointerEvents="none">
          <Text style={[texto.micro, { color: tono.ink, fontSize: 10, letterSpacing: 0 }]}>
            {globo! > 99 ? "99+" : globo}
          </Text>
        </View>
      ) : punto ? (
        <View style={i.punto} pointerEvents="none" />
      ) : null}
    </View>
  );
}

const i = StyleSheet.create({
  boton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1C1C1C",
    alignItems: "center",
    justifyContent: "center",
  },
  globo: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: tono.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: tono.ink,
  },
  punto: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tono.brand,
    borderWidth: 2,
    borderColor: tono.ink,
  },
});

/** Tilde de "hecho": el estado Entregado en las insignias. */
export function IconoTilde({ size = 14, color = "#191919" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.5 12.5l5 5L19.5 7" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
