// Testes de arranque dos fluxos que mudam dados EM MEMÓRIA nas páginas Pessoas e Negócio e metas: cada botão abre o que
// tem de abrir, cria ou atualiza, e o resultado aparece na lista, na ficha e no quadro. Nenhum botão fica só com um aviso.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import Pessoas from "./Pessoas";
import { alteracoesAtuais, repor as reporAlteracoes } from "@/components/negocio-metas/negociosAlterados";
import { negociosNovos, repor as reporNegocios } from "@/components/negocio-metas/negociosNovos";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { faseDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { registarLead, repor as reporPessoas } from "@/components/pessoas/pessoasNovas";
import { criarNegocioNovo } from "@/components/negocio-metas/negociosNovos";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, "sidebar.crm": "CRM" };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const aplicacao = (endereco: string) => (
  <MemoryRouter initialEntries={[endereco]}>
    <Routes>
      <Route path="/pessoas" element={<Pessoas />} />
      <Route path="/negocio-metas" element={<NegocioMetas />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => window.localStorage.clear());
afterEach(() => { reporPessoas(); reporNegocios(); reporAlteracoes(); });

/** O botão "Mais" da ficha abre com o teclado (o menu do Radix não abre com um clique simulado). */
const abrirMenuMais = (ficha: HTMLElement) => fireEvent.keyDown(within(ficha).getByRole("button", { name: "Mais" }), { key: "Enter" });

describe("Pessoas: Nova lead", () => {
  it("abre o painel, cria a pessoa em Por contactar e abre-lhe a ficha", async () => {
    render(aplicacao("/pessoas"));
    expect(screen.getByText("34 pessoas · 15 clientes · 13 sem negócio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nova lead" }));
    const painel = await screen.findByRole("dialog", { name: "Nova lead" });
    fireEvent.change(within(painel).getByLabelText(/^Nome/), { target: { value: "Teresa Lobo" } });
    fireEvent.change(within(painel).getByLabelText("Telefone"), { target: { value: "912 345 678" } });
    fireEvent.change(within(painel).getByLabelText("Localidade"), { target: { value: "Sintra" } });
    fireEvent.change(within(painel).getByLabelText("Nota"), { target: { value: "Ligar depois das 18h" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar lead" }));
    expect(await screen.findByRole("heading", { name: "Teresa Lobo", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Lead · Por contactar · Sintra/)).toBeInTheDocument();
    expect(screen.getByText("35 pessoas · 15 clientes · 14 sem negócio")).toBeInTheDocument();
    // A atividade da lead nova: a criação e a nota escrita no painel.
    expect(screen.getByRole("tab", { name: /Atividade/ })).toHaveTextContent("2");
  });

  it("sem o nome não cria nada e diz o que falta", async () => {
    render(aplicacao("/pessoas"));
    fireEvent.click(screen.getByRole("button", { name: "Nova lead" }));
    const painel = await screen.findByRole("dialog", { name: "Nova lead" });
    fireEvent.change(within(painel).getByLabelText("Email"), { target: { value: "sem-arroba" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar lead" }));
    expect(within(painel).getByText("Escreva o nome.")).toBeInTheDocument();
    expect(within(painel).getByText(/não parece válido/)).toBeInTheDocument();
    expect(screen.getByText("34 pessoas · 15 clientes · 13 sem negócio")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("Pessoas: Criar negócio a partir da ficha", () => {
  it("abre o painel Novo negócio com a pessoa escolhida; ao criar, o negócio aparece na ficha e no quadro", async () => {
    render(aplicacao("/pessoas?open=p-beatriz"));
    const ficha = screen.getByRole("dialog");
    abrirMenuMais(ficha);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Criar negócio" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    expect(within(painel).getByRole("combobox", { name: /Pessoa/ })).toHaveTextContent("Beatriz Sampaio");
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ pessoaId: "p-beatriz", pessoa: "Beatriz Sampaio" });
    const abaNegocios = await screen.findByRole("tab", { name: /Negócios/ });
    expect(abaNegocios).toHaveAttribute("aria-selected", "true");
    expect(abaNegocios).toHaveTextContent("1");
  });
});

describe("Pessoas: Marcar visita numa submissão", () => {
  it("abre o diálogo, marca a visita e o botão passa a dizer que já está marcada", async () => {
    render(aplicacao("/pessoas?separador=submissoes"));
    fireEvent.click(screen.getByRole("button", { name: /^Marcar visita para/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    expect(within(dialogo).getByText("Escolha o dia da visita.")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    expect(await screen.findByText("Já tem uma visita marcada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Marcar visita para/ })).not.toBeInTheDocument();
  });
});

describe("Negócio e metas: orçamento e mudança de passo", () => {
  const porFase = (fase: string, estado?: string) =>
    DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === fase && (estado === undefined || n.proposta?.estado === estado))!;

  /** Abre o painel do negócio pelo cartão (o quadro mostra só "os meus" por omissão, por isso passa a Todos). */
  const abrirPainel = (negocio: NegocioMes) => {
    render(aplicacao("/negocio-metas"));
    fireEvent.click(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: "Todos" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${negocio.pessoa} · `) }));
    return screen.getByRole("dialog", { name: negocio.pessoa });
  };

  it("Criar orçamento abre o diálogo, valida o valor e acrescenta o orçamento ao negócio", async () => {
    const negocio = porFase("orcamento");
    const painel = abrirPainel(negocio);
    fireEvent.click(within(within(painel).getByRole("group", { name: "Ações do negócio" })).getByRole("button", { name: "Criar orçamento" }));
    const dialogo = await screen.findByRole("dialog", { name: "Criar orçamento" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar orçamento" }));
    expect(within(dialogo).getByText("Escreva o valor do orçamento.")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Valor (€)"), { target: { value: "1 234,5" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar orçamento" }));
    const editado = alteracoesAtuais().editados[negocio.id];
    expect(editado.orcamentos).toHaveLength(negocio.orcamentos.length + 1);
    expect(editado.orcamentos.at(-1)).toMatchObject({ id: "o-novo-1", valor: 1234.5, escolhido: true });
    expect(screen.queryByRole("dialog", { name: "Criar orçamento" })).not.toBeInTheDocument();
  });

  it("Proposta aceite pergunta o que fazer (como manda o Workflow) e passa o negócio a Contrato", async () => {
    const negocio = porFase("proposta", "enviada");
    const painel = abrirPainel(negocio);
    fireEvent.click(within(painel).getByRole("button", { name: "Proposta aceite" }));
    const dialogo = await screen.findByRole("dialog", { name: "Proposta aceite" });
    expect(within(dialogo).getByText("O que fazer a seguir?")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
    const editado = alteracoesAtuais().editados[negocio.id];
    expect(faseDoNegocio(editado)).toBe("contrato");
    expect(editado.contrato).toEqual({ estado: "pendente" });
    expect(screen.queryByRole("dialog", { name: "Proposta aceite" })).not.toBeInTheDocument();
  });

  it("Proposta recusada perde o negócio: pede o motivo e o negócio sai do quadro", async () => {
    const negocio = porFase("proposta", "enviada");
    const painel = abrirPainel(negocio);
    fireEvent.click(within(painel).getByRole("button", { name: "Proposta recusada" }));
    const dialogo = await screen.findByRole("dialog", { name: "Proposta recusada" });
    fireEvent.change(within(dialogo).getByLabelText("Motivo da perda"), { target: { value: "Concorrência" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
    expect(alteracoesAtuais().perdidos[negocio.id]).toMatchObject({ motivo: "Concorrência", mes: "2026-10", fase: "proposta" });
    expect(screen.queryByRole("button", { name: new RegExp(`^${negocio.pessoa} · `) })).not.toBeInTheDocument();
  });
});

describe("Abrir pessoa a partir de um negócio", () => {
  it("leva à ficha da pessoa, também a de uma lead criada nesta sessão", async () => {
    const lead = registarLead(
      { nome: "Teresa Lobo", telefone: "", email: "", localidade: "", origem: "telefone", formulario: "", comercial: "Ana Ribeiro", nota: "" },
      HOJE_EXEMPLO,
    ).pessoa;
    const negocio = criarNegocioNovo({ pessoa: { id: lead.id, nome: lead.nome }, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO);
    render(aplicacao(`/negocio-metas?open=${negocio.id}`));
    const painel = screen.getByRole("dialog", { name: "Teresa Lobo" });
    fireEvent.click(within(painel).getByRole("link", { name: "Abrir pessoa" }));
    expect(await screen.findByRole("heading", { name: "Teresa Lobo", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Negócios/ })).toHaveTextContent("1");
  });

  it("o negócio criado em Pessoas já aparece no quadro de Negócio e metas", () => {
    const negocio = criarNegocioNovo({ pessoa: { id: "p-beatriz", nome: "Beatriz Sampaio" }, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO);
    render(aplicacao(`/negocio-metas?open=${negocio.id}`));
    expect(screen.getByRole("dialog", { name: "Beatriz Sampaio" })).toBeInTheDocument();
  });
});
