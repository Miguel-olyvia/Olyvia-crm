// Definições da V2: uma só página com pesquisa e secções. Por agora mostra as Definições simples.
import { DefinicoesSimples } from "../OutrosSimples";
import type { Ctx } from "../pecas";

export function DefinicoesV2(ctx: Ctx) {
  return <DefinicoesSimples {...ctx} />;
}
