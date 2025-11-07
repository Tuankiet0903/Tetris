import { useCallback, useEffect, useRef } from 'react';

export function useSound(src: string, fallbackFreq?: number) {
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