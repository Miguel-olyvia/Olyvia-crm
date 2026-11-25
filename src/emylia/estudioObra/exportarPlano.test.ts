// 25/11 (Rúben): exportar o plano todo e o estado para PDF horizontal, e para Excel (fase, tarefa, micro e tempo).
import { describe, expect, it } from "vitest";
import { obraDeExemplo } from "./exemploObra";
import { folhasExcel, gerarPdfPlano, linhasDoPlano, nomeFicheiro, resumoEstados, textoPdf } from "./exportarPlano";

describe("exportar o plano", () => {
  it("os dados: todas as tarefas, pelas fases, com o estado e as microtarefas", () => {
    const { S, d } = obraDeExemplo();
    const P = linhasDoPlano(d, S)!;
    const n = P.fases.reduce((a, f) => a + f.tarefas.length, 0);
    expect(n).toBe(d.obra.plano!.tasks.length);
    expect(P.fases.map((f) => f.n)).toEqual([...P.fases.map((f) => f.n)].sort());
    expect(resumoEstados(P).reduce((a, e) => a + e.n, 0)).toBe(n);
    expect(P.fases.some((f) => f.tarefas.some((t) => t.micro.length > 0))).toBe(true);
    expect(nomeFicheiro(P, "pdf", new Date(2026, 10, 25))).toMatch(/^Plano da obra \d+ .+ 2026-11-25\.pdf$/);
  });

  it("o Excel: a folha «Plano» por níveis (fase › tarefa › microtarefa) com o tempo, e a das tarefas", () => {
    const { S, d } = obraDeExemplo();
    const P = linhasDoPlano(d, S)!;
    const folhas = folhasExcel(P), [instr, plano, tarefas] = folhas;
    expect(instr.nome).toBe("Como validar");
    expect(folhas.map((f) => f.nome)).toContain("Histórico");
    expect(plano.nome).toBe("Plano");
    expect(plano.colunas.map((c) => c.t).slice(0, 6)).toEqual(["Ref", "Fase", "Tarefa", "Microtarefa", "Tempo (h)", "Espera (dias)"]);
    expect(plano.colunas.some((c) => c.t.startsWith("CORRIGIR: tempo real"))).toBe(true);
    const t = P.fases.flatMap((f) => f.tarefas).find((x) => x.micro.length)!;
    const i = plano.linhas.findIndex((l) => l.tarefa === t.nome && l.micro === "");
    expect(plano.linhas[i].h).toBe(t.h);
    expect(plano.linhas[i + 1].micro).toBe(t.micro[0].n);
    expect(plano.linhas[i + 1].ref).toBe(`${t.ref}.1`);
    // uma linha de fase antes das tarefas dela, com as horas da fase
    expect(plano.linhas[0].tarefa).toBe("");
    expect(tarefas.linhas.length).toBe(P.fases.reduce((a, f) => a + f.tarefas.length, 0));
  });

  it("com a encomenda de cliente: as folhas dos materiais e das encomendas a fornecedor, com o prazo", () => {
    const { S, d } = obraDeExemplo();
    const ec = { id: "EC-2026-0028", eliminada: false, estado: "waiting", rotulo: "À espera do fornecedor", ajustes: [], pronta: false,
      tot: { linhas: 1, servidas: 0, prontas: 0, aBordo: 0, aFornecedor: 1, semForn: 0 },
      pos: [{ id: "PO-2026-0013", forn: "ANLORBEL", estado: "ordered", fase: "no portal", prometida: "2026-12-02", prevista: "2026-12-02" }],
      linhas: [{ ec: "EC-2026-0028", id: "l1", sku: "AZ-1", n: "Azulejo 30x60", q: 12, un: "m2", st: "waitpo", rotulo: "À espera do fornecedor", aBordo: false, saida: 0, pronto: 0, aChegar: 12, semForn: 0,
        pos: [{ id: "PO-2026-0013", forn: "ANLORBEL", estado: "ordered", fase: "no portal", prometida: "2026-12-02", prevista: "2026-12-02" }] }],
    } as unknown as Parameters<typeof linhasDoPlano>[2];
    const P = linhasDoPlano(d, S, ec)!;
    const folhas = folhasExcel(P);
    const mat = folhas.find((f) => f.nome === "Materiais")!;
    expect(mat.linhas[0]).toMatchObject({ n: "Azulejo 30x60", q: 12, pos: "PO-2026-0013", forn: "ANLORBEL", prazo: "2026-12-02" });
    expect(folhas.find((f) => f.nome === "Encomendas a fornecedor")!.linhas[0]).toMatchObject({ id: "PO-2026-0013", prometida: "2026-12-02" });
  });

  it("o PDF: um documento horizontal, com páginas deitadas", async () => {
    const { S, d } = obraDeExemplo();
    const bytes = await gerarPdfPlano(linhasDoPlano(d, S)!);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
    for (const pg of doc.getPages()) expect(pg.getWidth()).toBeGreaterThan(pg.getHeight());
  });

  it("o texto do PDF só leva o que a fonte tem", () => {
    expect(textoPdf("Mão de obra → teto — «x» … ✓")).toBe("Mão de obra  teto - «x» ... ");
  });
});
