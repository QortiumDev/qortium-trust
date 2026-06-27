import { useEffect, useRef, useState } from 'react';
import type { TrustGraphModel, TrustGraphNode } from './graphModel';

const ANIMATION_DURATION_MS = 420;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function interpolateGraph(previous: TrustGraphModel, target: TrustGraphModel, t: number): TrustGraphModel {
  const previousNodes = new Map<string, TrustGraphNode>(
    previous.nodes.map((node) => [node.address, node]),
  );

  return {
    ...target,
    nodes: target.nodes.map((node) => {
      const from = previousNodes.get(node.address);

      if (!from) {
        return node;
      }

      return {
        ...node,
        radius: lerp(from.radius, node.radius, t),
        x: lerp(from.x, node.x, t),
        y: lerp(from.y, node.y, t),
      };
    }),
  };
}

export function useAnimatedTrustGraph(target: TrustGraphModel, instantKey?: string): TrustGraphModel {
  const [displayed, setDisplayed] = useState<TrustGraphModel>(target);
  const displayedRef = useRef<TrustGraphModel>(target);
  const frameRef = useRef<number | null>(null);
  const instantKeyRef = useRef(instantKey);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      displayedRef.current = target;
      instantKeyRef.current = instantKey;

      return;
    }

    const instant = instantKey !== instantKeyRef.current;

    instantKeyRef.current = instantKey;

    if (
      instant ||
      prefersReducedMotion() ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      displayedRef.current = target;
      setDisplayed(target);

      return;
    }

    const from = displayedRef.current;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / ANIMATION_DURATION_MS);
      const next = interpolateGraph(from, target, easeInOut(progress));

      displayedRef.current = next;
      setDisplayed(next);

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step);
      } else {
        frameRef.current = null;
      }
    };

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [instantKey, target]);

  return displayed;
}
