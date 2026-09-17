"use client";

import { useEffect, useRef } from "react";

interface LiquidGlassIndicatorProps {
  x: number;
  width: number;
  height: number;
  top: number;
  visible: boolean;
  motionKey: number;
  direction: "left" | "right" | null;
  isDragging?: boolean;
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

type Phase = "idle" | "travel" | "settle";

const SPRING = { stiffness: 240, damping: 32, mass: 1 };
const DRAG_SPRING = { stiffness: 320, damping: 28, mass: 0.9 };
const TRAIL_SPRING = { stiffness: 140, damping: 24, mass: 1.1 };
const DRAG_TRAIL_SPRING = { stiffness: 200, damping: 22, mass: 0.95 };
const SETTLE_MS = 420;

const SETTLE_KEYFRAMES: { t: number; sx: number; sy: number }[] = [
  { t: 0, sx: 1.1, sy: 0.96 },
  { t: 0.4, sx: 0.98, sy: 1.02 },
  { t: 0.7, sx: 1.02, sy: 0.99 },
  { t: 1, sx: 1, sy: 1 },
];

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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function sampleSettle(progress: number): { sx: number; sy: number } {
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < SETTLE_KEYFRAMES.length - 1; i++) {
    const a = SETTLE_KEYFRAMES[i];
    const b = SETTLE_KEYFRAMES[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = (p - a.t) / (b.t - a.t);
      const eased = easeOutCubic(local);
      return {
        sx: a.sx + (b.sx - a.sx) * eased,
        sy: a.sy + (b.sy - a.sy) * eased,
      };
    }
  }
  return { sx: 1, sy: 1 };
}

function transformOriginForPhase(
  phase: Phase,
  direction: "left" | "right" | null
): string {
  if (phase === "travel") {
    return direction === "left" ? "right center" : "left center";
  }
  return "center center";
}

export default function LiquidGlassIndicator({
  x,
  width,
  height,
  top,
  visible,
  motionKey,
  direction,
  isDragging = false,
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
  const springTargetRef = useRef({ x, w: width });
  const phaseRef = useRef<Phase>("idle");
  const phaseStartRef = useRef(0);
  const directionRef = useRef(direction);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const initializedRef = useRef(false);
  const motionKeyRef = useRef(motionKey);
  const reducedMotionRef = useRef(false);
  const draggingRef = useRef(isDragging);
  const prevDraggingRef = useRef(isDragging);

  targetRef.current = { x, w: width };
  directionRef.current = direction;
  draggingRef.current = isDragging;

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    if (isDragging && !prevDraggingRef.current) {
      phaseRef.current = "travel";
      phaseStartRef.current = performance.now();
      springTargetRef.current = targetRef.current;
      velRef.current = { ...velRef.current, sx: 0, sy: 0 };
    } else if (!isDragging && prevDraggingRef.current) {
      phaseRef.current = "settle";
      phaseStartRef.current = performance.now();
      springTargetRef.current = targetRef.current;
      velRef.current = { ...velRef.current, sx: 0, sy: 0 };
    }

    prevDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    if (motionKey === motionKeyRef.current || !initializedRef.current) {
      motionKeyRef.current = motionKey;
      return;
    }

    motionKeyRef.current = motionKey;
    phaseRef.current = "travel";
    phaseStartRef.current = performance.now();
    springTargetRef.current = targetRef.current;
    velRef.current = { ...velRef.current, sx: 0, sy: 0 };
  }, [motionKey]);

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
      springTargetRef.current = { x, w: width };
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
      const dir = directionRef.current;
      let phase = phaseRef.current;
      const phaseElapsed = now - phaseStartRef.current;

      const isDraggingNow = draggingRef.current;

      let targetSx = 1;
      let targetSy = 1;
      let springTarget = springTargetRef.current;

      if (isDraggingNow) {
        phaseRef.current = "travel";
        phase = "travel";
      }

      if (reducedMotionRef.current) {
        phaseRef.current = "idle";
        springTargetRef.current = t;
        springTarget = t;
        targetSx = 1;
        targetSy = 1;
      } else if (phase === "travel") {
        springTarget = t;
        const dist = Math.abs(t.x - s.x);
        const speed = Math.abs(v.x);

        if (isDraggingNow) {
          targetSx = 1.1 + Math.min(speed * 0.005 + dist * 0.0008, 0.08);
          targetSy = 0.95 - Math.min(speed * 0.003, 0.04);
        } else {
          targetSx = 1.12;
          targetSy = 0.94;
        }

        if (!isDraggingNow && dist < 2.5 && speed < 120) {
          phaseRef.current = "settle";
          phaseStartRef.current = now;
          springTargetRef.current = t;
          springTarget = t;
          velRef.current = { ...v, x: 0, w: 0, sx: 0, sy: 0 };
          phase = "settle";
        }
      } else if (phase === "settle") {
        springTarget = t;
        const settleT = phaseElapsed / SETTLE_MS;
        const sampled = sampleSettle(settleT);
        targetSx = sampled.sx;
        targetSy = sampled.sy;

        if (settleT >= 1) {
          phaseRef.current = "idle";
          targetSx = 1;
          targetSy = 1;
        }
      } else {
        springTarget = t;
        const speed = Math.abs(v.x);
        const dist = Math.abs(t.x - s.x);
        targetSx = 1 + Math.min(speed * 0.004 + dist * 0.0006, 0.03);
        targetSy = 1 - Math.min(speed * 0.002 + dist * 0.0003, 0.015);
      }

      const moveSpring = isDraggingNow ? DRAG_SPRING : SPRING;
      const [nx, nvx] = springStep(s.x, v.x, springTarget.x, moveSpring, dt);
      const [nw, nvw] = springStep(s.w, v.w, springTarget.w, moveSpring, dt);

      let nsx: number;
      let nsy: number;
      let nvsx: number;
      let nvsy: number;

      if (phase === "settle") {
        nsx = targetSx;
        nsy = targetSy;
        nvsx = 0;
        nvsy = 0;
      } else {
        const scaleSpring = isDraggingNow ? DRAG_TRAIL_SPRING : TRAIL_SPRING;
        [nsx, nvsx] = springStep(s.sx, v.sx, targetSx, scaleSpring, dt);
        [nsy, nvsy] = springStep(s.sy, v.sy, targetSy, scaleSpring, dt);
      }

      const trailTargetX = nx + (springTarget.x - nx) * (isDraggingNow ? 0.42 : 0.35);
      const trailTargetW = nw * 0.55;
      const trailTargetOpacity = Math.min(
        Math.abs(nvx) * 0.04 + Math.abs(springTarget.x - nx) * 0.0025,
        phase === "travel" ? 0.75 : 0.45
      );

      const trailSpring = isDraggingNow ? DRAG_TRAIL_SPRING : TRAIL_SPRING;
      const [ntx, ntvx] = springStep(
        s.trailX,
        v.trailX,
        trailTargetX,
        trailSpring,
        dt
      );
      const [ntw, ntvw] = springStep(
        s.trailW,
        v.trailW,
        trailTargetW,
        trailSpring,
        dt
      );
      const [trailOpacity] = springStep(
        s.trailOpacity,
        0,
        trailTargetOpacity,
        { stiffness: 180, damping: 22, mass: 1 },
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
      velRef.current = {
        x: nvx,
        w: nvw,
        trailX: ntvx,
        trailW: ntvw,
        sx: nvsx,
        sy: nvsy,
      };

      const morph =
        phase === "idle"
          ? Math.sin(timeRef.current * 1.2) * 0.6 +
            Math.cos(timeRef.current * 0.85) * 0.35
          : 0;
      const radius = `${18 + morph}% ${22 - morph * 0.5}% ${20 + morph * 0.6}% ${24 - morph}% / ${44 + morph * 0.4}% ${42 - morph * 0.3}%`;

      const origin = transformOriginForPhase(phaseRef.current, dir);
      primary.style.transformOrigin = origin;
      primary.style.transform = `translate3d(${nx}px, 0, 0) scale(${nsx}, ${nsy})`;
      primary.style.width = `${nw}px`;
      primary.style.borderRadius = radius;

      trail.style.transform = `translate3d(${ntx}px, 0, 0)`;
      trail.style.width = `${ntw}px`;
      trail.style.opacity = `${trailOpacity}`;

      const parallax = Math.max(-6, Math.min(6, nvx * 0.28));
      highlight.style.transform = `translate3d(${parallax}px, 0, 0)`;

      layer.style.opacity = "1";

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, x, width]);

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
