// "Repor a demonstração" também limpa o que as páginas da V2 guardam em memória (Hoje, Catálogo e custos, Marketing, Definições).
// As Operações e o Financeiro não precisam: o estado deles está preso ao Estado (estadoV2.ts).
import { esquecerCampanhas } from "./campanhasStore";
import { reporCustos } from "./custosStore";
import { esquecerDefinicoes } from "./definicoesDados";
import { esquecerHojeV2 } from "./hojeV2Store";

export function esquecerV2(): void {
  esquecerHojeV2();
  reporCustos();
  esquecerCampanhas();
  esquecerDefinicoes();
}
