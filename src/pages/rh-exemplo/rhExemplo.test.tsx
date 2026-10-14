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
    const campo = screen.getByRole("searchbox");
    fireEvent.change(campo, { target: { value: "Beatriz" } });
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(2);
    expect(within(tabela).getByText("Beatriz Lopes")).toBeInTheDocument();
  });
});

describe("RH de exemplo: ficha da pessoa (painel lateral)", () => {
  it("a ligação direta abre a lista com a ficha em painel, com o nome, a linha Filial · Cargo e as sete abas", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByRole("heading", { level: 1, name: /Rui Amaral/ })).toBeInTheDocument();
    expect(within(ficha).getByText("Filial Lisboa · Gerente de Loja")).toBeInTheDocument();
    const abas = within(ficha).getAllByRole("tab");
    expect(abas).toHaveLength(7);
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
  });

  it("muda de aba dentro do painel", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const abas = within(screen.getByRole("dialog")).getAllByRole("tab");
    fireEvent.mouseDown(abas[3], { button: 0 });
    expect(within(screen.getByRole("dialog")).getAllByRole("tab")[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(abas[4], { button: 0 });
    expect(within(screen.getByRole("dialog")).getAllByRole("tab")[4]).toHaveAttribute("aria-selected", "true");
  });

  it("um clique numa linha da lista abre a ficha dessa pessoa por cima da lista", () => {
    renderEm("/rh-exemplo/pessoas");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("table")).getByText("Beatriz Lopes"));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 1, name: /Beatriz Lopes/ })).toBeInTheDocument();
  });

  it("anterior e seguinte passam à pessoa vizinha e mostram n de N; Fechar fecha o painel", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = () => screen.getByRole("dialog");
    expect(within(ficha()).getByText(/^\d+ de 13$/)).toBeInTheDocument();
    const antes = within(ficha()).getByRole("heading", { level: 1 }).textContent;
    const seguinte = within(ficha()).getByRole("button", { name: "Pessoa seguinte" });
    const anterior = within(ficha()).getByRole("button", { name: "Pessoa anterior" });
    fireEvent.click(seguinte.hasAttribute("disabled") ? anterior : seguinte);
    expect(within(ficha()).getByRole("heading", { level: 1 }).textContent).not.toBe(antes);
    fireEvent.click(within(ficha()).getByRole("button", { name: "Fechar a ficha" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a tecla ] passa à pessoa seguinte", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const antes = within(screen.getByRole("dialog")).getByRole("heading", { level: 1 }).textContent;
    const primeiro = within(screen.getByRole("dialog")).getByRole("button", { name: "Pessoa anterior" }).hasAttribute("disabled");
    fireEvent.keyDown(document.body, { key: primeiro ? "]" : "[" });
    expect(within(screen.getByRole("dialog")).getByRole("heading", { level: 1 }).textContent).not.toBe(antes);
  });

  it("tem um só botão primário no cabeçalho: Criar acesso, a quem ainda não tem conta", () => {
    renderEm("/rh-exemplo/pessoas/p-rui");
    const ficha = screen.getByRole("dialog");
    const criar = within(ficha).queryByRole("button", { name: /Criar acesso/ });
    const mais = within(ficha).getByRole("button", { name: "Mais ações desta pessoa" });
    expect(mais).toBeInTheDocument();
    if (criar) expect(within(ficha).getAllByRole("button", { name: /Criar acesso/ })).toHaveLength(1);
  });

  it("uma pessoa que não existe abre o painel com o aviso de não encontrada", () => {
    renderEm("/rh-exemplo/pessoas/nao-existe");
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(within(ficha).getByText("Esta pessoa não existe (ou já não existe).")).toBeInTheDocument();
  });
});
