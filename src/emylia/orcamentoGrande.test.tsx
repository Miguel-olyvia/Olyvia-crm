// O orçamento com muitas linhas e muitas tarefas (27/10/2026): procura e filtros nas linhas, grupos que fecham, e no plano as
// fases fechadas quando há mais de 20 tarefas.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado, type LinhaOrc, type Negocio, type SvcId } from "./motor";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { PlanoObra } from "./PlanoObraOrcamento";

afterEach(cleanup);

function Pagina({ S, d, plano }: { S: Estado; d: Negocio; plano?: boolean }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn) };
  return plano ? <PlanoObra ctx={ctx} d={d} /> : <LinhasOrcamento ctx={ctx} d={d} simples />;
}
/** Um orçamento com muitas linhas: os serviços do Catálogo de exemplo, um de cada, e dois materiais. */
const montar = (n: number, plano = false) => {
  const S = seed();
  const d = S.deals.find((x) => x.orc) as Negocio;
  d.orc!.enviada = null;
  // o exemplo tem 13 serviços: os que faltam são cópias, com outro nome
  const base = Object.keys(S.svc) as SvcId[];
  for (let k = base.length; k < n; k++) S.svc[`extra${k}` as SvcId] = { ...S.svc[base[k % base.length]], n: `Serviço extra ${k}` };
  const sids = (Object.keys(S.svc) as SvcId[]).slice(0, n);
  const linhas: LinhaOrc[] = sids.map((sid) => ({ t: "svc", sid, q: 2, cu: 10, pu: 20 }));
  linhas.push({ t: "mat", d: "Materiais de acabamento", custo: 100, preco: 90 }, { t: "mat", d: "Pedra Lioz polida", custo: 50, preco: 100 });
  d.orc!.linhas = linhas;
  delete d.orc!.demolicao;
  render(<Pagina S={S} d={d} plano={plano} />);
  return { S, d, sids };
};

describe("as linhas de um orçamento grande", () => {
  it("com mais de 8 linhas: grupos com o subtotal, que fecham e abrem", () => {
    const { sids } = montar(10);
    const svc = screen.getByRole("list", { name: "Linhas: Serviços" });
    expect(within(svc).getAllByRole("listitem").length).toBe(sids.length);
    const cab = screen.getByRole("button", { name: /Serviços\s*10 linhas/ });
    fireEvent.click(cab);
    expect(screen.queryByRole("list", { name: "Linhas: Serviços" })).toBeNull();
    expect(cab.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(cab);
    expect(screen.getByRole("list", { name: "Linhas: Serviços" })).toBeTruthy();
  });

  it("a procura e os filtros (a margem abaixo do mínimo só mostra essas linhas)", () => {
    const { S, sids } = montar(10);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar uma linha" }), { target: { value: "lióz" } });
    expect(screen.queryByRole("list", { name: "Linhas: Serviços" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Linhas: Materiais e produtos" })).getAllByRole("listitem").length).toBe(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar uma linha" }), { target: { value: "nada assim" } });
    expect(screen.getByText(/Nenhuma linha com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(within(screen.getByRole("list", { name: "Linhas: Serviços" })).getAllByRole("listitem").length).toBe(sids.length);
    // os materiais de acabamento (custo 100, preço 90) estão abaixo do mínimo
    fireEvent.click(screen.getByRole("button", { name: /Margem abaixo do mínimo/ }));
    expect(screen.queryByRole("list", { name: "Linhas: Serviços" })).toBeNull();
    expect(within(screen.getByRole("list", { name: "Linhas: Materiais e produtos" })).getByText("Materiais de acabamento")).toBeTruthy();
    void S;
  });

  it("com poucas linhas, uma lista só, sem procura", () => {
    montar(3);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("list", { name: "Linhas do orçamento" })).toBeTruthy();
  });
});

describe("o plano de um orçamento grande", () => {
  it("com mais de 20 tarefas, as fases começam fechadas; 'Abrir as fases' mostra as tarefas", () => {
    const { d } = montar(24, true);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Abrir as fases" }));
    expect(screen.getAllByRole("slider").length).toBe(d.orc!.linhas.filter((l) => l.t === "svc").length);
    expect(screen.getByRole("button", { name: "Fechar as fases" })).toBeTruthy();
  });

  it("tocar numa fase da lista abre-a no Gantt", () => {
    montar(24, true);
    const fases = screen.getByRole("group", { name: "Fases da obra" }).querySelectorAll("button");
    fireEvent.click(fases[0]);
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
  });
});
