import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoasRh from "./PessoasRh";

const renderLista = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/rh-exemplo/pessoas"]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeAll(() => {
  // O Radix Select precisa de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
});

const painel = () => screen.getByRole("dialog");

function abrirNovaPessoa() {
  renderLista();
  fireEvent.click(screen.getByRole("button", { name: "Nova pessoa" }));
  return painel();
}

/** Abre o seletor com o teclado e escolhe a opção com esse nome. */
function escolher(rotulo: RegExp | string, opcao: RegExp | string) {
  const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
  fireEvent.keyDown(gatilho, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

describe("RH de exemplo: Nova pessoa em painel lateral", () => {
  it("abre o painel com migalhas, selo, três abas e o rodapé com um só botão primário", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getByRole("navigation", { name: "Onde está" })).toHaveTextContent("Recursos Humanos");
    expect(within(nova).getByRole("heading", { name: "Nova pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(nova).getAllByRole("tab").map((a) => a.textContent)).toEqual(["Dados pessoais", "Contrato e local", "Acesso"]);
    expect(within(nova).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(nova).getByRole("button", { name: "Criar pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText(/nada fica gravado/)).toBeInTheDocument();
  });

  it("o foco inicial vai para o nome", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getByLabelText(/^Nome/)).toHaveFocus();
  });

  it("criar vazio mostra os erros por campo ligados por aria-describedby, conta-os por aba e leva o foco ao primeiro", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Criar pessoa" }));
    const nome = within(nova).getByLabelText(/^Nome/);
    expect(nome).toHaveAttribute("aria-invalid", "true");
    const erro = document.getElementById(nome.getAttribute("aria-describedby") ?? "");
    expect(erro).toHaveTextContent("Obrigatório.");
    expect(nome).toHaveFocus();
    expect(within(nova).getByRole("status")).toHaveTextContent("4 campos por corrigir");
    const abas = within(nova).getAllByRole("tab");
    expect(abas[0]).toHaveTextContent("2 por corrigir");
    expect(abas[1]).toHaveTextContent("2 por corrigir");
    expect(abas[2]).not.toHaveTextContent("por corrigir");
  });

  it("um NIF com dígito de controlo errado dá erro no campo, e o certo não", () => {
    const nova = abrirNovaPessoa();
    const nif = within(nova).getByLabelText(/^NIF/);
    fireEvent.change(nif, { target: { value: "123456780" } });
    fireEvent.blur(nif);
    expect(nif).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(nif, { target: { value: "123456789" } });
    expect(nif).not.toHaveAttribute("aria-invalid");
  });

  it("Cancelar fecha o painel", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preenche, cria, a pessoa entra na lista e abre-se a ficha dela", async () => {
    const nova = abrirNovaPessoa();
    fireEvent.change(within(nova).getByLabelText(/^Nome/), { target: { value: "Teresa" } });
    fireEvent.change(within(nova).getByLabelText(/^Apelido/), { target: { value: "Nogueira" } });
    fireEvent.change(within(nova).getByLabelText(/^NIF/), { target: { value: "123456789" } });
    fireEvent.mouseDown(within(nova).getByRole("tab", { name: /Contrato e local/ }), { button: 0 });
    escolher(/Centro de trabalho/, /Sede/);
    escolher(/^Cargo/, /Vendedor/);
    fireEvent.click(within(painel()).getByRole("button", { name: "Criar pessoa" }));
    const titulo = await screen.findByRole("heading", { level: 1, name: "Teresa Nogueira" });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]');
    expect(ficha).not.toBeNull();
    expect(within(ficha as HTMLElement).getAllByRole("tab")).toHaveLength(7);
    expect(within(ficha as HTMLElement).getByText(/^.+ · Vendedor\/a$/)).toBeInTheDocument();
  });
});
