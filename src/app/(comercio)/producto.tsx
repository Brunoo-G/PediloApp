/**
 * Editor de un producto. Sirve para crear y para editar.
 *
 * Dos decisiones que valen la pena:
 *
 * 1. **Las fotos recién se pueden subir cuando el producto existe.** Si no,
 *    habría que guardarlas en algún limbo y asociarlas después, y el día que
 *    alguien cierra la app a la mitad quedan archivos pagos sin dueño. En un
 *    producto nuevo el bloque de fotos aparece pero explica por qué está
 *    apagado, en vez de estar escondido y dar la sensación de que no se puede.
 *
 * 2. **Borrar pide confirmación; apagar no.** Apagar es lo de todos los días y
 *    se deshace con un tap. Borrar se lleva puestas las fotos y no vuelve.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Boton, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import { IconoCerrar, IconoVolver } from "../../componentes/Iconos";
import { useSesion } from "../../contextos/Sesion";
import { cartaRecordada } from "../../lib/cartaEnMemoria";
import { misCategorias, normalizarCategoria, prolijarCategoria } from "../../lib/categorias";
import {
  borrarFoto,
  borrarProducto,
  cartaDelComercio,
  crearProducto,
  elegirImagen,
  guardarProducto,
  miComercio,
  subirFotoDeProducto,
} from "../../lib/catalogo";
import { formatPrecio } from "../../lib/precios";
import type { Comercio, ProductoConFotos } from "../../lib/tipos";
import { color, espacio, radio, sombras, texto } from "../../theme/tokens";

const TOPE_FOTOS = 3;

/**
 * El editor es una pantalla escondida del grupo de pestañas, y las pestañas
 * NO se desmontan al irse: sin esto, el estado del producto anterior quedaba
 * vivo. Abrir otro producto mostraba el viejo hasta que llegaba el nuevo, y
 * "Agregar producto" aparecía con el último que habías editado adentro.
 *
 * La `key` hace que cada apertura sea un editor nuevo, con su estado en
 * blanco. `n` es un número que pone el catálogo en cada apertura, para que
 * dos "Agregar producto" seguidos también sean dos editores distintos.
 */
export default function PantallaProducto() {
  const { id, n } = useLocalSearchParams<{ id?: string; n?: string }>();
  return <EditorProducto key={`${id || "nuevo"}:${n ?? ""}`} />;
}

function EditorProducto() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSesion();
  // `seccion`: si se abrió desde adentro de una categoría del catálogo, el
  // producto nuevo ya nace en esa categoría.
  const { id: idParam, seccion } = useLocalSearchParams<{ id?: string; seccion?: string }>();
  const id = idParam || undefined;
  const esNuevo = !id;

  // Lo que ya tenía cargado el catálogo: con esto la pantalla abre al toque.
  const [recordada] = useState(() => cartaRecordada());
  const [inicial] = useState(() => (id ? recordada?.productos.find((x) => x.id === id) ?? null : null));
  /** Si ya teníamos todo, la carga del servidor no pisa lo que la persona empiece a escribir. */
  const [yaListo] = useState(() => !!recordada && (!id || !!inicial));

  /**
   * Volver SIEMPRE al catálogo, no "atrás".
   *
   * El editor es una pantalla escondida del grupo de pestañas, y el "atrás"
   * de las pestañas vuelve a la primera (Ingresos), no a la que abrió el
   * editor. El catálogo queda montado mientras tanto, así que vuelve a la
   * misma categoría y con la misma búsqueda en la que estaba.
   */
  const volver = useCallback(() => router.navigate("/(comercio)/carta"), [router]);

  // Lo mismo con el botón atrás de Android.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        volver();
        return true;
      });
      return () => sub.remove();
    }, [volver])
  );

  const [local, setLocal] = useState<Comercio | null>(recordada?.local ?? null);
  const [producto, setProducto] = useState<ProductoConFotos | null>(inicial);
  const [cargando, setCargando] = useState(!yaListo);

  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [precio, setPrecio] = useState(inicial ? String(inicial.precio) : "");
  const [subcategoria, setSubcategoria] = useState(inicial ? inicial.subcategoria ?? "" : seccion ? String(seccion) : "");
  const [activo, setActivo] = useState(inicial?.activo ?? true);

  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);

  /** Las subcategorías que ya usa el local, para no inventar una nueva sin querer. */
  const [subcategorias, setSubcategorias] = useState<string[]>(() => recordada?.categorias ?? []);
  /** Escribiendo el nombre de una categoría que todavía no existe. */
  const [modoNueva, setModoNueva] = useState(false);

  useEffect(() => {
    (async () => {
      const uid = session?.user?.id;
      if (!uid) return;
      const c = await miComercio(uid);
      setLocal(c);
      if (!c) {
        setCargando(false);
        return;
      }
      const [carta, creadas] = await Promise.all([cartaDelComercio(c.id), misCategorias(c.id)]);
      const deProductos = carta.map((p) => p.subcategoria?.trim()).filter(Boolean) as string[];
      const vistas = new Set<string>();
      setSubcategorias(
        [...deProductos, ...creadas.map((c) => c.nombre)].filter((n) => {
          const k = normalizarCategoria(n);
          if (vistas.has(k)) return false;
          vistas.add(k);
          return true;
        })
      );

      if (id) {
        const p = carta.find((x) => x.id === id) ?? null;
        setProducto(p);
        if (p && !yaListo) {
          setNombre(p.nombre);
          setDescripcion(p.descripcion);
          setPrecio(String(p.precio));
          setSubcategoria(p.subcategoria ?? "");
          setActivo(p.activo);
        }
      }
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.user?.id]);

  const precioNum = Number(precio.replace(/[^0-9]/g, ""));
  const nombreOk = nombre.trim().length >= 2;
  const precioOk = Number.isFinite(precioNum) && precioNum > 0;
  const listo = nombreOk && precioOk;

  /**
   * La categoría que se guarda. Si escribió una nueva que en realidad ya
   * existe ("bebidas" con "Bebidas" cargada), se usa la existente: dos
   * categorías que difieren en una mayúscula son dos tarjetas en el catálogo.
   */
  const existente = subcategoria.trim()
    ? subcategorias.find((x) => normalizarCategoria(x) === normalizarCategoria(subcategoria))
    : undefined;
  const categoriaFinal = subcategoria.trim() ? existente ?? prolijarCategoria(subcategoria) : "";
  const mostrarCampoNueva = modoNueva || subcategorias.length === 0 || (!!subcategoria.trim() && !existente);

  async function guardar() {
    setTocado(true);
    if (!listo || !local || guardando) return;
    setGuardando(true);
    setError(null);

    const datos = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio: precioNum,
      subcategoria: categoriaFinal,
      activo,
    };

    const r = producto
      ? await guardarProducto(producto.id, datos)
      : await crearProducto(local.id, datos);

    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }

    // Recién creado: en vez de volver, se queda para que pueda ponerle la foto,
    // que es justo lo que no podía hacer un segundo antes.
    if (!producto) {
      const carta = await cartaDelComercio(local.id);
      setProducto(carta.find((x) => x.id === r.dato.id) ?? null);
      return;
    }
    volver();
  }

  async function agregarFoto() {
    if (!local || !producto || subiendo) return;
    setError(null);
    const img = await elegirImagen();
    if (!img) return;

    setSubiendo(true);
    const r = await subirFotoDeProducto(local.id, producto.id, img);
    if (!r.ok) setError(r.mensaje);
    const carta = await cartaDelComercio(local.id);
    setProducto(carta.find((x) => x.id === producto.id) ?? null);
    setSubiendo(false);
  }

  async function sacarFoto(fotoId: string) {
    if (!local || !producto) return;
    const r = await borrarFoto(fotoId);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    const carta = await cartaDelComercio(local.id);
    setProducto(carta.find((x) => x.id === producto.id) ?? null);
  }

  async function eliminar() {
    if (!producto) return;
    setGuardando(true);
    const r = await borrarProducto(producto.id);
    setGuardando(false);
    setConfirmarBorrado(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    volver();
  }

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.n50 }}>
        <ActivityIndicator color={color.brandInk} />
      </View>
    );
  }

  const fotos = producto?.producto_fotos ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.n50 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <Tocable onPress={volver} etiqueta="Volver al catálogo">
          <View style={e.volver}>
            <IconoVolver size={26} color={color.white} />
          </View>
        </Tocable>
        <View style={{ flex: 1 }}>
          <Txt v="title" style={{ color: color.white }} numberOfLines={1}>
            {esNuevo && !producto ? "Producto nuevo" : nombre || "Producto"}
          </Txt>
          {!!local && (
            <Txt v="cap" style={{ color: "#9A9A9A" }} numberOfLines={1}>
              {local.nombre}
            </Txt>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: espacio.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------------------ fotos ------------------------------ */}
        <Txt v="micro" style={{ marginBottom: espacio.sm }}>
          Fotos ({fotos.length}/{TOPE_FOTOS})
        </Txt>

        {!producto ? (
          <View style={e.avisoFotos}>
            <Txt v="cap" style={{ color: color.n600 }}>
              Guardá el producto y vas a poder agregarle hasta {TOPE_FOTOS} fotos. Necesitamos que
              exista primero para saber dónde guardarlas.
            </Txt>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: espacio.sm, flexWrap: "wrap", marginBottom: espacio.lg }}>
            {fotos.map((f) => (
              <View key={f.id}>
                <ImagenSmart uri={f.url} categoria={local?.categoria ?? "Todos"} style={e.foto} />
                <Tocable onPress={() => sacarFoto(f.id)} etiqueta="Sacar esta foto">
                  <View style={e.sacar}>
                    <IconoCerrar size={12} color={color.white} />
                  </View>
                </Tocable>
              </View>
            ))}

            {fotos.length < TOPE_FOTOS && (
              <Tocable onPress={agregarFoto}>
                <View style={[e.foto, e.agregarFoto]}>
                  {subiendo ? (
                    <ActivityIndicator color={color.brandInk} />
                  ) : (
                    <>
                      <Txt v="head" style={{ color: color.brandInk }}>
                        +
                      </Txt>
                      <Txt v="cap" style={{ color: color.brandInk, fontSize: 11 }}>
                        Foto
                      </Txt>
                    </>
                  )}
                </View>
              </Tocable>
            )}
          </View>
        )}

        {fotos.length === 0 && !!producto && (
          <Txt v="cap" style={{ marginBottom: espacio.lg }}>
            Un producto con foto se pide mucho más que uno sin foto. No hace falta que sea
            profesional: con buena luz y desde arriba alcanza.
          </Txt>
        )}

        {/* ------------------------------ datos ------------------------------ */}
        <Txt v="cap" style={{ marginBottom: 6 }}>
          Nombre
        </Txt>
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej: Hamburguesa Clásica"
          placeholderTextColor={color.n400}
          style={[e.input, tocado && !nombreOk && { borderColor: color.danger }]}
        />
        {tocado && !nombreOk && (
          <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
            Poné un nombre de al menos dos letras.
          </Txt>
        )}

        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          Precio
        </Txt>
        <TextInput
          value={precio}
          onChangeText={(t) => setPrecio(t.replace(/[^0-9]/g, ""))}
          placeholder="3200"
          placeholderTextColor={color.n400}
          inputMode="numeric"
          style={[e.input, tocado && !precioOk && { borderColor: color.danger }]}
        />
        {precioOk ? (
          <Txt v="cap" style={{ color: color.brandInk, marginTop: 6 }}>
            El cliente ve {formatPrecio(precioNum)}
          </Txt>
        ) : (
          tocado && (
            <Txt v="cap" style={{ color: color.danger, marginTop: 6 }}>
              El precio tiene que ser mayor a cero. Va sin centavos.
            </Txt>
          )
        )}

        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          Descripción (opcional)
        </Txt>
        <TextInput
          value={descripcion}
          onChangeText={(t) => setDescripcion(t.slice(0, 280))}
          placeholder="Qué trae, para cuántos alcanza, si es picante…"
          placeholderTextColor={color.n400}
          multiline
          style={[e.input, { minHeight: 72, textAlignVertical: "top" }]}
        />

        {/* ------------------------- categoría del producto ------------------------ */}
        <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
          Categoría del producto
        </Txt>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {subcategorias.map((s) => {
            const elegida = !modoNueva && existente === s;
            return (
              <Tocable
                key={s}
                etiqueta={`Elegir la categoría ${s}`}
                onPress={() => {
                  setModoNueva(false);
                  // Tocar la elegida la saca: el producto queda "Sin categoría".
                  setSubcategoria(elegida ? "" : s);
                }}
              >
                <View style={[e.sugerencia, elegida && e.sugerenciaSel]}>
                  <Txt v="cap" style={{ color: elegida ? color.brandInk : color.n600 }}>
                    {elegida ? `✓ ${s}` : s}
                  </Txt>
                </View>
              </Tocable>
            );
          })}
          {subcategorias.length > 0 && (
            <Tocable
              etiqueta="Crear una categoría nueva"
              onPress={() => {
                setModoNueva(true);
                setSubcategoria("");
              }}
            >
              <View style={[e.sugerencia, e.sugerenciaNueva, mostrarCampoNueva && e.sugerenciaSel]}>
                <Txt v="cap" style={{ color: color.brandInk }}>
                  + Nueva categoría
                </Txt>
              </View>
            </Tocable>
          )}
        </View>

        {mostrarCampoNueva && (
          <TextInput
            value={subcategoria}
            onChangeText={(t) => setSubcategoria(t.slice(0, 40))}
            placeholder={subcategorias.length ? "Nombre de la categoría nueva" : "Ej: Bebidas, Almacén, Postres"}
            placeholderTextColor={color.n400}
            autoFocus={modoNueva}
            style={[e.input, { marginTop: espacio.sm }]}
            accessibilityLabel="Nombre de la categoría nueva"
          />
        )}
        <Txt v="cap" style={{ marginTop: 6, fontSize: 11 }}>
          {!subcategoria.trim()
            ? "Si no elegís ninguna, queda en \"Sin categoría\"."
            : existente
              ? modoNueva
                ? `Ya existe: va a quedar en "${existente}".`
                : `Va en "${existente}".`
              : `Se crea la categoría "${categoriaFinal}".`}
        </Txt>

        {/* ------------------------------ activo ----------------------------- */}
        <View style={e.interruptor}>
          <View style={{ flex: 1 }}>
            <Txt v="label">En venta</Txt>
            <Txt v="cap" style={{ marginTop: 2 }}>
              {activo
                ? "Se muestra en el marketplace y se puede pedir."
                : "Queda guardado pero el cliente no lo ve."}
            </Txt>
          </View>
          <Switch
            value={activo}
            onValueChange={setActivo}
            trackColor={{ false: color.n200, true: color.brand }}
            thumbColor={color.white}
          />
        </View>

        {!!error && (
          <View style={e.error}>
            <Txt v="cap" style={{ color: color.danger }}>
              {error}
            </Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
          <Boton onPress={guardar} cargando={guardando} disabled={!listo}>
            {producto ? "Guardar cambios" : "Crear producto"}
          </Boton>
        </View>

        {!!producto && (
          <View style={{ flexDirection: "row", marginTop: espacio.md }}>
            <Boton
              variante="fantasma"
              onPress={() => setConfirmarBorrado(true)}
              textStyle={{ color: color.danger }}
            >
              Borrar de la carta
            </Boton>
          </View>
        )}
      </ScrollView>

      {/* --------------------------- confirmación -------------------------- */}
      <Modal visible={confirmarBorrado} transparent animationType="fade" onRequestClose={() => setConfirmarBorrado(false)}>
        <Pressable style={e.fondo} onPress={() => setConfirmarBorrado(false)}>
          <Pressable style={e.dialogo} onPress={() => {}}>
            <Txt v="title">¿Borrar {nombre}?</Txt>
            <Txt v="cap" style={{ marginTop: espacio.sm }}>
              Se van también sus fotos y no se puede deshacer. Si es sólo que se acabó, cerrá esto y
              usá el interruptor “En venta”: vuelve con un tap.
            </Txt>
            <Txt v="cap" style={{ marginTop: espacio.sm }}>
              Los pedidos viejos no se tocan: guardan el nombre y el precio con el que se vendió.
            </Txt>
            <View style={{ flexDirection: "row", gap: espacio.md, marginTop: espacio.lg }}>
              <Boton variante="fantasma" onPress={() => setConfirmarBorrado(false)}>
                Cancelar
              </Boton>
              <Boton onPress={eliminar} cargando={guardando}>
                Borrar
              </Boton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const e = StyleSheet.create({
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
  },
  volver: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#191919", alignItems: "center", justifyContent: "center" },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  foto: { width: 92, height: 92, borderRadius: radio.sm, backgroundColor: color.n100 },
  agregarFoto: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.brandInk,
    backgroundColor: color.brandWash,
  },
  sacar: {
    position: "absolute",
    top: -74,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  avisoFotos: { backgroundColor: color.n100, borderRadius: radio.sm, padding: espacio.md, marginBottom: espacio.lg },
  sugerencia: {
    paddingHorizontal: espacio.md,
    paddingVertical: 7,
    borderRadius: radio.pill,
    borderWidth: 1.5,
    borderColor: color.n200,
    backgroundColor: color.white,
  },
  sugerenciaSel: { borderColor: color.brandInk, backgroundColor: color.brandWash },
  sugerenciaNueva: { borderStyle: "dashed", borderColor: color.brandInk },
  interruptor: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    marginTop: espacio.lg,
    ...sombras.sm,
  },
  error: { backgroundColor: color.dangerWash, padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.lg },
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: espacio.lg },
  dialogo: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, maxWidth: 420, width: "100%" },
});
