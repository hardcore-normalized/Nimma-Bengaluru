// Crayon-coloured confetti for the success screen.
import { useEffect, useRef } from 'react';

export default function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const W = (c.width = innerWidth * dpr);
    const H = (c.height = innerHeight * dpr);
    const colors = ['#e2453c', '#f5862a', '#ffcd38', '#43a047', '#3d85e6', '#8a63d2', '#f472a8'];
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.2,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 16 * dpr,
      vy: (-Math.random() * 15 - 5) * dpr,
      r: (Math.random() * 5 + 3) * dpr,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.42 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (now - start < 3500) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
