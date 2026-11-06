// Griglia virtualizzata (SPEC.md, sezione 7: oltre 200 capi si disegnano solo le righe vicine allo schermo).

export const VIRTUAL_THRESHOLD = 200;

/** Colonne di una griglia CSS "repeat(auto-fill, minmax(minCol, 1fr))" larga `width`. */
export function gridColumns(width: number, minCol: number, gap: number): number {
  if (!(width > 0) || !(minCol > 0)) return 1;
  return Math.max(1, Math.floor((width + gap) / (minCol + gap)));
}

export interface GridWindowInput {
  count: number;
  cols: number;
  rowHeight: number;
  gap: number;
  /** Quanti pixel della griglia sono sopra il bordo alto dello schermo (negativo se la griglia inizia più in basso). */
  viewTop: number;
  viewHeight: number;
  overscanRows?: number;
}

export interface GridWindow {
  /** Indici [start, end) degli elementi da disegnare. */
  start: number;
  end: number;
  /** Spazio vuoto al posto delle righe non disegnate, sopra e sotto. */
  padTop: number;
  padBottom: number;
}

export function gridWindow(input: GridWindowInput): GridWindow {
  const { count, gap, viewTop, viewHeight } = input;
  const cols = Math.max(1, Math.floor(input.cols));
  const overscan = input.overscanRows ?? 3;
  const rows = Math.ceil(count / cols);
  const stride = input.rowHeight + gap;
  if (rows === 0 || !(input.rowHeight > 0)) return { start: 0, end: count, padTop: 0, padBottom: 0 };
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const first = clamp(Math.floor(viewTop / stride) - overscan, 0, rows - 1);
  const last = clamp(Math.ceil((viewTop + Math.max(0, viewHeight)) / stride) + overscan, first, rows - 1);
  return {
    start: first * cols,
    end: Math.min(count, (last + 1) * cols),
    padTop: first * stride,
    padBottom: (rows - 1 - last) * stride,
  };
}
