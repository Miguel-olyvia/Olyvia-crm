import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";

afterEach(() => { cleanup(); reporCustos(); });

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  return S;
}
const abrirCanalizacao = () => { fireEvent.click(screen.getByRole("tab", { name: "Serviços" })); fireEvent.click(screen.getAllByRole("button", { name: /^Canalização/ })[0]); };

describe("CatalogoV1 · os seis separadores", () => {
  it("tem Serviços, Produtos, Equipamentos, Consumíveis, Técnicos e Ligações, cada um com o seu painel", () => {
    pagina();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Serviços", "Produtos", "Equipamentos", "Consumíveis", "Técnicos", "Ligações"]);
    for (const t of tabs) {
      fireEvent.click(t);
      expect(t).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
  });
  it("os produtos aguentam milhares: mostram-se 40 de cada vez, com «Mostrar mais», e a pesquisa encontra pelo SKU", () => {
    mudarCatalogo((k) => {
      const base = k.produtos[0];
      for (let i = 0; i < 2200; i++) k.produtos.push({ ...base, id: `x${i}`, n: `Artigo ${i}`, sku: `SKU-${i}`, pvp: 10, servico: undefined } as Produto);
    });
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    const lista = () => within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    expect(lista()).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: /^Mostrar mais \(/ }));
    expect(lista()).toHaveLength(80);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "sku-1999" } });
    expect(lista()).toHaveLength(1);
    expect(lista()[0]).toHaveTextContent("Artigo 1999");
  });
});

describe("CatalogoV1 · a ficha do serviço numa página", () => {
  it("abre no lugar da lista (sem modal), com as seis secções e um só botão primário, e volta", () => {
    pagina();
    abrirCanalizacao();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Canalização" })).toBeInTheDocument();
    for (const t of ["Medida", "Quem faz", "Equipamentos", "Consumíveis", "Produtos ligados", "Custo e preço"]) {
      expect(screen.getByRole("heading", { level: 2, name: t })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Guardar o preço" })).toBeDisabled();
    expect(screen.getByText(/\(1\.700,00 € − 0,00 €\) ÷ 2\.000 h/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });
  it("o interruptor «Opcional» tira o consumível do custo e o motor fica com o custo novo", () => {
    const S = pagina();
    abrirCanalizacao();
    const antes = S.svc.canal.cons;
    const sw = screen.getByRole("switch", { name: "Opcional: Fita e vedante" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(screen.getByRole("switch", { name: "Opcional: Fita e vedante" })).toHaveAttribute("aria-checked", "true");
    expect(S.svc.canal.cons).toBeCloseTo(antes - 0.5, 6);
    expect(screen.getByTestId("opcionais")).toHaveTextContent("mais 0,50 €");
  });
  it("a medida escolhe-se (não se escreve) e o exemplo acompanha", () => {
    pagina();
    abrirCanalizacao();
    const med = screen.getByRole("group", { name: "A quantidade vem de" });
    expect(within(med).getByRole("radio", { name: "Pontos de água" })).toBeChecked();
    fireEvent.click(within(med).getByRole("radio", { name: "O comercial escreve" }));
    expect(within(screen.getByRole("group", { name: "A quantidade vem de" })).getByRole("radio", { name: "O comercial escreve" })).toBeChecked();
    expect(screen.getByTestId("exemplo-medida")).toHaveTextContent(/comercial escreve/);
  });
  it("«Guardar o preço» guarda o preço de tabela e passa-o para o serviço", () => {
    const S = pagina();
    abrirCanalizacao();
    fireEvent.change(screen.getByRole("textbox", { name: /Preço de tabela/ }), { target: { value: "120" } });
    const b = screen.getByRole("button", { name: "Guardar o preço" });
    expect(b).toBeEnabled();
    fireEvent.click(b);
    expect(S.svc.canal.preco).toBe(120);
  });
});
