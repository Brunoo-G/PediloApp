/**
 * Íconos de categoría propios.
 *
 * Son el set de íconos de la app y no vienen de una librería a propósito: con
 * íconos genéricos el home se ve como un dashboard, no como una app de comida.
 * Sólidos, en el color del rubro, sobre un cuadrado redondeado.
 */
import Svg, { Path, Circle, Rect, G } from "react-native-svg";

export function IconoCategoria({
  nombre,
  size = 28,
  color = "#000",
  opacity = 1,
}: {
  nombre: string;
  size?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" opacity={opacity}>
      <G>{trazos(nombre, color)}</G>
    </Svg>
  );
}

function trazos(nombre: string, c: string) {
  switch (nombre) {
    case "Restaurante":
      return (
        <>
          <Path fill={c} d="M4 10.2C4 7 7.6 4.5 12 4.5s8 2.5 8 5.7c0 .5-.4.8-.9.8H4.9c-.5 0-.9-.3-.9-.8z" />
          <Rect fill={c} x="3.6" y="12.4" width="16.8" height="2.6" rx="1.3" />
          <Path fill={c} d="M4.6 16.6h14.8c.4 0 .7.4.6.8-.5 1.7-2.1 2.9-4 2.9H8c-1.9 0-3.5-1.2-4-2.9-.1-.4.2-.8.6-.8z" />
        </>
      );
    case "Heladería":
      return (
        <>
          <Path fill={c} d="M12 3.2c-2.9 0-5.2 2.2-5.4 5-.5.3-.9.9-.9 1.6 0 1 .8 1.8 1.8 1.8h9c1 0 1.8-.8 1.8-1.8 0-.7-.4-1.3-.9-1.6-.2-2.8-2.5-5-5.4-5z" />
          <Path fill={c} d="M8.2 13.2h7.6c.5 0 .8.5.6 1l-3.4 6.6c-.4.7-1.4.7-1.8 0L7.6 14.2c-.2-.5.1-1 .6-1z" />
        </>
      );
    case "Supermercado":
      return (
        <>
          <Path fill={c} d="M2.8 4h2.1c.5 0 .9.3 1 .8L6.3 7h13.4c.7 0 1.2.6 1 1.3l-1.7 6c-.2.9-1 1.5-1.9 1.5H8.7c-.9 0-1.7-.6-1.9-1.5L4.4 6H2.8a1 1 0 0 1 0-2z" />
          <Circle fill={c} cx="9.5" cy="19.2" r="1.8" />
          <Circle fill={c} cx="17" cy="19.2" r="1.8" />
        </>
      );
    case "Rotisería":
      return (
        <>
          <Path
            fill={c}
            d="M16.6 3.6c2.4 0 4.3 1.9 4.3 4.3 0 .7-.2 1.4-.5 2 1 .6 1.6 1.7 1.6 2.9 0 1.9-1.5 3.4-3.4 3.4-1.9 0-3.4-1.5-3.4-3.4 0-.3 0-.6.1-.9l-2.6 2.6-3.1-3.1 2.6-2.6c-.3.1-.6.1-.9.1-1.9 0-3.4-1.5-3.4-3.4S9.4 2.1 11.3 2.1c1.2 0 2.3.6 2.9 1.6.6-.1 1.4-.1 2.4-.1z"
          />
          <Path d="M9.9 12.6 4.4 18.1" fill="none" stroke={c} strokeWidth={2.8} strokeLinecap="round" />
          <Circle fill={c} cx="4.6" cy="19.4" r="2.6" />
        </>
      );
    case "Farmacia":
      return (
        <>
          <Rect fill={c} x="9.6" y="2.6" width="4.8" height="18.8" rx="2.4" />
          <Rect fill={c} x="2.6" y="9.6" width="18.8" height="4.8" rx="2.4" />
        </>
      );
    case "Pañalera":
      return (
        <>
          <Path fill={c} d="M10.4 2.6h3.2c.6 0 1 .4 1 1v1.2h-5.2V3.6c0-.6.4-1 1-1z" />
          <Rect fill={c} x="8.6" y="5.6" width="6.8" height="2.4" rx="1.2" />
          <Path fill={c} d="M8.2 9.4h7.6c.7 0 1.2.5 1.2 1.2v8.2c0 1.5-1.2 2.6-2.6 2.6H9.6c-1.5 0-2.6-1.2-2.6-2.6v-8.2c0-.7.5-1.2 1.2-1.2z" />
        </>
      );
    default: // "Todos" — una bolsa de compras
      return (
        <>
          <Path fill={c} d="M5 8h14a1 1 0 0 1 1 1.1l-1 10A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 19.1l-1-10A1 1 0 0 1 5 8z" />
          <Path d="M9 8V6.5a3 3 0 1 1 6 0V8" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" />
        </>
      );
  }
}
