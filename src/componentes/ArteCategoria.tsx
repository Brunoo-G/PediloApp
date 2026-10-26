/**
 * Las imágenes de los rubros, para los círculos del home.
 *
 * Son ilustraciones 3D (Microsoft Fluent Emoji 3D, licencia MIT) sobre un
 * fondo pastel propio de cada rubro: se leen como "el objeto" —el carrito del
 * súper, el helado, la pastilla— y no como un ícono de línea, que dentro de un
 * círculo se lee como un panel de control.
 *
 * Los PNG están en `assets/categorias/`, a 192 px para que se vean nítidos en
 * pantallas densas. El nombre de la clave es el rubro sin tildes.
 */
import { Image, View } from "react-native";

const FONDOS: Record<string, string> = {
  Todos: "#F1FCE4",
  Supermercado: "#E9F6E2",
  Restaurante: "#FFEFE2",
  Heladería: "#FDE7EF",
  Rotisería: "#FFF1DD",
  Farmacia: "#E6F0FF",
  Pañalera: "#EFEAFB",
};

const IMAGENES: Record<string, number> = {
  Todos: require("../../assets/categorias/todos.png"),
  Supermercado: require("../../assets/categorias/supermercado.png"),
  Restaurante: require("../../assets/categorias/restaurante.png"),
  Heladería: require("../../assets/categorias/heladeria.png"),
  Rotisería: require("../../assets/categorias/rotiseria.png"),
  Farmacia: require("../../assets/categorias/farmacia.png"),
  Pañalera: require("../../assets/categorias/panalera.png"),
};

export function ArteCategoria({ nombre, size = 64 }: { nombre: string; size?: number }) {
  const fondo = FONDOS[nombre] ?? FONDOS.Todos;
  const imagen = IMAGENES[nombre] ?? IMAGENES.Todos;
  const lado = Math.round(size * 0.68);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fondo,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image source={imagen} style={{ width: lado, height: lado }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}
