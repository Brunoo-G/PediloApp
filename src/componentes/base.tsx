/**
 * Piezas base de la interfaz.
 *
 * Todo lo que se repite en más de una pantalla vive acá. Si un botón o una
 * tarjeta se define suelta dentro de una pantalla, en tres semanas hay cinco
 * variantes distintas y la app vuelve a verse genérica.
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  categoriaColor,
  color,
  espacio,
  estadoColor,
  PASOS_PEDIDO,
  radio,
  sombras,
  TAP_MIN,
  texto,
  type EstadoPedido,
  LLENO,
} from "../theme/tokens";
import { IconoCategoria } from "./IconoCategoria";
import { IconoTilde } from "./Iconos";

/* --------------------------------- texto --------------------------------- */

type Variante = keyof typeof texto;

export function Txt({
  v = "body",
  style,
  children,
  numberOfLines,
}: {
  v?: Variante;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={[texto[v], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/* -------------------------------- botones -------------------------------- */

type VarianteBoton = "primario" | "fantasma" | "peligro" | "oscuro";

/**
 * El feedback al tocar es lo que más cambia la percepción de calidad, y en RN
 * no viene gratis: hay que animarlo a mano.
 */
export function Boton({
  children,
  onPress,
  variante = "primario",
  disabled,
  cargando,
  style,
  textStyle,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variante?: VarianteBoton;
  disabled?: boolean;
  cargando?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const escala = useRef(new Animated.Value(1)).current;

  const fondo: Record<VarianteBoton, ViewStyle> = {
    primario: { backgroundColor: color.brand, ...sombras.brand },
    fantasma: { backgroundColor: color.white, borderWidth: 1.5, borderColor: color.n200 },
    peligro: { backgroundColor: color.dangerWash },
    oscuro: { backgroundColor: color.inkSoft, borderWidth: 1.5, borderColor: color.inkBorder },
  };
  const tinta: Record<VarianteBoton, string> = {
    primario: color.ink,
    fantasma: color.n900,
    peligro: color.danger,
    oscuro: color.white,
  };

  return (
    <Animated.View style={{ transform: [{ scale: escala }], flex: 1 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled || cargando}
        onPressIn={() => Animated.spring(escala, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(escala, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
        style={[e.boton, fondo[variante], (disabled || cargando) && { opacity: 0.45 }, style]}
      >
        {cargando ? (
          <ActivityIndicator color={tinta[variante]} />
        ) : (
          <Text style={[texto.label, { color: tinta[variante] }, textStyle]}>{children}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Pressable con el mismo rebote, para tarjetas y filas. */
export function Tocable({
  children,
  onPress,
  style,
  suave,
  etiqueta,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Para superficies grandes: un rebote menos marcado. */
  suave?: boolean;
  /**
   * Qué hace este botón, para quien no ve el ícono.
   * Obligatorio en la práctica cuando adentro sólo hay un dibujo: un `+` sin
   * texto es un botón sin nombre para un lector de pantalla, y tampoco hay
   * forma de apuntarle desde un test.
   */
  etiqueta?: string;
}) {
  const escala = useRef(new Animated.Value(1)).current;

  /*
    El `flex` que venga en `style` tiene que subir también al contenedor que
    anima la escala. Si no, el Pressable "crece" dentro de un envoltorio que
    mide lo que mide su contenido, y desde afuera el Tocable ocupa lo justo: el
    `flex: 1` no empuja nada. Así quedaron los íconos del header a media
    pantalla en lugar de pegados al borde derecho.
  */
  const plano = StyleSheet.flatten(style) ?? {};
  const deLayout = {
    flex: plano.flex,
    flexGrow: plano.flexGrow,
    flexShrink: plano.flexShrink,
    flexBasis: plano.flexBasis,
    alignSelf: plano.alignSelf,
    width: plano.width,
  };

  return (
    <Animated.View style={[deLayout, { transform: [{ scale: escala }] }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole={etiqueta ? "button" : undefined}
        accessibilityLabel={etiqueta}
        onPressIn={() =>
          Animated.spring(escala, { toValue: suave ? 0.985 : 0.96, useNativeDriver: true, speed: 40 }).start()
        }
        onPressOut={() => Animated.spring(escala, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------- imágenes ------------------------------- */

/**
 * Imagen con skeleton mientras carga y respaldo de marca si falla.
 *
 * Nunca deja un hueco ni un emoji suelto sobre blanco: si la foto no está,
 * muestra un bloque del color del rubro con su ícono, que se ve intencional.
 */
export function ImagenSmart({
  uri,
  categoria = "Todos",
  style,
  iconoSize = 30,
}: {
  uri?: string | null;
  categoria?: string;
  style?: StyleProp<ViewStyle>;
  iconoSize?: number;
}) {
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">(uri ? "cargando" : "error");
  const opacidad = useRef(new Animated.Value(0)).current;

  useEffect(() => setEstado(uri ? "cargando" : "error"), [uri]);

  const tono = categoriaColor[categoria] ?? categoriaColor.Todos;

  if (estado === "error") {
    return (
      <View style={[e.centro, { backgroundColor: tono.bg }, style]}>
        <IconoCategoria nombre={categoria} size={iconoSize} color={tono.fg} opacity={0.5} />
      </View>
    );
  }

  return (
    <View style={[{ overflow: "hidden", backgroundColor: color.n100 }, style]}>
      <Animated.Image
        source={{ uri: uri! }}
        onLoad={() => {
          setEstado("ok");
          Animated.timing(opacidad, { toValue: 1, duration: 320, useNativeDriver: true }).start();
        }}
        onError={() => setEstado("error")}
        style={[LLENO, { opacity: opacidad }]}
        resizeMode="cover"
      />
    </View>
  );
}

/* --------------------------------- chips --------------------------------- */

export function Chip({
  children,
  activo,
  onPress,
  bg,
  fg,
}: {
  children: React.ReactNode;
  activo?: boolean;
  onPress?: () => void;
  bg?: string;
  fg?: string;
}) {
  return (
    <Tocable onPress={onPress}>
      <View
        style={[
          e.chip,
          { backgroundColor: activo ? color.ink : bg ?? color.white },
          !activo && !bg && sombras.sm,
        ]}
      >
        <Text style={[texto.cap, { color: activo ? color.white : fg ?? color.n600, fontSize: 13.5 }]}>
          {children}
        </Text>
      </View>
    </Tocable>
  );
}

/* ------------------------------- estado del pedido ----------------------- */

export function InsigniaEstado({ estado }: { estado: EstadoPedido }) {
  const t = estadoColor[estado];
  return (
    <View style={[e.insignia, { backgroundColor: t.bg }]}>
      {estado === "Entregado" ? (
        <IconoTilde size={12} color={t.fg} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} />
      )}
      <Text style={[texto.cap, { color: t.fg }]}>{estado}</Text>
    </View>
  );
}

/**
 * En qué paso de la barra cae cada estado.
 *
 * "Listo" no es un paso: cae en "Preparando". La comida está hecha, pero
 * todavía no salió del local, y mover la barra a "En camino" sería decirle al
 * cliente que alguien está yendo cuando nadie salió. Entre quedarse corto y
 * prometer de más, quedarse corto.
 */
function pasoDelEstado(estado: EstadoPedido): number {
  if (estado === "Listo") return PASOS_PEDIDO.indexOf("Preparando");
  return PASOS_PEDIDO.indexOf(estado);
}

/** Barra de 4 pasos. Reemplaza al badge suelto: se entiende de un vistazo. */
export function ProgresoPedido({ estado }: { estado: EstadoPedido }) {
  if (estado === "Rechazado") return null;
  const idx = pasoDelEstado(estado);
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: espacio.md }}>
      {PASOS_PEDIDO.map((paso, i) => (
        <View key={paso} style={{ flex: 1 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: color.n200, overflow: "hidden" }}>
            {i <= idx && (
              <View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: i === idx ? color.brand : color.brandInk,
                }}
              />
            )}
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 9.5,
              fontWeight: i === idx ? "800" : "600",
              color: i <= idx ? color.brandInk : color.n400,
            }}
          >
            {paso}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ estados vacíos --------------------------- */

export function EstadoVacio({
  titulo,
  sub,
  icono = "Todos",
}: {
  titulo: string;
  sub: string;
  icono?: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: espacio.xxl }}>
      {/* Círculo, no cuadrado: es la misma forma que los rubros del home y que
          los avatares. Un cuadrado redondeado acá parecía una tarjeta vacía. */}
      <View style={[e.centro, { width: 76, height: 76, borderRadius: 38, backgroundColor: color.brandWash }]}>
        <IconoCategoria nombre={icono} size={32} color={color.brandInk} opacity={0.75} />
      </View>
      <Txt v="head" style={{ marginTop: espacio.lg, textAlign: "center" }}>
        {titulo}
      </Txt>
      <Txt v="cap" style={{ marginTop: 4, textAlign: "center" }}>
        {sub}
      </Txt>
    </View>
  );
}

/* ------------------------------- tarjetas -------------------------------- */

export function Tarjeta({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[e.tarjeta, style]}>{children}</View>;
}

const e = StyleSheet.create({
  centro: { alignItems: "center", justifyContent: "center" },
  boton: {
    minHeight: TAP_MIN,
    borderRadius: radio.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: espacio.sm,
    paddingHorizontal: espacio.lg,
  },
  chip: {
    minHeight: TAP_MIN,
    justifyContent: "center",
    paddingHorizontal: espacio.lg,
    borderRadius: radio.pill,
  },
  insignia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: espacio.md,
    paddingVertical: 6,
    borderRadius: radio.pill,
  },
  tarjeta: {
    backgroundColor: color.white,
    borderRadius: radio.md,
    ...sombras.sm,
  },
});

/* -------------------------------- diálogos -------------------------------- */

/**
 * Confirmación modal.
 *
 * Existe porque `Alert.alert` **no hace nada en web**. React Native Web no lo
 * implementa: la llamada no tira error, simplemente no pasa nada, y la app
 * queda muda justo en el momento en que tenía que preguntar algo. Nos costó el
 * aviso de "ya tenés un carrito de otro local", que estaba escrito hace
 * semanas y nadie había visto nunca.
 *
 * Por eso: nada de `Alert` en esta app. Si hay que preguntar, se pregunta con
 * esto, que es el mismo modal que ya se usa para borrar un producto y funciona
 * igual en los dos lados.
 *
 * Tocar el fondo cancela, como cualquier modal. La acción destructiva NO es la
 * primera ni la que queda bajo el pulgar por defecto.
 */
export function Dialogo({
  visible,
  titulo,
  children,
  onCerrar,
  confirmar,
  cancelar = "Cancelar",
  cargando,
}: {
  visible: boolean;
  titulo: string;
  children?: React.ReactNode;
  onCerrar: () => void;
  confirmar: { texto: string; onPress: () => void };
  /** `null` deja un solo botón: para avisos que no tienen nada que cancelar. */
  cancelar?: string | null;
  cargando?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={d.fondo} onPress={onCerrar}>
        {/* El onPress vacío frena el toque: sin esto, tocar el diálogo lo cierra. */}
        <Pressable style={d.caja} onPress={() => {}}>
          <Txt v="title">{titulo}</Txt>
          {children}
          <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
            {cancelar !== null && (
              <Boton variante="fantasma" onPress={onCerrar}>
                {cancelar}
              </Boton>
            )}
            <Boton onPress={confirmar.onPress} cargando={cargando}>
              {confirmar.texto}
            </Boton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const d = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(14,14,14,0.55)",
    justifyContent: "center",
    padding: espacio.xl,
  },
  caja: {
    backgroundColor: color.white,
    borderRadius: radio.xl,
    padding: espacio.xl,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    ...sombras.lg,
  },
});
