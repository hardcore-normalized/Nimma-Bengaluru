// Live GPS tracking (browsers allow this only on https:// or localhost).
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'insecure';

export function useGeolocation(enabled = true) {
  const [pos, setPos] = useState<Position | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState('');
  const watchId = useRef<number | null>(null);
  const best = useRef<Position | null>(null);

  const start = useCallback(() => {
    if (!window.isSecureContext) {
      setStatus('insecure');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('This browser cannot share location.');
      return;
    }
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    setStatus((s) => (s === 'ok' ? s : 'locating'));
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const next: Position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0), at: p.timestamp || Date.now() };
        // keep the most accurate fix, but accept newer fixes that are about as good
        const b = best.current;
        if (!b || next.accuracy <= b.accuracy * 1.3 || next.at - b.at > 20000) {
          best.current = next;
          setPos(next);
        }
        setStatus('ok');
        setError('');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else if (!best.current) setStatus('unavailable');
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    start();
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [enabled, start]);

  return { pos, status, error, retry: start };
}
