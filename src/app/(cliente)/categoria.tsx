/**
 * Una categoría de un local, en su propia pantalla.
 *
 * Se llega desde la grilla de la ficha del local. Arriba: volver (a la ficha)
 * con un buscador al lado (busca en TODOS los productos del local, sin
 * importar la categoría abierta, por nombre y descripción y sin tildes), y un
 * carrusel con TODAS las
 * categorías del local,
 * siempre en el mismo orden, con la que se está viendo marcada. Tocar otra
 * abre esa categoría como pantalla nueva (arranca arriba de todo); el
 * carrusel no se reordena, así que nada "salta" de lugar. El nombre de la
 * categoría va debajo del carrusel, como título de la lista.
 *
 * Params: `local` (id), `nombre` (la categoría, o "Todos") y `n` (para que
 * cada apertura sea una pantalla nueva aunque la pestaña quede montada).
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EstadoVacio, Tocable, Txt } from "../../componentes/base";
import {
  ANCHO_MINI,
  BarraCarrito,
  FilaProducto,
  MiniCategoria,
  productosDe,
  TODOS,
  useAgregar,
  useCartaLocal,
} from "../../componentes/CartaLocal";
import { IconoCerrar, IconoLupa, IconoVolver } from "../../componentes/Iconos";
import { normalizarCategoria } from "../../lib/categorias";
import { color, espacio, radio, texto } from "../../theme/tokens";

const SEPARACION = espacio.sm;

export default function PantallaCategoria() {
  const { local, nombre, n } = useLocalSearchParams<{ local: string; nombre: string; n?: string }>();
  // Cada apertura es una pantalla nueva: la pestaña queda montada, así que la
  // clave fuerza a empezar de cero (scroll arriba, carrusel en su lugar).
  return <Categoria key={`${local}:${nombre}:${n ?? ""}`} localId={local} nombre={nombre ?? TODOS} />;
}

function Categoria({ localId, nombre }: { localId: string; nombre: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { local, cargando, apertura, productos, categorias } = useCartaLocal(localId);
  const { agregar, dialogos } = useAgregar(local, apertura);
  const carrusel = useRef<ScrollView>(null);
  const [busqueda, setBusqueda] = useState("");

  const esTodos = nombre === TODOS;
  const k = normalizarCategoria(nombre);
  const deLaCategoria = productosDe(productos, nombre);
  const q = normalizarCategoria(busqueda);
  const lista = q
    ? productos.filter((p) => normalizarCategoria(`${p.nombre} ${p.descripcion ?? ""}`).includes(q))
    : deLaCategoria;
  const indice = esTodos ? 0 : categorias.findIndex((c) => normalizarCategoria(c.nombre) === k) + 1;

  function volver() {
    router.navigate(`/(cliente)/local/${localId}`);
  }

  function abrir(otra: string) {
    if (normalizarCategoria(otra) === k) return;
    router.navigate({ pathname: "/(cliente)/categoria", params: { local: localId, nombre: otra, n: String(Date.now()) } });
  }

  useEffect(() => {
    const h = BackHandler.addEventListener("hardwareBackPress", () => {
      volver();
      return true;
    });
    return () => h.remove();
  }, [localId]);

  // Que la categoría elegida quede a la vista en el carrusel.
  useEffect(() => {
    if (indice <= 1) return;
    const x = (ANCHO_MINI + SEPARACION) * (indice - 1);
    const t = setTimeout(() => carrusel.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(t);
  }, [indice, categorias.length]);

  if (cargando || !local) {
    return (
      <View style={e.centro}>
        {cargando ? <ActivityIndicator color={color.brandInk} /> : <EstadoVacio titulo="Local no encontrado" sub="Puede que ya no esté disponible." />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      {/* ------------------------------ cabecera ------------------------------ */}
      <View style={[e.cabecera, { paddingTop: insets.top + espacio.sm }]}>
        <View style={e.filaTitulo}>
          <Tocable onPress={volver} etiqueta={`Volver a ${local.nombre}`}>
            <View style={e.volver}>
              <IconoVolver size={22} color={color.ink} />
            </View>
          </Tocable>
          <View style={e.buscador}>
            <IconoLupa size={18} color={color.n400} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder={`Buscar en ${local.nombre}`}
              placeholderTextColor={color.n400}
              autoCorrect={false}
              returnKeyType="search"
              style={e.inputBusqueda}
              accessibilityLabel="Buscar productos"
            />
            {!!busqueda && (
              <Tocable onPress={() => setBusqueda("")} etiqueta="Borrar la búsqueda">
                <View style={e.borrar}>
                  <IconoCerrar size={12} color={color.white} />
                </View>
              </Tocable>
            )}
          </View>
        </View>

        <ScrollView
          ref={carrusel}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: SEPARACION, paddingHorizontal: espacio.lg, paddingTop: espacio.md }}
        >
          <MiniCategoria titulo={TODOS} todos activa={esTodos} onPress={() => abrir(TODOS)} />
          {categorias.map((c) => (
            <MiniCategoria
              key={c.nombre}
              titulo={c.nombre}
              cat={c}
              activa={!esTodos && normalizarCategoria(c.nombre) === k}
              onPress={() => abrir(c.nombre)}
            />
          ))}
        </ScrollView>
      </View>

      {/* ------------------------------ productos ----------------------------- */}
      <ScrollView contentContainerStyle={{ padding: espacio.lg, paddingBottom: 120, gap: espacio.sm }} showsVerticalScrollIndicator={false}>
        {!apertura.abierto && (
          <View style={e.avisoCerrado}>
            <Txt v="cap" style={{ color: color.warn }}>
              {local.nombre} está cerrado{apertura.abreA ? ` · abre a las ${apertura.abreA}` : ""}. Podés mirar, pero todavía no pedir.
            </Txt>
          </View>
        )}
        <Txt v="title" numberOfLines={1} style={{ marginBottom: espacio.xs }}>
          {busqueda.trim() ? `Resultados para “${busqueda.trim()}”` : esTodos ? "Todos los productos" : nombre}
        </Txt>
        {lista.map((p) => (
          <FilaProducto key={p.id} p={p} local={local} apertura={apertura} agregar={agregar} />
        ))}
        {lista.length === 0 &&
          (busqueda.trim() ? (
            <EstadoVacio titulo="No encontramos nada" sub={`${local.nombre} no tiene productos con esa palabra.`} />
          ) : (
            <EstadoVacio titulo="Nada por acá" sub="Esta categoría no tiene productos por ahora." />
          ))}
      </ScrollView>

      <BarraCarrito localId={local.id} />
      {dialogos}
    </View>
  );
}

const e = StyleSheet.create({
  centro: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 },
  cabecera: {
    backgroundColor: color.white,
    paddingBottom: espacio.md,
    borderBottomWidth: 1,
    borderBottomColor: color.n200,
  },
  filaTitulo: { flexDirection: "row", alignItems: "center", gap: espacio.md, paddingHorizontal: espacio.lg },
  volver: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.n50,
    borderWidth: 1.5,
    borderColor: color.n200,
    alignItems: "center",
    justifyContent: "center",
  },
  buscador: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    backgroundColor: color.n50,
    borderRadius: radio.pill,
    borderWidth: 1.5,
    borderColor: color.n200,
    paddingHorizontal: espacio.md,
    height: 44,
  },
  inputBusqueda: { ...texto.body, flex: 1, minWidth: 0, paddingVertical: 0, color: color.n900 },
  borrar: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.n400, alignItems: "center", justifyContent: "center" },
  avisoCerrado: { backgroundColor: color.warnWash, borderRadius: 12, padding: espacio.md },
});
