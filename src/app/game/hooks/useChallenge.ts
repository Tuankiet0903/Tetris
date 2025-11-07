import { useState, useEffect, useCallback } from 'react';
import { Challenge } from '../types';

export function useChallenge() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [seenChallenges, setSeenChallenges] = useState<Set<string>>(new Set());
  const [challenge, setChallenge] = useState<Challenge>({
    type: "none",
    duration: 0,
    startTime: null,
  });
  const [paused, setPaused] = useState(false);

  const startChallenge = useCallback((newLevel: number) => {
    if (newLevel % 2 === 0) {
      setPaused(true);
      const challengeType = newLevel % 4 === 0 ? "reverse" : "speed";
      const newChallenge: Challenge = {
        type: challengeType as "speed" | "reverse",
        duration: 30000,
        startTime: null,
      };

      const isFirstTime = !seenChallenges.has(challengeType);
      const initialCountdown = isFirstTime ? 5 : 3;
      setCountdown(initialCountdown);

      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            setPaused(false);
            setChallenge({ ...newChallenge, startTime: Date.now() });
            if (isFirstTime) {
              setSeenChallenges((prev) => new Set([...prev, newChallenge.type]));
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      setTimeout(() => {
        setChallenge({ type: "none", duration: 0, startTime: null });
      }, newChallenge.duration + (isFirstTime ? 5000 : 3000));
    }
  }, [seenChallenges]);

  return {
    challenge,
    countdown,
    paused,
    setPaused,
    setChallenge,
    startChallenge,
    seenChallenges,
    setSeenChallenges,
  };
}