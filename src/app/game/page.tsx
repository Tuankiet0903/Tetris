"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type Point = { x: number; y: number };
type Matrix = number[][];
type Tetromino = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
type Cell = { filled: boolean; color?: string; kind?: Tetromino };

const COLS = 10;
const ROWS = 20;
const CELL = 28;

const COLORS: Record<Tetromino, string> = {
  I: "#06b6d4",
  J: "#3b82f6",
  L: "#f59e0b",
  O: "#eab308",
  S: "#22c55e",
  T: "#a855f7",
  Z: "#ef4444",
};

const SHAPES: Record<Tetromino, Matrix> = {
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

function rotateCW(m: Matrix): Matrix {
  const h = m.length,
    w = m[0].length;
  const r: Matrix = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) r[x][h - 1 - y] = m[y][x];
  return r;
}

function rotateCCW(m: Matrix): Matrix {
  const h = m.length,
    w = m[0].length;
  const r: Matrix = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) r[w - 1 - x][y] = m[y][x];
  return r;
}

function useSound(src: string, fallbackFreq?: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(src);
    audioRef.current.preload = "auto";
  }, [src]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) {
      if (fallbackFreq == null) return;
      try {
        if (!ctxRef.current) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext!;
          ctxRef.current = new AudioCtx();
        }
        const ctx = ctxRef.current!;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = fallbackFreq!;
        g.gain.value = 0.05;
        o.connect(g);
        g.connect(ctx!.destination);
        o.start();
        setTimeout(() => {
          o.stop();
          o.disconnect();
          g.disconnect();
        }, 100);
      } catch {}
      return;
    }
    a.currentTime = 0;
    a.volume = 0.6;
    a.play().catch(() => {});
  }, [fallbackFreq]);

  return play;
}

type Piece = {
  kind: Tetromino;
  matrix: Matrix;
  pos: Point; // top-left of matrix within board
  color: string;
};

function newBag(): Tetromino[] {
  const bag = Object.keys(SHAPES) as Tetromino[];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export default function GamePage() {
  // Load block textures
  const blockImgRef = useRef<Partial<Record<Tetromino, HTMLImageElement>>>({});
  useEffect(() => {
    (["I", "J", "L", "O", "S", "T", "Z"] as Tetromino[]).forEach((k) => {
      const img = new Image();
      img.src = `/blocks/${k}.png`;
      img.decoding = "async";
      img.onerror = () => {
        blockImgRef.current[k] = undefined;
      };
      blockImgRef.current[k] = img;
    });
  }, []);

  const params = useSearchParams();
  const router = useRouter();
  const player =
    params.get("name") ||
    (typeof window !== "undefined"
      ? localStorage.getItem("playerName") || "Player"
      : "Player");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reqRef = useRef<number | null>(null);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [best, setBest] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const v = localStorage.getItem("bestScoreTetris");
      if (v) setBest(Number(v));
    } catch {}
  }, []);
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);

  // Action/Spin tracking
  type LastAction = "none" | "move" | "soft" | "hard" | "rotate";
  const lastActionRef = useRef<LastAction>("none");
  const rotatedWithKickRef = useRef(false);
  const b2bRef = useRef(false); // Back-to-Back

  const boardRef = useRef<Cell[][]>(
    Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => ({ filled: false }))
    )
  );
  const curRef = useRef<Piece | null>(null);
  const nextRef = useRef<Tetromino[]>(newBag());
  const gravityMsRef = useRef(800);
  const accRef = useRef(0);
  const lastTimeRef = useRef(0);

  const playMove = useSound("/sounds/move.mp3", 700);
  const playRotate = useSound("/sounds/rotate.mp3", 900);
  const playLock = useSound("/sounds/drop.mp3", 300);
  const playLine = useSound("/sounds/line.mp3", 600);
  const playOver = useSound("/sounds/gameover.mp3", 200);

  // Latest score ref for spawn()
  const scoreRef = useRef<number>(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const spawn = useCallback(() => {
    if (nextRef.current.length <= 2) nextRef.current.push(...newBag());
    const kind = nextRef.current.shift() as Tetromino;
    const matrix = SHAPES[kind].map((r) => r.slice());
    const color = COLORS[kind];
    const width = matrix[0].length;
    const pos = { x: Math.floor((COLS - width) / 2), y: -matrix.length + 1 };
    const piece: Piece = { kind, matrix, pos, color };
    if (collides(piece, boardRef.current, { x: 0, y: 0 })) {
      setRunning(false);
      playOver();
      setBest((prev) => {
        const b = Math.max(prev, scoreRef.current);
        if (typeof window !== "undefined")
          localStorage.setItem("bestScoreTetris", String(b));
        return b;
      });
      return;
    }
    curRef.current = piece;
  }, [playOver]);

  function drawCell(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    kind: Tetromino | null,
    color: string,
    alpha = 1
  ) {
    const pad = 2;
    const x = px * CELL + pad;
    const y = py * CELL + pad;
    const w = CELL - pad * 2;
    const r = 6;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(x, y, w, w, r);
    ctx.clip();

    const img = kind ? blockImgRef.current[kind] : undefined;
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      ctx.drawImage(img, x, y, w, w);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, w);
    }
    ctx.restore();
  }

  const collides = (p: Piece, board: Cell[][], delta: Point) => {
    const { matrix, pos } = p;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const nx = pos.x + x + delta.x;
        const ny = pos.y + y + delta.y;
        if (ny < 0) continue; // above the board is allowed
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (board[ny][nx].filled) return true;
      }
    }
    return false;
  };

  const merge = (p: Piece) => {
    const board = boardRef.current;
    const { matrix, pos, color, kind } = p;
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = pos.x + x,
          by = pos.y + y;
        if (by >= 0) {
          board[by][bx] = { filled: true, color, kind };
        }
      }
    }
  };

  // T-Spin detection (3-corner rule)
  function isTSpin(cur: Piece): { type: "none" | "mini" | "full" } {
    if (cur.kind !== "T") return { type: "none" };
    if (lastActionRef.current !== "rotate") return { type: "none" };

    const c = { x: cur.pos.x + 1, y: cur.pos.y + 1 }; // T center
    const corners: Point[] = [
      { x: c.x - 1, y: c.y - 1 },
      { x: c.x + 1, y: c.y - 1 },
      { x: c.x - 1, y: c.y + 1 },
      { x: c.x + 1, y: c.y + 1 },
    ];
    let blocked = 0;
    for (const p of corners) {
      if (p.y < 0 || p.x < 0 || p.x >= COLS || p.y >= ROWS) blocked++;
      else if (boardRef.current[p.y][p.x].filled) blocked++;
    }
    if (blocked >= 3) {
      return { type: rotatedWithKickRef.current ? "mini" : "full" };
    }
    return { type: "none" };
  }

  function isPerfectClear(board: Cell[][]) {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (board[y][x].filled) return false;
      }
    return true;
  }

  const clearLines = useCallback(() => {
    let cleared = 0;
    const board = boardRef.current;

    // remove full rows
    for (let y = ROWS - 1; y >= 0; ) {
      if (board[y].every((c) => c.filled)) {
        board.splice(y, 1);
        board.unshift(Array.from({ length: COLS }, () => ({ filled: false })));
        cleared++;
      } else {
        y--;
      }
    }

    if (cleared > 0) {
      playLine();
      setLines((v) => v + cleared);

      // base tables
      const normalBase: Record<number, number> = {
        1: 100,
        2: 300,
        3: 500,
        4: 800,
      };
      const tMiniBase: Record<number, number> = { 0: 100, 1: 200 };
      const tFullBase: Record<number, number> = { 0: 400, 2: 1200, 3: 1600 };

      const cur = curRef.current!;
      const tspin = isTSpin(cur);

      let gained = 0;
      if (tspin.type === "mini") {
        gained = tMiniBase[cleared as 0 | 1] ?? 0;
      } else if (tspin.type === "full") {
        gained = tFullBase[cleared as 0 | 2 | 3] ?? 0;
      } else {
        gained = normalBase[cleared as 1 | 2 | 3 | 4] ?? 0;
      }

      // level bonus
      gained += level * 10;

      // Back-to-Back bonus (50%)
      const isB2BEvent =
        cleared === 4 || (tspin.type !== "none" && cleared > 0);
      if (isB2BEvent && b2bRef.current) {
        gained = Math.round(gained * 1.5);
      }
      b2bRef.current = isB2BEvent ? true : false;

      // Perfect Clear bonus
      const pc = isPerfectClear(board);
      if (pc) {
        const pcBonus: Record<number, number> = {
          1: 800,
          2: 1200,
          3: 1800,
          4: 2000,
        };
        gained += pcBonus[cleared as 1 | 2 | 3 | 4] ?? 0;
        // B2B Perfect-Clear Tetris extra → +1200 (total 3200)
        if (cleared === 4 && b2bRef.current) gained += 1200;
        b2bRef.current = true;
      }

      setScore((s) => s + gained);

      // speed up
      const newLevel = 1 + Math.floor((lines + cleared) / 10);
      setLevel(newLevel);
      gravityMsRef.current = Math.max(120, 800 - (newLevel - 1) * 60);

      // reset spin flags after scoring
      rotatedWithKickRef.current = false;
      lastActionRef.current = "none";
    }
  }, [level, lines, playLine]);

  const hardDrop = useCallback(() => {
    if (paused) return;
    lastActionRef.current = "hard";
    const cur = curRef.current;
    if (!cur || !running) return;
    let d = 0;
    while (!collides(cur, boardRef.current, { x: 0, y: 1 })) {
      cur.pos.y++;
      d++;
    }
    playLock();
    setScore((s) => s + Math.max(0, d) * 2); // hard drop 2 pts per cell
    merge(cur);
    clearLines();
    spawn();
  }, [running, playLock, clearLines, spawn, paused]);

  const move = useCallback(
    (dx: number) => {
      if (paused) return;
      lastActionRef.current = "move";
      const cur = curRef.current;
      if (!cur || !running) return;
      if (!collides(cur, boardRef.current, { x: dx, y: 0 })) {
        cur.pos.x += dx;
        playMove();
      }
    },
    [running, playMove, paused]
  );

  const softDrop = useCallback(() => {
    if (paused) return;
    lastActionRef.current = "soft";
    const cur = curRef.current;
    if (!cur || !running) return;
    if (!collides(cur, boardRef.current, { x: 0, y: 1 })) {
      cur.pos.y += 1;
      setScore((s) => s + 1); // soft drop 1 pt per cell
    } else {
      playLock();
      merge(cur);
      clearLines();
      spawn();
    }
  }, [running, playLock, clearLines, spawn, paused]);

  const rotate = useCallback(
    (ccw = false) => {
      const cur = curRef.current;
      if (!cur || !running || paused) return;
      const m = ccw ? rotateCCW(cur.matrix) : rotateCW(cur.matrix);
      const trial: Piece = { ...cur, matrix: m, pos: { ...cur.pos } };

      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        trial.pos.x = cur.pos.x + k;
        if (!collides(trial, boardRef.current, { x: 0, y: 0 })) {
          cur.matrix = m;
          cur.pos.x = trial.pos.x;
          rotatedWithKickRef.current = k !== 0;
          lastActionRef.current = "rotate";
          playRotate();
          return;
        }
      }
    },
    [running, playRotate, paused]
  );

  const reset = useCallback(() => {
    boardRef.current = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => ({ filled: false }))
    );
    nextRef.current = newBag();
    curRef.current = null;
    setScore(0);
    setLines(0);
    setLevel(1);
    gravityMsRef.current = 800;
    setRunning(true);
    setPaused(false);
    b2bRef.current = false;
    rotatedWithKickRef.current = false;
    lastActionRef.current = "none";
    spawn();
  }, [spawn]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!running && (k === "enter" || k === " ")) {
        reset();
        return;
      }
      if (k === "arrowleft" || k === "a") move(-1);
      else if (k === "arrowright" || k === "d") move(1);
      else if (k === "arrowdown" || k === "s") softDrop();
      else if (k === "arrowup" || k === "w" || k === "x") rotate(false);
      else if (k === "z") rotate(true);
      else if (k === "p") {
        setPaused((v) => !v);
        return;
      } else if (k === " ") {
        e.preventDefault();
        hardDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, reset, move, softDrop, rotate, hardDrop]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const W = ctx.canvas.width,
      H = ctx.canvas.height;

    // Background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#020617");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y <= ROWS; y++) {
      const py = Math.round(y * CELL) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(COLS * CELL, py);
      ctx.stroke();
    }
    for (let x = 0; x <= COLS; x++) {
      const px = Math.round(x * CELL) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, ROWS * CELL);
      ctx.stroke();
    }

    // Board
    const board = boardRef.current;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = board[y][x];
        if (c.filled) drawCell(ctx, x, y, c.kind ?? null, c.color || "#fff", 1);
      }
    }

    // Ghost + current
    const cur = curRef.current;
    if (cur) {
      // Ghost
      const ghost: Piece = { ...cur, pos: { ...cur.pos } };
      while (!collides(ghost, board, { x: 0, y: 1 })) ghost.pos.y++;
      for (let y = 0; y < cur.matrix.length; y++) {
        for (let x = 0; x < cur.matrix[y].length; x++) {
          if (!cur.matrix[y][x]) continue;
          const gx = ghost.pos.x + x,
            gy = ghost.pos.y + y;
          if (gy < 0) continue;
          drawCell(ctx, gx, gy, cur.kind, cur.color, 0.35);
        }
      }
      // Current
      for (let y = 0; y < cur.matrix.length; y++) {
        for (let x = 0; x < cur.matrix[y].length; x++) {
          if (!cur.matrix[y][x]) continue;
          const px = cur.pos.x + x,
            py = cur.pos.y + y;
          if (py < 0) continue;
          drawCell(ctx, px, py, cur.kind, cur.color, 1);
        }
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (t: number) => {
      if (!running || paused) {
        draw(ctx);
        reqRef.current = requestAnimationFrame(loop);
        return;
      }

      // Ensure a piece exists
      if (!curRef.current) {
        spawn();
      }

      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = t - lastTimeRef.current;
      lastTimeRef.current = t;
      accRef.current += dt;

      while (accRef.current >= gravityMsRef.current) {
        accRef.current -= gravityMsRef.current;
        softDrop();
      }

      draw(ctx);
      reqRef.current = requestAnimationFrame(loop);
    };

    reqRef.current = requestAnimationFrame(loop);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      reqRef.current = null;
    };
  }, [draw, running, softDrop, spawn, paused]);

  const size = useMemo(() => ({ w: COLS * CELL, h: ROWS * CELL }), []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-cover bg-center text-white overflow-hidden">
      {/* Side videos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-50 hidden lg:block w-[22vw]"
      >
        <video
          className="h-full w-full object-cover opacity-70"
          src="/videos/left.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-linear-to-r from-black/60 to-transparent" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-50 hidden lg:block w-[22vw]"
      >
        <video
          className="h-full w-full object-cover opacity-70"
          src="/videos/right.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-linear-to-l from-black/60 to-transparent" />
      </div>

      {/* Main content above videos */}
      <div className="relative z-10 w-full max-w-3xl">
        <div className="flex w-full max-w-3xl items-center justify-between">
          <div className="text-sm text-zinc-300">
            Player: <span className="font-medium text-white">{player}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-300">
            <span>
              Score: <span className="font-semibold text-white">{score}</span>
            </span>
            <span>
              Lines: <span className="font-semibold text-white">{lines}</span>
            </span>
            <span>
              Level: <span className="font-semibold text-white">{level}</span>
            </span>
            <span>
              Best:{" "}
              <span className="font-semibold text-white">
                {mounted ? best : 0}
              </span>
            </span>
            <button
              onClick={() => setPaused((v) => !v)}
              className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => reset()}
              className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
            >
              Reset
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
            >
              Home
            </button>
          </div>
        </div>

        <div className="relative mt-4 w-fit mx-auto rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
          <canvas
            ref={canvasRef}
            width={size.w}
            height={size.h}
            className="h-[84vmin] w-[42vmin] max-h-[720px] max-w-[360px] rounded-xl"
          />
          {!running && (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60">
              <div className="text-center">
                <h2 className="text-2xl font-semibold">Game Over</h2>
                <p className="mt-2 text-zinc-300">
                  Score: {score} • Lines: {lines}
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={() => reset()}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium transition hover:bg-blue-500"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="rounded-md border border-white/10 bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
                  >
                    Home
                  </button>
                </div>
                <p className="mt-3 text-xs text-zinc-400">
                  Press Enter or Space to restart
                </p>
              </div>
            </div>
          )}
          {paused && running && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-black/50">
              <div className="rounded-md border border-white/10 bg-white/10 px-4 py-2 text-sm">
                Paused
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-zinc-400 mx-auto text-center">
          Controls: Left/Right move • Down soft-drop (+1/ô) • Space hard-drop
          (+2/ô) • Up/X rotate CW • Z rotate CCW • P Pause
        </div>
      </div>
    </div>
  );
}
