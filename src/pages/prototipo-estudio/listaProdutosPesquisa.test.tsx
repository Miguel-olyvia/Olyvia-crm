// 23/11 (testarh, Mudelar): na lista de produtos do Estúdio, a pesquisa pela referência, os mais parecidos primeiro e o «Ver mais do
// catálogo» que pede as páginas seguintes ao servidor (antes ficava preso nos primeiros 50).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const procura = vi.hoisted(() => ({ chamadas: [] as { q: string; pagina: number }[] }));

vi.mock("./pesquisaEstudio", async (orig) => {
  const real = await orig<typeof import("./pesquisaEstudio")>();
  const { usarProdutosReais, produtosReais } = await import("./catalogoFake");
  return {
    ...real,
    // o servidor: 2 páginas; a 2.ª traz o produto que faltava
    procurarNoCatalogo: async (_cat: string, q: string, pagina = 1) => {
      procura.chamadas.push({ q, pagina });
      if (pagina === 2) {
        usarProdutosReais([...produtosReais(), { id: "alvo", cat: "movel", n: "Móvel AXIS Suspenso c/lavatório 60x50x36 2 Gav Fundo Reduzido", colecao: "", cores: ["madeira"], hex: "#000", preco: 300, un: "un", inst: 50, ref: "MACBML0092" }]);
        return { novos: 1, haMais: false };
      }
      return { novos: 0, haMais: true };
    },
  };
});

import { ListaProdutos } from "./pecasEstudio";
import { usarProdutosReais, type Produto } from "./catalogoFake";

const p = (id: string, n: string, ref: string): Produto => ({ id, cat: "movel", n, colecao: "", cores: ["branco"], hex: "#fff", preco: 200, un: "un", inst: 50, ref });

afterEach(() => { usarProdutosReais([]); procura.chamadas = []; vi.useRealTimers(); });

describe("a lista de produtos do Estúdio a procurar", () => {
  it("pela referência: o produto aparece (antes dava «Nenhum produto com esse nome»)", async () => {
    vi.useFakeTimers();
    usarProdutosReais([p("x", "Base de Duche CACH 70x120 Branco", "DBBD0098"), p("y", "Móvel AXIS 80 Branco", "MACBML0001")]);
    render(<ListaProdutos cat="movel" estilo={{ cores: ["branco"], porCategoria: {} }} onEscolher={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MACBML0001" } });
    expect(screen.getByText("Móvel AXIS 80 Branco")).toBeTruthy();
    expect(screen.queryByText("Nenhum produto com esse nome.")).toBeNull();
  });

  it("«Ver mais do catálogo» pede a página seguinte e o produto que faltava entra à frente", async () => {
    vi.useFakeTimers();
    usarProdutosReais(Array.from({ length: 6 }, (_, i) => p(`a${i}`, `Móvel AXIS Suspenso 60x50x36 - 1 Pio / 2 Gav c/Fundo Reduzido - Cor ${i}`, `MACBML01${i}`)));
    render(<ListaProdutos cat="movel" estilo={{ cores: ["branco"], porCategoria: {} }} limite={3} onEscolher={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "AXIS Suspenso 2 Gav Fundo Reduzido" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(procura.chamadas).toEqual([{ q: "AXIS Suspenso 2 Gav Fundo Reduzido", pagina: 1 }]);
    expect(screen.getByText(/6 resultados .*Há mais no catálogo\./)).toBeTruthy();
    // primeiro mostra os carregados todos; depois pede ao servidor
    fireEvent.click(screen.getByRole("button", { name: "Ver mais 3" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ver mais do catálogo" })); await vi.runAllTimersAsync(); });
    expect(procura.chamadas.at(-1)).toEqual({ q: "AXIS Suspenso 2 Gav Fundo Reduzido", pagina: 2 });
    const nomes = screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent ?? "").filter((t) => t.startsWith("Móvel"));
    expect(nomes[0]).toContain("c/lavatório");
    // sem mais páginas, o botão sai
    expect(screen.queryByRole("button", { name: "Ver mais do catálogo" })).toBeNull();
  });
});
