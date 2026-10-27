import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import {
  SEM_FILTROS_H, atividadeRecente, dataDe, entradasPorSemana, estadoDe, filtrarH, filtrosLigados, funilH, linhasHistorico, motivosPerda, ordenarH, porCampo, resumoH,
} from "./historicoNegocios";

const HOJE = new Date(2026, 9, 27);

describe("historicoNegocios · datas sem ano", () => {
  it("lê dia e mês, hoje e a data completa", () => {
    expect(dataDe("30/09 21:40", HOJE)).toEqual(new Date(2026, 8, 30));
    expect(dataDe("hoje 09:12", HOJE)).toEqual(new Date(2026, 9, 27));
    expect(dataDe("15/10/2025 10:00", HOJE)).toEqual(new Date(2025, 9, 15));
    expect(dataDe("Sem data", HOJE)).toBeNull();
  });
  it("um dia que ainda não chegou este ano é do ano passado", () => {
    expect(dataDe("20/12", HOJE)).toEqual(new Date(2025, 11, 20));
  });
});

describe("historicoNegocios · linhas", () => {
  const S = seed(), ls = linhasHistorico(S, HOJE);
  it("tem todos os negócios de sempre, perdidos incluídos", () => {
    expect(ls).toHaveLength(S.deals.length);
    expect(ls.some((l) => l.estado === "perdido")).toBe(S.deals.some((d) => d.perdido));
  });
  it("o estado sai do negócio: perdido, ganho com contrato, aberto", () => {
    for (const d of S.deals) {
      const e = estadoDe(d);
      if (d.perdido) expect(e).toBe("perdido");
      else if (d.fase < 4 && d.orc?.contrato !== "assinado" && !(d.orc?.vendaDireta && d.orc.aceite)) expect(["aberto", "concluido"]).toContain(e);
    }
  });
  it("o parado só conta nos abertos", () => {
    for (const l of ls) if (l.estado !== "aberto") expect(l.parado).toBeNull();
  });
});

describe("historicoNegocios · filtros e ordem", () => {
  const S = seed(), ls = linhasHistorico(S, HOJE);
  it("sem filtros passa tudo; o estado e a procura no histórico filtram", () => {
    expect(filtrarH(ls, SEM_FILTROS_H, "", HOJE)).toHaveLength(ls.length);
    const ab = filtrarH(ls, { ...SEM_FILTROS_H, estado: "aberto" }, "", HOJE);
    expect(ab.every((l) => l.estado === "aberto")).toBe(true);
    const t = ls[0].d.hist[0]?.t;
    if (t) expect(filtrarH(ls, SEM_FILTROS_H, t.slice(0, 12), HOJE).map((l) => l.id)).toContain(ls[0].id);
  });
  it("a fase, a linha e o valor filtram; contam-se os filtros ligados", () => {
    const f = { ...SEM_FILTROS_H, fase: "3", valor: "sem" as const };
    expect(filtrarH(ls, f, "", HOJE).every((l) => l.fase === 3 && l.valor === null)).toBe(true);
    expect(filtrosLigados(f)).toBe(2);
  });
  it("sem um filtro (para as contagens) ignora só esse", () => {
    const f = { ...SEM_FILTROS_H, estado: "perdido" as const };
    expect(filtrarH(ls, f, "", HOJE, "estado")).toHaveLength(ls.length);
  });
  it("ordena pelo valor, com os sem orçamento no fim", () => {
    const o = ordenarH(ls, { coluna: "valor", dir: "desc" }), v = o.map((l) => l.valor);
    const comValor = v.filter((x) => x !== null) as number[];
    expect(comValor).toEqual([...comValor].sort((a, b) => b - a));
    expect(v.indexOf(null) === -1 || v.slice(v.indexOf(null)).every((x) => x === null)).toBe(true);
  });
});

describe("historicoNegocios · painel", () => {
  const S = seed(), ls = linhasHistorico(S, HOJE);
  it("o resumo bate com as linhas", () => {
    const r = resumoH(ls, HOJE);
    expect(r.total).toBe(ls.length);
    expect(r.abertos + r.ganhos + r.perdidos).toBe(ls.length);
    if (r.ganhos + r.perdidos) expect(r.conversao).toBe(Math.round((100 * r.ganhos) / (r.ganhos + r.perdidos)));
  });
  it("o funil desce de fase para fase e começa em todos", () => {
    const f = funilH(ls);
    expect(f[0].chegaram).toBe(ls.length);
    for (let i = 1; i < f.length; i++) expect(f[i].chegaram).toBeLessThanOrEqual(f[i - 1].chegaram);
  });
  it("os grupos somam o total e os motivos contam os perdidos", () => {
    expect(porCampo(ls, "origem").reduce((a, g) => a + g.n, 0)).toBe(ls.length);
    expect(motivosPerda(ls).reduce((a, m) => a + m.n, 0)).toBe(ls.filter((l) => l.estado === "perdido").length);
  });
  it("as semanas são 12 e a atividade vem do mais recente para o mais antigo", () => {
    expect(entradasPorSemana(ls, HOJE)).toHaveLength(12);
    const a = atividadeRecente(ls, HOJE, 50).map((x) => x.data?.getTime() ?? 0);
    expect(a).toEqual([...a].sort((x, y) => y - x));
  });
});
