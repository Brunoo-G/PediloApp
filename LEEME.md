# Pedilo

App de delivery, Argentina. Un solo código para web, Android y iOS
(Expo SDK 57 + React Native 0.86 + Supabase).

---

## Arrancar (5 pasos, ~10 minutos)

### 1. Instalar las dependencias

```bash
cd pedilo
npm install
```

### 2. Crear el proyecto en Supabase

En [supabase.com](https://supabase.com) → **New project**. Anotá la contraseña
de la base, después no se puede ver de nuevo.

### 3. Cargar la base

Supabase → **SQL Editor** → **New query**:

1. Pegá todo `supabase/schema.sql` → **Run**
2. Pegá todo `supabase/seed.sql` → **Run**

> Lo más simple: pegá `supabase/instalar.sql` (hace el esquema y los datos de
> prueba de una sola vez) y después `supabase/verificar.sql`, que te devuelve 13
> chequeos y te dice si falta algo.
>
> Si venías de una versión anterior, corré las migraciones en orden:
> `migracion-01-mapas-y-notas.sql`, `migracion-02-crear-pedido.sql`,
> `migracion-03-cupones.sql`, `migracion-04-tarifa-servicio.sql`.

**Un paso más, en el panel de Supabase:**
Authentication → Sign In / Providers → activá **"Allow anonymous sign-ins"**.
Sin eso no se puede confirmar un pedido. Se usa para que alguien pueda pedir sin
crear cuenta; después se le puede vincular Google sin perder el historial.

El schema crea las tablas, los permisos por rol (RLS) y los buckets de imágenes.
El seed carga 7 locales de prueba para tener algo que mirar.

### 4. Configurar las credenciales

Copiá `.env.example` a `.env` y completá los dos valores:

Supabase → **Project Settings** → **API**

| Variable | De dónde sale | Ojo con |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | "Project URL" | **Sin** `/rest/v1/` al final |
| `EXPO_PUBLIC_SUPABASE_KEY` | La clave `sb_publishable_...` | Es la que reemplaza a la vieja "anon key" |

### 5. Correr

```bash
npx expo start
```

Apretá `w` para abrir en el navegador. Deberías ver los 7 locales.

> Si cambiás el `.env`, arrancá con `npx expo start -c` para limpiar el caché de
> Metro. Si no, sigue usando los valores viejos y parece que no anduviera nada.

---

## Qué hay hecho

**Base**
- Sistema de diseño completo portado a React Native (`src/theme/tokens.ts`):
  color, tipografía Figtree, sombras que funcionan en iOS/Android/web, espaciado
  y mínimos táctiles.
- Cliente de Supabase con las cuatro trampas conocidas ya resueltas y comentadas
  (`src/lib/supabase.ts`).
- Schema completo con RLS por rol y buckets de storage.
- Lógica de precios y horarios como funciones puras y testeables
  (`src/lib/precios.ts`) — una sola fuente de verdad para el carrito, el
  checkout y el panel del comercio.
- Carrito persistido en el dispositivo, con las reglas que en el prototipo
  costaron una auditoría: un solo local por carrito, nada entra sin validar.

**Pantallas**
- Home: buscador de locales **y productos**, promos, categorías, listado con
  los locales fuera de zona marcados.
- Ficha del local: carta, subcategorías, agregar al carrito.
- Carrito con **una nota por producto**.
- **Checkout completo**: dirección, teléfono, método de pago, cupón, vuelto,
  nota de entrega y validación de zona.
- **Historial de pedidos** con Activos / Historial, barra de progreso, motivo de
  rechazo y "volver a pedir".
- Dirección con **mapa y pin arrastrable** + GPS.
- Perfil: dirección y teléfono (fuente única de verdad).

**El precio lo calcula el servidor**
La app no manda precios: manda qué productos y cuántos. La función
`crear_pedido` de Postgres busca los precios en el catálogo, aplica las promos y
calcula el total. La clave `sb_publishable_` viaja dentro del bundle, así que
cualquiera puede abrir la consola y mandar un insert: RLS controla *quién*
escribe, no *qué* escribe. La única forma de que no se pueda falsear un total es
que el cliente nunca lo elija.

Esa función además hace todo en una transacción (o se crea el pedido con todos
sus renglones, o nada) y revalida del lado del servidor lo que la interfaz ya
valida: local aprobado y abierto, productos de ese local y activos, dirección
dentro del radio, y monto en efectivo suficiente.

**Promociones**
- **No hay promos en el código.** Toda promoción es una fila en la tabla
  `cupones`: se crea, se cambia y se apaga desde el panel de Supabase sin
  publicar la app.
- Un cupón puede dar **un porcentaje, envío gratis, o las dos cosas**.
- El home muestra los cupones que están activos de verdad. Deja de ser posible
  que la pantalla prometa una promo que el checkout no aplica — que fue uno de
  los problemas del prototipo. Si no hay ninguno vigente, el carrusel no aparece.
- Se fueron el envío gratis automático por monto y el descuento por pagar con
  Mercado Pago: eran decisiones comerciales metidas en el código, y cambiarlas
  obligaba a publicar una versión nueva.
- Si el código que escribe el cliente no existe o venció, el checkout lo dice
  con todas las letras (**"Cupón inválido"**) y **no deja confirmar** hasta que
  lo corrija o lo borre. Dejar pasar el pedido sin avisar sería peor: el cliente
  pagaría el precio de lista creyendo que le hicieron el descuento.

**Tarifa de servicio**
- Es el cargo de la plataforma. Aparece como una fila propia en el detalle del
  checkout, junto al envío, y se guarda en `pedidos.tarifa_servicio`. Va separada
  del envío a propósito: no es plata del comercio, y cuando haya que liquidarle
  el corte tiene que estar hecho en la base.
- Se configura con dos filas de `configuracion`, que se suman:

  | clave | qué es |
  |---|---|
  | `tarifa_servicio_monto` | un fijo por pedido, en pesos (arranca en 300) |
  | `tarifa_servicio_pct` | un porcentaje del subtotal (arranca en 0) |

  Para cambiarla, desde el SQL Editor de Supabase:

  ```sql
  update configuracion set valor = '500' where clave = 'tarifa_servicio_monto';
  ```

  Con las dos en `0` no se cobra nada y la fila **no aparece** en el detalle.
- Se calcula sobre el subtotal **antes** del descuento, y un cupón de envío
  gratis no la toca: son cargos distintos.
- La calcula el servidor, igual que el resto del total. Lo que muestra la app es
  una previsualización; si alguien cambia la tarifa mientras el checkout está
  abierto, manda el servidor.

**Mapa y zona de entrega**
- Sin API key y sin costo: Leaflet + tiles de OpenStreetMap. El mismo HTML
  corre dentro de un `<iframe>` en web y de un `WebView` en Android/iOS, así
  que hay una sola implementación para las tres plataformas.
- La persona pone el pin donde vive (o usa el GPS). No hay geocoding: adivinar
  la coordenada desde el texto cuesta plata y en direcciones argentinas falla
  seguido.
- El radio de envío es **global** y vive en la tabla `configuracion`, así que
  se cambia desde el panel de Supabase sin volver a publicar la app. Cuando
  haga falta, `comercios.radio_envio_km` ya existe: se le carga un valor al
  local y ese pisa al global. No hace falta migrar nada.
- La distancia es en línea recta (haversine). La calle siempre es más larga —
  entre 20% y 40% más. Para decidir "está en zona" alcanza; para cobrar por
  kilómetro haría falta una API de rutas, que sí cuesta.
- Si los dos CDN de Leaflet fallan, la pantalla lo dice y deja guardar la
  dirección igual. Quedarse sin poder cargar la dirección porque se cayó un CDN
  sería peor que guardar sólo el texto.

**Decisiones que ya están tomadas y conviene no revertir sin pensarlo**
- Los locales fuera de zona **se muestran, apagados y marcados**, no se
  esconden. En una ciudad chica esconderlos dejaría el home casi vacío sin
  explicar por qué.
- La nota es **por producto**, no por pedido. "Sin cebolla" pertenece a la
  hamburguesa; cuando pedís cuatro cosas y aclarás sobre dos, una nota general
  obliga al comercio a adivinar.
- El texto de la dirección y el pin son **dos datos distintos**: uno lo lee el
  repartidor, el otro decide qué locales llegan.
- Se puede mirar el marketplace **sin cuenta**. El login aparece en el checkout.
  Pedir login antes de mostrar nada es la forma más rápida de perder a alguien.
- Un local cerrado **se puede mirar**: la carta es lo que la gente viene a ver.
  Lo que se bloquea es pedir.
- La dirección del perfil es la **fuente única de verdad**. El checkout puede
  usar otra para un pedido puntual, pero no la pisa salvo que se marque.
- Los precios son **enteros en pesos**. Nunca float.
- `pedido_items` guarda nombre y precio **copiados**: un pedido es un documento
  histórico, no una vista de los productos actuales.

## Qué falta

- **Mercado Pago.** Queda para más adelante: todavía no hay vinculación, y
  ofrecerlo como medio de pago sin poder cobrar sería prometer algo que la app
  no cumple. Cuando se integre, se agrega a `METODOS_PAGO` en
  `src/theme/tokens.ts` (el SQL ya contempla su etiqueta para pedidos
  históricos).
- Login con Google (hoy se pide como invitado, con sesión anónima) y
  email + contraseña para comercios.
- Panel del comercio: perfil, productos, pedidos.
- Subida de imágenes a Supabase Storage.
- Formulario "Sumá tu local".

---

## Estructura

```
src/
  theme/tokens.ts       Sistema de diseño. Todo el color y la tipografía sale de acá.
  lib/
    supabase.ts         Cliente + validación de configuración
    tipos.ts            Tipos de la base
    precios.ts          Cupones, envío gratis, horarios, fechas (funciones puras)
    geo.ts              Distancia y zona de cobertura (funciones puras)
    pedidos.ts          Crear y leer pedidos (llama a la función del servidor)
    cupones.ts          Buscar y listar cupones (única fuente de promos)
  componentes/
    base.tsx            Botones, imágenes, chips, estados vacíos, progreso
    IconoCategoria.tsx  Set de íconos propio (SVG)
    mapaHtml.ts         El mapa Leaflet como una página HTML sola
    MapaPin.tsx         El mapa en un WebView (Android/iOS)
    MapaPin.web.tsx     El mismo mapa en un iframe (web)
  contextos/
    Sesion.tsx          Auth + perfil
    Carrito.tsx         Carrito persistido, con nota por producto
    Configuracion.tsx   Parámetros de la plataforma (hoy: el radio de envío)
  app/                  Rutas (Expo Router: la carpeta ES el ruteo)
    (cliente)/
      index.tsx         Home
      local/[id].tsx    Ficha del local
      carrito.tsx       Carrito (no es pestaña: se llega por la barra flotante)
      checkout.tsx      Checkout
      pedidos.tsx       Historial de pedidos
      direccion.tsx     Dirección con mapa
      perfil.tsx        Perfil
supabase/
  schema.sql                      Correr primero
  seed.sql                        Correr después
  migracion-01-mapas-y-notas.sql  Sólo si venías de una versión anterior
  migracion-02-crear-pedido.sql   Ídem
  migracion-03-cupones.sql        Ídem
  instalar.sql                    Todo junto, para una base nueva
  migracion-04-tarifa-servicio.sql Ídem
  verificar.sql                   Diagnóstico: 13 chequeos
```

## Comandos

```bash
npx expo start          # desarrollo (w = web, a = Android, i = iOS)
npx expo start -c       # ídem, limpiando caché — usar tras tocar .env
npx tsc --noEmit        # revisar tipos
npx expo export --platform web   # build de producción → carpeta dist/
```

## Publicar la web

Vercel, conectando el repo:

- **Build Command**: `npx expo export --platform web`
- **Output Directory**: `dist`
- **Environment Variables**: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY`

El export de web es una SPA (`web.output: "single"` en `app.json`). Se eligió
así porque el contenido depende del cliente — sesión y carrito guardado en el
dispositivo — y el pre-renderizado estático generaba errores de hidratación en
cada pantalla. El SEO que se pierde no le sirve a una app detrás de login.

---

## Notas

**Las fotos del seed son de Unsplash.** Sirven para probar. Si alguna no carga,
la app muestra un bloque con el color y el ícono del rubro: nunca se rompe.
En producción cada comercio sube las suyas a Supabase Storage.

**Sobre los cobros.** El checkout va a registrar el método de pago, pero cobrar
de verdad con Mercado Pago tiene implicancias de seguridad y fiscales que
conviene que revise alguien con experiencia antes de salir a producción.
