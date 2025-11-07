import { useState, useCallback } from 'react';

export function useGameLogic() {
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [best, setBest] = useState(0);

  const updateScore = useCallback((cleared: number, level: number, isTSpin: boolean, isB2B: boolean, isPerfectClear: boolean) => {
    const normalBase: Record<number, number> = {
      1: 100,
      2: 300,
      3: 500,
      4: 800,
    };
    const tMiniBase: Record<number, number> = { 0: 100, 1: 200 };
    const tFullBase: Record<number, number> = { 0: 400, 2: 1200, 3: 1600 };

    let gained = 0;
    if (isTSpin) {
      gained = tMiniBase[cleared as 0 | 1] ?? tFullBase[cleared as 0 | 2 | 3] ?? 0;
    } else {
      gained = normalBase[cleared as 1 | 2 | 3 | 4] ?? 0;
    }

    gained += level * 10;

    if (isB2B) gained = Math.round(gained * 1.5);

    if (isPerfectClear) {
      const pcBonus: Record<number, number> = {
        1: 800,
        2: 1200,
        3: 1800,
        4: 2000,
      };
      gained += pcBonus[cleared as 1 | 2 | 3 | 4] ?? 0;
      if (cleared === 4 && isB2B) gained += 1200;
    }

    setScore(s => s + gained);
    return gained;
  }, []);

  const calculateSpeed = useCallback((level: number) => {
    const baseSpeed = 800;
    const reduction = (level - 1) * 120; // 120ms reduction per level
    return Math.max(120, baseSpeed - reduction);
  }, []);

  const updateLevel = useCallback((totalLines: number) => {
    const newLevel = 1 + Math.floor(totalLines / 5);
    setLevel(newLevel);
    return newLevel;
  }, []);

  return {
    score,
    setScore,
    lines,
    setLines,
    level,
    setLevel,
    best,
    setBest,
    updateScore,
    calculateSpeed,
    updateLevel
  };
}