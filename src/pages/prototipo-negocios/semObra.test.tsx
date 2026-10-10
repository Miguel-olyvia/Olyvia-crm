// A obra é um fluxo posterior (Operações): não entra na página Pessoas. Este teste percorre a lista e a ficha de todas as pessoas,
// em todos os separadores e em todos os negócios, e garante que a palavra "obra" não aparece em nenhum texto (nem nos rótulos acessíveis).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { todosApp } from "./pessoasDocs";

const original = window.matchMedia;
beforeEach(() => {
  esquecerPessoas();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); window.matchMedia = original; });

/** Todo o texto que se lê ou ouve: o texto dos elementos e os rótulos acessíveis. */
const texto = (): string => [document.body.textContent ?? "", ...[...document.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? "")].join("\n");
const OBRA = /obra/i;

describe("Pessoas · sem obra", () => {
  it("a lista de todas as pessoas, em tabela e em cartões, não fala de obra", async () => {
    const S = seed();
    const run = (fn: () => void) => fn();
    const props = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn), q: "", repor: vi.fn() };
    const { unmount } = render(<PessoasSimples {...props} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 });
    await screen.findByRole("table");
    expect(texto()).not.toMatch(OBRA);
    unmount();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
    render(<PessoasSimples {...props} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 });
    await screen.findByRole("list", { name: "Todos" });
    expect(texto()).not.toMatch(OBRA);
  });

  it("a ficha das 11 pessoas (etapas, subtítulo, resumo, negócios, entradas, atividade, contratos e documentos) não fala de obra", async () => {
    const S = seed();
    const run = (fn: () => void) => fn();
    render(<PessoasSimples S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Todos/ }), { button: 0 });
    const nomes = todosApp(S).map((p) => p.nome);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(nomes[0]) }));
    const painel = await screen.findByRole("dialog");
    for (const [i, nome] of nomes.entries()) {
      await within(painel).findByRole("heading", { name: nome });
      for (const sep of within(painel).getAllByRole("tab")) {
        fireEvent.mouseDown(sep, { button: 0 });
        for (const linha of within(painel).queryAllByRole("button", { pressed: false })) if (linha.closest("ul[aria-label='Negócios desta pessoa']")) fireEvent.click(linha);
        expect(texto(), `${nome} · ${sep.textContent}`).not.toMatch(OBRA);
      }
      if (i < nomes.length - 1) {
        fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: / }));
        await waitFor(() => expect(within(painel).getByRole("heading", { name: nomes[i + 1] })).toBeInTheDocument());
      }
    }
  });
});
