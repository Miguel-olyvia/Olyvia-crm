// 17/11: o botão da Olyvia por comando — escrever a frase navega para o sítio certo e a pesquisa dispara o evento do quadro.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EVENTO_PESQUISA, OlyviaComando } from "./OlyviaComando";
import { EV_ABRIR, EV_PASSO, responderOlyvia } from "./comandoOlyvia";

afterEach(cleanup);

function Local() { const l = useLocation(); return <div data-testid="loc">{l.pathname}{l.search}</div>; }
const montar = (inicio = "/negocios") => render(<MemoryRouter initialEntries={[inicio]}><OlyviaComando /><Local /></MemoryRouter>);
const loc = () => screen.getByTestId("loc").textContent;
const escrever = (frase: string) => {
  fireEvent.click(screen.getByRole("button", { name: /Olyvia/ }));
  fireEvent.change(screen.getByLabelText("Comando"), { target: { value: frase } });
  fireEvent.submit(screen.getByLabelText("Comando").closest("form")!);
};

describe("a Olyvia por comando (botão flutuante)", () => {
  it("escrever «vai ao catálogo» navega para o Catálogo e custos", () => {
    montar();
    escrever("vai ao catálogo");
    expect(loc()).toBe("/catalogo-custos");
  });

  it("«mostra o dia de hoje» leva ao Hoje", () => {
    montar();
    escrever("mostra o dia de hoje");
    expect(loc()).toBe("/negocios?vista=hoje");
  });

  it("«abre as pessoas» leva às Pessoas", () => {
    montar();
    escrever("abre as pessoas");
    expect(loc()).toBe("/pessoas");
  });

  it("«procura o Nuno» abre os Negócios e dispara o evento da pesquisa com o termo", () => {
    montar("/pessoas");
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_PESQUISA, (e) => ouvinte((e as CustomEvent<string>).detail));
    vi.useFakeTimers();
    escrever("procura o Nuno Pereira");
    expect(loc()).toBe("/negocios");
    vi.runAllTimers();
    vi.useRealTimers();
    expect(ouvinte).toHaveBeenCalledWith("nuno pereira");
  });

  it("«abre o Ruben Branco na fase de negócio» vai aos Negócios e pede para abrir esse negócio na fase 3", () => {
    montar("/pessoas");
    const pedidos: unknown[] = [];
    const h = (e: Event) => pedidos.push((e as CustomEvent).detail);
    window.addEventListener(EV_ABRIR, h);
    vi.useFakeTimers();
    escrever("abre o Ruben Branco na fase de negócio");
    expect(loc()).toBe("/negocios");
    vi.runAllTimers();
    vi.useRealTimers();
    window.removeEventListener(EV_ABRIR, h);
    expect(pedidos).toEqual([{ nome: "ruben branco", fase: 3 }]);
  });

  it("«vai para o fim» sem negócio aberto avisa; com negócio aberto pede o passo «fim»", () => {
    montar("/negocios");
    escrever("vai para o fim");
    expect(screen.getByRole("status").textContent).toMatch(/Abre primeiro um negócio/);
    cleanup();
    montar("/negocios?negocio=1020");
    const passos: unknown[] = [];
    const h = (e: Event) => passos.push((e as CustomEvent).detail);
    window.addEventListener(EV_PASSO, h);
    escrever("vai para o fim");
    window.removeEventListener(EV_PASSO, h);
    expect(passos).toEqual([{ passo: "fim" }]);
  });

  it("mostra a resposta da página que cumpriu («A abrir Ruben Branco · Negócio.»)", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Olyvia/ }));
    act(() => responderOlyvia("A abrir Ruben Branco · Negócio."));
    expect(screen.getByRole("status").textContent).toBe("A abrir Ruben Branco · Negócio.");
  });

  it("não aparece nas páginas públicas (login)", () => {
    montar("/auth");
    expect(screen.queryByRole("button", { name: /Olyvia/ })).toBeNull();
  });
});
