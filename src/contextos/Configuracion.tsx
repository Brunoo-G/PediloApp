/**
 * Parámetros de la plataforma que se pueden cambiar sin volver a publicar.
 *
 * Viven en la tabla `configuracion` y no en el código para poder ajustarlos
 * desde el panel de Supabase mientras la app se prueba en la ciudad. Si la base
 * no responde, se usan los valores de reserva y la app sigue andando: nunca
 * romper por una configuración.
 *
 * Ojo: lo que se lee acá es para MOSTRAR. El total que vale lo calcula
 * `crear_pedido` en el servidor leyendo estas mismas filas. Si alguien cambia
 * la tarifa mientras un cliente tiene el checkout abierto, manda el servidor.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { configuracionOk, supabase } from "../lib/supabase";

/** Si la base no responde. Suficiente para una ciudad chica. */
const RADIO_POR_DEFECTO_KM = 8;

/** Sin tarifa. Cobrar de más por no poder leer la config sería peor que no cobrar. */
const TARIFA_POR_DEFECTO = { monto: 0, pct: 0 };

/**
 * Envío de reserva. El envío ya no lo pone el local: lo pone Pedilo, que es
 * quien pone el repartidor, y más adelante va a salir de la distancia real del
 * viaje. Hasta entonces es este número, igual para todos.
 *
 * Es 0 a propósito si la base no contesta: mostrarle al cliente un envío
 * inventado y después cobrarle otro en el servidor es la peor de las dos
 * opciones.
 */
const ENVIO_POR_DEFECTO = 0;

/**
 * Qué parte del envío le queda al repartidor. Sólo se usa para mostrarle su
 * saldo; la cuenta que vale la hace `resumen_repartidor` en el servidor.
 */
const REPARTO_PCT_POR_DEFECTO = 0;

export interface TarifaServicio {
  /** Fijo por pedido, en pesos. */
  monto: number;
  /** Porcentaje del subtotal. Se suma al fijo. */
  pct: number;
}

interface Ctx {
  radioEnvioKm: number;
  tarifaServicio: TarifaServicio;
  /** Lo que se le cobra al cliente por el envío, en pesos. Lo fija Pedilo. */
  envioBase: number;
  /** Porcentaje del envío que le queda al repartidor. */
  repartoPctEnvio: number;
  cargando: boolean;
}

const ConfigCtx = createContext<Ctx>({
  radioEnvioKm: RADIO_POR_DEFECTO_KM,
  tarifaServicio: TARIFA_POR_DEFECTO,
  envioBase: ENVIO_POR_DEFECTO,
  repartoPctEnvio: REPARTO_PCT_POR_DEFECTO,
  cargando: true,
});

export function ConfiguracionProvider({ children }: { children: React.ReactNode }) {
  const [radioEnvioKm, setRadio] = useState(RADIO_POR_DEFECTO_KM);
  const [tarifaServicio, setTarifa] = useState<TarifaServicio>(TARIFA_POR_DEFECTO);
  const [envioBase, setEnvio] = useState(ENVIO_POR_DEFECTO);
  const [repartoPctEnvio, setReparto] = useState(REPARTO_PCT_POR_DEFECTO);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!configuracionOk) {
      setCargando(false);
      return;
    }
    // Una sola consulta para todas las claves: son tres filas de una tabla
    // chiquita y no tiene sentido pegarle tres veces.
    supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["radio_envio_km", "tarifa_servicio_monto", "tarifa_servicio_pct", "envio_base", "reparto_pct_envio"])
      .then(({ data }) => {
        const filas = (data ?? []) as unknown as { clave: string; valor: string }[];
        const num = (clave: string) => {
          const n = Number(filas.find((f) => f.clave === clave)?.valor);
          return Number.isFinite(n) ? n : null;
        };

        const radio = num("radio_envio_km");
        if (radio !== null && radio > 0) setRadio(radio);

        setTarifa({
          monto: Math.max(0, num("tarifa_servicio_monto") ?? 0),
          pct: Math.max(0, num("tarifa_servicio_pct") ?? 0),
        });

        const envio = num("envio_base");
        if (envio !== null && envio >= 0) setEnvio(Math.round(envio));

        const pct = num("reparto_pct_envio");
        if (pct !== null && pct >= 0) setReparto(pct);

        setCargando(false);
      });
  }, []);

  const valor = useMemo(
    () => ({ radioEnvioKm, tarifaServicio, envioBase, repartoPctEnvio, cargando }),
    [radioEnvioKm, tarifaServicio, envioBase, repartoPctEnvio, cargando]
  );
  return <ConfigCtx.Provider value={valor}>{children}</ConfigCtx.Provider>;
}

export function useConfiguracion() {
  return useContext(ConfigCtx);
}
