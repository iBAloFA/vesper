import { useEffect, useRef } from "react";

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  twinkle: number;
  phase: number;
  ember: boolean;
}

export function Backdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let motes: Mote[] = [];
    let frame = 0;
    let last = 0;

    const makeMote = (): Mote => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.000045,
      vy: -0.000012 - Math.random() * 0.00004,
      radius: 0.6 + Math.random() * 1.6,
      alpha: 0.08 + Math.random() * 0.28,
      twinkle: 0.0008 + Math.random() * 0.0018,
      phase: Math.random() * Math.PI * 2,
      ember: Math.random() > 0.62,
    });

    const resize = () => {
      dpr = Math.min(1.6, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.max(28, Math.floor((width * height) / 26000)));
      motes = Array.from({ length: count }, makeMote);
      draw(0);
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      for (let index = 0; index < motes.length; index += 1) {
        const mote = motes[index];
        if (!reduceMotion) {
          mote.x += mote.vx * 16;
          mote.y += mote.vy * 16;
          if (mote.y < -0.03) mote.y = 1.03;
          if (mote.x < -0.03) mote.x = 1.03;
          if (mote.x > 1.03) mote.x = -0.03;
        }
        const x = mote.x * width;
        const y = mote.y * height;
        const shimmer = reduceMotion ? 1 : 0.65 + Math.sin(time * mote.twinkle + mote.phase) * 0.35;
        context.beginPath();
        context.fillStyle = mote.ember
          ? `rgba(224, 138, 75, ${mote.alpha * shimmer})`
          : `rgba(154, 147, 173, ${mote.alpha * shimmer * 0.8})`;
        context.arc(x, y, mote.radius, 0, Math.PI * 2);
        context.fill();

        if (index % 7 === 0) {
          const next = motes[(index + 3) % motes.length];
          const nx = next.x * width;
          const ny = next.y * height;
          const distance = Math.hypot(nx - x, ny - y);
          if (distance < 140) {
            context.strokeStyle = `rgba(224, 138, 75, ${0.035 * (1 - distance / 140)})`;
            context.lineWidth = 0.5;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(nx, ny);
            context.stroke();
          }
        }
      }
    };

    const tick = (time: number) => {
      if (time - last > 32) {
        draw(time);
        last = time;
      }
      frame = window.requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) frame = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="backdrop" aria-hidden="true" />;
}
