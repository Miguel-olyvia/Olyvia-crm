// 25/11 (Rúben: «garante que os documentos seguem a formatação correta»): visto no PDF da 1048. A proposta mostrava serviços a zero, o
// contrato punha os nomes em minúsculas, a fatura dizia «t1» e a impressão saía com fundo cinzento e folhas quase vazias.
import { describe, expect, it } from "vitest";
import { seed, type Estado, type Negocio } from "./motor";
import { CSS_IMPRESSAO, clausulasContrato, orcamentoDetalhado } from "./DocsCliente";
import { conteudoPorFase } from "./propostaDados";
import { rotuloDaTranche } from "./parcelas";

const comZero = () => {
  const S: Estado = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.filter((l) => l.t === "svc").length >= 2) as Negocio;
  const svcs = d.orc!.linhas.filter((l) => l.t === "svc");
  const zero = svcs[0];
  zero.q = 0;
  const nome = (S.svc as Record<string, { n: string }>)[String(zero.sid)].n;
  return { S, d, nome, outro: (S.svc as Record<string, { n: string }>)[String(svcs[1].sid)].n };
};

describe("os documentos: conteúdo", () => {
  it("um serviço a zero não aparece no «O que vamos fazer» nem no orçamento detalhado", () => {
    const { S, d, nome } = comZero();
    const fases = conteudoPorFase(d, S);
    expect(JSON.stringify(fases)).not.toContain(`"${nome}"`);
    expect(orcamentoDetalhado(d, S).linhas.some((x) => x.nome === nome)).toBe(false);
  });
  it("o objeto do contrato mantém os nomes como estão e não lista os serviços a zero", () => {
    const { S, d, nome, outro } = comZero();
    const obj = clausulasContrato(d, S).find((c) => /Objeto/.test(c.titulo))!.texto;
    expect(obj).toContain(outro);
    expect(obj).not.toContain(nome.toLowerCase() + ",");
  });
  it("a prestação tem nome (nunca «t1»)", () => {
    const S: Estado = seed();
    const d = S.deals[0];
    expect(rotuloDaTranche(null, d, "t1")).toBe("1.ª prestação");
    expect(rotuloDaTranche(null, d, "unica")).toBe("Pagamento único");
    expect(rotuloDaTranche(S, d, "t1")).not.toBe("t1");
  });
});

describe("os documentos: impressão", () => {
  it("A4, fundo branco e uma página da proposta por folha", () => {
    expect(CSS_IMPRESSAO).toContain("@page{size:A4");
    expect(CSS_IMPRESSAO).toContain("background:#fff!important");
    expect(CSS_IMPRESSAO).toContain(".pagina{");
    expect(CSS_IMPRESSAO).toContain("break-after:page");
  });
});
