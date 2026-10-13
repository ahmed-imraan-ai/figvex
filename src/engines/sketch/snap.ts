// Snapping and arranging for the sketch canvas: alignment guides against the
// other shapes, plus align and distribute for a multiple selection.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guides {
  x: number[];
  y: number[];
}

const lines = (start: number, size: number) => [start, start + size / 2, start + size];

/**
 * Nudge a moving box so one of its edges or its centre lines up with an edge
 * or centre of another box, if one is within `tol`. Returns the extra shift
 * and the guide lines to show.
 */
export function alignSnap(box: Box, others: Box[], tol: number): { dx: number; dy: number; guides: Guides } {
  const best = (mine: number[], theirs: number[]) => {
    let shift = 0;
    let dist = tol + 1e-9;
    for (const m of mine) {
      for (const t of theirs) {
        const d = Math.abs(t - m);
        if (d < dist) {
          dist = d;
          shift = t - m;
        }
      }
    }
    return dist <= tol ? shift : null;
  };
  const xs = others.flatMap((o) => lines(o.x, o.w));
  const ys = others.flatMap((o) => lines(o.y, o.h));
  const dx = best(lines(box.x, box.w), xs);
  const dy = best(lines(box.y, box.h), ys);
  const moved = { x: box.x + (dx ?? 0), y: box.y + (dy ?? 0), w: box.w, h: box.h };
  const on = (mine: number[], theirs: number[]) => [...new Set(theirs.filter((t) => mine.some((m) => Math.abs(t - m) < 0.5)))];
  return {
    dx: dx ?? 0,
    dy: dy ?? 0,
    guides: { x: dx === null ? [] : on(lines(moved.x, moved.w), xs), y: dy === null ? [] : on(lines(moved.y, moved.h), ys) },
  };
}

/** Snap a single coordinate (a dragged edge) to the nearest line of the others. */
export function edgeSnap(value: number, others: Box[], axis: "x" | "y", tol: number): { value: number; guide?: number } {
  let best: number | undefined;
  for (const o of others) {
    for (const t of axis === "x" ? lines(o.x, o.w) : lines(o.y, o.h)) {
      if (Math.abs(t - value) <= tol && (best === undefined || Math.abs(t - value) < Math.abs(best - value))) best = t;
    }
  }
  return best === undefined ? { value } : { value: best, guide: best };
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** New positions that line the boxes up along one edge or centre line. */
export function align(boxes: Box[], how: Alignment): Box[] {
  if (boxes.length < 2) return boxes.map((b) => ({ ...b }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return boxes.map((b) => {
    switch (how) {
      case "left":
        return { ...b, x: minX };
      case "right":
        return { ...b, x: maxX - b.w };
      case "center":
        return { ...b, x: (minX + maxX) / 2 - b.w / 2 };
      case "top":
        return { ...b, y: minY };
      case "bottom":
        return { ...b, y: maxY - b.h };
      case "middle":
        return { ...b, y: (minY + maxY) / 2 - b.h / 2 };
    }
  });
}

/** New positions with equal gaps between the boxes, keeping the outer two in place. */
export function distribute(boxes: Box[], axis: "x" | "y"): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  if (out.length < 3) return out;
  const pos = axis === "x" ? "x" : "y";
  const size = axis === "x" ? "w" : "h";
  const order = [...out].sort((a, b) => a[pos] - b[pos]);
  const first = order[0];
  const last = order[order.length - 1];
  const total = order.reduce((sum, b) => sum + b[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (order.length - 1);
  let at = first[pos];
  for (const b of order) {
    b[pos] = at;
    at += b[size] + gap;
  }
  return out;
}
