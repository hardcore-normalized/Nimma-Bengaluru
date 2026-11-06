// Leaflet map using the official OpenStreetMap raster tiles.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  emoji?: string;
  ring?: boolean;
  popup?: string;
  onClick?: () => void;
}

interface Props {
  center: [number, number];
  zoom?: number;
  className?: string;
  markers?: MapMarker[];
  pin?: { lat: number; lng: number; draggable?: boolean; onMove?: (lat: number, lng: number) => void; emoji?: string } | null;
  me?: { lat: number; lng: number; accuracy?: number } | null;
  circle?: { lat: number; lng: number; radius: number } | null;
  line?: [[number, number], [number, number]] | null;
  geojson?: any;
  fit?: 'markers' | 'geojson' | null;
  onClickMap?: (lat: number, lng: number) => void;
}

const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
};

function pinIcon(color = '#e5e5e5', emoji = '', ring = false, size = 34) {
  return L.divIcon({
    className: 'nb-marker',
    html: `<div class="nb-pin${ring ? ' ring' : ''}" style="--c:${color};width:${size}px;height:${size}px"><span>${emoji}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

export default function MapView({ center, zoom = 15, className, markers, pin, me, circle, line, geojson, fit, onClickMap }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const layers = useRef<{ markers?: L.LayerGroup; pin?: L.Marker; me?: L.LayerGroup; circle?: L.Circle; line?: L.Polyline; geo?: L.GeoJSON }>({});
  const onMoveRef = useRef(pin?.onMove);
  onMoveRef.current = pin?.onMove;
  const onClickRef = useRef(onClickMap);
  onClickRef.current = onClickMap;

  // create map once
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView(center, zoom);
    m.on('click', (e: L.LeafletMouseEvent) => onClickRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = {};
      tileLayer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Request only tiles needed for the map's visible viewport; keep OSM attribution in view.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tileLayer.current?.remove();
    tileLayer.current = L.tileLayer(OSM_TILES.url, { attribution: OSM_TILES.attr, maxZoom: 19 }).addTo(m);
  }, []);

  // markers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.markers?.remove();
    if (!markers?.length) return;
    const g = L.layerGroup();
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: pinIcon(mk.color, mk.emoji, mk.ring, 30) });
      if (mk.popup) marker.bindPopup(mk.popup);
      if (mk.onClick) marker.on('click', mk.onClick);
      g.addLayer(marker);
    }
    g.addTo(m);
    layers.current.markers = g;
    if (fit === 'markers' && markers.length > 1) m.fitBounds(L.latLngBounds(markers.map((x) => [x.lat, x.lng] as [number, number])).pad(0.15), { maxZoom: 16 });
  }, [markers, fit]);

  // draggable issue pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!pin) {
      layers.current.pin?.remove();
      layers.current.pin = undefined;
      return;
    }
    if (!layers.current.pin) {
      const p = L.marker([pin.lat, pin.lng], { draggable: Boolean(pin.draggable), icon: pinIcon('#ef4444', pin.emoji || '📍', true, 42), zIndexOffset: 1000 });
      p.on('dragend', () => {
        const ll = p.getLatLng();
        onMoveRef.current?.(ll.lat, ll.lng);
      });
      p.addTo(m);
      layers.current.pin = p;
    } else {
      layers.current.pin.setLatLng([pin.lat, pin.lng]);
    }
  }, [pin?.lat, pin?.lng, pin?.draggable, pin?.emoji, pin]);

  // reporter's live position
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.me?.remove();
    if (!me) return;
    const g = L.layerGroup();
    if (me.accuracy) L.circle([me.lat, me.lng], { radius: me.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.12 }).addTo(g);
    L.circleMarker([me.lat, me.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Reporter position').addTo(g);
    g.addTo(m);
    layers.current.me = g;
  }, [me?.lat, me?.lng, me?.accuracy, me]);

  // allowed-distance circle
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.circle?.remove();
    if (!circle) return;
    layers.current.circle = L.circle([circle.lat, circle.lng], { radius: circle.radius, color: '#d4d4d4', weight: 1.5, dashArray: '6 6', fillOpacity: 0.04 }).addTo(m);
  }, [circle?.lat, circle?.lng, circle?.radius, circle]);

  // line between reporter and issue
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.line?.remove();
    if (!line) return;
    layers.current.line = L.polyline(line, { color: '#d4d4d4', weight: 2.5, dashArray: '4 6' }).addTo(m);
    m.fitBounds(L.latLngBounds(line).pad(0.4), { maxZoom: 17 });
  }, [line]);

  // ward boundaries
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.geo?.remove();
    if (!geojson) return;
    const g = L.geoJSON(geojson, {
      style: () => ({ color: '#d4d4d4', weight: 1.5, fillOpacity: 0.07, fillColor: '#737373' }),
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        if (p.name) layer.bindTooltip(`${p.name}${p.code ? ' (' + p.code + ')' : ''}`, { sticky: true });
      },
    }).addTo(m);
    g.bringToBack();
    layers.current.geo = g;
    if (fit === 'geojson') {
      const b = g.getBounds();
      if (b.isValid()) m.fitBounds(b.pad(0.05));
    }
  }, [geojson, fit]);

  // recenter when center prop changes significantly
  const lastCenter = useRef(center);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const [a, b] = lastCenter.current;
    if (Math.abs(a - center[0]) > 1e-5 || Math.abs(b - center[1]) > 1e-5) {
      m.setView(center, m.getZoom() < 13 ? zoom : m.getZoom());
      lastCenter.current = center;
    }
  }, [center, zoom]);

  return <div ref={el} className={`map ${className || ''}`} />;
}
