import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { MarketingV2 } from "./MarketingV2";
import { esquecerCampanhas } from "./campanhasStore";

afterEach(() => { cleanup(); esquecerCampanhas(); });

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  return render(<MarketingV2 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
}
const linhas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const primarios = (c: HTMLElement) => [...c.querySelectorAll("button")].filter((b) => /\bbg-primary\b/.test(b.className));

describe("MarketingV2 · a lista", () => {
  it("uma linha por campanha, ordenada por ganhos (aria-sort descendente), com canal, leads, ganhos, receita e custos", () => {
    pagina();
    expect(linhas()).toHaveLength(8);
    expect(screen.getByRole("columnheader", { name: /Ganhos/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Receita/ })).toHaveAttribute("aria-sort", "none");
    const coz = linhas().find((r) => within(r).queryByText("Cozinhas outubro"))!;
    expect(within(coz).getByText(/Redes sociais pagas/)).toBeInTheDocument();
    expect(within(coz).getByText("1.130 €")).toBeInTheDocument();
    expect(within(coz).getByText(/2 por rever/)).toBeInTheDocument();
  });
  it("o cabeçalho ordena e a pesquisa filtra", () => {
    pagina();
    fireEvent.click(within(screen.getByRole("columnheader", { name: /Campanha/ })).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: /Campanha/ })).toHaveAttribute("aria-sort", "ascending");
    expect(within(linhas()[0]).getByText("Casa de banho outubro")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar campanha" }), { target: { value: "outdoor" } });
    expect(linhas()).toHaveLength(1);
  });
  it("só há um botão primário na lista; a lead da UTM por mapear aparece como 'sem campanha'", () => {
    const { container } = pagina();
    expect(primarios(container).map((b) => b.textContent)).toEqual(["Nova campanha"]);
    expect(screen.getByText(/Sem campanha: Ana Martins/)).toBeInTheDocument();
  });
});

describe("MarketingV2 · nova campanha na página (sem modal) e a página da campanha", () => {
  it("nome, canal e modelo em chips, criar abre a página da campanha com o formulário do modelo", () => {
    const { container } = pagina();
    fireEvent.click(screen.getByRole("button", { name: /Nova campanha/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Cozinhas novembro" } });
    fireEvent.click(screen.getByRole("radio", { name: "Pesquisa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Marcar visita" }));
    expect(primarios(container)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Criar e abrir a campanha" }));
    expect(screen.getByRole("heading", { level: 1, name: "Cozinhas novembro" })).toBeInTheDocument();
    const campos = screen.getByRole("list", { name: "Campos do formulário" });
    expect(within(campos).getAllByRole("listitem").map((li) => li.querySelector("span")!.textContent)).toEqual(["Nome", "Telefone", "Morada", "Dia preferido", "Período"]);
    fireEvent.click(screen.getByRole("button", { name: "Campanhas" }));
    expect(linhas()).toHaveLength(9);
  });
  it("sem canal não cria e diz porquê", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Nova campanha/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar e abrir a campanha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha o canal.");
    expect(screen.queryByRole("heading", { level: 1, name: "X" })).toBeNull();
  });
  it("a página tem as cinco secções sem separadores, o funil e um só primário (Copiar)", () => {
    const { container } = pagina();
    fireEvent.click(screen.getByRole("button", { name: /Cozinhas outubro/ }));
    for (const s of ["Resumo", "Formulário", "Onde anuncia", "Leads", "Partilhar"]) expect(screen.getByRole("heading", { level: 2, name: s })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("list", { name: "Funil" })).toBeInTheDocument();
    expect(primarios(container).map((b) => b.textContent)).toEqual(["Copiar"]);
    const leads = screen.getByRole("list", { name: "Leads de Cozinhas outubro" });
    expect(within(leads).getAllByRole("listitem")).toHaveLength(3);
  });
  it("as submissões por rever: Aceitar junta a pessoa às leads, Rejeitar tira-a, e o aviso desaparece", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Cozinhas outubro/ }));
    expect(screen.getByRole("heading", { name: "2 submissões por rever" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar Sofia Barata" }));
    expect(within(screen.getByRole("list", { name: "Leads de Cozinhas outubro" })).getByText("Sofia Barata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rejeitar teste teste" }));
    expect(screen.queryByRole("heading", { name: /por rever/ })).toBeNull();
  });
  it("o formulário edita-se na linha: juntar, tirar, subir e obrigatório", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Outdoor A1/ }));
    const lista = () => within(screen.getByRole("list", { name: "Campos do formulário" })).getAllByRole("listitem").map((li) => li.querySelector("span")!.textContent);
    expect(lista()).toEqual(["Nome", "Telefone", "Mensagem"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Juntar campo" }), { target: { value: "Email" } });
    fireEvent.click(screen.getByRole("button", { name: "Juntar" }));
    expect(lista()).toEqual(["Nome", "Telefone", "Mensagem", "Email"]);
    fireEvent.click(screen.getByRole("button", { name: 'Subir "Email"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Tirar "Mensagem"' }));
    expect(lista()).toEqual(["Nome", "Telefone", "Email"]);
    const obrig = within(screen.getByRole("list", { name: "Campos do formulário" }).children[2] as HTMLElement).getByRole("checkbox", { name: "Obrigatório" });
    fireEvent.click(obrig);
    expect(obrig).toBeChecked();
  });
  it("onde anuncia: juntar um anúncio e mudar o investimento muda o investimento do resumo", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Recomendações/ }));
    fireEvent.click(screen.getByRole("button", { name: "Influencer" }));
    const inv = screen.getByRole("spinbutton", { name: /Investimento/ });
    fireEvent.change(inv, { target: { value: "300" } });
    fireEvent.blur(inv);
    const resumo = screen.getByRole("region", { name: "Resumo" });
    const valor = (r: string) => within(resumo).getByText(r).nextElementSibling;
    expect(valor("Investimento")).toHaveTextContent("300 €");
    expect(valor("Custo por lead")).toHaveTextContent("100 €"); // 300 € / 3 leads
  });
});
