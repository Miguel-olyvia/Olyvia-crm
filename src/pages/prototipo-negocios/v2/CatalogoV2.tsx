// Catálogo e custos da V2: lista única e ficha do serviço numa página. Por agora mostra o Catálogo simples.
import { CatalogoSimples } from "../OutrosSimples";
import type { Ctx } from "../pecas";

export function CatalogoV2(ctx: Ctx) {
  return <CatalogoSimples {...ctx} />;
}
