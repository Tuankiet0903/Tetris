export type Point = { x: number; y: number };
export type Matrix = number[][];
export type Tetromino = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export type Cell = { filled: boolean; color?: string; kind?: Tetromino };
export type LastAction = "none" | "move" | "soft" | "hard" | "rotate";

export type Piece = {
  kind: Tetromino;
  matrix: Matrix;
  pos: Point;
  color: string;
};

export type Challenge = {
  type: "speed" | "reverse" | "none";
  duration: number;
  startTime: number | null;
};