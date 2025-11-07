import { useState, useCallback, useRef } from 'react';
import { Piece, Cell, Tetromino, Point } from '../types';
import { SHAPES, COLORS, COLS, ROWS } from '../constants';
import { createEmptyBoard, newBag } from '../utils/matrix';

export function useTetris() {
  const boardRef = useRef<Cell[][]>(createEmptyBoard(ROWS, COLS));
  const curRef = useRef<Piece | null>(null);
  const nextRef = useRef<Tetromino[]>(newBag());
  const gravityMsRef = useRef(800);
  const accRef = useRef(0);
  const lastTimeRef = useRef(0);
  const [running, setRunning] = useState(true);

  const spawn = useCallback(() => {
    if (nextRef.current.length <= 2) nextRef.current.push(...newBag());
    const kind = nextRef.current.shift() as Tetromino;
    const matrix = SHAPES[kind].map((r) => r.slice());
    const color = COLORS[kind];
    const width = matrix[0].length;
    const pos = { x: Math.floor((COLS - width) / 2), y: -matrix.length + 1 };
    const piece: Piece = { kind, matrix, pos, color };
    
    const collides = (board: Cell[][]) => {
      for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
          if (!matrix[y][x]) continue;
          const ny = pos.y + y;
          const nx = pos.x + x;
          if (ny < 0) continue;
          if (nx < 0 || nx >= COLS || ny >= ROWS || board[ny][nx].filled) 
            return true;
        }
      }
      return false;
    };

    if (collides(boardRef.current)) {
      setRunning(false);
      return null;
    }

    curRef.current = piece;
    return piece;
  }, []);

  const merge = useCallback((piece: Piece) => {
    const board = boardRef.current;
    const { matrix, pos, color, kind } = piece;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = pos.x + x,
          by = pos.y + y;
        if (by >= 0) board[by][bx] = { filled: true, color, kind };
      }
    }
  }, []);

  const checkCollision = useCallback((piece: Piece, delta: Point) => {
    const { matrix, pos } = piece;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const nx = pos.x + x + delta.x;
        const ny = pos.y + y + delta.y;
        if (ny < 0) continue;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (boardRef.current[ny][nx].filled) return true;
      }
    }
    return false;
  }, []);

  return {
    boardRef,
    curRef,
    nextRef,
    gravityMsRef,
    accRef,
    lastTimeRef,
    running,
    setRunning,
    spawn,
    merge,
    checkCollision,
  };
}