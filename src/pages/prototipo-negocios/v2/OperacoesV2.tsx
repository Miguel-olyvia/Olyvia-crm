// Operações da V2: plano por aprovar, validar dentro da obra. Por agora mostra as Operações simples.
import { OperacoesSimples } from "../OperacoesSimples";
import type { Ctx } from "../pecas";

export function OperacoesV2(ctx: Ctx) {
  return <OperacoesSimples {...ctx} />;
}
