// 24/11 (testarh, negócio 1022 da Mudelar): a página do negócio rebentava («Algo correu mal») quando o texto do contrato se desenhava
// antes de o Catálogo chegar: uma linha de serviço sem o serviço em S.svc lia `.n` de undefined. Agora diz «serviço» até o Catálogo chegar.
import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "./motor";
import { clausulasContrato, orcamentoDetalhado } from "./DocsCliente";
import { conteudoPorFase, dadosDasClausulas } from "./propostaDados";

describe("linha de serviço sem o serviço no Catálogo (ainda a carregar)", () => {
  it("o contrato, o orçamento e a proposta desenham-se sem rebentar", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && x.orc.linhas.some((l) => l.t === "svc")) as Negocio;
    for (const l of d.orc!.linhas) if (l.t === "svc") delete S.svc[l.sid];
    expect(() => clausulasContrato(d, S)).not.toThrow();
    expect(() => orcamentoDetalhado(d, S)).not.toThrow();
    expect(conteudoPorFase(d, S).length).toBeGreaterThan(0);
    expect(dadosDasClausulas(d, S).servicos.every((n) => n === "serviço")).toBe(true);
  });
});
