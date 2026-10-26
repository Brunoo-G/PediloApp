/**
 * El mapa, como una página HTML sola.
 *
 * Por qué así y no con una librería de mapas nativa:
 *
 *  - `react-native-maps` no funciona en web, y la app sale primero por web.
 *  - Google Maps y Mapbox piden tarjeta de crédito y cobran por uso.
 *
 * Leaflet + los tiles de OpenStreetMap son gratis, sin API key y sin cuenta.
 * El mismo HTML se muestra dentro de un <iframe> en web y de un <WebView> en
 * Android/iOS, así que hay UNA sola implementación del mapa para las tres
 * plataformas.
 *
 * La comunicación es en un solo sentido — mapa → app — porque alcanza: cuando
 * la app necesita mover el mapa (por ejemplo al usar el GPS), remonta el
 * componente con un centro nuevo. Un protocolo bidireccional sería más código
 * para el mismo resultado.
 *
 * Nota sobre los tiles: OpenStreetMap pide no abusar de sus servidores. Para
 * una app en una ciudad chica está bien. Si esto crece, conviene pasar a un
 * proveedor de tiles propio o pago — se cambia una sola URL acá abajo.
 */

export interface OpcionesMapa {
  lat: number;
  lng: number;
  /** Nivel de zoom. 16 muestra la manzana; 13 el barrio. */
  zoom?: number;
  /** Color del pin, para que combine con la marca. */
  colorPin?: string;
}

export function mapaHtml({ lat, lng, zoom = 16, colorPin = "#0E0E0E" }: OpcionesMapa): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script>
    // Si unpkg no responde, se prueba jsdelivr antes de darse por vencido.
    // Que un CDN caído deje sin cargar la dirección sería un problema serio.
    function cargarLeaflet(urls, listo, falla) {
      if (!urls.length) return falla();
      var s = document.createElement('script');
      s.src = urls[0];
      s.onload = listo;
      s.onerror = function () { cargarLeaflet(urls.slice(1), listo, falla); };
      document.head.appendChild(s);
    }
  </script>
  <style>
    html, body, #mapa { height: 100%; margin: 0; padding: 0; background: #F4F4F2; }
    .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    /* El pin se dibuja acá y no con una imagen: una request menos y toma el color de marca. */
    .pin {
      width: 30px; height: 30px; margin-left: -15px; margin-top: -30px;
      background: ${colorPin};
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 10px rgba(0,0,0,.35);
    }
    .pin::after {
      content: ""; position: absolute; top: 8px; left: 8px;
      width: 8px; height: 8px; border-radius: 50%; background: #6EE51A;
    }
    .aviso {
      position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px; z-index: 500;
      background: rgba(14,14,14,.86); color: #fff; padding: 7px 14px; border-radius: 999px;
      font-size: 12.5px; font-weight: 600; white-space: nowrap; pointer-events: none;
      transition: opacity .3s;
    }
  </style>
</head>
<body>
  <div id="mapa"></div>
  <div class="aviso" id="aviso">Arrastrá el pin o tocá el mapa</div>
  <script>
    function avisarFalla() {
      var msg = JSON.stringify({ tipo: 'error' });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
      document.getElementById('aviso').textContent = 'No se pudo cargar el mapa';
    }

    cargarLeaflet(
      ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
       'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'],
      iniciar,
      avisarFalla
    );

    function iniciar() {
      var mapa = L.map('mapa', { zoomControl: true, attributionControl: true })
                  .setView([${lat}, ${lng}], ${zoom});

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(mapa);

      var icono = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30] });
      var pin = L.marker([${lat}, ${lng}], { icon: icono, draggable: true }).addTo(mapa);

      var aviso = document.getElementById('aviso');
      function ocultarAviso() { aviso.style.opacity = '0'; }

      function avisar(ll) {
        var msg = JSON.stringify({ tipo: 'pin', lat: ll.lat, lng: ll.lng });
        // WebView (Android/iOS)
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
        // iframe (web)
        else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
      }

      pin.on('dragend', function () { ocultarAviso(); avisar(pin.getLatLng()); });
      mapa.on('click', function (ev) {
        ocultarAviso();
        pin.setLatLng(ev.latlng);
        avisar(ev.latlng);
      });

      // El mapa arranca con un tamaño mal calculado si el contenedor todavía no
      // terminó de layoutearse. Este empujón lo corrige.
      setTimeout(function () { mapa.invalidateSize(); }, 250);
    }
  </script>
</body>
</html>`;
}
