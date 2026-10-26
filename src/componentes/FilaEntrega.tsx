/**
 * Un renglón del historial del repartidor: una entrega ya hecha.
 *
 * Sirve para los dos trabajos. Un pedido de local muestra el logo y el nombre
 * del local; un envío muestra el sello violeta, de dónde a dónde y a quién se
 * entregó. Abajo, siempre las mismas tres píldoras: cuánto salió el envío, la
 * propina y cómo se pagó.
 *
 * "Sin propina" se escribe en vez de dejar el lugar vacío: un renglón en blanco
 * se lee como un error de la app, no como un cliente que no dejó nada.
 */
import { StyleSheet, View } from "react-native";
import { quienRecibe } from "../lib/envios";
import { fechaCorta, formatPrecio } from "../lib/precios";
import { seCobroEnEfectivo, type PedidoParaRepartir } from "../lib/repartos";
import { color, envioColor, espacio, radio, sombras } from "../theme/tokens";
import { ImagenSmart, Txt } from "./base";
import { SelloEnvio } from "./Envio";

export function FilaEntrega({ p }: { p: PedidoParaRepartir }) {
  const esEnvio = p.tipo === "envio";
  const recibe = esEnvio ? quienRecibe(p) : null;
  const fecha = fechaCorta(p.entregado_en ?? p.creado_en);

  return (
    <View style={[f.fila, esEnvio && f.filaEnvio]}>
      {esEnvio ? (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.sm }}>
            <SelloEnvio />
            <Txt v="cap" style={{ flex: 1 }} numberOfLines={1}>
              {fecha}
            </Txt>
          </View>
          <Txt v="cap" style={{ marginTop: espacio.sm }} numberOfLines={1}>
            De {p.retiro_direccion ?? "—"}
          </Txt>
          <Txt v="cap" numberOfLines={1}>
            A {p.direccion}
            {recibe?.rotulo === "Recibe" ? ` · ${recibe.texto}` : ""}
          </Txt>
          <Pildoras p={p} tinta={envioColor} />
        </View>
      ) : (
        <>
          <ImagenSmart
            uri={p.comercios?.logo_url}
            categoria={p.comercios?.categoria ?? "Todos"}
            style={f.logo}
            iconoSize={18}
          />
          <View style={{ flex: 1 }}>
            <Txt v="label" numberOfLines={1}>
              {p.comercios?.nombre ?? "Local"}
            </Txt>
            <Txt v="cap" numberOfLines={1}>
              {fecha} · {p.direccion}
            </Txt>
            <Pildoras p={p} tinta={{ wash: color.brandWash, fg: color.brandInk }} />
          </View>
        </>
      )}
    </View>
  );
}

function Pildoras({ p, tinta }: { p: PedidoParaRepartir; tinta: { wash: string; fg: string } }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      <View style={f.pill}>
        <Txt v="cap" style={{ fontSize: 11 }}>Envío {formatPrecio(p.costo_envio)}</Txt>
      </View>
      <View style={[f.pill, p.propina > 0 && { backgroundColor: tinta.wash }]}>
        <Txt v="cap" style={{ fontSize: 11, color: p.propina > 0 ? tinta.fg : color.n600 }}>
          {p.propina > 0 ? `Propina ${formatPrecio(p.propina)}` : "Sin propina"}
        </Txt>
      </View>
      <View style={f.pill}>
        <Txt v="cap" style={{ fontSize: 11 }}>
          {seCobroEnEfectivo(p.metodo_pago) ? "Cobrado en mano" : p.pago_label}
        </Txt>
      </View>
    </View>
  );
}

const f = StyleSheet.create({
  fila: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: espacio.md,
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    ...sombras.sm,
  },
  filaEnvio: { borderLeftWidth: 4, borderLeftColor: envioColor.bg },
  logo: { width: 34, height: 34, borderRadius: radio.sm, overflow: "hidden" },
  pill: { backgroundColor: color.n50, borderRadius: radio.pill, paddingHorizontal: espacio.sm, paddingVertical: 3 },
});
