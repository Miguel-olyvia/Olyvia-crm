// O nome da linha da Lista real passa a botão que abre a ficha (só quando a página dá `aoAbrir`).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { pessoaLista } from "./fabricaLista";
import { LinhaListaReal } from "./LinhaListaReal";
import { TabelaListaReal } from "./TabelaListaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

function desenhar(aoAbrir?: (id: string) => void, nome = "Ana Lopes") {
  render(
    <MemoryRouter>
      <table><tbody><LinhaListaReal pessoa={pessoaLista("p1", { nome })} aoAbrir={aoAbrir} /></tbody></table>
    </MemoryRouter>,
  );
}

describe("LinhaListaReal com aoAbrir", () => {
  it("o nome é um botão dentro do cabeçalho da linha, que continua a ser o rowheader", () => {
    desenhar(vi.fn());
    const cabecalho = screen.getByRole("rowheader");
    expect(cabecalho).toHaveAttribute("scope", "row");
    expect(within(cabecalho).getByRole("button", { name: "Ana Lopes" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell")).toHaveLength(5);
  });

  it("anuncia que abre um diálogo, leva o id da pessoa e tem área de toque de 44 px", () => {
    desenhar(vi.fn());
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");
    // Atributo próprio: o data-pessoa-id fica só na linha (não há dois elementos com o mesmo).
    expect(botao).toHaveAttribute("data-abrir-pessoa", "p1");
    expect(botao).not.toHaveAttribute("data-pessoa-id");
    expect(document.querySelectorAll('[data-pessoa-id="p1"]')).toHaveLength(1);
    expect(botao).toHaveAttribute("type", "button");
    expect(botao.className).toContain("min-h-11");
  });

  it("clicar chama aoAbrir com o id da pessoa e o botão que se clicou (a origem do foco)", () => {
    const aoAbrir = vi.fn();
    desenhar(aoAbrir);
    const botao = screen.getByRole("button", { name: "Ana Lopes" });
    fireEvent.click(botao);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("p1", botao);
  });

  it("uma pessoa sem nome continua a abrir, com «Sem nome» como nome do botão", () => {
    const aoAbrir = vi.fn();
    desenhar(aoAbrir, "");
    fireEvent.click(screen.getByRole("button", { name: "Sem nome" }));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("p1", expect.any(HTMLElement));
  });

  it("o selo de encerrada não entra no nome do botão", () => {
    render(
      <MemoryRouter>
        <table><tbody><LinhaListaReal pessoa={pessoaLista("p1", { nome: "Ana Lopes", encerrada: "semInteresse" })} aoAbrir={vi.fn()} /></tbody></table>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Ana Lopes" })).toBeInTheDocument();
    expect(screen.getByText("Encerrada · Sem interesse")).toBeInTheDocument();
  });
});

describe("LinhaListaReal sem aoAbrir", () => {
  it("o nome fica texto simples, como no P1", () => {
    desenhar(undefined);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Ana Lopes")).toBeInTheDocument();
  });
});

describe("TabelaListaReal passa aoAbrir às linhas", () => {
  it("clicar no nome de uma linha chama aoAbrir com o id dessa pessoa", () => {
    const aoAbrir = vi.fn();
    render(
      <MemoryRouter>
        <TabelaListaReal linhas={[pessoaLista("a", { nome: "Ana" }), pessoaLista("b", { nome: "Bruno" })]} ocupada={false} aoAbrir={aoAbrir} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bruno" }));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("b", expect.any(HTMLElement));
  });
});
