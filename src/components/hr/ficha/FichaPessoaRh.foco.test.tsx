/**
 * O foco da ficha em painel (acessibilidade):
 *  - ao abrir, enquanto a ficha carrega, o foco fica no próprio painel (nunca se perde para trás do diálogo) e, quando a
 *    ficha chega, passa para o título;
 *  - ao passar à pessoa seguinte ou anterior (botões, setas ou teclas), o foco não cai para o corpo da página enquanto a
 *    outra ficha carrega e, quando ela chega, volta ao mesmo botão;
 *  - [ e ] são atalhos de UM carácter (WCAG 2.1.4): só funcionam com o foco dentro do cabeçalho da ficha.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

// Uma ficha que "chega" quando o teste o diz: enquanto não chega, só mostra o carregamento (sem nada focável).
const chegadas = new Set<string>();
const ouvintes = new Set<() => void>();
const chegar = (id: string) => act(() => { chegadas.add(id); ouvintes.forEach((o) => o()); });
const subscrever = (o: () => void) => { ouvintes.add(o); return () => ouvintes.delete(o); };

vi.mock("./ConteudoFichaRh", () => ({
  ConteudoFichaRh: (p: { id: string; aoIr: (id: string, qual: "anterior" | "seguinte") => void; vizinhas: { anterior: string | null; seguinte: string | null }; aoPronta?: () => void }) => {
    const pronta = useSyncExternalStore(subscrever, () => chegadas.has(p.id));
    useEffect(() => { if (pronta) p.aoPronta?.(); }, [pronta]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!pronta) return <p role="status">a carregar {p.id}</p>;
    return (
      <>
        <header data-cabecalho-ficha="">
          <h2 tabIndex={-1} data-titulo-ficha="">Pessoa {p.id}</h2>
          <button type="button" data-seta="anterior" disabled={p.vizinhas.anterior === null} onClick={() => p.vizinhas.anterior && p.aoIr(p.vizinhas.anterior, "anterior")}>anterior</button>
          <button type="button" data-seta="seguinte" disabled={p.vizinhas.seguinte === null} onClick={() => p.vizinhas.seguinte && p.aoIr(p.vizinhas.seguinte, "seguinte")}>seguinte</button>
        </header>
        <div role="tablist"><button type="button" role="tab" aria-selected="true">Aba</button></div>
        <p data-testid="corpo" tabIndex={0}>conteúdo</p>
      </>
    );
  },
}));

import { FichaPessoaRh } from "./FichaPessoaRh";

function Pagina({ inicial = "p2" }: { inicial?: string }) {
  const [id, setId] = useState(inicial);
  return (
    <>
      <button type="button">linha-da-lista</button>
      <FichaPessoaRh
        id={id} aberta aoFechar={vi.fn()} idsVisiveis={["p1", "p2", "p3"]} aoIrPara={setId}
        aba="visaoGeral" aoMudarAba={vi.fn()} colegas={[]}
      />
    </>
  );
}

const painel = () => screen.getByRole("dialog");
const titulo = () => document.querySelector<HTMLElement>("[data-titulo-ficha]");
const seta = (qual: string) => document.querySelector<HTMLElement>(`[data-seta="${qual}"]`) as HTMLElement;

beforeEach(() => chegadas.clear());

describe("FichaPessoaRh: o foco ao abrir", () => {
  it("enquanto a ficha carrega, o foco fica no painel (que aceita foco) e não se perde", async () => {
    render(<Pagina />);
    await waitFor(() => expect(painel()).toHaveFocus());
    expect(painel()).toHaveAttribute("tabindex", "-1");
  });

  it("quando a ficha chega, o foco passa para o título", async () => {
    render(<Pagina />);
    await waitFor(() => expect(painel()).toHaveFocus());
    chegar("p2");
    await waitFor(() => expect(titulo()).toHaveFocus());
  });
});

describe("FichaPessoaRh: o foco ao passar a outra pessoa", () => {
  async function abrirNoMeio() {
    render(<Pagina />);
    chegar("p2");
    await waitFor(() => expect(titulo()).toHaveFocus());
  }

  it("com o botão seguinte: durante o carregamento o foco está no painel (não no corpo) e depois volta ao botão seguinte", async () => {
    await abrirNoMeio();
    seta("seguinte").focus();
    fireEvent.click(seta("seguinte"));
    expect(screen.getByText("a carregar p3")).toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(painel()).toHaveFocus();
    chegar("p3");
    await waitFor(() => expect(titulo()).toHaveTextContent("Pessoa p3"));
    // p3 é a última: «seguinte» está desativado, por isso o foco vai ao outro botão
    await waitFor(() => expect(seta("anterior")).toHaveFocus());
  });

  it("com o botão anterior, o foco volta ao botão anterior quando a ficha chega", async () => {
    await abrirNoMeio();
    fireEvent.click(seta("anterior"));
    expect(painel()).toHaveFocus();
    chegar("p1");
    // p1 é a primeira: «anterior» está desativado, por isso o foco vai ao seguinte
    await waitFor(() => expect(seta("seguinte")).toHaveFocus());
  });

  it("a ficha da outra pessoa só recebe o foco depois de carregar: antes disso não se foca um botão que ainda não existe", async () => {
    await abrirNoMeio();
    fireEvent.click(seta("seguinte"));
    expect(document.querySelector("[data-seta]")).toBeNull();
    expect(painel()).toHaveFocus();
  });
});

describe("FichaPessoaRh: [ e ] só funcionam com o foco no cabeçalho da ficha (WCAG 2.1.4)", () => {
  async function abrirNoMeio() {
    render(<Pagina />);
    chegar("p2");
    await waitFor(() => expect(titulo()).toHaveFocus());
  }

  it("com o foco no título do cabeçalho, ] passa à seguinte", async () => {
    await abrirNoMeio();
    fireEvent.keyDown(titulo() as HTMLElement, { key: "]" });
    expect(screen.getByText("a carregar p3")).toBeInTheDocument();
  });

  it("com o foco num botão do cabeçalho, [ passa à anterior", async () => {
    await abrirNoMeio();
    seta("seguinte").focus();
    fireEvent.keyDown(seta("seguinte"), { key: "[" });
    expect(screen.getByText("a carregar p1")).toBeInTheDocument();
  });

  it("com o foco no conteúdo ou nas abas, [ e ] não fazem nada (nem ficam presos: seguem para o campo)", async () => {
    await abrirNoMeio();
    for (const alvo of [screen.getByTestId("corpo"), screen.getByRole("tab")]) {
      alvo.focus();
      const evento = new KeyboardEvent("keydown", { key: "]", bubbles: true, cancelable: true });
      alvo.dispatchEvent(evento);
      expect(evento.defaultPrevented).toBe(false);
    }
    expect(screen.queryByText("a carregar p3")).not.toBeInTheDocument();
    expect(titulo()).toHaveTextContent("Pessoa p2");
  });

  it("com o foco no corpo da página (fora do painel) também não", async () => {
    await abrirNoMeio();
    fireEvent.keyDown(document.body, { key: "]" });
    expect(screen.queryByText("a carregar p3")).not.toBeInTheDocument();
  });
});
