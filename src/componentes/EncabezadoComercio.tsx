/**
 * El encabezado negro de las pantallas del comercio.
 *
 * Estaba copiado tres veces con tres textos distintos: "Panel del local" en
 * pedidos, el nombre del local en la carta, "Lo que cobrás vos" en ingresos.
 * Eso hacía que cada pestaña pareciera una app distinta y que el comercio no
 * supiera en cuál está parado.
 *
 * Ahora es siempre lo mismo: arriba chico **Panel de administrador · el nombre
 * del local**, que no cambia nunca y le dice dónde está, y abajo grande el
 * título de la pestaña, que es lo único que cambia.
 *
 * El nombre del local se pide una sola vez por sesión (ver `useNombreDelLocal`):
 * tres pestañas pidiendo lo mismo cada vez que se tocan es una consulta de más
 * por cada toque, y el nombre de un local no cambia mientras alguien mira sus
 * pedidos.
 */
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSesion } from "../contextos/Sesion";
import { miComercio } from "../lib/catalogo";
import { color, espacio, radio } from "../theme/tokens";
import { Txt } from "./base";
import { Isotipo } from "./Marca";

/**
 * El nombre del local del usuario en sesión.
 *
 * La caché es de módulo y está indexada por usuario: si alguien cierra sesión y
 * entra con otra cuenta, la clave cambia y se vuelve a pedir. Se guarda también
 * el pedido en vuelo para que tres pantallas montadas a la vez compartan una
 * sola consulta en lugar de disparar tres.
 */
const cache = new Map<string, string>();
const enVuelo = new Map<string, Promise<string>>();

export function useNombreDelLocal(): string | null {
  const { session, perfil } = useSesion();
  const uid = session?.user?.id;
  const [nombre, setNombre] = useState<string | null>(() => (uid ? cache.get(uid) ?? null : null));

  useEffect(() => {
    if (!uid) return;
    const guardado = cache.get(uid);
    if (guardado) {
      setNombre(guardado);
      return;
    }

    let vivo = true;
    let p = enVuelo.get(uid);
    if (!p) {
      p = miComercio(uid).then((c) => c?.nombre?.trim() || "");
      enVuelo.set(uid, p);
    }
    p.then((n) => {
      enVuelo.delete(uid);
      if (n) cache.set(uid, n);
      if (vivo) setNombre(n || null);
    });

    return () => {
      vivo = false;
    };
  }, [uid]);

  // Mientras no llegue el nombre del local se usa el del perfil: es mejor un
  // nombre aproximado que un hueco que después salta de golpe.
  return nombre ?? perfil?.nombre?.trim() ?? null;
}

export function EncabezadoComercio({
  titulo,
  derecha,
}: {
  titulo: string;
  /** El chip de la derecha: "3 nuevos", "12 en venta". Opcional. */
  derecha?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const nombre = useNombreDelLocal();

  return (
    <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
      {/* La P de Pedilo, igual que en el inicio del cliente: dice de quién es
          el panel sin ocupar un renglón. */}
      <View style={e.logo}>
        <Isotipo tam={30} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="cap" style={{ color: "#9A9A9A" }} numberOfLines={1}>
          Panel de administrador{nombre ? ` · ${nombre}` : ""}
        </Txt>
        <Txt v="title" style={{ color: color.white }} numberOfLines={1}>
          {titulo}
        </Txt>
      </View>
      {derecha}
    </View>
  );
}

/** Radio de las esquinas de abajo. Lo usa "Mi local" para meter la portada debajo. */
export const RADIO_ENCABEZADO = 22;

const e = StyleSheet.create({
  logo: {
    width: 46,
    height: 46,
    borderRadius: radio.md,
    backgroundColor: "#191919",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: RADIO_ENCABEZADO,
    borderBottomRightRadius: RADIO_ENCABEZADO,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.md,
  },
});
