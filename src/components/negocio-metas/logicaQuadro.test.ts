import { describe, expect, it } from "vitest";
import {
  SEM_FILTROS, alternarFase, alternarParaTratar, chipsDeFase, filtrarNegocios, numerosDashboard,
  proximoPasso, resumoQuadro, totaisPorFase,
} from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, valorGanho, type NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";

const { negocios } = DADOS_EXEMPLO;
const HOJE = HOJE_EXEMPLO;
const ids = (ls: readonly { id: string }[]) => ls.map((n) => n.id);
const filtrar = (f: Partial<typeof SEM_FILTROS>) => ids(filtrarNegocios(negocios, { ...SEM_FILTROS, ...f }, HOJE));
const por = (id: string) => negocios.find((n) => n.id === id)!;

describe("filtros", () => {
  it("sem filtros devolve tudo", () => {
    expect(filtrar({})).toHaveLength(10);
  });
  it("pesquisa por pessoa, serviço e comercial", () => {
    expect(filtrar({ q: "marta" })).toEqual(["n1"]);
    expect(filtrar({ q: "cozinha" })).toHaveLength(2);
    expect(filtrar({ q: "diogo" })).toHaveLength(3);
  });
  it("os filtros combinam", () => {
    expect(filtrar({ comercial: "Diogo Lopes", fases: ["proposta"] })).toEqual(["n9"]);
  });
});

describe("filtro de fase: OU entre fases", () => {
  it("fases vazio = todas", () => {
    expect(filtrar({ fases: [] })).toHaveLength(10);
  });
  it("uma fase", () => {
    expect(filtrar({ fases: ["orcamento"] })).toEqual(["n8"]);
  });
  it("várias fases somam-se", () => {
    expect(filtrar({ fases: ["orcamento", "proposta"] })).toEqual(["n6", "n8", "n9"]);
    expect(filtrar({ fases: ["contrato", "orcamento"] })).toEqual(["n8", "n10"]);
  });
  it("alternarFase liga e desliga sem tocar nas outras", () => {
    const a = alternarFase(SEM_FILTROS, "proposta");
    const b = alternarFase(a, "contrato");
    expect(b.fases).toEqual(["proposta", "contrato"]);
    expect(alternarFase(b, "proposta").fases).toEqual(["contrato"]);
    expect(SEM_FILTROS.fases).toEqual([]);
  });
});

describe("Para tratar: atraso OU parado OU prazo hoje", () => {
  const base = (id: string, extra: Partial<NegocioMes>): NegocioMes => ({
    ...por("n10"), id, parado: null, proximoPrazo: "2026-10-30", ...extra,
  });
  const casos = [
    base("atrasado", { proximoPrazo: "2026-10-10" }),
    base("parado", { parado: 8 }),
    base("hoje", { proximoPrazo: HOJE }),
    base("amanha", { proximoPrazo: "2026-10-14" }),
    base("emDia", {}),
  ];
  it("cada alerta basta, os outros ficam de fora", () => {
    const r = filtrarNegocios(casos, { ...SEM_FILTROS, paraTratar: true }, HOJE);
    expect(ids(r)).toEqual(["atrasado", "parado", "hoje"]);
  });
  it("nos dados de exemplo apanha os três a tratar", () => {
    expect(filtrar({ paraTratar: true })).toEqual(["n6", "n8", "n9"]);
  });
  it("E entre grupos diferentes", () => {
    expect(filtrar({ paraTratar: true, comercial: "Diogo Lopes" })).toEqual(["n8", "n9"]);
    expect(filtrar({ paraTratar: true, fases: ["proposta"] })).toEqual(["n6", "n9"]);
    expect(filtrar({ paraTratar: true, fases: ["proposta"], meus: true })).toEqual([]);
  });
  it("alternarParaTratar liga e desliga", () => {
    expect(alternarParaTratar(SEM_FILTROS).paraTratar).toBe(true);
    expect(alternarParaTratar({ ...SEM_FILTROS, paraTratar: true }).paraTratar).toBe(false);
  });
});

describe("chips de fase", () => {
  it("contam e somam o valor de cada fase", () => {
    const { fases, paraTratar } = chipsDeFase(negocios, SEM_FILTROS, HOJE);
    expect(fases.map((c) => [c.fase, c.n])).toEqual([
      ["orcamento", 1], ["proposta", 2], ["contrato", 1], ["ganho", 6],
    ]);
    expect(fases.find((c) => c.fase === "proposta")?.valor).toBe(8600 + 15200);
    expect(fases.every((c) => !c.ativo)).toBe(true);
    expect(paraTratar).toMatchObject({ n: 3, ativo: false });
  });
  it("as contagens ignoram o filtro de fase mas respeitam os outros", () => {
    const f = { ...SEM_FILTROS, comercial: "Diogo Lopes", fases: ["ganho" as const] };
    const { fases } = chipsDeFase(negocios, f, HOJE);
    expect(fases.map((c) => c.n)).toEqual([1, 1, 0, 1]);
    expect(fases.find((c) => c.fase === "ganho")?.ativo).toBe(true);
    expect(fases.find((c) => c.fase === "proposta")?.ativo).toBe(false);
  });
  it("com Os meus só contam os meus", () => {
    const { fases } = chipsDeFase(negocios, { ...SEM_FILTROS, meus: true }, HOJE);
    expect(fases.map((c) => c.n)).toEqual([0, 0, 1, 2]);
  });
  it("o chip Para tratar conta com os outros filtros e fica ativo quando ligado", () => {
    const f = { ...SEM_FILTROS, comercial: "Carla Mendes", paraTratar: true };
    expect(chipsDeFase(negocios, f, HOJE).paraTratar).toMatchObject({ n: 1, ativo: true });
  });
});

describe("próximo passo e fase", () => {
  it("segue a cadeia", () => {
    expect(proximoPasso(por("n8"))).toBe("escolherOrcamento");
    expect(proximoPasso(por("n9"))).toBe("enviarProposta");
    expect(proximoPasso(por("n6"))).toBe("esperarCliente");
    expect(proximoPasso(por("n10"))).toBe("pedirAssinatura");
    expect(proximoPasso(por("n1"))).toBe("concluido");
    expect(faseDoNegocio(por("n1"))).toBe("ganho");
  });
});

describe("totais por fase", () => {
  it("a soma dos totais é a soma dos negócios filtrados", () => {
    const f = { ...SEM_FILTROS, q: "a" };
    const visiveis = filtrarNegocios(negocios, f, HOJE);
    const totais = Object.values(totaisPorFase(negocios, f, HOJE));
    expect(totais.reduce((s, t) => s + t.n, 0)).toBe(visiveis.length);
    expect(totais.reduce((s, t) => s + t.valor, 0)).toBe(visiveis.reduce((s, n) => s + valorDoNegocio(n), 0));
  });
  it("ignora o filtro de fase mas respeita os outros", () => {
    const todas = totaisPorFase(negocios, SEM_FILTROS, HOJE);
    const soFin = totaisPorFase(negocios, { ...SEM_FILTROS, fases: ["ganho"] }, HOJE);
    expect(soFin).toEqual(todas);
    const diogo = totaisPorFase(negocios, { ...SEM_FILTROS, comercial: "Diogo Lopes", fases: ["ganho"] }, HOJE);
    expect(diogo.proposta.n).toBe(1);
    expect(diogo.contrato.n).toBe(0);
  });
  it("Ganho soma o valor ganho", () => {
    expect(totaisPorFase(negocios, SEM_FILTROS, HOJE).ganho.valor).toBe(valorGanho(negocios));
  });
  it("resumo do quadro", () => {
    expect(resumoQuadro(negocios)).toEqual({ n: 10, valorEmProposta: 8600 + 15200, porFechar: 4 });
  });
});

describe("números do dashboard", () => {
  it("batem com os negócios", () => {
    const [quadro, porFechar, ponderado, duas] = numerosDashboard(negocios);
    expect(quadro.valor).toBe(10);
    expect(porFechar).toMatchObject({ valor: 4, valorNota: 24000 + 8600 + 15200 });
    expect(ponderado.valor).toBe(Math.round(24000 * 0.8 + 8600 * 0.5 + 15200 * 0.5));
    expect(duas.valor).toBe(6);
  });
});
