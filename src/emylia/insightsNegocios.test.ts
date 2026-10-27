import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { linhasHistorico } from "./historicoNegocios";
import { MIN_DECIDIDOS, PROB_BASE, compararPeriodos, insights, previsao, saude, serieSemanal, taxasFecho } from "./insightsNegocios";

const HOJE = new Date(2026, 9, 27);
const linhas = () => linhasHistorico(seed(), HOJE);

describe("insightsNegocios · séries e comparação", () => {
  it("a série semanal tem as semanas pedidas e soma as entradas dessas semanas", () => {
    const ls = linhas(), s = serieSemanal(ls, HOJE, 8, (l) => l.entrada);
    expect(s).toHaveLength(8);
    const desde = new Date(2026, 9, 27 - 55).getTime();
    expect(s.reduce((a, x) => a + x, 0)).toBe(ls.filter((l) => l.entrada && l.entrada.getTime() >= desde).length);
  });
  it("compara os últimos 30 dias com os 30 antes", () => {
    const c = compararPeriodos(linhas(), HOJE, 30);
    expect(c.entradas.atual + c.entradas.antes).toBeGreaterThan(0);
    if (c.entradas.antes) expect(c.entradas.delta).toBe(Math.round((100 * (c.entradas.atual - c.entradas.antes)) / c.entradas.antes));
  });
});

describe("insightsNegocios · previsão", () => {
  it("usa a taxa de exemplo onde há poucos decididos", () => {
    const t = taxasFecho(linhas());
    t.forEach((x, i) => { if (!x.historica) expect(x.prob).toBe(PROB_BASE[i]); else expect(x.decididos).toBeGreaterThanOrEqual(MIN_DECIDIDOS); });
  });
  it("o ponderado é a soma de cada fase e nunca passa o aberto", () => {
    const p = previsao(linhas());
    expect(p.total).toBeCloseTo(p.porFase.reduce((a, f) => a + f.ponderado, 0), 6);
    expect(p.total).toBeCloseTo(p.ponderado + p.ponderadoEstimado, 6);
    expect(p.ponderado).toBeLessThanOrEqual(p.aberto + 0.01);
  });
});

describe("insightsNegocios · insights", () => {
  it("vêm do mais urgente para o informativo, no máximo seis, cada um com texto", () => {
    const ins = insights(linhas(), HOJE);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins.length).toBeLessThanOrEqual(6);
    const ordem = { risco: 0, atencao: 1, bom: 2, info: 3 };
    for (let i = 1; i < ins.length; i++) expect(ordem[ins[i].tom]).toBeGreaterThanOrEqual(ordem[ins[i - 1].tom]);
    for (const x of ins) expect(x.titulo && x.texto).toBeTruthy();
  });
  it("o dinheiro parado não repete as propostas à espera do cliente", () => {
    const ins = insights(linhas(), HOJE, 20), d = ins.find((x) => x.id === "dinheiro"), p = ins.find((x) => x.id === "propostas");
    if (d && p) expect(d.numero).not.toBe(p.numero);
  });
  it("os pedidos por contactar há 2 dias ou mais são urgentes", () => {
    const ins = insights(linhas(), HOJE), frias = linhas().filter((l) => l.estado === "aberto" && l.fase === 0 && (l.parado ?? 0) >= 2);
    if (frias.length) expect(ins.find((x) => x.id === "frias")).toMatchObject({ tom: "risco", urgente: true, numero: String(frias.length) });
  });
  it("sem negócios não há insights e a saúde diz que não há dados", () => {
    expect(insights([], HOJE)).toEqual([]);
    expect(saude([]).rotulo).toBe("Sem dados");
  });
});
