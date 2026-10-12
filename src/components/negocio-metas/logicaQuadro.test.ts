import { describe, expect, it } from "vitest";
import {
  SEM_FILTROS, alternarVista, filtrarNegocios, numerosDashboard, ordenarNegocios, proximaOrdem,
  proximoPasso, resumoQuadro, totaisPorFase, vistasRapidas, type IdVista,
} from "./logicaQuadro";
import { faseDoNegocio, valorDoNegocio, valorGanho } from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";

const { negocios } = DADOS_EXEMPLO;
const ids = (ls: readonly { id: string }[]) => ls.map((n) => n.id);

describe("filtros", () => {
  it("sem filtros devolve tudo", () => {
    expect(filtrarNegocios(negocios, SEM_FILTROS)).toHaveLength(10);
  });
  it("pesquisa por pessoa, serviço e comercial", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, q: "marta" }))).toEqual(["n1"]);
    expect(filtrarNegocios(negocios, { ...SEM_FILTROS, q: "cozinha" })).toHaveLength(2);
    expect(filtrarNegocios(negocios, { ...SEM_FILTROS, q: "diogo" })).toHaveLength(3);
  });
  it("fase, parados e atraso", () => {
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, fase: "orcamento" }))).toEqual(["n8"]);
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, parados: true }))).toEqual(["n6", "n8"]);
    expect(ids(filtrarNegocios(negocios, { ...SEM_FILTROS, atraso: true }))).toEqual(["n6", "n8"]);
  });
  it("os filtros combinam", () => {
    const r = filtrarNegocios(negocios, { ...SEM_FILTROS, comercial: "Diogo Lopes", fase: "proposta" });
    expect(ids(r)).toEqual(["n9"]);
  });
});

describe("chips de vista rápida", () => {
  it("a contagem de cada chip é o número de linhas que o filtro dele mostra", () => {
    const esperado: Record<IdVista, number> = { enviar: 1, espera: 2, assinar: 1, financeiro: 6, parados: 2, atraso: 2 };
    for (const v of vistasRapidas(negocios, SEM_FILTROS)) {
      expect(v.n).toBe(esperado[v.id]);
      expect(v.ativo).toBe(false);
      const aplicado = alternarVista(SEM_FILTROS, v.id);
      expect(filtrarNegocios(negocios, aplicado)).toHaveLength(v.n);
    }
  });
  it("ligar e desligar repõe os filtros", () => {
    const ligado = alternarVista(SEM_FILTROS, "espera");
    expect(ligado.fase).toBe("proposta");
    expect(vistasRapidas(negocios, ligado).find((v) => v.id === "espera")?.ativo).toBe(true);
    expect(alternarVista(ligado, "espera")).toEqual(SEM_FILTROS);
  });
  it("a contagem tem em conta os outros filtros", () => {
    const f = { ...SEM_FILTROS, comercial: "Carla Mendes" };
    const v = vistasRapidas(negocios, f);
    expect(v.find((x) => x.id === "atraso")?.n).toBe(1);
    expect(v.find((x) => x.id === "financeiro")?.n).toBe(1);
  });
});

describe("próximo passo e fase", () => {
  it("segue a cadeia", () => {
    const por = (id: string) => negocios.find((n) => n.id === id)!;
    expect(proximoPasso(por("n8"))).toBe("escolherOrcamento");
    expect(proximoPasso(por("n9"))).toBe("enviarProposta");
    expect(proximoPasso(por("n6"))).toBe("esperarCliente");
    expect(proximoPasso(por("n10"))).toBe("pedirAssinatura");
    expect(proximoPasso(por("n1"))).toBe("passarFinanceiro");
    expect(faseDoNegocio(por("n1"))).toBe("financeiro");
  });
});

describe("ordenação", () => {
  it("ordena por pessoa e inverte ao segundo clique", () => {
    const o1 = proximaOrdem(null, "pessoa");
    expect(o1).toEqual({ coluna: "pessoa", dir: "asc" });
    expect(ids(ordenarNegocios(negocios, o1))[0]).toBe("n9");
    const o2 = proximaOrdem(o1, "pessoa");
    expect(o2.dir).toBe("desc");
    expect(ids(ordenarNegocios(negocios, o2))[0]).toBe("n10");
  });
  it("o valor começa do maior e os sem valor ficam no fim", () => {
    const r = ordenarNegocios(negocios, proximaOrdem(null, "valor"));
    expect(r[0].id).toBe("n10");
    expect(r[r.length - 1].id).toBe("n8");
    const asc = ordenarNegocios(negocios, { coluna: "valor", dir: "asc" });
    expect(asc[asc.length - 1].id).toBe("n8");
  });
  it("sem ordem mantém a ordem recebida", () => {
    expect(ids(ordenarNegocios(negocios, null))).toEqual(ids(negocios));
  });
});

describe("totais", () => {
  it("a soma dos totais por fase é a soma dos negócios visíveis", () => {
    const visiveis = filtrarNegocios(negocios, { ...SEM_FILTROS, q: "a" });
    const totais = Object.values(totaisPorFase(visiveis));
    expect(totais.reduce((s, t) => s + t.n, 0)).toBe(visiveis.length);
    expect(totais.reduce((s, t) => s + t.valor, 0)).toBe(
      visiveis.reduce((s, n) => s + valorDoNegocio(n), 0),
    );
  });
  it("Financeiro soma o valor ganho", () => {
    expect(totaisPorFase(negocios).financeiro.valor).toBe(valorGanho(negocios));
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
