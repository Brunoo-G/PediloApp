/**
 * Las acciones de un viaje en curso, para el repartidor.
 *
 * Antes eran tres botones anchos apilados (chat, avanzar, soltar) del mismo
 * tamaño: desde la moto no se distinguía cuál era "el" botón, y "No lo puedo
 * llevar" quedaba a un dedo de "Retiré el pedido". Ahora hay una jerarquía:
 *
 *   Paso 1 de 2 · Retirá en el local
 *   [ 💬 ]  [        Retiré el pedido        ]
 *            No lo puedo llevar
 *
 * - El paso siguiente es el único botón grande y de color.
 * - El chat es un botón cuadrado al lado: siempre a mano, pero secundario.
 * - Soltar el pedido es un link de texto, separado, y pide confirmación.
 */
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { color, espacio, radio } from "../theme/tokens";
import { Tocable, Txt } from "./base";
import { IconoChat } from "./Iconos";

export function AccionesViaje({
  paso,
  accion,
  onChat,
  soltar,
  estiloAccion,
}: {
  /** "Paso 1 de 2 · Retirá en el local". Sin paso, no se muestra. */
  paso?: { actual: number; total: number; texto: string };
  /**
   * El paso que sigue, dicho completo ("Ya retiré el pedido", "Ya entregué el
   * paquete"): "Lo retiré" solo no decía de qué hablaba. `detalle` (el lugar)
   * se usa en la etiqueta de accesibilidad; a la vista va sólo el título.
   */
  accion?: { texto: string; detalle?: string; onPress: () => void; cargando?: boolean };
  onChat?: () => void;
  soltar?: { texto: string; onPress: () => void };
  /** Para pintar el botón principal con otro color (los envíos van en violeta). */
  estiloAccion?: { fondo: string; tinta: string };
}) {
  if (!accion && !onChat && !soltar) return null;
  return (
    <View style={e.caja}>
      {!!paso && (
        <View style={e.paso}>
          <View style={e.pasos}>
            {Array.from({ length: paso.total }).map((_, i) => (
              <View key={i} style={[e.rayita, i < paso.actual && { backgroundColor: estiloAccion?.fondo ?? color.brand }]} />
            ))}
          </View>
          <Txt v="cap" style={{ color: color.n600 }}>
            Paso {paso.actual} de {paso.total}: {paso.texto}
          </Txt>
        </View>
      )}

      <View style={e.fila}>
        {!!onChat && (
          <Tocable onPress={onChat} etiqueta="Chat de entrega">
            <View style={[e.chat, !accion && e.chatAncho]}>
              <IconoChat size={22} color={color.n900} />
              {!accion && <Txt v="label">Chat de entrega</Txt>}
            </View>
          </Tocable>
        )}
        {!!accion && (
          <View style={{ flex: 1 }}>
            <Tocable onPress={accion.cargando ? undefined : accion.onPress} etiqueta={[accion.texto, accion.detalle].filter(Boolean).join(" ")}>
              <View style={[e.principal, { backgroundColor: estiloAccion?.fondo ?? color.brand }]}>
                {accion.cargando ? (
                  <ActivityIndicator color={estiloAccion?.tinta ?? color.ink} />
                ) : (
                  <>
                    <Txt v="label" style={{ color: estiloAccion?.tinta ?? color.ink, fontSize: 16 }} numberOfLines={1}>
                      {accion.texto}
                    </Txt>
                  </>
                )}
              </View>
            </Tocable>
          </View>
        )}
      </View>

      {!!soltar && (
        <Tocable onPress={soltar.onPress} etiqueta={soltar.texto}>
          <View style={e.soltar}>
            <Txt v="cap" style={{ color: color.danger, textDecorationLine: "underline" }}>
              {soltar.texto}
            </Txt>
          </View>
        </Tocable>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  caja: {
    marginTop: espacio.lg,
    paddingTop: espacio.md,
    borderTopWidth: 1,
    borderTopColor: color.n200,
  },
  paso: { marginBottom: espacio.md, gap: 6 },
  pasos: { flexDirection: "row", gap: 4 },
  rayita: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.n200 },
  fila: { flexDirection: "row", alignItems: "stretch", gap: espacio.sm },
  chat: {
    width: 54,
    minHeight: 52,
    borderRadius: radio.lg,
    borderWidth: 1.5,
    borderColor: color.n200,
    backgroundColor: color.white,
    alignItems: "center",
    justifyContent: "center",
  },
  chatAncho: { width: "auto", flexDirection: "row", gap: espacio.sm, paddingHorizontal: espacio.lg },
  principal: {
    minHeight: 56,
    borderRadius: radio.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
  },
  soltar: { alignSelf: "center", paddingVertical: espacio.md, paddingHorizontal: espacio.lg, marginBottom: -espacio.sm },
});
