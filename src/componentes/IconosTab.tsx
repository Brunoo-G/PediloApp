/**
 * Los íconos de la barra de abajo.
 *
 * Están acá y no en cada layout porque las tres apps —cliente, comercio y
 * repartidor— comparten la misma barra negra y tienen que verse iguales: si
 * cada una dibuja lo suyo, a la tercera ya hay tres estilos de casa distintos.
 *
 * Son de trazo, sin relleno, con la forma de la familia Lucide: contornos
 * redondeados y detalles grandes, que es lo que se lee a 25px en una barra
 * oscura. El apagado va en un gris claro (`#C2C2BE`) y no en uno medio: sobre
 * negro, un gris medio desaparece a la luz del día.
 *
 * La barrita verde de arriba es la única señal de "estás acá" además del
 * color: el relleno no se usa porque a este tamaño ensucia la forma.
 */
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { color } from "../theme/tokens";

export type TipoIconoTab = "casa" | "bolsa" | "envio" | "persona" | "moto" | "panel" | "carta" | "plata" | "ingresos" | "tienda" | "stock";

/** Gris del ícono apagado. Sobre el negro de la barra da 9:1. */
export const TAB_APAGADO = "#C2C2BE";

const TRAZOS: Record<TipoIconoTab, string[]> = {
  casa: [
    "M3 10.2a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M15 21v-7a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v7",
  ],
  bolsa: [
    "M5.4 5.47a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.67a2 2 0 0 0-.4-1.2l-1.5-2A2 2 0 0 0 16 2.5H8a2 2 0 0 0-1.6.8z",
    "M15.5 9.5a3.5 3.5 0 0 1-7 0",
  ],
  envio: [
    "M14.5 21.4a.5.5 0 0 0 .94-.02l6-18.3a.5.5 0 0 0-.63-.63l-18.3 6a.5.5 0 0 0-.02.94l7.6 3a2 2 0 0 1 1.11 1.11z",
    "M21.4 2.6 11.6 12.4",
  ],
  persona: ["M18.5 20.5a6.5 6.5 0 0 0-13 0"],
  moto: [
    "M8 16.5h8M14 6.5h3l1.6 8M6 16.5l3.5-6h5",
  ],
  panel: ["M4 5.5h7v5H4zM13 5.5h7v12h-7zM4 12.5h7v5H4z"],
  carta: ["M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v15l-3.2-2-2.2 2-2.1-2-2.1 2-2.2-2-3.2 2V5A1.5 1.5 0 0 1 6 3.5z", "M9 9h6M9 13h4"],
  plata: ["M3 7.5h18v9H3z", "M7 12h.01M17 12h.01"],
  /** Columnas: los ingresos del local. */
  ingresos: ["M3.5 20.5h17", "M6.5 16.5v-5", "M11 16.5v-9", "M15.5 16.5V11", "M20 16.5V5.5"],
  /** La caja: el stock de productos del local. */
  stock: [
    "M11 21.7a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7z",
    "M12 22V12",
    "M3.3 7 12 12l8.7-5",
    "M7.5 4.3l9 5.2",
  ],
  /** El frente del local, con su toldo. */
  tienda: [
    "M3.5 9.5 5 4.5h14l1.5 5",
    "M3.5 9.5a2.8 2.8 0 0 0 5.67 0 2.8 2.8 0 0 0 5.66 0 2.8 2.8 0 0 0 5.67 0",
    "M5 11.8V20h14v-8.2",
    "M10 20v-4.5h4V20",
  ],
};

const CIRCULOS: Partial<Record<TipoIconoTab, { cx: number; cy: number; r: number }[]>> = {
  persona: [{ cx: 12, cy: 9, r: 4 }],
  moto: [
    { cx: 5.5, cy: 16.5, r: 2.5 },
    { cx: 18.5, cy: 16.5, r: 2.5 },
  ],
  plata: [{ cx: 12, cy: 12, r: 2.6 }],
};

export function IconoTab({
  tipo,
  tinta,
  activo,
  acento = color.brand,
}: {
  tipo: TipoIconoTab;
  tinta: string;
  activo: boolean;
  /** Color de la barrita de arriba. En envíos del repartidor es otro. */
  acento?: string;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      {activo && (
        <View
          style={{
            position: "absolute",
            top: -11,
            width: 30,
            height: 3.5,
            borderRadius: 2,
            backgroundColor: acento,
          }}
        />
      )}
      <Svg width={25} height={25} viewBox="0 0 24 24">
        {TRAZOS[tipo].map((d, i) => (
          <Path
            key={i}
            d={d}
            fill="none"
            stroke={tinta}
            strokeWidth={activo ? 2.1 : 1.85}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {(CIRCULOS[tipo] ?? []).map((c, i) => (
          <Circle
            key={`c${i}`}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill="none"
            stroke={tinta}
            strokeWidth={activo ? 2.1 : 1.85}
          />
        ))}
      </Svg>
    </View>
  );
}
