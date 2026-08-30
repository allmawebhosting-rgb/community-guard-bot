import { useEffect, useRef, useState } from "react";
import type { NearbyPlace } from "@/lib/places.types";

type NearbyMapProps = {
  center: { lat: number; lng: number };
  userLocation: { lat: number; lng: number };
  places: NearbyPlace[];
};

const SCRIPT_ID = "allma-google-maps-script";

export function NearbyMap({ center, userLocation, places }: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState<boolean>(Boolean((window as any)?.google?.maps));
  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

  useEffect(() => {
    if ((window as any)?.google?.maps) {
      setReady(true);
      return;
    }

    if (!browserKey) {
      setReady(false);
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setReady(Boolean((window as any)?.google?.maps)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(browserKey)}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(Boolean((window as any)?.google?.maps));
    document.head.appendChild(script);
  }, [browserKey]);

  useEffect(() => {
    if (!ready || !containerRef.current || !(window as any)?.google?.maps) return;

    const map = new (window as any).google.maps.Map(containerRef.current, {
      center: { lat: center.lat, lng: center.lng },
      zoom: 12,
      mapTypeId: "satellite",
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: (window as any).google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      },
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: "greedy",
    });

    new (window as any).google.maps.Marker({
      map,
      position: { lat: userLocation.lat, lng: userLocation.lng },
      title: "Your location",
      icon: {
        path: (window as any).google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#22c55e",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    new (window as any).google.maps.Circle({
      map,
      center: { lat: userLocation.lat, lng: userLocation.lng },
      radius: 2000,
      fillColor: "#22c55e",
      fillOpacity: 0.08,
      strokeColor: "#22c55e",
      strokeOpacity: 0.5,
      strokeWeight: 1,
    });

    places.slice(0, 30).forEach((place) => {
      new (window as any).google.maps.Marker({
        map,
        position: { lat: place.latitude, lng: place.longitude },
        title: place.name,
      });
    });
  }, [center, places, ready, userLocation]);

  if (!browserKey) {
    return <div className="grid h-[320px] place-items-center rounded-[1.5rem] border border-dashed border-border/70 bg-card/50 text-sm text-muted-foreground">Google Maps is not configured for this build.</div>;
  }

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 shadow-soft">
      {!ready && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 text-sm font-medium text-muted-foreground">
          Loading map…
        </div>
      )}
      <div ref={containerRef} className="h-[320px] w-full" />
    </div>
  );
}
