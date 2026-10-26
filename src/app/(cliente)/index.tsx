/**
 * Home del cliente: descubrir locales.
 *
 * El buscador busca locales Y productos, como dice su placeholder. En el
 * prototipo prometía productos y sólo filtraba por nombre de local: si el
 * texto promete algo, el sistema lo tiene que cumplir.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Isotipo } from "../../componentes/Marca";
import { Boton, Dialogo, EstadoVacio, ImagenSmart, Tocable, Txt } from "../../componentes/base";
import { ArteCategoria } from "../../componentes/ArteCategoria";
import { Degradado } from "../../componentes/Degradado";
import { IconoCategoria } from "../../componentes/IconoCategoria";
import { BotonHeader, IconoCampana, IconoCarrito, IconoLupa, IconoReloj } from "../../componentes/Iconos";
import { PanelNovedades } from "../../componentes/PanelNovedades";
import { useCarrito } from "../../contextos/Carrito";
import { useConfiguracion } from "../../contextos/Configuracion";
import { useSesion } from "../../contextos/Sesion";
import { cobertura, puntoValido } from "../../lib/geo";
import { cuponesVigentes, tituloCupon } from "../../lib/cupones";
import { traerNovedades } from "../../lib/novedades";
import { estadoApertura, formatPrecio } from "../../lib/precios";
import { configuracionOk, diagnosticoConfig, supabase } from "../../lib/supabase";
import type { ComercioConProductos, Cupon, ProductoConFotos } from "../../lib/tipos";
import {
  CATEGORIAS,
  categoriaColor,
  color,
  espacio,
  radio,
  sombras,
  texto,
  LLENO,
} from "../../theme/tokens";

/**
 * Las promos salen de la tabla `cupones`, no de una lista hardcodeada.
 *
 * Así el home no puede prometer algo que el checkout no aplica: si la tarjeta
 * está en pantalla es porque el cupón existe y está activo. Cuando no hay
 * ninguno vigente, el carrusel directamente no aparece.
 *
 * Los colores se alternan para que dos cupones seguidos no se vean iguales.
 */
const PALETA_PROMO = [
  { bg: color.ink, fg: color.white, chip: "rgba(255,255,255,.16)" },
  { bg: color.brand, fg: color.ink, chip: "rgba(14,14,14,.12)" },
  { bg: "#1B2B4B", fg: color.white, chip: "rgba(255,255,255,.16)" },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { perfil, session } = useSesion();
  const { radioEnvioKm, envioBase } = useConfiguracion();
  const carrito = useCarrito();
  const cantidadTotal = carrito.cantidadTotal;

  /**
   * El puntito de la campana. Se recalcula al volver al home y no con un
   * `setInterval`: consultar cada X segundos para prender una luz es gastar
   * batería y cuota de Supabase para algo que se puede mirar cuando la persona
   * efectivamente está mirando.
   */
  const buscadorRef = useRef<TextInput>(null);
  const [novedadesAbierto, setNovedadesAbierto] = useState(false);
  const [sinVer, setSinVer] = useState(0);

  useFocusEffect(
    useCallback(() => {
      // Sin sesión no hay pedidos ni chats, así que no hay nada que consultar.
      if (!session?.user?.id) {
        setSinVer(0);
        return;
      }
      let vivo = true;
      traerNovedades(session.user.id).then((n) => vivo && setSinVer(n.sinVer));
      return () => {
        vivo = false;
      };
    }, [session?.user?.id])
  );

  /** El pin del cliente. Sin esto no se puede saber quién le llega. */
  const miPunto = puntoValido(perfil?.lat, perfil?.lng);

  const [comercios, setComercios] = useState<ComercioConProductos[]>([]);
  const [promos, setPromos] = useState<Cupon[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string>("Todos");
  /** El producto que espera confirmación para vaciar el carrito de otro local. */
  const [cambiarDeLocal, setCambiarDeLocal] = useState<{ p: ProductoConFotos; c: ComercioConProductos } | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  const traer = useCallback(async () => {
    if (!configuracionOk) {
      setError(diagnosticoConfig());
      setCargando(false);
      return;
    }
    // Una sola consulta con los productos y horarios embebidos: el home necesita
    // los productos para poder buscar por nombre de producto.
    //
    // Con timeout: si el proyecto de Supabase está pausado o la URL está mal, la
    // promesa se queda colgada y el usuario mira un esqueleto para siempre.
    // Mejor un error claro a los 10 segundos.
    try {
      const consulta = supabase
        .from("comercios")
        .select("*, productos(*, producto_fotos(*)), comercio_horarios(*)")
        .eq("aprobado", true)
        .order("nombre");

      const { data, error: err } = (await Promise.race([
        consulta,
        new Promise((_, rechazar) =>
          setTimeout(() => rechazar(new Error("Supabase no respondió en 10 segundos")), 10_000)
        ),
      ])) as Awaited<typeof consulta>;

      if (err) setError(err.message);
      else {
        // Se chequea que sea una lista en vez de confiar: si la respuesta
        // viene con otra forma (un proxy mal configurado, una API vieja), la
        // pantalla queda vacía con su cartel en vez de tirar
        // "filter is not a function" y dejar el home en blanco.
        setComercios(Array.isArray(data) ? (data as unknown as ComercioConProductos[]) : []);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar");
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (configuracionOk) cuponesVigentes().then(setPromos);
  }, []);

  /**
   * El listado se vuelve a pedir cada vez que se vuelve al home, no una sola
   * vez al montar.
   *
   * Es lo que hace que "el local acaba de abrir" se vea sin recargar la app.
   * Antes, con `useEffect` de montaje, alguien que dejaba Pedilo abierto seguía
   * viendo el estado de cuando entró: el comercio prendía su interruptor y del
   * otro lado no pasaba nada. Volver a la pestaña de inicio ahora alcanza.
   *
   * `traer` no prende el spinner en las recargas (ya hay datos en pantalla),
   * así que el refresco no parpadea.
   */
  useFocusEffect(
    useCallback(() => {
      traer();
    }, [traer])
  );

  const q = busqueda.trim().toLowerCase();

  const visibles = useMemo(
    () =>
      comercios.filter((c) => {
        const porRubro = categoria === "Todos" || c.categoria === categoria;
        if (!q) return porRubro;
        const enNombre = c.nombre.toLowerCase().includes(q);
        const enProductos = (c.productos ?? []).some(
          (p) => p.activo && (p.nombre.toLowerCase().includes(q) || p.subcategoria.toLowerCase().includes(q))
        );
        return porRubro && (enNombre || enProductos);
      }),
    [comercios, categoria, q]
  );

  /**
   * Los productos del carrusel "Lo más pedido".
   *
   * Salen de los locales que ya se trajeron —no hay una consulta más— y van los
   * que tienen foto primero: el carrusel existe para mostrar producto, y una
   * fila de cuadros vacíos no vende nada. Con un solo local en la plataforma,
   * éste es el atajo real a la compra: mandar a la gente a una lista de un
   * local para que después entre es un paso de más.
   */
  const destacados = useMemo(() => {
    const filas: { p: ProductoConFotos; c: ComercioConProductos }[] = [];
    for (const c of comercios) {
      for (const p of (c.productos ?? []) as ProductoConFotos[]) {
        if (p.activo) filas.push({ p, c });
      }
    }
    return filas
      .sort((a, b) => (b.p.producto_fotos?.length ?? 0) - (a.p.producto_fotos?.length ?? 0) || a.p.orden - b.p.orden)
      .slice(0, 12);
  }, [comercios]);

  function agregarSuelto(p: ProductoConFotos, c: ComercioConProductos) {
    const abierto = estadoApertura(c.abierto, c.comercio_horarios ?? []).abierto;
    if (!abierto) {
      setProblema(`${c.nombre} está cerrado ahora. Podés mirar la carta y pedir cuando abra.`);
      return;
    }
    const motivo = carrito.agregar(c.id, c.nombre, p);
    if (motivo === "OTRO_LOCAL") setCambiarDeLocal({ p, c });
    else if (motivo) setProblema(motivo);
  }

  /** Qué producto hizo que aparezca este local, para explicar el resultado. */
  const productoQueCoincide = (c: ComercioConProductos) => {
    if (!q || c.nombre.toLowerCase().includes(q)) return null;
    return (c.productos ?? []).find((p) => p.activo && p.nombre.toLowerCase().includes(q))?.nombre ?? null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.n50 }}>
      {/* ---------------------------- header oscuro --------------------------- */}
      <View style={[e.header, { paddingTop: insets.top + espacio.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espacio.md }}>
          <View style={e.logo}>
            <Isotipo tam={28} />
          </View>
          <Tocable onPress={() => router.push("/(cliente)/direccion")} style={{ flex: 1 }} suave>
            <Txt v="micro" style={{ color: color.brand, fontSize: 10.5 }}>
              Enviar a
            </Txt>
            <Txt v="label" style={{ color: color.white, marginTop: 2 }} numberOfLines={1}>
              {perfil?.direccion || "Agregá tu dirección"}
            </Txt>
          </Tocable>

          {/*
            Campana y carrito. El carrito también está en la barra flotante de
            abajo cuando hay algo adentro, pero esa aparece y desaparece: acá
            está siempre, que es lo que hace que se pueda volver a mirarlo sin
            buscarlo. La campana va primero porque el carrito es la acción más
            fuerte de las dos y las acciones fuertes van pegadas al borde.
          */}
          <BotonHeader
            onPress={() => setNovedadesAbierto(true)}
            punto={sinVer > 0}
            etiqueta={sinVer > 0 ? "Novedades, hay algo nuevo" : "Novedades"}
          >
            <IconoCampana size={21} color={color.white} />
          </BotonHeader>

          <BotonHeader
            onPress={() => router.push("/(cliente)/carrito")}
            globo={cantidadTotal}
            etiqueta={cantidadTotal > 0 ? `Carrito, ${cantidadTotal} productos` : "Carrito, vacío"}
          >
            <IconoCarrito size={21} color={color.white} />
          </BotonHeader>
        </View>

        {/*
          El buscador va DENTRO del header oscuro y no flotando en una tarjeta
          blanca montada abajo. La tarjeta blanca partía el header en dos y
          empujaba todo el contenido 34px hacia abajo para dejarle lugar; acá
          el header termina donde termina, y el primer contenido arranca
          pegado.
        */}
        <Tocable onPress={() => buscadorRef.current?.focus()} etiqueta="Buscar">
          <View style={e.buscador}>
            <IconoLupa size={18} color="#B9B9B5" />
            <TextInput
              ref={buscadorRef}
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar productos o locales"
              placeholderTextColor="#B9B9B5"
              style={[texto.body, { flex: 1, paddingVertical: 0, color: color.white }]}
            />
          </View>
        </Tocable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: espacio.lg, paddingBottom: espacio.xxxl }}
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
        {/* ------------------------------ promos ----------------------------- */}
        {promos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: espacio.lg, gap: espacio.md }}
            style={{ marginBottom: espacio.xl }}
          >
            {promos.map((c, i) => {
              const tono = PALETA_PROMO[i % PALETA_PROMO.length];
              return (
                <View key={c.codigo} style={[e.promo, { backgroundColor: tono.bg }]}>
                  <View style={[e.promoChip, { backgroundColor: tono.chip }]}>
                    <Txt v="micro" style={{ color: tono.fg, fontSize: 9.5 }}>
                      {c.codigo}
                    </Txt>
                  </View>
                  <Txt v="title" style={{ color: tono.fg, fontSize: 24, marginTop: espacio.sm }}>
                    {tituloCupon(c)}
                  </Txt>
                  <Txt v="cap" style={{ color: tono.fg, opacity: 0.8, marginTop: 2 }} numberOfLines={2}>
                    {c.descripcion}
                  </Txt>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* ---------------------------- categorías --------------------------- */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: espacio.md, gap: espacio.xs }}
          style={{ marginBottom: espacio.xl }}
        >
          {CATEGORIAS.map((c) => {
            const activo = categoria === c;
            return (
              <Tocable key={c} onPress={() => setCategoria(c)} etiqueta={c}>
                <View style={{ alignItems: "center", width: 84 }}>
                  {/* El aro está SIEMPRE (transparente si no está elegido): si
                      apareciera sólo al elegir, el borde le robaría lugar al
                      dibujo y lo correría hacia la derecha y abajo. */}
                  <View style={[e.categoriaAro, activo && e.categoriaActiva]}>
                    <ArteCategoria nombre={c} size={62} />
                  </View>
                  <Txt
                    v="cap"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      textAlign: "center",
                      color: color.n900,
                      fontWeight: activo ? "800" : "600",
                    }}
                    // Una sola línea: "Supermercado" en dos quedaba cortado
                    // en "Supermercad / o".
                    numberOfLines={1}
                  >
                    {c}
                  </Txt>
                </View>
              </Tocable>
            );
          })}
        </ScrollView>

        {/* ----------------------------- listado ----------------------------- */}
        <View style={{ paddingHorizontal: espacio.lg }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: espacio.md }}>
            <Txt v="title">{q ? "Resultados" : "Locales cerca tuyo"}</Txt>
            {!cargando && <Txt v="cap">{visibles.length}</Txt>}
          </View>

          {!miPunto && !error && (
            <Tocable onPress={() => router.push("/(cliente)/direccion")} suave>
              <View style={[e.aviso, { backgroundColor: color.brandWash }]}>
                <Txt v="label" style={{ color: color.brandInk }}>
                  Marcá tu ubicación en el mapa
                </Txt>
                <Txt v="cap" style={{ color: color.brandInk, marginTop: 4 }}>
                  Así te mostramos sólo los locales que llegan hasta tu casa. Tocá acá para hacerlo.
                </Txt>
              </View>
            </Tocable>
          )}

          {error && (
            <View style={[e.aviso, { backgroundColor: color.warnWash }]}>
              <Txt v="label" style={{ color: color.warn }}>
                No se pudo conectar con Supabase
              </Txt>
              <Txt v="cap" style={{ color: color.warn, marginTop: 4 }}>
                {error}
              </Txt>
              <Txt v="cap" style={{ color: color.warn, marginTop: espacio.sm }}>
                Revisá el archivo .env y volvé a arrancar con `npx expo start -c`.
              </Txt>
            </View>
          )}

          {cargando ? (
            <View style={{ gap: espacio.md }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[e.tarjetaLocal, { height: 260, backgroundColor: color.n100 }]} />
              ))}
              <ActivityIndicator color={color.brandInk} style={{ marginTop: espacio.lg }} />
            </View>
          ) : visibles.length === 0 && !error ? (
            <EstadoVacio
              titulo="Sin resultados"
              sub="No encontramos locales ni productos con esa búsqueda. Probá con otra palabra o cambiá de categoría."
            />
          ) : (
            <View style={{ gap: espacio.md }}>
              {visibles.map((c) => {
                const apertura = estadoApertura(c.abierto, c.comercio_horarios ?? []);
                const coincide = productoQueCoincide(c);
                // Los locales fuera de zona se muestran igual, marcados. En una
                // ciudad chica esconderlos dejaría el home casi vacío y sin
                // explicación; verlos apagados enseña dónde está el límite.
                const zona = cobertura(miPunto, puntoValido(c.lat, c.lng), radioEnvioKm, c.radio_envio_km);
                const fuera = zona.enZona === false;
                return (
                  <Tocable key={c.id} suave onPress={() => router.push(`/(cliente)/local/${c.id}`)}>
                    <View style={[e.tarjetaLocal, fuera && { opacity: 0.62 }]}>
                      {/*
                        La foto ES la tarjeta: portada 16:9 a sangre, degradado
                        encima y el nombre en blanco abajo. El estado —abierto
                        hasta tal hora, cerrado, fuera de zona— va en una sola
                        píldora arriba del nombre, que es donde se mira.
                      */}
                      {/* 2:1 y no 16:9: con un local por pantalla, la portada
                          alta empujaba todo lo demás abajo del pliegue. */}
                      <View style={{ aspectRatio: 2 / 1, position: "relative" }}>
                        <ImagenSmart uri={c.portada_url} categoria={c.categoria} style={LLENO} iconoSize={58} />
                        <Degradado fuerza={apertura.abierto ? 0.78 : 0.86} />

                        {/* Nombre a la izquierda y estado a la derecha, en la
                            misma línea: el ojo lee "qué local" y "puedo pedir"
                            de un solo barrido. */}
                        <View style={e.sobreFoto}>
                          <Txt v="display" style={{ color: color.white, fontSize: 22, flex: 1 }} numberOfLines={1}>
                            {c.nombre}
                          </Txt>
                          <View
                            style={[
                              e.pastilla,
                              !fuera && apertura.abierto && { backgroundColor: color.brand },
                            ]}
                          >
                            {!(!fuera && apertura.abierto) && <IconoReloj size={12} color={color.white} />}
                            <Txt
                              v="cap"
                              style={{
                                color: !fuera && apertura.abierto ? color.ink : color.white,
                                fontSize: 12,
                                fontWeight: "700",
                              }}
                              numberOfLines={1}
                            >
                              {fuera
                                ? "Fuera de zona"
                                : apertura.abierto
                                  ? "Abierto"
                                  : `Cerrado${apertura.abreA ? ` · abre ${apertura.abreA}` : ""}`}
                            </Txt>
                          </View>
                        </View>
                      </View>

                      {/* El pie: rubro, demora y envío separados por puntos. */}
                      <View style={e.filaMeta}>
                        <Txt v="cap" numberOfLines={1}>
                          {c.categoria}
                        </Txt>
                        <View style={e.puntoSep} />
                        <Txt v="cap" numberOfLines={1}>
                          {c.tiempo_entrega}
                        </Txt>
                        <View style={e.puntoSep} />
                        <Txt
                          v="cap"
                          style={{ flex: 1, color: fuera ? color.warn : coincide ? color.brandInk : color.n600 }}
                          numberOfLines={1}
                        >
                          {fuera ? zona.detalle : coincide ? `Tiene "${coincide}"` : `Envío ${formatPrecio(envioBase)}`}
                        </Txt>
                      </View>
                    </View>
                  </Tocable>
                );
              })}
            </View>
          )}
        </View>

        {/* --------------------------- lo más pedido ------------------------- */}
        {!q && destacados.length > 0 && (
          <View style={{ marginTop: espacio.xl }}>
            <View style={{ paddingHorizontal: espacio.lg, marginBottom: espacio.sm }}>
              <Txt v="title">Lo más pedido</Txt>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: espacio.lg, gap: espacio.md, paddingBottom: espacio.sm }}
            >
              {destacados.map(({ p, c }) => {
                const foto = [...(p.producto_fotos ?? [])].sort((a, b) => a.orden - b.orden)[0];
                return (
                  <View key={p.id} style={e.tarjetaProducto}>
                    <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={p.nombre}>
                      <View style={{ width: "100%", aspectRatio: 1 }}>
                        <ImagenSmart uri={foto?.url} categoria={c.categoria} style={LLENO} iconoSize={40} />
                      </View>
                    </Tocable>

                    {/* El + va sobre la foto, como en la carta: sumar uno es un
                        toque y no entrar, elegir y volver. El envoltorio lleva
                        la posición porque `Tocable` sólo hereda flex y ancho. */}
                    <View style={e.masWrap}>
                      <Tocable onPress={() => agregarSuelto(p, c)} etiqueta={`Agregar ${p.nombre}`}>
                        <View style={e.masProducto}>
                          <Txt v="head" style={{ color: color.ink, fontSize: 19, lineHeight: 22 }}>
                            +
                          </Txt>
                        </View>
                      </Tocable>
                    </View>

                    <Tocable onPress={() => router.push(`/(cliente)/producto/${p.id}`)} etiqueta={p.nombre}>
                      <View style={{ padding: espacio.sm + 2 }}>
                        <Txt v="label" numberOfLines={2} style={{ height: 36 }}>
                          {p.nombre}
                        </Txt>
                        <Txt v="price" style={{ marginTop: 4 }}>
                          {formatPrecio(p.precio)}
                        </Txt>
                        <Txt v="cap" style={{ fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                          {c.nombre}
                        </Txt>
                      </View>
                    </Tocable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

      </ScrollView>

      <PanelNovedades
        visible={novedadesAbierto}
        onCerrar={() => {
          setNovedadesAbierto(false);
          // Se abrió: ya no hay nada "sin ver". El panel ya guardó la marca.
          setSinVer(0);
        }}
      />

      <Dialogo
        visible={!!cambiarDeLocal}
        titulo="¿Empezar un carrito nuevo?"
        onCerrar={() => setCambiarDeLocal(null)}
        cancelar="No, dejalo"
        confirmar={{
          texto: "Vaciar y agregar",
          onPress: () => {
            if (cambiarDeLocal) carrito.reiniciarCon(cambiarDeLocal.c.id, cambiarDeLocal.c.nombre, cambiarDeLocal.p);
            setCambiarDeLocal(null);
          },
        }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          Ya tenés {carrito.cantidadTotal} {carrito.cantidadTotal === 1 ? "producto" : "productos"} de{" "}
          <Txt v="body" style={{ fontWeight: "800" }}>
            {carrito.carrito.comercioNombre}
          </Txt>
          .
        </Txt>
        <Txt v="cap" style={{ marginTop: espacio.sm }}>
          Un pedido es de un solo local. Para agregar esto hay que vaciar el otro carrito.
        </Txt>
      </Dialogo>

      <Dialogo
        visible={!!problema}
        titulo="No se pudo agregar"
        onCerrar={() => setProblema(null)}
        cancelar={null}
        confirmar={{ texto: "Entendido", onPress: () => setProblema(null) }}
      >
        <Txt v="body" style={{ marginTop: espacio.sm }}>
          {problema}
        </Txt>
      </Dialogo>

      {carrito.cantidadTotal > 0 && (
        <View style={[e.barraCarrito, { bottom: espacio.lg }]}>
          <Boton onPress={() => router.push("/(cliente)/carrito")}>
            {`Ver carrito (${carrito.cantidadTotal})  ·  ${formatPrecio(carrito.subtotal)}`}
          </Boton>
        </View>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  barraCarrito: { position: "absolute", left: espacio.lg, right: espacio.lg, flexDirection: "row" },
  header: {
    backgroundColor: color.ink,
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.xl,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 26,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radio.md,
    backgroundColor: "#191919",
    alignItems: "center",
    justifyContent: "center",
  },
  buscador: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
    backgroundColor: "#1C1C1C",
    borderRadius: radio.sm,
    paddingHorizontal: espacio.md,
    marginTop: espacio.lg,
    height: 48,
  },
  promo: { width: 268, height: 116, borderRadius: radio.lg, padding: espacio.lg, ...sombras.md },
  promoChip: { alignSelf: "flex-start", paddingHorizontal: espacio.sm, paddingVertical: 4, borderRadius: radio.pill },
  categoriaAro: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  categoriaActiva: { borderColor: color.ink },
  tarjetaLocal: { backgroundColor: color.white, borderRadius: radio.lg, overflow: "hidden", ...sombras.md },
  velo: { ...LLENO, backgroundColor: "rgba(14,14,14,.10)" },
  tarjetaProducto: {
    width: 150,
    backgroundColor: color.white,
    borderRadius: radio.md,
    overflow: "hidden",
    ...sombras.sm,
  },
  masWrap: { position: "absolute", right: espacio.sm, top: 150 - 42 },
  masProducto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.brand,
    alignItems: "center",
    justifyContent: "center",
    ...sombras.md,
  },
  cerrado: { ...LLENO, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,14,14,.55)" },
  pill: { paddingHorizontal: espacio.md, paddingVertical: 6, borderRadius: radio.pill },
  pillTL: { position: "absolute", top: espacio.md, right: espacio.md, backgroundColor: color.brand },
  nombreLocal: {
    position: "absolute",
    left: espacio.lg,
    right: espacio.lg,
    bottom: espacio.md,
    color: color.white,
    fontSize: 22,
    lineHeight: 26,
  },
  sobreFoto: {
    position: "absolute",
    left: espacio.md,
    right: espacio.md,
    bottom: espacio.sm + 2,
    flexDirection: "row",
    alignItems: "center",
    gap: espacio.sm,
  },
  pastilla: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(14,14,14,.55)",
    borderRadius: radio.pill,
    paddingHorizontal: espacio.sm + 2,
    paddingVertical: 3,
  },
  puntoSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: color.n200 },
  filaMeta: { flexDirection: "row", alignItems: "center", gap: espacio.sm, paddingHorizontal: espacio.md, paddingVertical: espacio.sm + 2 },
  logoLocal: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    marginTop: -30,
    borderWidth: 3,
    borderColor: color.white,
    backgroundColor: color.white,
  },
  aviso: { padding: espacio.lg, borderRadius: radio.md, marginBottom: espacio.lg },
});
