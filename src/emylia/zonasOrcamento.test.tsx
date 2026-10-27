// 26/10: as zonas da obra no orçamento (zonasOrcamento.ts, ZonasDaObra.tsx): as contas, as ações, a proposta e o ecrã.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, linhaCalc, porZonaDe, preservarManuais, seed, LINHAS, type Aviso, type Estado, type LinhaOrc, type Negocio } from "./motor";
import { SEM_ZONA, erroZonasLinha, limparZonas, valoresPorZona } from "./zonasOrcamento";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { PropostaDoc } from "./DocsCliente";
import { ligarCatalogo } from "./produtosVisita";
import { catalogo0 } from "./v2/catalogoModelo";
import type { Ctx } from "./pecas";

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); ligarCatalogo(() => catalogo0()); });

/** Um orçamento por enviar (o 1031 da demonstração, reaberto). */
function preparar() {
  const S = seed();
  const avisos: Aviso[] = [];
  const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
  const d = S.deals.find((x) => x.id === 1031)!;
  d.orc!.enviada = null;
  return { S, A, d, avisos };
}
const iSvc = (d: Negocio) => d.orc!.linhas.findIndex((l) => l.t === "svc" && l.q >= 2);

describe("as contas das zonas", () => {
  const svc: LinhaOrc = { t: "svc", sid: "x", q: 3, cu: 1, pu: 10.01 };
  const mat: LinhaOrc = { t: "mat", d: "Tomada", custo: 10, preco: 68.5 };
  it("limparZonas tira espaços, vazios, repetidos e o nome reservado", () => {
    expect(limparZonas([" Geral ", "", "cozinha", "Cozinha", "Casa  de banho", SEM_ZONA])).toEqual(["Geral", "cozinha", "Casa de banho"]);
  });
  it("erroZonasLinha: a soma, as zonas conhecidas, os valores nos materiais", () => {
    const Z = ["Geral", "Cozinha"];
    expect(erroZonasLinha(svc, [{ z: "Geral", q: 1 }, { z: "Cozinha", q: 2 }], Z, 3)).toBeNull();
    expect(erroZonasLinha(svc, [], Z, 3)).toMatch(/pelo menos uma/);
    expect(erroZonasLinha(svc, [{ z: "Sala", q: 3 }], Z, 3)).toMatch(/não está/);
    expect(erroZonasLinha(svc, [{ z: "Geral", q: 1 }, { z: "geral", q: 2 }], Z, 3)).toMatch(/duas vezes/);
    expect(erroZonasLinha(svc, [{ z: "Geral", q: 1 }, { z: "Cozinha", q: 1 }], Z, 3)).toBe("As zonas somam 2: têm de somar a quantidade da linha (3).");
    expect(erroZonasLinha(svc, [{ z: "Geral", q: 3, preco: 30 }], Z, 3)).toMatch(/serviços/);
    expect(erroZonasLinha(mat, [{ z: "Geral", q: 2, preco: 16 }, { z: "Cozinha", q: 6 }], Z, 8)).toMatch(/todas as zonas/);
    expect(erroZonasLinha(mat, [{ z: "Geral", q: 2, preco: 16 }, { z: "Cozinha", q: 6, preco: 52.5 }], Z, 8)).toBeNull();
  });
  it("valoresPorZona: serviço pela quantidade, materiais pelo valor escrito ou pela parte; somam sempre a linha", () => {
    const v1 = valoresPorZona({ ...svc, zonas: [{ z: "Geral", q: 1 }, { z: "Cozinha", q: 2 }] }, 30.03, 3);
    expect(v1).toEqual([{ z: "Geral", q: 1, valor: 10.01 }, { z: "Cozinha", q: 2, valor: 20.02 }]);
    const v2 = valoresPorZona({ ...mat, zonas: [{ z: "Geral", q: 2, preco: 16 }, { z: "Cozinha", q: 6, preco: 52.5 }] }, 68.5, 8);
    expect(v2.map((x) => x.valor)).toEqual([16, 52.5]);
    const v3 = valoresPorZona({ ...mat, preco: 10, zonas: [{ z: "a", q: 1 }, { z: "b", q: 1 }, { z: "c", q: 1 }] }, 10, 3);
    expect(v3.map((x) => x.valor)).toEqual([3.33, 3.33, 3.34]);
    expect(valoresPorZona(svc, 30.03, 3)).toEqual([]);
  });
});

describe("as ações das zonas", () => {
  it("sem zonas no orçamento não há grupos", () => {
    const { S, d } = preparar();
    expect(porZonaDe(d, S)).toEqual([]);
  });
  it("põe as zonas, uma linha numa zona e outra repartida; os grupos somam o orçamento", () => {
    const { S, A, d } = preparar();
    expect(A.zonasOrc(d.id, ["Casa de banho", "Cozinha"])).toBe(true);
    const i = iSvc(d), l = d.orc!.linhas[i] as Extract<LinhaOrc, { t: "svc" }>;
    expect(A.zonasLinha(d.id, i, [{ z: "casa de banho", q: 1 }, { z: "Cozinha", q: l.q - 1 }])).toBe(true);
    expect(l.zonas![0].z, "o nome fica como está nas zonas").toBe("Casa de banho");
    const j = d.orc!.linhas.findIndex((x, k) => k !== i);
    expect(A.zonaLinha(d.id, j, "Cozinha")).toBe(true);
    const G = porZonaDe(d, S);
    expect(G.map((g) => g.z)).toEqual(["Casa de banho", "Cozinha", SEM_ZONA]);
    const soma = d.orc!.linhas.reduce((a, x) => a + linhaCalc(x, S).preco, 0);
    expect(G.reduce((a, g) => a + g.total, 0)).toBeCloseTo(soma, 2);
  });
  it("a soma errada não fica e avisa", () => {
    const { A, d, avisos } = preparar();
    A.zonasOrc(d.id, ["A", "B"]);
    expect(A.zonasLinha(d.id, iSvc(d), [{ z: "A", q: 0.5 }])).toBe(false);
    expect(d.orc!.linhas[iSvc(d)].zonas).toBeUndefined();
    expect(avisos.at(-1)?.msg).toBe("As zonas da linha não ficaram");
  });
  it("nos materiais, o valor de cada zona passa a ser o preço da linha", () => {
    const { A, d } = preparar();
    A.zonasOrc(d.id, ["A", "B"]);
    const i = A.linhaLivre(d.id, { d: "Tomada c/tampa", q: 8, pu: 8, iva: 23 });
    expect(A.zonasLinha(d.id, i, [{ z: "A", q: 2, preco: 16 }, { z: "B", q: 6, preco: 52.5 }])).toBe(true);
    expect(d.orc!.linhas[i]).toMatchObject({ preco: 68.5, livre: { q: 8, pu: 8.56 } });
  });
  it("tirar uma zona tira a repartição das linhas que a usavam; a lista vazia tira tudo", () => {
    const { A, d } = preparar();
    A.zonasOrc(d.id, ["A", "B"]);
    A.zonaLinha(d.id, 0, "A");
    A.zonaLinha(d.id, 1, "B");
    A.zonasOrc(d.id, ["B"]);
    expect(d.orc!.linhas[0].zonas).toBeUndefined();
    expect(d.orc!.linhas[1].zonas).toEqual([{ z: "B", q: expect.any(Number) }]);
    A.zonasOrc(d.id, []);
    expect(d.orc!.zonas).toBeUndefined();
  });
  it("não muda depois de enviada", () => {
    const { A, d } = preparar();
    d.orc!.enviada = "2026-10-10";
    expect(A.zonasOrc(d.id, ["A"])).toBe(false);
    expect(d.orc!.zonas).toBeUndefined();
  });
  it("o levantamento reaberto guarda as zonas", () => {
    const { A, d } = preparar();
    A.zonasOrc(d.id, ["A"]);
    const i = iSvc(d);
    A.zonaLinha(d.id, i, "A");
    const antes = JSON.parse(JSON.stringify(d.orc));
    const novo = JSON.parse(JSON.stringify(d.orc));
    for (const l of novo.linhas) delete l.zonas;
    delete novo.zonas;
    preservarManuais(antes, novo, LINHAS[d.linha]);
    expect(novo.zonas).toEqual(["A"]);
    expect(novo.linhas[i].zonas).toEqual(antes.linhas[i].zonas);
  });
});

describe("a proposta por zona", () => {
  it("agrupa o orçamento detalhado por zona, com o subtotal de cada uma", () => {
    const { S, A, d } = preparar();
    A.zonasOrc(d.id, ["Casa de banho", "Cozinha"]);
    d.orc!.linhas.forEach((_, i) => A.zonaLinha(d.id, i, i % 2 ? "Cozinha" : "Casa de banho"));
    render(<PropostaDoc S={S} d={d} />);
    const G = porZonaDe(d, S);
    expect(G.map((g) => g.z)).toEqual(["Casa de banho", "Cozinha"]);
    expect(screen.getByText("Subtotal · Casa de banho")).toBeTruthy();
    expect(screen.getByText("Subtotal · Cozinha")).toBeTruthy();
    expect(screen.queryByText(/Subtotal da fase/)).toBeNull();
  });
  it("sem zonas fica por fase, como era", () => {
    const { S, d } = preparar();
    render(<PropostaDoc S={S} d={d} />);
    expect(screen.getAllByText(/Subtotal da fase/).length).toBeGreaterThan(0);
  });
});

describe("o ecrã das zonas no orçamento", () => {
  function Pagina({ S, d }: { S: Estado; d: Negocio }) {
    const [, refazer] = useReducer((x: number) => x + 1, 0);
    const run = (fn: () => void) => { fn(); refazer(); };
    const ctx: Ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn) => () => run(fn), q: "" };
    return <LinhasOrcamento ctx={ctx} d={d} />;
  }
  it("escreve as zonas, põe uma linha numa zona e reparte outra", () => {
    const { S, d } = preparar();
    render(<Pagina S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Separar por zonas da obra" }));
    fireEvent.change(screen.getByLabelText("Uma zona por linha", { exact: false }), { target: { value: "Casa de banho\nCozinha\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar as zonas" }));
    expect(d.orc!.zonas).toEqual(["Casa de banho", "Cozinha"]);
    const selects = screen.getAllByRole("combobox", { name: /^Zona de / });
    expect(selects).toHaveLength(d.orc!.linhas.length);
    fireEvent.change(selects[0], { target: { value: "Cozinha" } });
    expect(d.orc!.linhas[0].zonas).toEqual([{ z: "Cozinha", q: expect.any(Number) }]);
    // repartir a linha de serviço com quantidade 2 ou mais
    const i = iSvc(d), l = d.orc!.linhas[i] as Extract<LinhaOrc, { t: "svc" }>;
    fireEvent.change(screen.getAllByRole("combobox", { name: /^Zona de / })[i], { target: { value: "__repartir" } });
    const grupo = screen.getByRole("group", { name: /repartir/ });
    fireEvent.change(within(grupo).getByLabelText("Quantidade em Casa de banho"), { target: { value: "1" } });
    fireEvent.click(within(grupo).getByRole("button", { name: "Guardar a repartição" }));
    expect(within(grupo).getByRole("alert").textContent).toMatch(/têm de somar/);
    fireEvent.change(within(grupo).getByLabelText("Quantidade em Cozinha"), { target: { value: String(l.q - 1).replace(".", ",") } });
    fireEvent.click(within(grupo).getByRole("button", { name: "Guardar a repartição" }));
    expect(l.zonas).toEqual([{ z: "Casa de banho", q: 1 }, { z: "Cozinha", q: l.q - 1 }]);
    expect(screen.getByRole("button", { name: "Mudar a repartição" })).toBeTruthy();
  });
});
