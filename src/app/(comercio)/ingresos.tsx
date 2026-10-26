/**
 * Ingresos del local.
 *
 * Lo primero que hay que dejar claro en pantalla, y no en una nota al pie: el
 * número grande es **lo que cobra el local**, no el total que pagó el cliente.
 * De un pedido de $9.300, el envío y la tarifa de servicio son de Pedilo. Si
 * mostráramos el total, el local haría cuentas con plata que no es suya y el
 * día que cobre iba a sentir que le faltó.
 *
 * La segunda decisión: sólo se cuentan los pedidos **entregados**. Un pedido en
 * camino todavía puede no llegar, y "ingresos" tiene que querer decir plata que
 * entró. Los que están en curso se muestran aparte, en chico.
 *
 * La cuenta la hace el servidor (`resumen_ventas`). Acá sólo se dibuja.
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EstadoVacio, Tocable, Txt } from "../../componentes/base";
import { EncabezadoComercio } from "../../componentes/EncabezadoComercio";
import { formatPrecio } from "../../lib/precios";
import { resumenVentas, type ResumenVentas } from "../../lib/ventas";
import { color, espacio, radio, sombras } from "../../theme/tokens";

const PERIODOS = [
  { dias: 1, label: "Hoy" },
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
] as const;

export default function Ingresos() {
  const insets = useSafeAreaInsets();
  const [dias, setDias] = useState<number>(1);
  const [datos, setDatos] = useState<ResumenVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const traer = useCallback(async () => {
    setError(null);
    const r = await resumenVentas(dias);
    if (r.ok) setDatos(r.dato);
    else setError(r.mensaje);
    setCargando(false);
  }, [dias]);

  useFocusEffect(
    useCallback(() => {
      setCargando(true);
      traer();
    }, [traer])
  );

  const maxDia = Math.max(1, ...(datos?.por_dia ?? []).map((d) => d.ingresos));

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      <EncabezadoComercio titulo="Ingresos por ventas" />

      <View style={e.solapas}>
        {PERIODOS.map((p) => (
          <Tocable key={p.dias} onPress={() => setDias(p.dias)}>
            <View style={[e.solapa, dias === p.dias && e.solapaActiva]}>
              <Txt v="label" style={{ color: dias === p.dias ? color.white : color.n600 }}>
                {p.label}
              </Txt>
            </View>
          </Tocable>
        ))}
      </View>

      {cargando ? (
        <View style={{ paddingVertical: 64 }}>
          <ActivityIndicator color={color.brandInk} />
        </View>
      ) : error ? (
        <View style={{ padding: espacio.lg }}>
          <View style={[e.aviso, { backgroundColor: color.dangerWash }]}>
            <Txt v="cap" style={{ color: color.danger }}>
              {error}
            </Txt>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: espacio.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={async () => {
                setRefrescando(true);
                await traer();
                setRefrescando(false);
              }}
              tintColor={color.brandInk}
            />
          }
        >
          {/* ----------------------------- el número ---------------------------- */}
          <View style={e.destacado}>
            <Txt v="cap" style={{ color: color.brandInk }}>
              {dias === 1 ? "Hoy cobraste" : `En ${dias} días cobraste`}
            </Txt>
            <Txt v="display" style={{ marginTop: 2 }}>
              {formatPrecio(datos?.ingresos ?? 0)}
            </Txt>
            <Txt v="cap" style={{ marginTop: espacio.sm }}>
              Es tu parte: el precio de carta de lo que vendiste. El envío y la tarifa de servicio no
              entran acá porque son de Pedilo.
            </Txt>
            {(datos?.en_curso ?? 0) > 0 && (
              <Txt v="cap" style={{ marginTop: 6, color: color.warn }}>
                Hay {datos!.en_curso} pedido{datos!.en_curso > 1 ? "s" : ""} en curso que todavía no
                se cuenta{datos!.en_curso > 1 ? "n" : ""} acá.
              </Txt>
            )}
          </View>

          {/* ----------------------------- los datos ---------------------------- */}
          <View style={e.grilla}>
            <Dato titulo="Pedidos entregados" valor={String(datos?.pedidos ?? 0)} />
            <Dato titulo="Productos vendidos" valor={String(datos?.productos_vendidos ?? 0)} />
            <Dato titulo="Ticket promedio" valor={formatPrecio(datos?.ticket_promedio ?? 0)} />
            <Dato
              titulo="Rechazados"
              valor={String(datos?.rechazados ?? 0)}
              alerta={(datos?.rechazados ?? 0) > 0}
            />
          </View>

          {(datos?.descuentos_pedilo ?? 0) > 0 && (
            <View style={[e.aviso, { backgroundColor: color.brandWash }]}>
              <Txt v="cap" style={{ color: color.brandInk }}>
                Pedilo puso {formatPrecio(datos!.descuentos_pedilo)} en cupones sobre tus pedidos. A
                vos no te descuenta nada: cobrás el precio completo de tu carta.
              </Txt>
            </View>
          )}

          {/* --------------------------- más vendidos --------------------------- */}
          <Txt v="micro" style={{ marginTop: espacio.xl, marginBottom: espacio.sm }}>
            Lo que más se vende
          </Txt>

          {(datos?.top ?? []).length === 0 ? (
            <EstadoVacio
              titulo="Todavía no vendiste nada"
              sub={
                dias === 1
                  ? "Cuando entregues el primer pedido de hoy, acá vas a ver qué salió."
                  : "Cuando entregues pedidos, acá vas a ver qué es lo que más sale."
              }
              icono="Restaurante"
            />
          ) : (
            <View style={e.tarjeta}>
              {datos!.top.map((p, i) => (
                <View key={p.nombre} style={{ marginBottom: i === datos!.top.length - 1 ? 0 : espacio.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                    <Txt v="label" style={{ flex: 1, paddingRight: espacio.md }} numberOfLines={1}>
                      {p.nombre}
                    </Txt>
                    <Txt v="cap">
                      {p.unidades} u · {formatPrecio(p.ingresos)}
                    </Txt>
                  </View>
                  {/*
                    Barra proporcional al más vendido. Es un gráfico de una sola
                    dimensión a propósito: en un teléfono, cinco barras se leen
                    de un vistazo y una torta de cinco porciones no.
                  */}
                  <View style={e.riel}>
                    <View
                      style={{
                        width: `${Math.round((p.unidades / datos!.top[0].unidades) * 100)}%`,
                        height: "100%",
                        borderRadius: 4,
                        backgroundColor: i === 0 ? color.brand : color.brandWash,
                        borderWidth: i === 0 ? 0 : 1,
                        borderColor: color.brand,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ------------------------------ por día ----------------------------- */}
          {dias > 1 && (datos?.por_dia ?? []).length > 0 && (
            <>
              <Txt v="micro" style={{ marginTop: espacio.xl, marginBottom: espacio.sm }}>
                Día por día
              </Txt>
              <View style={e.tarjeta}>
                <View style={e.barras}>
                  {datos!.por_dia.map((d) => (
                    <View key={d.fecha} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                      <View
                        style={{
                          width: "72%",
                          height: Math.max(3, Math.round((d.ingresos / maxDia) * 90)),
                          borderRadius: 3,
                          backgroundColor: color.brand,
                        }}
                      />
                      <Txt v="cap" style={{ fontSize: 9, color: color.n400 }}>
                        {d.fecha.slice(8, 10)}
                      </Txt>
                    </View>
                  ))}
                </View>
                <Txt v="cap" style={{ marginTop: espacio.md }}>
                  Sólo aparecen los días en que entregaste algo. El más alto es{" "}
                  {formatPrecio(maxDia)}.
                </Txt>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <View style={e.dato}>
      <Txt v="cap" numberOfLines={1}>
        {titulo}
      </Txt>
      <Txt v="head" style={{ marginTop: 2, color: alerta ? color.danger : color.n900 }}>
        {valor}
      </Txt>
    </View>
  );
}

const e = StyleSheet.create({
  solapas: { flexDirection: "row", gap: espacio.sm, paddingHorizontal: espacio.lg, paddingTop: espacio.lg },
  solapa: {
    paddingHorizontal: espacio.lg,
    paddingVertical: 10,
    borderRadius: radio.pill,
    backgroundColor: color.white,
    borderWidth: 1.5,
    borderColor: color.n200,
  },
  // Elegida = negra con letra blanca, como los Chip del resto de la app.
  solapaActiva: { borderColor: color.ink, backgroundColor: color.ink },
  destacado: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, ...sombras.md },
  grilla: { flexDirection: "row", flexWrap: "wrap", gap: espacio.sm, marginTop: espacio.md },
  dato: {
    flexGrow: 1,
    flexBasis: "46%",
    backgroundColor: color.white,
    borderRadius: radio.md,
    padding: espacio.md,
    ...sombras.sm,
  },
  tarjeta: { backgroundColor: color.white, borderRadius: radio.lg, padding: espacio.lg, ...sombras.md },
  riel: { height: 8, borderRadius: 4, backgroundColor: color.n100, overflow: "hidden" },
  barras: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 104 },
  aviso: { padding: espacio.md, borderRadius: radio.sm, marginTop: espacio.md },
});
