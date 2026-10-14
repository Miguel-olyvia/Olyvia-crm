import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";

const renderEm = (endereco: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
          <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("RH de exemplo: lista de pessoas", () => {
  it("abre, mostra o selo, os totais e as pessoas de exemplo", () => {
    renderEm("/rh-exemplo/pessoas");
    expect(screen.getByText("Dados de exemplo")).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + 13);
    expect(within(tabela).getByText("Marta Figueiredo")).toBeInTheDocument();
    expect(within(tabela).getByText("Rui Amaral")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("filtra pela pesquisa", () => {
    renderEm("/rh-exemplo/pessoas");
    const campo = screen.getByRole("textbox");
    fireEvent.change(campo, { target: { value: "Beatriz" } });
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(2);
    expect(within(tabela).getByText("Beatriz Lopes")).toBeInTheDocument();
  });
});

describe("RH de exemplo: ficha da pessoa", () => {
  it("abre com o nome e as sete abas, e muda de aba", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    expect(screen.getByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
    const abas = screen.getAllByRole("tab");
    expect(abas.length).toBeGreaterThanOrEqual(7);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(abas[3], { button: 0 });
    expect(screen.getAllByRole("tab")[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(abas[4], { button: 0 });
    expect(screen.getAllByRole("tab")[4]).toHaveAttribute("aria-selected", "true");
  });

  it("uma pessoa que não existe mostra o aviso de não encontrada", () => {
    renderEm("/rh-exemplo/pessoas/nao-existe");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
