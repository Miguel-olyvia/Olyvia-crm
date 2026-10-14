import { describe, expect, it } from "vitest";
import { acoes, seed } from "./motor";

const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()) }; };

describe("portais do cliente e do fornecedor", () => {
  it("o cliente pede alterações (fica no histórico) e avisa que pagou (o comprovativo fica para o Financeiro)", () => {
    const { S, A } = preparar();
    const c = S.deals.find((x) => x.id === 1031)!;
    A.pedirAlteracoes(c.id, "  Prefiro azulejo mais claro ");
    expect(c.hist[0]).toMatchObject({ t: "O cliente pediu alterações no portal: Prefiro azulejo mais claro", k: "w" });
    const t = S.deals.find((x) => x.id === 1027)!;
    A.avisarPagamento(t.id, "TRF 9"); // sem fatura: nada
    expect(t.f.comprovativo).toBeUndefined();
    t.fin.fatura = { n: "FT 2026/500", q: "hoje" };
    A.avisarPagamento(t.id, "TRF 9");
    expect(t.f.comprovativo).toBe("TRF 9");
    expect(t.f.data_pag).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("o fornecedor escolhe o dia da entrega (o primeiro útil a partir dele)", () => {
    const { S, A } = preparar();
    const d = S.deals.find((x) => x.id === 1027)!;
    A.aprovarEc(d.id); A.validarEf(d.id);
    A.confirmarEntrega(d.id, "2026-10-24"); // sábado → segunda
    expect(d.obra.enc).toMatchObject({ entrega: "seg, 26 out", entregaIso: "2026-10-26" });
    A.confirmarEntrega(d.id, "2026-10-22"); // muda a data
    expect(d.obra.enc!.entregaIso).toBe("2026-10-22");
  });
});

describe("o link de partilha", () => {
  it("cada documento de cada negócio tem um código só seu, e o link abre o portal no protótipo", async () => {
    const { TIPOS_DOC, tokenDoc, linkPortal } = await import("./DocsCliente");
    const S = seed();
    const codigos = S.deals.flatMap((d) => TIPOS_DOC.map((t) => tokenDoc(d, t)));
    expect(new Set(codigos).size).toBe(codigos.length);
    const d = S.deals.find((x) => x.id === 1031)!;
    expect(linkPortal(d, "proposta")).toMatch(/\/prototipo\/negocios\?portal=[0-9A-Z]+$/);
  });
});
