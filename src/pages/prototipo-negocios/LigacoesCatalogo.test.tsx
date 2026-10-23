import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import { abrirLigacoesEm } from "./LigacoesCatalogo";
import { EXIGE_MUDELAR } from "./dados/catalogoMudelar";

const mmOriginal = window.matchMedia;
// Estes testes usam só os dados de exemplo: sem os 317 serviços nem os produtos reais da Mudelar (14/10),
// que têm os seus testes em dados/catalogoMudelar.test.ts.
// as regras "exige produto" que vieram da Mudelar (as de exemplo, em EXIGE0, ganham-lhes)
const daMudelarExige = new Set(EXIGE_MUDELAR.map((e) => e.sid).filter((sid) => !["loucas", "pav", "moveis", "c6", "c13", "c17"].includes(sid)));
vi.mock("./catalogo", async (orig) => {
  const m = await orig<typeof import("./catalogo")>();
  return { ...m, CATALOGO_TODO: m.CATALOGO };
});
beforeEach(() => { mudarCatalogo((k) => {
  k.produtos = k.produtos.filter((p) => !p.sku);
  k.exigeProduto = Object.fromEntries(Object.entries(k.exigeProduto ?? {}).filter(([sid]) => !daMudelarExige.has(sid)));
}); });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); window.matchMedia = mmOriginal; });

function pagina() {
  const S = seed(), run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  return S;
}
const abrirLigacoes = () => fireEvent.click(screen.getByRole("tab", { name: "Ligações" }));
const centro = () => screen.getByRole("heading", { level: 2, name: (_, el) => el.id === "lig-centro" });
const rasto = () => within(screen.getByRole("navigation", { name: "Rasto" })).getAllByRole("listitem").map((li) => li.textContent);
const no = (nome: string) => screen.getAllByRole("button").find((b) => b.getAttribute("data-no") && b.textContent?.startsWith(nome))!;

describe("Catálogo V1 · separador Ligações", () => {
  it("abre com um produto no centro, e tocar num nó põe-no no centro, com o rasto para voltar", () => {
    abrirLigacoesEm({ t: "prod", id: "m3" });
    pagina();
    abrirLigacoes();
    expect(screen.getByRole("tab", { name: "Ligações" })).toHaveAttribute("aria-selected", "true");
    expect(centro()).toHaveTextContent("Sanita suspensa com estrutura");
    for (const g of ["Serviço que traz", "Serviços que o pedem", "Alternativas", "Quem instala"]) expect(screen.getByRole("region", { name: g })).toBeInTheDocument();
    fireEvent.click(no("Instalação de Sanita Compacta"));
    expect(centro()).toHaveTextContent("Instalação de Sanita Compacta");
    fireEvent.click(no("Canalizador"));
    expect(rasto()).toEqual(["Sanita suspensa com estrutura", "Instalação de Sanita Compacta", "Canalizador"]);
    fireEvent.click(screen.getByRole("button", { name: "Sanita suspensa com estrutura" }));
    expect(centro()).toHaveTextContent("Sanita suspensa com estrutura");
    expect(rasto()).toHaveLength(1);
  });
  it("no telemóvel fica em camadas e o porquê vê-se em cada nó; no computador, em colunas, aparece ao passar o rato", () => {
    abrirLigacoesEm({ t: "svc", id: "c13" });
    pagina();
    abrirLigacoes();
    expect(screen.getByTestId("mapa-ligacoes")).toHaveAttribute("data-layout", "camadas");
    expect(no("Sanita suspensa com estrutura")).toHaveTextContent("1 un traz 1 × Instalação de Sanita Compacta");
    cleanup();
    window.matchMedia = ((q: string) => ({ ...mmOriginal(q), matches: q.includes("min-width: 1024px") })) as typeof window.matchMedia;
    pagina();
    abrirLigacoes();
    expect(screen.getByTestId("mapa-ligacoes")).toHaveAttribute("data-layout", "colunas");
    expect(screen.queryByTestId("porque")).toBeNull();
    fireEvent.mouseEnter(no("Sanita suspensa com estrutura"));
    expect(screen.getByTestId("porque")).toHaveTextContent("1 un traz 1 × Instalação de Sanita Compacta");
  });
  it("mostra no máximo 12 nós por grupo; o resto abre-se em «+ N», numa lista com pesquisa", () => {
    mudarCatalogo((k) => {
      const base = k.produtos.find((p) => p.n === "Sanita compacta")!;
      for (let i = 0; i < 30; i++) k.produtos.push({ ...base, id: `x${i}`, n: `Sanita ${i}`, servico: undefined } as Produto);
    });
    abrirLigacoesEm({ t: "prod", id: "m3" });
    pagina();
    abrirLigacoes();
    const alt = screen.getByRole("region", { name: "Alternativas" });
    expect(within(alt).getAllByRole("listitem")).toHaveLength(12);
    const mais = within(alt).getByRole("button", { name: /^\+ 21/ });
    fireEvent.click(mais);
    expect(mais).toHaveAttribute("aria-expanded", "true");
    const lista = screen.getByRole("region", { name: /^Alternativas · 33/ });
    fireEvent.change(within(lista).getByRole("searchbox"), { target: { value: "sanita 29" } });
    fireEvent.click(within(lista).getByRole("button", { name: /Sanita 29/ }));
    expect(centro()).toHaveTextContent("Sanita 29");
  });
  it("a pesquisa escolhe o centro", () => {
    pagina();
    abrirLigacoes();
    fireEvent.change(screen.getByRole("searchbox", { name: "Escolher o centro do mapa" }), { target: { value: "prensa" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Resultados" })).getByRole("button", { name: /Prensa de multicamada/ }));
    expect(centro()).toHaveTextContent("Prensa de multicamada");
    expect(no("Canalização")).toBeTruthy();
  });
  it("a vista Problemas conta por tipo e um toque abre o problema no mapa, com o aviso no centro", () => {
    pagina();
    abrirLigacoes();
    fireEvent.click(screen.getByRole("button", { name: /^Problemas/ }));
    const p = screen.getByTestId("problemas");
    expect(within(p).getByRole("list", { name: "Problemas por tipo" })).toHaveTextContent(/\d+ produtos sem serviço de instalação/);
    const sec = within(p).getByRole("region", { name: "Produtos sem serviço de instalação" });
    fireEvent.click(within(sec).getByRole("button", { name: /Espelho simples 60×80/ }));
    expect(centro()).toHaveTextContent("Espelho simples 60×80");
    expect(screen.getByRole("list", { name: "Problemas de dados" })).toHaveTextContent("Sem serviço de instalação");
  });
});

describe("Ficha do serviço · Ver ligações", () => {
  it("«Ver ligações» abre o mapa centrado no serviço; um produto ligado abre-se no mapa", () => {
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: "Sanita Compacta" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Instalação de Sanita Compacta/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sanita compacta: ver ligações" }));
    expect(screen.getByRole("tab", { name: "Ligações" })).toHaveAttribute("aria-selected", "true");
    expect(centro()).toHaveTextContent("Sanita compacta");
    fireEvent.click(no("Instalação de Sanita Compacta"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha" }));
    expect(screen.getByRole("heading", { level: 1, name: "Instalação de Sanita Compacta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver ligações" }));
    expect(centro()).toHaveTextContent("Instalação de Sanita Compacta");
  });
});
