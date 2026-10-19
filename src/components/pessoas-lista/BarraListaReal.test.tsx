import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BarraListaReal } from "./BarraListaReal";
import type { OrdemLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { EtapaPessoa, PapelPessoa } from "@/components/pessoas/pessoasTipos";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

interface Estado {
  pesquisa: string;
  papel: PapelPessoa | null;
  etapa: EtapaPessoa | null;
  ordem: OrdemLista;
}
const PADRAO: Estado = { pesquisa: "", papel: null, etapa: null, ordem: "recentes" };

function desenhar(estado: Partial<Estado> = {}) {
  const aoMudarPesquisa = vi.fn();
  const aoMudarPapel = vi.fn();
  const aoMudarEtapa = vi.fn();
  const aoMudarOrdem = vi.fn();
  render(
    <BarraListaReal
      {...PADRAO} {...estado} aoMudarPesquisa={aoMudarPesquisa} aoMudarPapel={aoMudarPapel}
      aoMudarEtapa={aoMudarEtapa} aoMudarOrdem={aoMudarOrdem}
    />,
  );
  return { aoMudarPesquisa, aoMudarPapel, aoMudarEtapa, aoMudarOrdem };
}

describe("BarraListaReal", () => {
  it("escrever na pesquisa chama aoMudarPesquisa com o texto", () => {
    const { aoMudarPesquisa } = desenhar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar pessoas por nome" }), { target: { value: "ana" } });
    expect(aoMudarPesquisa).toHaveBeenCalledWith("ana");
  });

  const DICA = "Pesquise por nome (mínimo 2 letras)";

  it("a dica está sempre visível e ligada ao campo por aria-describedby", () => {
    desenhar();
    const dica = screen.getByText(DICA);
    expect(screen.getByRole("searchbox").getAttribute("aria-describedby")).toBe(dica.id);
    expect(dica).not.toHaveAttribute("data-destacada");
  });

  it("com 1 caractere a dica destaca-se", () => {
    desenhar({ pesquisa: "a" });
    expect(screen.getByText(DICA)).toHaveAttribute("data-destacada", "true");
  });

  it.each(["", "an", "  "])("sem destaque com a pesquisa «%s»", (pesquisa) => {
    desenhar({ pesquisa });
    expect(screen.getByText(DICA)).not.toHaveAttribute("data-destacada");
  });

  it("o grupo das etapas tem o seu próprio rótulo", () => {
    desenhar();
    expect(screen.getByRole("group", { name: "Filtrar por etapa" })).toBeInTheDocument();
  });

  it.each([
    ["Todos", null],
    ["Leads", "lead"],
    ["Clientes", "cliente"],
  ])("o tipo «%s» pede o papel %s", (nome, papel) => {
    const { aoMudarPapel } = desenhar({ papel: papel === null ? "lead" : null });
    fireEvent.click(screen.getByRole("button", { name: nome }));
    expect(aoMudarPapel).toHaveBeenCalledWith(papel);
  });

  it("o tipo escolhido está aria-pressed", () => {
    desenhar({ papel: "cliente" });
    expect(screen.getByRole("button", { name: "Clientes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Leads" })).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["Todas", null],
    ["Por contactar", "nova"],
    ["Contacto", "emContacto"],
    ["Visita", "visitaMarcada"],
    ["Negócio", "qualificada"],
  ])("o chip «%s» pede a etapa %s", (nome, etapa) => {
    const { aoMudarEtapa } = desenhar({ etapa: etapa === null ? "nova" : null });
    fireEvent.click(screen.getByRole("button", { name: nome }));
    expect(aoMudarEtapa).toHaveBeenCalledWith(etapa);
  });

  it("os chips são as etapas atuais do protótipo e «Cliente» não é uma etapa (é o papel, no interruptor Todos, Leads e Clientes)", () => {
    desenhar();
    const grupo = within(screen.getByRole("group", { name: "Filtrar por etapa" }));
    expect(grupo.getAllByRole("button").map((b) => b.textContent)).toEqual(["Todas", "Por contactar", "Contacto", "Visita", "Negócio"]);
    expect(grupo.queryByRole("button", { name: "Cliente" })).toBeNull();
  });

  it("o chip ativo está aria-pressed", () => {
    desenhar({ etapa: "emContacto" });
    expect(screen.getByRole("button", { name: "Contacto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "false");
  });

  it("a ordem oferece só «Mais recentes» e «Nome» e muda para o valor certo", () => {
    const { aoMudarOrdem } = desenhar();
    const seletor = screen.getByRole("combobox", { name: "Ordenar por" });
    expect(Array.from(seletor.querySelectorAll("option")).map((o) => o.value)).toEqual(["recentes", "nome"]);
    fireEvent.change(seletor, { target: { value: "nome" } });
    expect(aoMudarOrdem).toHaveBeenCalledWith("nome");
  });

  it("não tem controlos que a Lista real ainda não suporta", () => {
    desenhar();
    for (const nome of [/Atrasadas/, /Perdidas/, /Só as minhas/, /Quadro/, /Nova lead/, /Urgência/, /Valor/]) {
      expect(screen.queryByText(nome)).toBeNull();
    }
  });
});
