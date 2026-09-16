"use client";

import { useEffect, useRef } from "react";

interface LiquidGlassIndicatorProps {
  x: number;
  width: number;
  height: number;
  top: number;
  visible: boolean;
}

interface BlobState {
  x: number;
  w: number;
  sx: number;
  sy: number;
  trailX: number;
  trailW: number;
  trailOpacity: number;
}

const SPRING = { stiffness: 200, damping: 22, mass: 1 };
const TRAIL_SPRING = { stiffness: 120, damping: 18, mass: 1.2 };

function springStep(
  current: number,
  velocity: number,
  target: number,
  cfg: typeof SPRING,
  dt: number
): [number, number] {
  const acceleration =
    (cfg.stiffness * (target - current) - cfg.damping * velocity) / cfg.mass;
  const v = velocity + acceleration * dt;
  const next = current + v * dt;
  return [next, v];
}

export default function LiquidGlassIndicator({
  x,
  width,
  height,
  top,
  visible,
}: LiquidGlassIndicatorProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef<BlobState>({
    x,
    w: width,
    sx: 1,
    sy: 1,
    trailX: x,
    trailW: width * 0.45,
    trailOpacity: 0,
  });

  const velRef = useRef({ x: 0, w: 0, trailX: 0, trailW: 0, sx: 0, sy: 0 });
  const targetRef = useRef({ x, w: width });
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const initializedRef = useRef(false);

  targetRef.current = { x, w: width };

  useEffect(() => {
    if (!visible) return;

    if (!initializedRef.current && width > 0) {
      stateRef.current = {
        x,
        w: width,
        sx: 1,
        sy: 1,
        trailX: x,
        trailW: width * 0.45,
        trailOpacity: 0,
      };
      initializedRef.current = true;
    }

    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      timeRef.current += dt;

      const primary = primaryRef.current;
      const trail = trailRef.current;
      const highlight = highlightRef.current;
      const layer = layerRef.current;
      if (!primary || !trail || !highlight || !layer) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const s = stateRef.current;
      const v = velRef.current;
      const t = targetRef.current;

      const [nx, nvx] = springStep(s.x, v.x, t.x, SPRING, dt);
      const [nw, nvw] = springStep(s.w, v.w, t.w, SPRING, dt);

      const speed = Math.abs(nvx);
      const dist = Math.abs(t.x - nx);
      const targetSx = 1 + Math.min(speed * 0.012 + dist * 0.0018, 0.38);
      const targetSy = 1 - Math.min(speed * 0.006 + dist * 0.0008, 0.14);

      const [nsx, nvsx] = springStep(s.sx, v.sx, targetSx, TRAIL_SPRING, dt);
      const [nsy, nvsy] = springStep(s.sy, v.sy, targetSy, TRAIL_SPRING, dt);

      const trailTargetX = nx + (t.x - nx) * 0.38;
      const trailTargetW = nw * 0.52;
      const trailTargetOpacity = Math.min(speed * 0.045 + dist * 0.002, 0.82);

      const [ntx, ntvx] = springStep(s.trailX, v.trailX, trailTargetX, TRAIL_SPRING, dt);
      const [ntw, ntvw] = springStep(s.trailW, v.trailW, trailTargetW, TRAIL_SPRING, dt);
      const [trailOpacity] = springStep(
        s.trailOpacity,
        0,
        trailTargetOpacity,
        { stiffness: 160, damping: 20, mass: 1 },
        dt
      );

      stateRef.current = {
        x: nx,
        w: nw,
        sx: nsx,
        sy: nsy,
        trailX: ntx,
        trailW: ntw,
        trailOpacity,
      };
      velRef.current = { x: nvx, w: nvw, trailX: ntvx, trailW: ntvw, sx: nvsx, sy: nvsy };

      const morph =
        Math.sin(timeRef.current * 1.8) * 3 +
        Math.cos(timeRef.current * 1.1) * 2;
      const radius = `${18 + morph}% ${22 - morph * 0.5}% ${20 + morph * 0.6}% ${24 - morph}% / ${44 + morph * 0.4}% ${42 - morph * 0.3}%`;

      primary.style.transform = `translate3d(${nx}px, 0, 0) scale(${nsx}, ${nsy})`;
      primary.style.width = `${nw}px`;
      primary.style.borderRadius = radius;

      trail.style.transform = `translate3d(${ntx}px, 0, 0)`;
      trail.style.width = `${ntw}px`;
      trail.style.opacity = `${trailOpacity}`;

      const parallax = Math.max(-5, Math.min(5, nvx * 0.32));
      highlight.style.transform = `translate3d(${parallax}px, 0, 0)`;

      layer.style.opacity = "1";

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden>
        <defs>
          <filter id="liquid-goo" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        ref={layerRef}
        className="liquid-glass-layer pointer-events-none absolute inset-x-0 z-[1]"
        style={{ height, top, filter: "url(#liquid-goo)" }}
      >
        <div
          ref={trailRef}
          className="liquid-blob liquid-blob--trail"
          style={{ height }}
        />
        <div
          ref={primaryRef}
          className="liquid-blob liquid-blob--primary"
          style={{ height }}
        >
          <div ref={highlightRef} className="liquid-blob__highlight" aria-hidden />
          <div className="liquid-blob__sheen" aria-hidden />
        </div>
      </div>
    </>
  );
}
