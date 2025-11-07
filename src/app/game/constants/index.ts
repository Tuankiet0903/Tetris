import { Tetromino } from "../types";

export const COLS = 10;
export const ROWS = 20;
export const CELL = 28;
export const SCALE = 2;
export const DRAW_CELL = CELL * SCALE;

export const COLORS: Record<Tetromino, string> = {
  I: "#06b6d4",
  J: "#3b82f6",
  L: "#f59e0b",
  O: "#eab308",
  S: "#22c55e",
  T: "#a855f7",
  Z: "#ef4444",
};

export const SHAPES: Record<Tetromino, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};