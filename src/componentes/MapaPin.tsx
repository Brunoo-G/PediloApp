/**
 * Mapa para elegir la ubicación — versión Android / iOS.
 *
 * El mapa vive dentro de un WebView. La versión de web (`MapaPin.web.tsx`) usa
 * el mismo HTML dentro de un iframe: Metro elige el archivo según la
 * plataforma, así que hay una sola implementación del mapa para las tres.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { color, radio } from "../theme/tokens";
import { mapaHtml } from "./mapaHtml";
import type { Punto } from "../lib/geo";

export interface MapaPinProps {
  centro: Punto;
  onMover: (p: Punto) => void;
  /** Se llama si el mapa no pudo cargarse (los dos CDN caídos, o sin internet). */
  onFallo?: () => void;
  altura?: number;
}

export function MapaPin({ centro, onMover, onFallo, altura = 260 }: MapaPinProps) {
  // El HTML se rearma sólo cuando cambia el centro de verdad, no en cada render.
  const html = useMemo(() => mapaHtml({ lat: centro.lat, lng: centro.lng }), [centro.lat, centro.lng]);

  return (
    <View style={{ height: altura, borderRadius: radio.md, overflow: "hidden", backgroundColor: color.n100 }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={{ flex: 1, backgroundColor: color.n100 }}
        onMessage={(ev) => {
          try {
            const msg = JSON.parse(ev.nativeEvent.data);
            if (msg?.tipo === "pin") onMover({ lat: msg.lat, lng: msg.lng });
            else if (msg?.tipo === "error") onFallo?.();
          } catch {
            // Mensaje que no es nuestro: se ignora.
          }
        }}
      />
    </View>
  );
}
