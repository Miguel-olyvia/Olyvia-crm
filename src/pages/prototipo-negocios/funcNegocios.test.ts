// O Hoje e o Quadro da V2 funcional de Negócios: as listas, o tempo parado, as vistas rápidas e a ordem.
import { describe, expect, it } from "vitest";
import { seed } from "./motor";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro } from "./filtrosNegocios";
import { VISTAS_N, aplicarVistaN, grupoN, hojeNegocios, ordenarHojeN, ordenarN, paradoN, paradoTexto } from "./funcNegocios";

const quadro = (S = seed(), rapido = "todos") => selecionarQuadro(linhasNegocios(S), { rapido, q: "", f: SEM_FILTROS_N });
const titulos = (ls: ReturnType<typeof quadro>) => ls.map((l) => `${l.negocio.nome} · ${l.negocio.titulo}`);

describe("Negócios · Hoje", () => {
  it("as quatro listas, cada negócio numa só, e a soma bate com o Quadro (todos os do Quadro estão por tratar)", () => {
    const q = quadro(), gs = hojeNegocios(q);
    expect(gs.map((g) => [g.nome, g.linhas.length])).toEqual([
      ["Orçamentos por enviar", 5], ["Propostas à espera do cliente", 4], ["Contratos por assinar", 1], ["A faturar", 4],
    ]);
    const ids = gs.flatMap((g) => g.linhas.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(q.filter((l) => grupoN(l) !== null).length);
    expect(ids.length).toBe(q.length);
  });
  it("um negócio em Financeiro com a fatura emitida já não está 'A faturar'", () => {
    const S = seed();
    S.deals.find((d) => d.id === 1027)!.fin.fatura = { n: "FT 1", q: "10/10" };
    const faturar = hojeNegocios(quadro(S)).find((g) => g.id === "faturar")!;
    expect(titulos(faturar.linhas)).not.toContain("Tiago Almeida · Cozinha");
  });
  it("o tempo parado em texto, por fase", () => {
    const t = Object.fromEntries(quadro().map((l) => [`${l.negocio.nome} · ${l.negocio.titulo}`, paradoTexto(l)]));
    expect(t["Carla Nunes · Cozinha"]).toBe("Enviada há 5 dias");
    expect(t["Tiago Almeida · Pintura exterior"]).toBe("Em orçamento ontem");
    expect(t["Joana Ribeiro · WC de serviço e lavandaria"]).toBe("À espera de assinatura ontem");
    expect(t["Armando Figueiredo · Cozinha"]).toBe("Ganho há 24 dias, por faturar");
  });
  it("dentro de cada lista: os mais parados primeiro, ou o maior valor primeiro", () => {
    const orc = hojeNegocios(quadro(), "parado")[0].linhas;
    expect(orc.map(paradoN)).toEqual([...orc.map(paradoN)].sort((a, b) => b - a));
    const porValor = hojeNegocios(quadro(), "valor")[0].linhas;
    expect(titulos(porValor)[0]).toBe("Hotel Praia Dourada · Casas de banho dos quartos");
    expect(porValor.map((l) => l.valor)).toEqual([...porValor.map((l) => l.valor)].sort((a, b) => (b ?? 0) - (a ?? 0)));
  });
  it("ordenar não muda a lista recebida", () => {
    const q = quadro(), antes = q.map((l) => l.id);
    ordenarHojeN(q, "valor"); ordenarN(q, "nome");
    expect(q.map((l) => l.id)).toEqual(antes);
  });
});

describe("Negócios · vistas rápidas e ordem do Quadro", () => {
  it("cada vista dá o número que mostra, e Para enviar + À espera + Por assinar + A faturar = todo o Quadro", () => {
    const q = quadro(), n = Object.fromEntries(VISTAS_N.map((v) => [v.id, aplicarVistaN(q, v.id).length]));
    expect(n).toEqual({ enviar: 5, espera: 4, assinar: 1, faturar: 4, parados: 3, varios: 4 });
    expect(n.enviar + n.espera + n.assinar + n.faturar).toBe(q.length);
    expect(aplicarVistaN(q, null)).toHaveLength(q.length);
  });
  it("ordenar por nome, valor e tempo parado", () => {
    const orc = quadro().filter((l) => l.doc === "orcamento");
    expect(ordenarN(orc, "nome").map((l) => l.negocio.nome)).toEqual(["Carla Nunes", "Hotel Praia Dourada", "Marta Lima", "Sérgio Pinto", "Tiago Almeida"]);
    expect(ordenarN(orc, "valor")[0].valor).toBe(18900);
    expect(ordenarN(orc, "valor", "asc")[0].valor).toBe(1380);
    expect(paradoN(ordenarN(orc, "parado")[0])).toBe(6);
    expect(ordenarN(orc, null).map((l) => l.id)).toEqual(orc.map((l) => l.id));
  });
  it("as vistas e o Hoje respeitam os filtros de sempre (a pesquisa)", () => {
    const S = seed(), q = selecionarQuadro(linhasNegocios(S), { rapido: "todos", q: "Carla", f: SEM_FILTROS_N });
    expect(hojeNegocios(q).reduce((a, g) => a + g.linhas.length, 0)).toBe(q.length);
    expect(q.every((l) => l.negocio.nome === "Carla Nunes")).toBe(true);
  });
});
