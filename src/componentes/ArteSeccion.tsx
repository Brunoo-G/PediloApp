/**
 * Las imágenes de las categorías del catálogo del local.
 *
 * Mismo estilo que los rubros del home (`ArteCategoria`): un objeto 3D
 * (Microsoft Fluent Emoji 3D, licencia MIT) sobre un fondo pastel propio de
 * cada tema. Los PNG están en `assets/secciones/`, a 192 px.
 *
 * El tema sale del NOMBRE que escribió el local, por palabras clave
 * ("Bebidas", "Gaseosas" → vaso con sorbete). Si no reconoce ninguna, usa una
 * caja: nunca queda un hueco gris. El local también puede elegirlo a mano.
 */
import { Image, View } from "react-native";

export type Tema =
  | "bebidas"
  | "almacen"
  | "lacteos"
  | "limpieza"
  | "golosinas"
  | "frescos"
  | "carnes"
  | "panaderia"
  | "congelados"
  | "higiene"
  | "mascotas"
  | "bebes"
  | "desayuno"
  | "helados"
  | "comidas"
  | "postres"
  | "caja";

/** Palabras clave → tema. Va en orden: la primera que coincide gana. */
const CLAVES: [Tema, string[]][] = [
  ["helados", ["helad", "palito", "cucurucho"]],
  ["congelados", ["congelad", "frozen", "hielo"]],
  ["bebes", ["bebe", "panal", "infant"]],
  ["mascotas", ["mascota", "perro", "gato", "pet"]],
  ["limpieza", ["limpieza", "lavandin", "detergente", "jabon en polvo", "hogar"]],
  ["higiene", ["higiene", "cuidado", "perfum", "shampoo", "farmacia", "cosmet"]],
  ["lacteos", ["lacte", "leche", "queso", "yogur", "huevo", "manteca"]],
  ["desayuno", ["desayuno", "merienda", "cafe", "te ", "infusion", "yerba", "mate"]],
  ["panaderia", ["panader", "pan ", "galletit", "factura", "budin", "tostad"]],
  ["postres", ["postre", "torta", "dulce", "reposter"]],
  ["golosinas", ["golosina", "chocolate", "caramelo", "snack", "kiosco", "alfajor", "papas fritas"]],
  ["bebidas", ["bebida", "gaseosa", "agua", "jugo", "cerveza", "vino", "aperitivo", "alcohol"]],
  ["carnes", ["carne", "pescado", "pollo", "fiambre", "carniceria", "embutido"]],
  ["frescos", ["fruta", "verdura", "fresco", "verduleria", "organico"]],
  ["comidas", ["pizza", "hamburguesa", "empanada", "milanesa", "plato", "minuta", "sandwich", "lomito", "comida", "combo", "menu", "pasta"]],
  ["almacen", ["almacen", "despensa", "aceite", "arroz", "fideo", "conserva", "harina", "legumbre"]],
];

function normalizar(s: string) {
  return (
    " " +
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") +
    " "
  );
}

export function temaDeSeccion(nombre: string): Tema {
  const n = normalizar(nombre);
  for (const [tema, claves] of CLAVES) {
    if (claves.some((c) => n.includes(c))) return tema;
  }
  return "caja";
}

/** Los dibujos que el local puede elegir para una categoría, con su nombre. */
export const TEMAS: { tema: Tema; nombre: string }[] = [
  { tema: "bebidas", nombre: "Bebidas" },
  { tema: "almacen", nombre: "Almacén" },
  { tema: "lacteos", nombre: "Lácteos" },
  { tema: "limpieza", nombre: "Limpieza" },
  { tema: "golosinas", nombre: "Golosinas" },
  { tema: "frescos", nombre: "Frutas y verduras" },
  { tema: "carnes", nombre: "Carnes" },
  { tema: "panaderia", nombre: "Panadería" },
  { tema: "congelados", nombre: "Congelados" },
  { tema: "higiene", nombre: "Higiene" },
  { tema: "mascotas", nombre: "Mascotas" },
  { tema: "bebes", nombre: "Bebés" },
  { tema: "desayuno", nombre: "Desayuno" },
  { tema: "helados", nombre: "Helados" },
  { tema: "comidas", nombre: "Comidas" },
  { tema: "postres", nombre: "Postres" },
  { tema: "caja", nombre: "Varios" },
];

export function esTema(x: string | null | undefined): x is Tema {
  return !!x && TEMAS.some((t) => t.tema === x);
}

const FONDOS: Record<Tema, string> = {
  bebidas: "#FDE7EA",
  almacen: "#FFEDE6",
  lacteos: "#E8F2FB",
  limpieza: "#FFF4D9",
  golosinas: "#F6E9E2",
  frescos: "#FDE6E6",
  carnes: "#FCE8EC",
  panaderia: "#FBEFDD",
  congelados: "#E2F3FC",
  higiene: "#FCEAF2",
  mascotas: "#F5ECE1",
  bebes: "#FFF1E3",
  desayuno: "#EFEAF6",
  helados: "#FFF6DF",
  comidas: "#FFF0DC",
  postres: "#FDEDEF",
  caja: "#F3ECE2",
};

const IMAGENES: Record<Tema, number> = {
  bebidas: require("../../assets/secciones/bebidas.png"),
  almacen: require("../../assets/secciones/almacen.png"),
  lacteos: require("../../assets/secciones/lacteos.png"),
  limpieza: require("../../assets/secciones/limpieza.png"),
  golosinas: require("../../assets/secciones/golosinas.png"),
  frescos: require("../../assets/secciones/frescos.png"),
  carnes: require("../../assets/secciones/carnes.png"),
  panaderia: require("../../assets/secciones/panaderia.png"),
  congelados: require("../../assets/secciones/congelados.png"),
  higiene: require("../../assets/secciones/higiene.png"),
  mascotas: require("../../assets/secciones/mascotas.png"),
  bebes: require("../../assets/secciones/bebes.png"),
  desayuno: require("../../assets/secciones/desayuno.png"),
  helados: require("../../assets/secciones/helados.png"),
  comidas: require("../../assets/secciones/comidas.png"),
  postres: require("../../assets/secciones/postres.png"),
  caja: require("../../assets/secciones/caja.png"),
};

/**
 * Sin `ancho` llena el contenedor (que tiene que tener la proporción 120:72).
 * `tema` fuerza una imagen (la que eligió el local); si no, sale del nombre.
 */
export function ArteSeccion({ nombre, ancho, tema: forzado }: { nombre: string; ancho?: number; tema?: string | null }) {
  const tema = esTema(forzado) ? forzado : temaDeSeccion(nombre);
  return (
    <View
      style={{
        width: ancho ?? "100%",
        height: ancho ? (ancho * 72) / 120 : "100%",
        backgroundColor: FONDOS[tema],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={IMAGENES[tema]}
        style={{ height: "74%", aspectRatio: 1 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
