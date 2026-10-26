/**
 * Tipos de la base de datos.
 *
 * Escritos a mano para que se entiendan. Cuando el schema se estabilice conviene
 * generarlos con:
 *   npx supabase gen types typescript --project-id TU-ID > src/lib/tipos.ts
 */

export type RolUsuario = "cliente" | "comercio" | "repartidor" | "admin";

/**
 * "Listo" es el momento en que la comida está pronta y todavía no la levantó
 * el repartidor. Existe porque Pedilo entrega con cadetes propios: sin ese
 * estado el local no tiene cómo avisar que ya puede pasar a buscarlo.
 */
export type EstadoPedido =
  | "Pendiente"
  | "Preparando"
  | "Listo"
  | "En camino"
  | "Entregado"
  | "Rechazado";

export interface Perfil {
  id: string;
  rol: RolUsuario;
  nombre: string;
  email: string;
  /** @deprecated La app ya no pide teléfonos. Queda por los datos viejos. */
  telefono: string;
  /** Fuente única de verdad de la dirección del cliente. */
  direccion: string;
  metodo_pago: string;
  /** Pin que el cliente puso en el mapa. null si todavía no lo cargó. */
  lat: number | null;
  lng: number | null;
  creado_en: string;
}

export interface Comercio {
  id: string;
  dueno_id: string | null;
  nombre: string;
  descripcion: string;
  categoria: string;
  direccion: string;
  /** @deprecated La app ya no pide teléfonos. Queda por los datos viejos. */
  telefono: string;
  /** Texto libre. Mostrar tal cual, nunca parsear. */
  tiempo_entrega: string;
  costo_envio: number;
  abierto: boolean;
  logo_url: string | null;
  portada_url: string | null;
  lat: number | null;
  lng: number | null;
  /** Radio propio del local. null = usar el global de `configuracion`. */
  radio_envio_km: number | null;
  aprobado: boolean;
  creado_en: string;
}

export interface ComercioHorario {
  id: string;
  comercio_id: string;
  /** 0 = domingo */
  dia_semana: number;
  abre: string;
  cierra: string;
}

export interface Producto {
  id: string;
  comercio_id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  subcategoria: string;
  subcategoria_icono: string;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface ProductoFoto {
  id: string;
  producto_id: string;
  url: string;
  orden: number;
}

/**
 * Qué clase de viaje es.
 *
 * `delivery` es el pedido de siempre: un local cocina y el repartidor lo lleva.
 * `envio` es el servicio nuevo: no hay local, el cliente manda algo de una
 * dirección a otra. Comparten tabla porque para el repartidor son el mismo
 * trabajo (ver `supabase/migracion-18-envios.sql`), pero no comparten pantalla.
 */
export type TipoPedido = "delivery" | "envio";

export interface Pedido {
  id: string;
  cliente_id: string;
  tipo: TipoPedido;
  /** null en un envío: no hay local. */
  comercio_id: string | null;
  /** De dónde se retira. Sólo en los envíos. */
  retiro_direccion: string | null;
  retiro_lat: number | null;
  retiro_lng: number | null;
  /**
   * Nombre de quien recibe. Sólo en los envíos (migración 19). Es un dato del
   * envío, no un mensaje: NO va al chat. Los envíos viejos no lo tienen y
   * traen lo que se escribió en `nota`.
   */
  recibe?: string | null;
  estado: EstadoPedido;
  motivo_rechazo: string | null;
  subtotal: number;
  descuento: number;
  promo_label: string | null;
  cupon_codigo: string | null;
  costo_envio: number;
  envio_gratis: boolean;
  /** Cargo de la plataforma. Congelado al momento del pedido, aparte del envío. */
  tarifa_servicio: number;
  /** Propina para el repartidor. Es toda suya: ni el local ni Pedilo la tocan. */
  propina: number;
  /** Quién lo lleva. null mientras no lo tomó nadie. */
  repartidor_id: string | null;
  aceptado_en: string | null;
  listo_en: string | null;
  retirado_en: string | null;
  entregado_en: string | null;
  total: number;
  direccion: string;
  /** @deprecated Histórico. La comunicación va por el chat del pedido. */
  telefono: string;
  nota: string;
  metodo_pago: string;
  pago_label: string;
  /**
   * Si la plata entró o no. Sólo importa de verdad en Mercado Pago: el
   * efectivo y la tarjeta se cobran en la puerta y quedan en "pendiente" hasta
   * que el pedido llega. Lo escribe `registrar_pago` (migración 20).
   */
  pago_estado?: "pendiente" | "aprobado" | "rechazado" | "reembolsado";
  /** El id del pago en el proveedor, para rastrearlo. */
  pago_ref?: string | null;
  efectivo_con: number | null;
  vuelto: number | null;
  creado_en: string;
  actualizado_en: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
  foto_url: string | null;
  /** "Sin cebolla". Va pegada al renglón, no al pedido entero. */
  nota: string;
}

export interface Cupon {
  codigo: string;
  descripcion: string;
  /** null si el cupón sólo da envío gratis. */
  porcentaje: number | null;
  envio_gratis: boolean;
  activo: boolean;
  vence_el: string | null;
  usos_max: number | null;
  usos: number;
}

export interface Configuracion {
  clave: string;
  valor: string;
  descripcion: string;
  actualizado: string;
}

/* Formas compuestas que devuelven las consultas con join */

export type ComercioConProductos = Comercio & {
  productos: (Producto & { producto_fotos: ProductoFoto[] })[];
  comercio_horarios: ComercioHorario[];
};

export type ProductoConFotos = Producto & { producto_fotos: ProductoFoto[] };

export interface Mensaje {
  id: string;
  pedido_id: string;
  autor_id: string;
  /** El rol que tenía el autor al escribir, congelado. */
  autor_rol: RolUsuario;
  texto: string;
  creado_en: string;
}

export type PedidoCompleto = Pedido & {
  pedido_items: PedidoItem[];
  comercios: Pick<Comercio, "nombre" | "categoria" | "logo_url"> | null;
};

/** Tipado mínimo para createClient. No cubre todo: sirve para autocompletar. */
export interface Database {
  public: {
    Tables: {
      perfiles: { Row: Perfil; Insert: Partial<Perfil> & { id: string }; Update: Partial<Perfil> };
      comercios: { Row: Comercio; Insert: Partial<Comercio>; Update: Partial<Comercio> };
      comercio_horarios: { Row: ComercioHorario; Insert: Partial<ComercioHorario>; Update: Partial<ComercioHorario> };
      productos: { Row: Producto; Insert: Partial<Producto>; Update: Partial<Producto> };
      producto_fotos: { Row: ProductoFoto; Insert: Partial<ProductoFoto>; Update: Partial<ProductoFoto> };
      pedidos: { Row: Pedido; Insert: Partial<Pedido>; Update: Partial<Pedido> };
      pedido_items: { Row: PedidoItem; Insert: Partial<PedidoItem>; Update: Partial<PedidoItem> };
      cupones: { Row: Cupon; Insert: Partial<Cupon>; Update: Partial<Cupon> };
      configuracion: { Row: Configuracion; Insert: Partial<Configuracion>; Update: Partial<Configuracion> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
