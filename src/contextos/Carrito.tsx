/**
 * Carrito.
 *
 * Vive en memoria y se persiste en el dispositivo, no en la base: un carrito
 * sin confirmar no es un pedido y no tiene por qué ocupar filas en Postgres.
 *
 * Reglas que ya nos mordieron en el prototipo y acá están desde el principio:
 *  - Un carrito pertenece a UN solo local. Mezclar dos avisa y reinicia.
 *  - Si un producto desaparece del catálogo, el renglón se descarta solo.
 *  - Nada entra al carrito sin pasar por `agregar`, que revisa que el local
 *    esté abierto y el producto activo.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ProductoConFotos } from "../lib/tipos";

export interface ItemCarrito {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  fotoUrl: string | null;
  /** "Sin cebolla", "bien cocida". Pegada a ESTE producto, no al pedido. */
  nota: string;
}

interface Carrito {
  comercioId: string | null;
  comercioNombre: string;
  items: ItemCarrito[];
}

const VACIO: Carrito = { comercioId: null, comercioNombre: "", items: [] };
// v2: los renglones ahora tienen `nota`. Cambiar la clave evita leer carritos
// viejos sin ese campo y tener que defenderse de undefined en toda la app.
const CLAVE = "pedilo.carrito.v2";

interface Ctx {
  carrito: Carrito;
  cantidadTotal: number;
  subtotal: number;
  /** Devuelve un motivo si NO se pudo agregar; null si salió bien. */
  agregar: (comercioId: string, comercioNombre: string, p: ProductoConFotos) => string | null;
  /** Igual que agregar pero vaciando primero: se usa al confirmar el cambio de local. */
  reiniciarCon: (comercioId: string, comercioNombre: string, p: ProductoConFotos) => void;
  /**
   * Reemplaza el carrito entero. Lo usa "Repetir pedido".
   *
   * Repetir un pedido de ocho renglones llamando a `agregar` ocho veces
   * significaba ocho renders y, si el carrito venía de otro local, que el
   * primero fallara con OTRO_LOCAL y los demás entraran igual. Acá se arma la
   * lista completa y se guarda de una.
   */
  cargarPedido: (
    comercioId: string,
    comercioNombre: string,
    lineas: { producto: ProductoConFotos; cantidad: number; nota?: string }[]
  ) => void;
  cambiarCantidad: (productoId: string, delta: number) => void;
  /** Guarda (o borra, con "") la aclaración de un renglón. */
  cambiarNota: (productoId: string, nota: string) => void;
  quitar: (productoId: string) => void;
  vaciar: () => void;
  cantidadDe: (productoId: string) => number;
}

const CarritoCtx = createContext<Ctx | null>(null);

export function CarritoProvider({ children }: { children: React.ReactNode }) {
  const [carrito, setCarrito] = useState<Carrito>(VACIO);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((raw) => raw && setCarrito(JSON.parse(raw)))
      .catch(() => {})
      .finally(() => setListo(true));
  }, []);

  useEffect(() => {
    if (listo) AsyncStorage.setItem(CLAVE, JSON.stringify(carrito)).catch(() => {});
  }, [carrito, listo]);

  const valor = useMemo<Ctx>(() => {
    const cantidadTotal = carrito.items.reduce((s, i) => s + i.cantidad, 0);
    const subtotal = carrito.items.reduce((s, i) => s + i.precio * i.cantidad, 0);

    function linea(p: ProductoConFotos): ItemCarrito {
      const foto = [...(p.producto_fotos ?? [])].sort((a, b) => a.orden - b.orden)[0];
      return { productoId: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, fotoUrl: foto?.url ?? null, nota: "" };
    }

    return {
      carrito,
      cantidadTotal,
      subtotal,

      agregar(comercioId, comercioNombre, p) {
        if (p.activo === false) return "Ese producto ya no está disponible";
        if (carrito.comercioId && carrito.comercioId !== comercioId && carrito.items.length > 0) {
          return "OTRO_LOCAL";
        }
        setCarrito((prev) => {
          const items = prev.comercioId === comercioId ? [...prev.items] : [];
          const i = items.findIndex((x) => x.productoId === p.id);
          if (i >= 0) items[i] = { ...items[i], cantidad: items[i].cantidad + 1 };
          else items.push(linea(p));
          return { comercioId, comercioNombre, items };
        });
        return null;
      },

      reiniciarCon(comercioId, comercioNombre, p) {
        setCarrito({ comercioId, comercioNombre, items: [linea(p)] });
      },

      cargarPedido(comercioId, comercioNombre, lineas) {
        const items = lineas
          .filter((l) => l.producto.activo !== false && l.cantidad > 0)
          .map((l) => ({
            ...linea(l.producto),
            cantidad: Math.min(99, l.cantidad),
            nota: (l.nota ?? "").slice(0, 140),
          }));
        setCarrito(items.length ? { comercioId, comercioNombre, items } : VACIO);
      },

      cambiarCantidad(productoId, delta) {
        setCarrito((prev) => {
          const items = prev.items
            .map((i) => (i.productoId === productoId ? { ...i, cantidad: i.cantidad + delta } : i))
            .filter((i) => i.cantidad > 0);
          return items.length ? { ...prev, items } : VACIO;
        });
      },

      cambiarNota(productoId, nota) {
        setCarrito((prev) => ({
          ...prev,
          // Tope igual al de la base (140), así no se pierde texto al guardar.
          items: prev.items.map((i) => (i.productoId === productoId ? { ...i, nota: nota.slice(0, 140) } : i)),
        }));
      },

      quitar(productoId) {
        setCarrito((prev) => {
          const items = prev.items.filter((i) => i.productoId !== productoId);
          return items.length ? { ...prev, items } : VACIO;
        });
      },

      vaciar: () => setCarrito(VACIO),
      cantidadDe: (id) => carrito.items.find((i) => i.productoId === id)?.cantidad ?? 0,
    };
  }, [carrito]);

  return <CarritoCtx.Provider value={valor}>{children}</CarritoCtx.Provider>;
}

export function useCarrito() {
  const c = useContext(CarritoCtx);
  if (!c) throw new Error("useCarrito tiene que usarse dentro de <CarritoProvider>");
  return c;
}
