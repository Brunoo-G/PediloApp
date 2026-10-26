# Instrucciones para Claude Code

> Bruno: abrí esta carpeta en VS Code, abrí Claude Code y escribile:
> **"Leé PARA-CLAUDE-CODE.md y hacé lo que dice."**
>
> Todo lo que sigue está dirigido a Claude Code.

---

## Qué es esto

**Pedilo** — app de delivery para Argentina. Expo SDK 57 + React Native 0.86 +
React 19.2 + Expo Router + TypeScript + Supabase.

El código ya está escrito y verificado: `tsc --noEmit` pasa limpio, el build de
web compila, y el SQL fue probado contra un Postgres 16 real (los 13 chequeos de
`supabase/verificar.sql` en OK y 9 casos de prueba de la función `crear_pedido`,
incluidos los rechazos esperados).

**Lo que falta es ponerlo a correr en esta máquina.** Nunca se ejecutó acá.

> ### Importante: nadie sabe cómo está Supabase
>
> Bruno **no sabe si hay un proyecto de Supabase creado, si la base está
> instalada, ni si las credenciales funcionan.** Nunca se probó desde esta
> máquina, y quien escribió este código no tuvo acceso a su cuenta.
>
> No des por sentado que está andando ni que está vacío. **Averigualo vos** con
> la Tarea 3, que es un diagnóstico paso a paso, y recién después decidí qué
> hacer. Es lo primero que te va a frenar todo lo demás, así que no lo saltees.

---

## Tarea 1 — Instalar las dependencias

```bash
npm install
```

`node_modules` no vino con el proyecto, así que esto tarda unos minutos.

**Qué es normal y NO hay que arreglar:**

- Warnings de `npm audit` sobre vulnerabilidades en dependencias transitivas.
  **No corras `npm audit fix --force`**: cambia versiones que Expo fija a
  propósito y rompe el proyecto.
- Warnings de paquetes deprecados (`uuid@7`, `inflight`, etc.). Vienen de
  dependencias de Expo, no de este código.

**Qué SÍ es un problema:** que el comando termine con error, o que
`node_modules` quede vacío.

Después verificá que el código está sano:

```bash
npx tsc --noEmit
```

Tiene que terminar **sin ninguna salida**. Si tira errores, algo se corrompió
en la copia: avisale a Bruno antes de tocar nada.

---

## Tarea 2 — Poner en marcha la app

```bash
npx expo start
```

Cuando arranque, apretá `w` para abrir en el navegador.

**Qué debería verse:** el home de Pedilo con header negro, la fila de
categorías, y un cartel que dice que falta configurar Supabase (todavía no hay
`.env`, eso es lo esperado en este punto).

El carrusel de promos **no** va a aparecer, y está bien: las promos salen de la
tabla `cupones`, así que sin base no hay ninguna que mostrar.

**Si Metro no arranca**, probá `npx expo start -c` (limpia el caché).

---

## Tarea 3 — Averiguar cómo está Supabase (y dejarlo andando)

Este es el punto flojo del proyecto. Hay que **diagnosticar antes de tocar**,
porque hay cinco estados posibles y cada uno se arregla distinto.

### Reparto de trabajo

| Lo hacés vos (terminal) | Lo hace Bruno (navegador) |
|---|---|
| Leer y escribir `.env` | Crear el proyecto en supabase.com |
| Probar la conexión con `curl` | Pegar el SQL en el SQL Editor |
| Leer los errores de la app | Activar las sesiones anónimas |
| Decirle **exactamente** qué pegar y dónde | Copiar la URL y la clave |

No podés entrar al panel de Supabase. Tampoco le pidas la clave por chat para
"probar": la escribe él en el `.env` y vos leés el archivo si hace falta.

### Paso 1 — ¿Hay credenciales en esta máquina?

```bash
ls -la .env 2>/dev/null || echo "NO HAY .env"
```

- **No hay `.env`** → es lo esperado. Seguí en el Paso 2.
- **Hay `.env`** → mirá qué tiene (`cat .env`) y saltá al Paso 3 para probarlo.
  Si los valores son `demo.supabase.co` / `sb_publishable_demo`, son los de
  relleno: no sirven, tratalo como si no hubiera `.env`.

### Paso 2 — ¿Existe un proyecto de Supabase?

Preguntale a Bruno, en estos términos:

> ¿Entrás a supabase.com y me decís si ya tenés un proyecto creado para Pedilo?
> Si tenés, andá a **Project Settings → API** y copiame la **Project URL** y la
> **publishable key** (la que empieza con `sb_publishable_`). Si no tenés, creá
> uno: New project, nombre "pedilo", elegí la región más cercana y guardá la
> contraseña de la base que te pide.

Mientras esperás, no te quedes trabado: la app arranca igual sin `.env` y
podés seguir revisando el código.

### Paso 3 — Probar la conexión ANTES de meterla en la app

Esto ahorra horas. Con la URL y la clave en la mano:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "<URL>/rest/v1/configuracion?select=clave" \
  -H "apikey: <CLAVE>"
```

| Código | Qué significa | Qué hacer |
|---|---|---|
| `200` | Anda y la base está instalada | Paso 4 |
| `404` | Conecta pero **falta la tabla** | Instalar el SQL, abajo |
| `401` / `403` | La clave está mal o no es la publishable | Que la vuelva a copiar |
| `000` / timeout | URL mal escrita, o el proyecto está pausado | Que lo mire en el panel |

Supabase **pausa los proyectos gratis por inactividad**. Si estuvo parado unos
días, hay que despausarlo desde el panel y esperar un minuto.

### Paso 4 — Instalar la base (si hace falta)

Pedile a Bruno que, en **SQL Editor → New query**, pegue y corra, en este orden:

1. **Todo** `supabase/instalar.sql` → tiene que decir *"Success. No rows returned"*
2. **Todo** `supabase/verificar.sql` → devuelve 13 filas

De esas 13, **todas tienen que decir OK** menos la última, que es informativa.
Si alguna dice FALTA, el texto de la fila te dice qué archivo correr. Pedile que
te pegue la tabla entera en el chat: con eso sabés exactamente qué pasó sin ver
el panel.

Si la base **ya estaba instalada de antes** (el `curl` dio 200), no corras
`instalar.sql` a lo bruto: corré primero `verificar.sql` y, si falta algo, sólo
las migraciones que la tabla te señale (`migracion-01`…`migracion-04`). Son
idempotentes y no borran datos.

### Paso 5 — El toggle que no se ve desde SQL

**Authentication → Sign In / Providers → activar "Allow anonymous sign-ins".**

Sin esto, `verificar.sql` puede dar los 13 OK y aun así **no se va a poder
confirmar ningún pedido**. Se usa para que alguien pueda pedir sin crear cuenta.
Si Bruno confirma un pedido y la app le dice *"Falta activar las sesiones
anónimas en Supabase"*, es esto y sólo esto.

### Paso 6 — Escribir el `.env`

```bash
cp .env.example .env
```

Y completá los dos valores. **Dos trampas conocidas, las dos silenciosas:**

- `EXPO_PUBLIC_SUPABASE_URL` va **sin** `/rest/v1/` al final. Supabase muestra
  la URL completa de la API REST y es tentador copiarla entera; si queda así,
  todas las consultas dan 404 y nada explica por qué.
- `EXPO_PUBLIC_SUPABASE_KEY` es la que empieza con `sb_publishable_` (reemplaza
  a la vieja "anon key" que empezaba con `eyJ`). La `service_role` **nunca** va
  acá: viaja dentro del bundle y la puede leer cualquiera.

Después de tocar el `.env`, **reiniciá con caché limpio**:

```bash
npx expo start -c
```

Sin el `-c`, Metro sigue usando los valores viejos y parece que nada funcionara.
Es la causa más común de "lo configuré y sigue igual".

### Paso 7 — Confirmar que quedó

La app trae un diagnóstico propio: `diagnosticoConfig()` en `src/lib/supabase.ts`
valida la forma de la URL y de la clave, y el home muestra el cartel de
configuración faltante mientras algo esté mal. Si el home carga **7 locales con
fotos**, Supabase está andando de punta a punta. Recién ahí seguí con la Tarea 4.

**Si después de todo esto sigue sin andar**, no improvises cambios en el cliente
de Supabase (`src/lib/supabase.ts`): está comentado justamente con las cuatro
trampas conocidas. Juntá el código HTTP del `curl`, la salida de `verificar.sql`
y el mensaje exacto que muestra la app, y contáselo a Bruno con esos tres datos.

---

## Tarea 4 — Probar el flujo completo

Con Supabase configurado, recorré esto en el navegador y confirmá que anda:

1. **Home** → deberían aparecer 7 locales con fotos.
2. **Buscar "hamburguesa"** → tiene que encontrar *Burger Bros* y decir
   `Tiene "Hamburguesa Clásica"`. Es búsqueda por producto, no sólo por nombre
   de local.
3. **Perfil → "Marcar mi ubicación en el mapa"** → tiene que cargar un mapa
   (Leaflet + OpenStreetMap, sin API key). Arrastrar el pin y guardar.
4. **Entrar a un local → agregar productos** → aparece la barra verde flotante.
5. **En el carrito, tocar "+ Agregar una nota"** en un producto → escribir
   "sin cebolla" → guardar. Tiene que quedar en verde bajo ese producto.
6. **Continuar → Checkout** → en el resumen tiene que haber una fila
   **"Tarifa de servicio" de $300**, aparte del envío.
7. **Cupón** → escribir `BIENVENIDO`: el total baja un 20% y la tarifa **no**
   cambia. Con `ENVIOGRATIS`, el envío pasa a $0 y la tarifa tampoco cambia.
   Escribir cualquier cosa (`PEPE123`) tiene que decir **"Cupón inválido"** y
   dejar el botón *Confirmar pedido* deshabilitado hasta borrarlo.
   Los cupones se buscan en la base, así que si no aparecen es que falta correr
   `instalar.sql`.
8. **Confirmar pedido** → va a la pestaña Pedidos y el pedido aparece como
   *Pendiente* con la barra de progreso.

**Rotisería El Fogón está cerrada a propósito** (abre 19:00). Se puede entrar y
ver la carta, pero los botones de agregar están deshabilitados. Eso es correcto,
no es un bug.

---

## Errores esperados y qué significan

| Lo que ves | Qué pasa |
|---|---|
| "Falta EXPO_PUBLIC_SUPABASE_URL en el archivo .env" | No existe el `.env`, o falta reiniciar con `-c` |
| "La URL no lleva /rest/v1/ al final" | Bruno pegó la URL completa de la API REST |
| "Supabase no respondió en 10 segundos" | Proyecto pausado, o URL mal |
| "Falta correr supabase/migracion-02-crear-pedido.sql" | Falta el SQL. Correr `instalar.sql` completo lo arregla |
| "Falta activar las sesiones anónimas en Supabase..." | El toggle del Paso 5 de la Tarea 3 |
| El home carga para siempre, o 0 locales | Proyecto pausado, base sin instalar, o `.env` mal. Volvé al Paso 3 de la Tarea 3 |
| No aparece la fila "Tarifa de servicio" | Falta `migracion-04-tarifa-servicio.sql`, o las dos claves están en 0 (que es válido) |
| "No se pudo cargar el mapa" | Los dos CDN de Leaflet caídos, o sin internet. La app deja guardar la dirección igual |

---

## Panel del comercio (migración 05)

Del otro lado del mostrador. El cliente pide y ahora el local lo recibe.

**Los estados del pedido** son seis, y el orden importa:

    Pendiente → Preparando → Listo → En camino → Entregado
                    ↓           ↓
                Rechazado   Rechazado   (siempre con motivo)

`Listo` existe porque Pedilo entrega con **repartidores propios**: hay un
momento real en que la comida está pronta y todavía no la levantó nadie.

**Quién puede qué**, y esto lo decide el servidor, no la app:

| acción | quién |
|---|---|
| Aceptar / Marcar listo / Rechazar | el dueño del local |
| En camino / Entregado | el repartidor asignado |
| cualquier salto fuera de ese orden | nadie |

Todo pasa por la función `cambiar_estado_pedido`. **No la conviertas en un
`update` desde el cliente**: si la app decidiera el estado, alcanzaría con
abrir la consola del navegador para marcar como entregado un pedido que nunca
salió.

**Para crear la cuenta de un local** (lo hace Bruno, una vez por local):

1. Supabase → Authentication → Users → **Add user** → mail y contraseña
2. SQL Editor:
   ```sql
   select public.vincular_comercio('local@mail.com', 'Burger Bros');
   ```
   Te contesta en castellano si algo no cerró.
3. El local entra por **Perfil → "¿Tenés un local en Pedilo?"**, o directo en
   `/acceso`.

**Ojo con las migraciones 05a y 05.** Van separadas y en ejecuciones distintas,
no por prolijidad: Postgres no deja usar un valor de enum en la misma
transacción en la que se lo agrega, y el editor de Supabase corre todo lo que
pegás como una sola transacción. Si las juntás, falla con
`unsafe use of new value "Listo"`. La 05 tiene un chequeo arriba que te lo dice
antes de tocar nada.

---

## Reglas de este proyecto

Cosas que ya se decidieron y **no** hay que "arreglar":

- **`web.output` es `"single"` (SPA), no `"static"`.** El contenido depende del
  cliente (sesión, carrito en el dispositivo) y el pre-render estático generaba
  errores de hidratación en cada pantalla.
- **Los precios los calcula el servidor.** La app llama a la función
  `crear_pedido` de Postgres y nunca manda un total. La clave publicable viaja
  en el bundle: RLS controla *quién* escribe, no *qué*. No conviertas esto en un
  `insert` desde el cliente.
- **Los precios son enteros en pesos**, sin centavos. Nunca float.
- **No hay promociones hardcodeadas.** Ni envío gratis por monto ni descuentos
  por medio de pago. Toda promo es una fila en la tabla `cupones`. Si te piden
  agregar una promo, se agrega ahí, no en el código.
- **La tarifa de servicio sale de la base.** Dos filas de `configuracion`:
  `tarifa_servicio_monto` (fijo en pesos) y `tarifa_servicio_pct` (% del
  subtotal), que se suman. La calcula `crear_pedido` en el servidor sobre el
  subtotal **antes** del descuento; el envío gratis no la afecta. Si cambiás la
  cuenta en `src/lib/precios.ts`, tenés que cambiarla igual en la función SQL:
  la de TypeScript es sólo la previsualización.
- **Un cupón mal escrito frena la confirmación.** Es a propósito: dice "Cupón
  inválido" y deshabilita el botón. No lo cambies por "aplicar en silencio".
- **El estado del pedido lo mueve `cambiar_estado_pedido`, no un update.**
- **El repartidor queda pegado al pedido** cuando lo marca En camino, y desde
  ahí ningún otro puede tocarlo.
- **Rechazar siempre pide motivo.** El cliente lo ve. Un rechazo mudo lo deja
  esperando sin saber si pedir otra cosa.
- **Mercado Pago no está.** Se sacó a propósito: no hay vinculación todavía.
  No lo agregues de vuelta a `METODOS_PAGO` salvo que Bruno lo pida.
- **`pedido_items` copia nombre y precio.** Un pedido es un documento histórico.
- **Un local cerrado se puede mirar, no pedir.** La carta es lo que la gente
  viene a ver.
- **Se puede navegar sin cuenta.** El login (sesión anónima) aparece recién al
  confirmar el pedido.
- **La dirección del perfil es la fuente única de verdad.** El checkout puede
  usar otra para un pedido puntual, pero sólo la pisa si el usuario marca el
  check.
- **La nota es por producto**, no por pedido. Hay además una nota general para
  la entrega, que es otra cosa.
- **Los colores salen de `src/theme/tokens.ts`.** No hardcodees hex en las
  pantallas. `#6EE51A` sólo como fondo con texto negro; para texto sobre blanco
  va `#387F0D`.

## Qué falta construir (por si Bruno lo pide después)

1. Panel del comercio: recibir pedidos y cambiar su estado.
2. Login con Google para clientes; email + contraseña para comercios.
3. Vinculación con Mercado Pago (y recién ahí, volver a ofrecerlo como pago).
4. Subida de imágenes a Supabase Storage.
5. Formulario "Sumá tu local".

---

## Estructura

```
src/
  theme/tokens.ts       Sistema de diseño (colores, tipografía, sombras)
  lib/
    supabase.ts         Cliente + validación de configuración
    tipos.ts            Tipos de la base
    precios.ts          Cálculo de totales y horarios (funciones puras)
    geo.ts              Distancia y zona de cobertura (funciones puras)
    pedidos.ts          Crear y leer pedidos
    cupones.ts          Única fuente de promociones
  componentes/          Botones, imágenes, mapa, íconos
  contextos/            Sesión, carrito, configuración
  app/                  Rutas (Expo Router: la carpeta ES el ruteo)
supabase/
  instalar.sql          Todo junto, para una base nueva
  verificar.sql         Diagnóstico: 13 chequeos
  schema.sql, seed.sql, migracion-*.sql   Las partes por separado
```

Si algo no cierra, `LEEME.md` tiene el detalle completo.
