"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const v = localStorage.getItem("playerName");
      if (v) {
        startTransition(() => setName(v));
      }
    } catch {}
  }, []);

  const onStart = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("playerName", trimmed);
    router.push(`/game?name=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-linear-to-br from-zinc-900 via-black to-zinc-900 text-white bg-center bg-cover"
      style={{ backgroundImage: "url('/images/Yasou_backgroud.jpg')" }}
    >
      <main className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold">Tetris Arcade</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Enter your name to start playing
          </p>
        </div>
        <form onSubmit={onStart} className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-white outline-none ring-0 focus:border-blue-500"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!name.trim()}
          >
            Start Game
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-black-400">
          Ready for Tetris?
        </p>
      </main>
    </div>
  );
}
