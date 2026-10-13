// Hoje da V2: um só Hoje por papel (ver docs/melhorias-v2-2026-10-13). Por agora mostra o Hoje simples.
import { HojeSimples } from "../HojeSimples";
import type { Ctx } from "../pecas";

export function HojeV2(ctx: Ctx) {
  return <HojeSimples {...ctx} />;
}
