/**
 * Los numeritos de la barra de abajo.
 *
 * - Repartidor: en "Delivery", cuántos pedidos de locales están listos y sin
 *   repartidor; en "Envíos", cuántos envíos esperan que alguien los tome.
 * - Local: en "Pedidos", cuántos pedidos nuevos (Pendiente) tiene sin aceptar.
 *
 * Se cuentan con `count: "exact", head: true` (no se trae ninguna fila) y se
 * vuelven a contar con cada cambio en `pedidos` que llega por realtime. Como
 * realtime puede perderse un evento (o no mandar los INSERT que RLS filtra),
 * además se recuenta cada 20 segundos y al volver a la app.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

type Filtro = { tipo?: "delivery" | "envio"; estado: string; sinRepartidor?: boolean };

async function contar(f: Filtro): Promise<number> {
  let q = supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", f.estado);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.sinRepartidor) q = q.is("repartidor_id", null);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

/** Cuenta varios filtros a la vez y los mantiene al día. `activo` = false no cuenta nada. */
export function useConteos<K extends string>(filtros: Record<K, Filtro>, activo: boolean, canal: string): Record<K, number> {
  const claves = Object.keys(filtros) as K[];
  const vacio = Object.fromEntries(claves.map((k) => [k, 0])) as Record<K, number>;
  const [conteos, setConteos] = useState<Record<K, number>>(vacio);
  const firma = JSON.stringify(filtros);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;

    const recontar = async () => {
      const valores = await Promise.all(claves.map((k) => contar(filtros[k])));
      if (vivo) setConteos(Object.fromEntries(claves.map((k, i) => [k, valores[i]])) as Record<K, number>);
    };
    // Varios cambios juntos (tomar un pedido dispara más de uno) cuentan una vez.
    const pronto = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(recontar, 400);
    };

    recontar();
    const ch = supabase
      .channel(canal)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, pronto)
      .subscribe();
    const reloj = setInterval(recontar, 20000);
    const app = AppState.addEventListener("change", (s) => s === "active" && recontar());

    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      clearInterval(reloj);
      app.remove();
      supabase.removeChannel(ch);
    };
  }, [activo, firma, canal]);

  return conteos;
}

/** Para `tabBarBadge`: nada si es 0, "9+" si son muchos. */
export function insignia(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 9 ? "9+" : String(n);
}
