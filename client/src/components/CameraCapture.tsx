// Full-screen live camera. Photos are grabbed from the live camera stream and
// stamped with GPS + time, so a citizen cannot upload an old or downloaded image.
import { useEffect, useRef, useState } from 'react';
import { Camera, FlipHorizontal2, Flashlight, Image as ImageIcon, Square, Video, X } from 'lucide-react';
import { canUseCamera } from '../lib/device';
import { frameThumb, frameToJpeg, pickVideoMime, processNativePhoto, uid, type CapturedMedia, type StampInfo } from '../lib/capture';

interface Props {
  open: boolean;
  mode: 'photo' | 'video';
  stamp: StampInfo;
  maxVideoSec: number;
  allowGallery: boolean;
  onCapture: (m: CapturedMedia) => void;
  onClose: () => void;
}

export default function CameraCapture({ open, mode, stamp, maxVideoSec, allowGallery, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);
  const [torch, setTorch] = useState(false);
  const [recording, setRecording] = useState<{ rec: MediaRecorder; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // open / close the camera stream
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setError('');
    (async () => {
      if (!canUseCamera()) {
        setError(window.isSecureContext ? 'Live camera is not available in this browser.' : 'The live camera only works on the secure (https://) link.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const v = videoRef.current!;
        const videoHasFrame = new Promise<void>((resolve) => {
          if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0) return resolve();
          v.addEventListener('loadeddata', () => resolve(), { once: true });
        });
        v.srcObject = s;
        await v.play().catch(() => {});
        await Promise.race([videoHasFrame, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
        if (cancelled) return;
        if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !v.videoWidth) {
          setError('Camera opened but no picture is ready yet. Close the camera and try again.');
          return;
        }
        setReady(true);
        const track = s.getVideoTracks()[0] as any;
        const caps = track?.getCapabilities?.();
        setTorchAvail(Boolean(caps?.torch));
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access for this site in your browser settings, or use the phone camera button below.' : `Could not open the camera (${e?.message || e?.name}).`);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTorch(false);
    };
  }, [open, facing]);

  // recording timer + auto stop
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = (Date.now() - recording.started) / 1000;
      setElapsed(s);
      if (s >= maxVideoSec) stopRecording();
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, maxVideoSec]);

  if (!open) return null;

  const gps = stamp.lat != null && stamp.lng != null ? { lat: stamp.lat, lng: stamp.lng, accuracy: stamp.accuracy || 0 } : null;

  const takePhoto = async () => {
    if (!videoRef.current || busy) return;
    if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !videoRef.current.videoWidth) {
      setError('The camera is still starting. Wait a moment, then tap the shutter again.');
      return;
    }
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    try {
      const { blob, width, height } = await frameToJpeg(videoRef.current, stamp);
      onCapture({ id: uid(), kind: 'image', blob, url: URL.createObjectURL(blob), captureMethod: 'live', capturedAt: new Date().toISOString(), gps, width, height });
    } catch {
      setError('Could not capture that frame. Wait for the camera preview and try again.');
    } finally {
      setBusy(false);
    }
  };

  const startRecording = () => {
    const s = streamRef.current;
    if (!s || typeof MediaRecorder === 'undefined') {
      setError('Video recording is not supported in this browser. Use the phone camera button below.');
      return;
    }
    const mime = pickVideoMime();
    const rec = new MediaRecorder(s, mime ? { mimeType: mime, videoBitsPerSecond: 2_000_000 } : { videoBitsPerSecond: 2_000_000 });
    const chunks: Blob[] = [];
    const thumb = videoRef.current ? frameThumb(videoRef.current) : undefined;
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' });
      setRecording(null);
      setElapsed(0);
      onCapture({ id: uid(), kind: 'video', blob, url: URL.createObjectURL(blob), captureMethod: 'live', capturedAt: new Date(started).toISOString(), gps, durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)), thumb });
    };
    rec.start(1000);
    setRecording({ rec, started });
  };

  const stopRecording = () => {
    if (recording && recording.rec.state !== 'inactive') recording.rec.stop();
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as any;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch {
      setTorchAvail(false);
    }
  };

  const onNativeFile = async (file: File | undefined, method: 'native' | 'gallery') => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > 25 * 1024 * 1024) throw new Error('Video is larger than 25 MB. Record a shorter clip.');
        onCapture({ id: uid(), kind: 'video', blob: file, url: URL.createObjectURL(file), captureMethod: method, capturedAt: new Date().toISOString(), gps });
      } else {
        const r = await processNativePhoto(file, stamp, method);
        onCapture({ id: uid(), kind: 'image', blob: r.blob, url: URL.createObjectURL(r.blob), captureMethod: method, capturedAt: new Date().toISOString(), gps, width: r.width, height: r.height, exifDate: r.exifDate, exifLat: r.exifLat, exifLng: r.exifLng });
      }
    } catch (e: any) {
      setError(e?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="camera" role="dialog" aria-label={mode === 'photo' ? 'Camera' : 'Video recorder'}>
      <div className="camera-top">
        <button className="cam-icon" onClick={() => (recording ? stopRecording() : onClose())} aria-label="Close camera">
          <X size={22} />
        </button>
        <div className="cam-title">
          {mode === 'photo' ? <Camera size={16} /> : <Video size={16} />} {mode === 'photo' ? 'Live photo' : `Video · max ${maxVideoSec}s`}
        </div>
        <div className="cam-actions">
          {torchAvail && (
            <button className={`cam-icon ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-label="Torch">
              <Flashlight size={20} />
            </button>
          )}
          <button className="cam-icon" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')} aria-label="Switch camera" disabled={Boolean(recording)}>
            <FlipHorizontal2 size={20} />
          </button>
        </div>
      </div>

      <div className="camera-stage">
        <video ref={videoRef} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} />
        {flash && <div className="cam-flash" />}
        {!ready && !error && <div className="cam-msg">Opening camera…</div>}
        {error && (
          <div className="cam-msg cam-error">
            <p>{error}</p>
          </div>
        )}
        <div className="cam-chip">
          <span className={`dot ${gps ? 'ok' : 'warn'}`} />
          {gps ? `GPS ±${Math.round(gps.accuracy)} m${stamp.ward ? ' · ' + stamp.ward : ''}` : 'Waiting for GPS…'}
        </div>
        {recording && (
          <div className="cam-rec">
            <span className="rec-dot" /> {Math.floor(elapsed)}s / {maxVideoSec}s
          </div>
        )}
      </div>

      <div className="camera-bottom">
        <div className="cam-side">
          {allowGallery && (
            <button className="cam-small" onClick={() => galleryRef.current?.click()} disabled={busy || Boolean(recording)}>
              <ImageIcon size={18} />
              <span>Gallery</span>
            </button>
          )}
        </div>
        {mode === 'photo' ? (
          <button className="shutter" onClick={takePhoto} disabled={!ready || busy} aria-label="Take photo">
            <span />
          </button>
        ) : recording ? (
          <button className="shutter rec" onClick={stopRecording} aria-label="Stop recording">
            <Square size={26} fill="currentColor" />
          </button>
        ) : (
          <button className="shutter rec" onClick={startRecording} disabled={!ready} aria-label="Start recording">
            <span />
          </button>
        )}
        <div className="cam-side">
          <button className="cam-small" onClick={() => nativeRef.current?.click()} disabled={busy || Boolean(recording)} title="Use the phone's camera app">
            <Camera size={18} />
            <span>Phone camera</span>
          </button>
        </div>
      </div>

      <input ref={nativeRef} type="file" accept={mode === 'photo' ? 'image/*' : 'video/*'} capture="environment" hidden onChange={(e) => onNativeFile(e.target.files?.[0], 'native').finally(() => (e.target.value = ''))} />
      {allowGallery && <input ref={galleryRef} type="file" accept={mode === 'photo' ? 'image/*' : 'video/*'} hidden onChange={(e) => onNativeFile(e.target.files?.[0], 'gallery').finally(() => (e.target.value = ''))} />}
    </div>
  );
}
