import { Suspense } from "react";
import GameClient from "./gameClient";

export default async function Page({
  searchParams,
}: {
  searchParams: { name?: string };
}) {
  return (
    <Suspense fallback={null}>
      <GameClient initialName={searchParams?.name} />
    </Suspense>
  );
}
  