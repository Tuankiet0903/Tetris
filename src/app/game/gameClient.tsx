"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type Point = { x: number; y: number };
type Matrix = number[][];
type Tetromino = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
type Cell = { filled: boolean; color?: string; kind?: Tetromino };

type Props = { initialName?: string };

type Challenge = {
  type: "speed" | "reverse" | "none";
  duration: number;
  startTime: number | null;
};

// Single-player only: PvE/AI removed
type LastAction = "none" | "move" | "soft" | "hard" | "rotate";

const COLS = 10;
const ROWS = 20;
const CELL = 28;
// Scale factor for display (set to 2 to make play frame bigger)
const SCALE = 2;
// DRAW_CELL is the pixel size used for canvas drawing (keeps game logic in cell units)
const DRAW_CELL = CELL * SCALE;

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
        g.connect(ctx.destination);
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
  pos: Point;
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

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ filled: false }))
  );
}

export default function GameClient({ initialName }: Props) {
  const router = useRouter();

  // Player name state management
  const [player, setPlayer] = useState(initialName || "Player");

  // Update player name from localStorage after mount
  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      setPlayer(savedName);
    }
  }, []);

  // Images
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reqRef = useRef<number | null>(null);
  const [fogMode, setFogMode] = useState(false);
  // single-player mode only

  // Keep old refs for backward compatibility with existing code
  const boardRef = useRef<Cell[][]>(createEmptyBoard());
  const curRef = useRef<Piece | null>(null);
  const nextRef = useRef<Tetromino[]>(newBag());
  const gravityMsRef = useRef(800);
  const accRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastActionRef = useRef<LastAction>("none");
  const rotatedWithKickRef = useRef(false);
  const b2bRef = useRef(false);

  // PvE/AI removed

  // Keep score/lines/level in state for UI updates
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [seenChallenges, setSeenChallenges] = useState<Set<string>>(new Set());
  const [challenge, setChallenge] = useState<Challenge>({
    type: "none",
    duration: 0,
    startTime: null,
  });
  // AI/PvE removed
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
  // PvE/AI and winner state removed

  const playMove = useSound("/sounds/move.mp3", 700);
  const playRotate = useSound("/sounds/rotate.mp3", 900);
  const playLock = useSound("/sounds/drop.mp3", 300);
  const playLine = useSound("/sounds/line.mp3", 600);
  const playOver = useSound("/sounds/gameover.mp3", 200);

  const scoreRef = useRef(score);
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
      // Player died — regular game over handling above is sufficient
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
    const pad = 2 * SCALE;
    const x = px * DRAW_CELL + pad;
    const y = py * DRAW_CELL + pad;
    const w = DRAW_CELL - pad * 2;
    const r = 6 * SCALE;

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
        if (ny < 0) continue;
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
        if (by >= 0) board[by][bx] = { filled: true, color, kind };
      }
    }
  };

  function isTSpin(cur: Piece): { type: "none" | "mini" | "full" } {
    if (cur.kind !== "T") return { type: "none" };
    if (lastActionRef.current !== "rotate") return { type: "none" };
    const c = { x: cur.pos.x + 1, y: cur.pos.y + 1 };
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
    if (blocked >= 3)
      return { type: rotatedWithKickRef.current ? "mini" : "full" };
    return { type: "none" };
  }

  function isPerfectClear(board: Cell[][]) {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (board[y][x].filled) return false;
    return true;
  }

  const clearLines = useCallback(() => {
    let cleared = 0;
    const board = boardRef.current;
    for (let y = ROWS - 1; y >= 0; ) {
      if (board[y].every((c) => c.filled)) {
        board.splice(y, 1);
        board.unshift(Array.from({ length: COLS }, () => ({ filled: false })));
        cleared++;
      } else y--;
    }
    if (cleared > 0) {
      playLine();
      setLines((v) => v + cleared);

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
      if (tspin.type === "mini") gained = tMiniBase[cleared as 0 | 1] ?? 0;
      else if (tspin.type === "full")
        gained = tFullBase[cleared as 0 | 2 | 3] ?? 0;
      else gained = normalBase[cleared as 1 | 2 | 3 | 4] ?? 0;

      gained += level * 10;

      const isB2BEvent =
        cleared === 4 || (tspin.type !== "none" && cleared > 0);
      if (isB2BEvent && b2bRef.current) gained = Math.round(gained * 1.5);
      b2bRef.current = isB2BEvent ? true : false;

      if (isPerfectClear(board)) {
        const pcBonus: Record<number, number> = {
          1: 800,
          2: 1200,
          3: 1800,
          4: 2000,
        };
        gained += pcBonus[cleared as 1 | 2 | 3 | 4] ?? 0;
        if (cleared === 4 && b2bRef.current) gained += 1200;
        b2bRef.current = true;
      }

      setScore((s) => s + gained);

      // Calculate new level - every 5 lines
      const newLevel = 1 + Math.floor((lines + cleared) / 5);
      setLevel(newLevel);
      // Adjust gravity speed - reduce by 120ms each level
      const baseSpeed = 800;
      const reduction = (newLevel - 1) * 120; // 120ms reduction per level
      gravityMsRef.current = Math.max(120, baseSpeed - reduction);

      // Trigger challenges at specific levels
      if (newLevel % 2 === 0) {
        // Every 2 levels
        setPaused(true);
        // Alternate between speed and reverse challenges
        // Level 2, 6, 10... -> Speed Challenge
        // Level 4, 8, 12... -> Reverse Challenge
        const challengeType = newLevel % 4 === 0 ? "reverse" : "speed";
        const newChallenge: Challenge = {
          type: challengeType as "speed" | "reverse",
          duration: 30000,
          startTime: null,
        };

        // Check if this is first time seeing this challenge
        const isFirstTime = !seenChallenges.has(challengeType); // Longer countdown for first time (5s), shorter for repeats (3s)
        const initialCountdown = isFirstTime ? 5 : 3;
        setCountdown(initialCountdown);

        const countdownInterval = setInterval(() => {
          setCountdown((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownInterval);
              setPaused(false);
              setChallenge({ ...newChallenge, startTime: Date.now() });
              // Mark challenge as seen
              if (isFirstTime) {
                setSeenChallenges(
                  (prev) => new Set([...prev, newChallenge.type])
                );
              }
              return null;
            }
            return prev - 1;
          });
        }, 1000);

        // Reset challenge after duration
        setTimeout(() => {
          setChallenge({ type: "none", duration: 0, startTime: null });
        }, newChallenge.duration + (isFirstTime ? 5000 : 3000)); // Add countdown time
      }

      rotatedWithKickRef.current = false;
      lastActionRef.current = "none";
    }
  }, [level, lines, playLine, seenChallenges]);

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
    setScore((s) => s + Math.max(0, d) * 2);
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

      // Reverse movement if challenge is active
      const actualDx = challenge.type === "reverse" ? -dx : dx;

      if (!collides(cur, boardRef.current, { x: actualDx, y: 0 })) {
        cur.pos.x += actualDx;
        playMove();
      }
    },
    [running, playMove, paused, challenge.type]
  );

  const softDrop = useCallback(() => {
    if (paused) return;
    lastActionRef.current = "soft";
    const cur = curRef.current;
    if (!cur || !running) return;
    if (!collides(cur, boardRef.current, { x: 0, y: 1 })) {
      cur.pos.y += 1;
      setScore((s) => s + 1);
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

  // AI/PvE code removed - single player only

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

    // Clear previous state and challenges
    setChallenge({ type: "none", duration: 0, startTime: null });

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

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const W = ctx.canvas.width,
        H = ctx.canvas.height;
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#020617");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (let y = 0; y <= ROWS; y++) {
        const py = Math.round(y * DRAW_CELL) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(COLS * DRAW_CELL, py);
        ctx.stroke();
      }
      for (let x = 0; x <= COLS; x++) {
        const px = Math.round(x * DRAW_CELL) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, ROWS * DRAW_CELL);
        ctx.stroke();
      }

      const board = boardRef.current;
      const cur = curRef.current;

      // Calculate visible area for fog mode (3x3 around falling piece)
      const visibleArea: { [key: string]: boolean } = {};
      if (fogMode && cur) {
        // Find the center of all cells in the falling piece
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;
        let hasCells = false;

        for (let y = 0; y < cur.matrix.length; y++) {
          for (let x = 0; x < cur.matrix[y].length; x++) {
            if (cur.matrix[y][x]) {
              const px = cur.pos.x + x;
              const py = cur.pos.y + y;
              if (px >= 0 && px < COLS && py >= 0) {
                minX = Math.min(minX, px);
                maxX = Math.max(maxX, px);
                minY = Math.min(minY, py);
                maxY = Math.max(maxY, py);
                hasCells = true;
              }
            }
          }
        }

        if (hasCells) {
          // Calculate center cell (rounded to nearest integer)
          const centerX = Math.round((minX + maxX) / 2);
          const centerY = Math.round((minY + maxY) / 2);

          // Create 3x3 visible area around center
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const vx = centerX + dx;
              const vy = centerY + dy;
              if (vx >= 0 && vx < COLS && vy >= 0 && vy < ROWS) {
                visibleArea[`${vx},${vy}`] = true;
              }
            }
          }
        }
      }

      // Draw board cells with fog effect
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = board[y][x];
          if (c.filled) {
            // In fog mode, only draw if in visible area (100% invisible outside)
            if (fogMode && !visibleArea[`${x},${y}`]) {
              continue; // Skip drawing - 100% invisible
            }
            drawCell(ctx, x, y, c.kind ?? null, c.color || "#fff", 1);
          }
        }
      }

      // Draw ghost piece and current piece
      if (cur) {
        const ghost: Piece = { ...cur, pos: { ...cur.pos } };
        while (!collides(ghost, board, { x: 0, y: 1 })) ghost.pos.y++;

        // Draw ghost piece with fog effect
        for (let y = 0; y < cur.matrix.length; y++) {
          for (let x = 0; x < cur.matrix[y].length; x++) {
            if (!cur.matrix[y][x]) continue;
            const gx = ghost.pos.x + x,
              gy = ghost.pos.y + y;
            if (gy < 0) continue;
            // In fog mode, only draw ghost if in visible area (100% invisible outside)
            if (fogMode && !visibleArea[`${gx},${gy}`]) {
              continue; // Skip drawing - 100% invisible
            }
            drawCell(ctx, gx, gy, cur.kind, cur.color, 0.35);
          }
        }

        // Draw current piece (always fully visible)
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
    },
    [fogMode]
  );

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
      if (!curRef.current) spawn();
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = t - lastTimeRef.current;
      lastTimeRef.current = t;
      accRef.current += dt;
      while (accRef.current >= gravityMsRef.current) {
        accRef.current -= gravityMsRef.current;

        // Apply speed challenge effect
        if (challenge.type === "speed") {
          softDrop();
          softDrop(); // Double drop speed
        } else {
          softDrop();
        }
      }
      draw(ctx);
      reqRef.current = requestAnimationFrame(loop);
    };
    reqRef.current = requestAnimationFrame(loop);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      reqRef.current = null;
    };
  }, [draw, running, softDrop, spawn, paused, challenge.type]);

  // PvE/AI removed — single-player only, no second canvas or AI loop

  const size = useMemo(
    () => ({ w: COLS * DRAW_CELL, h: ROWS * DRAW_CELL }),
    []
  );

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-cover bg-center text-white overflow-hidden">
      {/* Side videos */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 hidden lg:block w-[22vw]"
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
        className="pointer-events-none absolute inset-y-0 right-0 hidden lg:block w-[22vw]"
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

      {/* Main content */}
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
            {challenge.type !== "none" && (
              <span className="animate-pulse text-yellow-400">
                {challenge.type === "speed" ? "⚡ Speed Up!" : "↔️ Reversed!"}
              </span>
            )}
            <span>
              Best:{" "}
              <span className="font-semibold text-white">
                {mounted ? best : 0}
              </span>
            </span>
            <button
              onClick={() => setFogMode((prev) => !prev)}
              className={`rounded-md border border-white/10 ${
                fogMode
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-white/10 hover:bg-white/20"
              } px-3 py-1 text-xs transition`}
            >
              Fog Mode
            </button>
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
          <div className="flex items-center justify-center">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={size.w}
                height={size.h}
                style={{ width: size.w + "px", height: size.h + "px" }}
                className={`h-[84vmin] w-[42vmin] max-h-[720px] max-w-[360px] rounded-xl`}
              />
            </div>
          </div>
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
          {(paused || countdown !== null) && running && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-black/50">
              <div className="rounded-md border border-white/10 bg-white/10 px-8 py-4 text-sm">
                {countdown !== null ? (
                  <div className="text-center">
                    <div className="mb-2 text-xl font-bold">
                      Challenge Alert!
                    </div>
                    <div className="text-3xl font-bold text-yellow-400 mb-4">
                      {countdown}
                    </div>
                    {challenge.type === "speed" ? (
                      <div className="text-xl text-yellow-400 mb-2">
                        ⚡ Speed Challenge!
                      </div>
                    ) : (
                      <div className="text-xl text-yellow-400 mb-2">
                        ↔️ Reversed Controls!
                      </div>
                    )}
                  </div>
                ) : (
                  "Paused"
                )}
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
