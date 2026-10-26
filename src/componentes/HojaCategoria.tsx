/**
 * La hoja para crear o editar una categoría del catálogo.
 *
 * Nombre e imagen. La imagen es una de tres cosas:
 *  - **Automática**: la imagen 3D que corresponde al nombre. Es lo que tiene
 *    toda categoría al nacer.
 *  - **Una imagen 3D** elegida de la lista (`TEMAS`).
 *  - **Tu foto**: una imagen propia, recortada apaisada como la tarjeta.
 *
 * Arriba se ve cómo va a quedar la tarjeta, así el local elige mirando el
 * resultado y no una lista de nombres.
 *
 * En modo editar aparece "Borrar categoría"; la confirmación la muestra la
 * pantalla, que sabe cuántos productos tiene.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { elegirImagen, subirImagenDeCategoria } from "../lib/catalogo";
import { prolijarCategoria, type Categoria } from "../lib/categorias";
import { color, espacio, radio, texto } from "../theme/tokens";
import { ArteSeccion, TEMAS } from "./ArteSeccion";
import { Boton, ImagenSmart, Tocable, Txt } from "./base";
import { Hoja } from "./Filas";

/** La imagen de una tarjeta de categoría, con el mismo orden de prioridad en todos lados. */
export function ImagenCategoria({
  nombre,
  icono,
  foto,
  fotoDeProducto,
}: {
  nombre: string;
  icono?: string | null;
  foto?: string | null;
  /** Ya no se usa (la automática es la 3D); queda para no tocar a quien la pasa. */
  fotoDeProducto?: string | null;
}) {
  if (foto) return <ImagenSmart uri={foto} categoria="Todos" style={{ width: "100%", height: "100%" }} iconoSize={24} />;
  // Automática: la imagen 3D que corresponde al nombre (como los rubros del
  // home). Antes era la foto de un producto, pero mezclada con las 3D la
  // grilla quedaba despareja.
  return <ArteSeccion nombre={nombre} tema={icono} />;
}

export function HojaCategoria({
  visible,
  modo,
  inicial,
  comercioId,
  fotoDeProducto,
  onCerrar,
  onGuardar,
  onBorrar,
}: {
  visible: boolean;
  modo: "crear" | "editar";
  inicial: Categoria;
  comercioId: string;
  fotoDeProducto?: string | null;
  onCerrar: () => void;
  /** Devuelve un mensaje de error, o null si salió bien. */
  onGuardar: (c: Categoria) => Promise<string | null>;
  onBorrar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [icono, setIcono] = useState<string | null>(inicial.icono);
  const [foto, setFoto] = useState<string | null>(inicial.foto_url);
  /** La foto subida sigue disponible aunque se elija otra opción, por si vuelve. */
  const [fotoSubida, setFotoSubida] = useState<string | null>(inicial.foto_url);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre, arranca de lo guardado.
  useEffect(() => {
    if (!visible) return;
    setNombre(inicial.nombre);
    setIcono(inicial.icono);
    setFoto(inicial.foto_url);
    setFotoSubida(inicial.foto_url);
    setError(null);
    setGuardando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const auto = !icono && !foto;
  const nombreVista = prolijarCategoria(nombre) || "Categoría";

  async function subirFoto() {
    if (subiendo) return;
    setError(null);
    const img = await elegirImagen(false, [5, 3]);
    if (!img) return;
    setSubiendo(true);
    const r = await subirImagenDeCategoria(comercioId, img);
    setSubiendo(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setFotoSubida(r.dato);
    setFoto(r.dato);
    setIcono(null);
  }

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const mensaje = await onGuardar({ nombre, icono: foto ? null : icono, foto_url: foto });
    setGuardando(false);
    if (mensaje) setError(mensaje);
  }

  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={modo === "crear" ? "Nueva categoría" : "Editar categoría"}>
      {/* ------------------------------ así queda ------------------------------ */}
      <View style={e.vista}>
        <View style={e.vistaImagen}>
          <ImagenCategoria nombre={nombreVista} icono={icono} foto={foto} fotoDeProducto={fotoDeProducto} />
        </View>
        <Txt v="label" numberOfLines={1} style={{ textAlign: "center", marginTop: 6 }}>
          {nombreVista}
        </Txt>
      </View>

      <Txt v="cap" style={{ marginTop: espacio.md, marginBottom: 6 }}>
        Nombre
      </Txt>
      <TextInput
        value={nombre}
        onChangeText={(t) => {
          setNombre(t.slice(0, 40));
          setError(null);
        }}
        placeholder="Ej: Congelados, Bebidas, Postres"
        placeholderTextColor={color.n400}
        autoFocus={modo === "crear"}
        autoCapitalize="sentences"
        style={e.input}
        accessibilityLabel="Nombre de la categoría"
      />

      <Txt v="cap" style={{ marginTop: espacio.lg, marginBottom: 6 }}>
        Imagen
      </Txt>
      <View style={e.grilla}>
        <Opcion etiqueta="Automática" elegida={auto} onPress={() => { setIcono(null); setFoto(null); }}>
          <ImagenCategoria nombre={nombreVista} fotoDeProducto={fotoDeProducto} />
        </Opcion>

        <Opcion
          etiqueta={fotoSubida ? "Tu foto" : "Subir foto"}
          elegida={!!foto}
          onPress={() => {
            if (fotoSubida && !foto) {
              setFoto(fotoSubida);
              setIcono(null);
            } else subirFoto();
          }}
          punteada={!fotoSubida}
        >
          {subiendo ? (
            <View style={e.centro}>
              <ActivityIndicator color={color.brandInk} />
            </View>
          ) : fotoSubida ? (
            <ImagenSmart uri={fotoSubida} categoria="Todos" style={{ width: "100%", height: "100%" }} iconoSize={20} />
          ) : (
            <View style={e.centro}>
              <Txt v="title" style={{ color: color.brandInk, fontSize: 22 }}>
                +
              </Txt>
            </View>
          )}
        </Opcion>

        {TEMAS.map((t) => (
          <Opcion
            key={t.tema}
            etiqueta={t.nombre}
            elegida={!foto && icono === t.tema}
            onPress={() => {
              setIcono(t.tema);
              setFoto(null);
            }}
          >
            <ArteSeccion nombre={t.nombre} tema={t.tema} />
          </Opcion>
        ))}
      </View>
      {!!foto && (
        <Tocable onPress={subirFoto} etiqueta="Cambiar la foto">
          <Txt v="cap" style={{ color: color.brandInk, paddingVertical: 6 }}>
            Cambiar la foto
          </Txt>
        </Tocable>
      )}

      {!!error && (
        <View style={e.error}>
          <Txt v="cap" style={{ color: color.danger }}>
            {error}
          </Txt>
        </View>
      )}

      <View style={{ flexDirection: "row", marginTop: espacio.lg }}>
        <Boton onPress={guardar} cargando={guardando} disabled={subiendo}>
          {modo === "crear" ? "Crear categoría" : "Guardar"}
        </Boton>
      </View>

      {modo === "editar" && onBorrar && (
        <View style={{ flexDirection: "row", marginTop: espacio.sm }}>
          <Boton variante="fantasma" onPress={onBorrar} textStyle={{ color: color.danger }}>
            Borrar categoría
          </Boton>
        </View>
      )}
    </Hoja>
  );
}

function Opcion({
  etiqueta,
  elegida,
  punteada,
  onPress,
  children,
}: {
  etiqueta: string;
  elegida: boolean;
  punteada?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={e.celda}>
      <Tocable onPress={onPress} etiqueta={`Imagen ${etiqueta}`} suave>
        <View>
          <View style={[e.opcion, punteada && e.punteada, elegida && e.elegida]}>{children}</View>
          <Txt
            v="cap"
            numberOfLines={1}
            style={[e.nombreOpcion, elegida && { color: color.brandInk, fontFamily: texto.label.fontFamily }]}
          >
            {elegida ? `✓ ${etiqueta}` : etiqueta}
          </Txt>
        </View>
      </Tocable>
    </View>
  );
}

const e = StyleSheet.create({
  vista: { alignSelf: "center", width: 180, marginTop: espacio.sm },
  vistaImagen: { width: "100%", aspectRatio: 120 / 72, borderRadius: radio.md, overflow: "hidden", backgroundColor: "#F1F1EF" },
  input: {
    ...texto.body,
    borderWidth: 1.5,
    borderColor: color.n200,
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    backgroundColor: color.white,
  },
  grilla: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  celda: { width: "25%", paddingHorizontal: 4, marginBottom: espacio.sm },
  opcion: {
    width: "100%",
    aspectRatio: 120 / 72,
    borderRadius: radio.sm,
    overflow: "hidden",
    backgroundColor: "#F1F1EF",
    borderWidth: 2,
    borderColor: "transparent",
  },
  punteada: { borderStyle: "dashed", borderColor: color.brandInk, backgroundColor: color.brandWash },
  elegida: { borderColor: color.brandInk },
  nombreOpcion: { textAlign: "center", fontSize: 10.5, marginTop: 2 },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md, backgroundColor: color.dangerWash },
});
