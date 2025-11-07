import { Matrix } from "../types";

export function rotateCW(m: Matrix): Matrix {
  const h = m.length,
    w = m[0].length;
  const r: Matrix = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) r[x][h - 1 - y] = m[y][x];
  return r;
}

export function rotateCCW(m: Matrix): Matrix {
  const h = m.length,
    w = m[0].length;
  const r: Matrix = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) r[w - 1 - x][y] = m[y][x];
  return r;
}

export function createEmptyBoard(rows: number, cols: number) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ filled: false }))
  );
}

export function newBag() {
  const bag = ["I", "J", "L", "O", "S", "T", "Z"] as const;
  const result = [...bag];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}