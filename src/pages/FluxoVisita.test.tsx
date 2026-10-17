// Arranque da visita na ficha da pessoa: o Resumo mostra a "Próxima visita" (com a MORADA DA VISITA e se é igual à da lead),
// o botão do passo («Marcar a visita como feita», depois «Criar o negócio») abre os painéis já preenchidos com a visita do pedido, e
// criar o negócio troca o pedido pelo negócio. Tudo em memória.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Pessoas from "./Pessoas";
import { repor as reporAlteracoes } from "@/components/negocio-metas/negociosAlterados";
import { negociosNovos, repor as reporNegocios } from "@/components/negocio-metas/negociosNovos";
import { repor as reporPessoas } from "@/components/pessoas/pessoasNovas";

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

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => window.localStorage.clear());
afterEach(() => { reporPessoas(); reporNegocios(); reporAlteracoes(); });

const aplicacao = (endereco: string) => (
  <MemoryRouter initialEntries={[endereco]}>
    <Routes><Route path="/pessoas" element={<Pessoas />} /></Routes>
  </MemoryRouter>
);

const escolher = async (dialogo: HTMLElement, campo: RegExp | string, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};

describe("Ficha: Próxima visita no Resumo", () => {
  it("visita marcada com a morada igual à da lead: dia da semana, data, hora, morada e o chip, por cima do próximo passo", () => {
    render(aplicacao("/pessoas?open=p-rita"));
    const ficha = screen.getByRole("dialog");
    const visita = within(ficha).getByRole("heading", { name: /^Próxima visita · / }).closest("section")!;
    expect(within(visita).getByText("terça-feira, 13/10/2026 · 15:00")).toBeInTheDocument();
    expect(within(visita).getByText("Rua dos Combatentes 12, 2710-100 Sintra")).toBeInTheDocument();
    expect(within(visita).getByText("Igual à da lead")).toBeInTheDocument();
    const titulos = within(ficha).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos.indexOf("Próxima visita")).toBeLessThan(titulos.indexOf("Próximo passo e prazo"));
    // O passo remete para o bloco em vez de repetir o dia.
    expect(within(ficha).getByText(/vê o bloco «Próxima visita» acima/)).toBeInTheDocument();
    // O contacto da ficha diz que a morada é a que a lead indicou.
    expect(within(ficha).getByText("Morada (indicada pela lead)")).toBeInTheDocument();
  });

  it("cliente com visita noutra morada: mostra «Outra morada» e a nota de acesso", () => {
    render(aplicacao("/pessoas?open=p-paulo"));
    const visita = within(screen.getByRole("dialog")).getByRole("heading", { name: /^Próxima visita · / }).closest("section")!;
    expect(within(visita).getByText("Zona Industrial, Lote 7, Armazém 2, 4700-500 Braga")).toBeInTheDocument();
    expect(within(visita).getByText("Outra morada")).toBeInTheDocument();
    expect(within(visita).getByText("Tocar à campainha da portaria.")).toBeInTheDocument();
  });

  it("visita cujo dia já passou diz «Visita por concluir» com a data", () => {
    render(aplicacao("/pessoas?open=p-goncalo"));
    const ficha = screen.getByRole("dialog");
    const visita = within(ficha).getByRole("heading", { name: /^Visita por concluir · / }).closest("section")!;
    expect(within(visita).getByText(/era a 12\/10\/2026 e ainda não foi concluída/)).toBeInTheDocument();
    expect(within(ficha).queryByRole("heading", { name: /^Próxima visita · / })).not.toBeInTheDocument();
  });

  it("sem visita não há bloco", () => {
    render(aplicacao("/pessoas?open=p-hugo"));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).queryByRole("heading", { name: /visita/i })).not.toBeInTheDocument();
    expect(within(ficha).queryByRole("button", { name: /Visita concluída/ })).not.toBeInTheDocument();
  });

  it("«Alterar visita» muda a morada: passa a outra morada e o bloco mostra a nova", async () => {
    render(aplicacao("/pessoas?open=p-rita"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Alterar visita/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Alterar visita" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Outra morada/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar visita" }));
    expect(within(dialogo).getByText("Escreve a rua e o número da visita.")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua Nova 5" } });
    fireEvent.change(within(dialogo).getByLabelText("Código postal"), { target: { value: "2750-300" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar visita" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Alterar visita" })).not.toBeInTheDocument());
    const visita = within(screen.getByRole("dialog")).getByRole("heading", { name: /^Próxima visita · / }).closest("section")!;
    expect(within(visita).getByText("Rua Nova 5, 2750-300")).toBeInTheDocument();
    expect(within(visita).getByText("Outra morada")).toBeInTheDocument();
  });
});

/** Estes fluxos abrem dois painéis e preenchem um formulário comprido: com a máquina ocupada passam dos 5 s por omissão. */
const TEMPO = 30_000;

describe("Ficha: marcar a visita como feita e criar o negócio (o mesmo caminho dos botões do Quadro)", () => {
  it("o painel de visita e levantamento traz a visita e a morada da visita; guardar com a visita feita e uma linha de medidas; depois «Criar o negócio» cria-o com tudo isso", async () => {
    render(aplicacao("/pessoas?open=p-paulo"));
    const ficha = screen.getByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Marcar a visita como feita: Pedido de 02/06/2025 de Paulo Neves" }));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Paulo Neves · Pedido de 02/06/2025" });
    // A morada da obra é a da VISITA (Zona Industrial), não a da lead (Rua do Souto).
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Qualificação/ }));
    expect(within(painel).getByLabelText("Rua e número")).toHaveValue("Zona Industrial, Lote 7");
    expect(within(painel).getByLabelText("Código postal")).toHaveValue("4700-500");
    expect(within(painel).getByLabelText("Andar / fração")).toHaveValue("Armazém 2");
    expect(within(painel).getByText(/Preenchida a partir da visita · outra morada/)).toBeInTheDocument();
    // A aba Geral mantém a morada da lead (contacto), separada da da obra.
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Geral/ }));
    expect(within(painel).getByRole("combobox", { name: /Pessoa/ })).toHaveTextContent("Paulo Neves");
    expect(within(painel).getByRole("combobox", { name: /Comercial/ })).toHaveTextContent("Bruno Costa");
    expect(within(painel).getByLabelText("Morada")).toHaveValue("Rua do Souto 51, 4700-329 Braga");
    // A aba Visita, na secção Visitas: a visita do pedido, por fazer; marca-se como feita ali mesmo.
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /^Visitas/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /^1\.ª visita/ }));
    expect(within(painel).getByLabelText("Data da visita")).toHaveValue("2026-10-15");
    expect(within(painel).getByRole("combobox", { name: "Feito por" })).toHaveTextContent("Bruno Costa");
    expect(within(painel).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Por fazer");
    fireEvent.click(within(painel).getByRole("button", { name: /^Marcar como feita a visita de/ }));
    expect(within(painel).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Feita");
    // O levantamento é opcional, mas aqui preenche-se uma linha para o negócio a levar.
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
    await escolher(painel, /^Divisão ou zona/, "Cozinha");
    await escolher(painel, /^Trabalho a fazer/, "Bancada nova");
    fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Visita e levantamento de Paulo Neves · Pedido de 02/06/2025" })).not.toBeInTheDocument());
    expect(negociosNovos()).toHaveLength(0);

    // A ficha diz «Visita feita» e o botão passou a «Criar o negócio»: abre com a pessoa, a morada da obra e o levantamento guardado.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Criar o negócio: Pedido de 02/06/2025 de Paulo Neves" }));
    const criar = await screen.findByRole("dialog", { name: "Novo negócio de Paulo Neves" });
    fireEvent.mouseDown(within(criar).getByRole("tab", { name: /^Qualificação/ }));
    expect(within(criar).getByLabelText("Rua e número")).toHaveValue("Zona Industrial, Lote 7");
    fireEvent.click(within(criar).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({
      pessoaId: "p-paulo", comercial: "Bruno Costa",
      moradaObra: { rua: "Zona Industrial, Lote 7", codigoPostal: "4700-500", localidade: "Braga", andar: "Armazém 2" },
      dadosContacto: { morada: "Rua do Souto 51, 4700-329 Braga" },
      levantamento: { estado: "feito", feitoPor: "Bruno Costa", data: "2026-10-15" },
    });
    // A ficha passa a Negócios, o pedido (e com ele as visitas) sai do Resumo e a atividade regista o que se fez.
    expect(await screen.findByRole("tab", { name: /Negócios/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Resumo" }));
    expect(screen.queryByRole("heading", { name: /^(Próxima visita|Visita feita|Visita por concluir)/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Atividade/ }));
    expect(screen.getByText(/Visita feita/)).toBeInTheDocument();
  }, TEMPO);

  it("uma lead: «Criar negócio» abre ligado ao pedido dela; fechar o painel sem criar deixa o pedido e a visita como estavam; criar leva a etapa a «Negócio · Orçamento»", async () => {
    render(aplicacao("/pessoas?open=p-rita"));
    const ficha = screen.getByRole("dialog");
    expect(within(ficha).getByText(/Lead · Com visita · Sintra/)).toBeInTheDocument();
    fireEvent.keyDown(within(ficha).getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Criar negócio" }));
    let painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Qualificação/ }));
    expect(within(painel).getByText(/Preenchida a partir da visita · igual à morada da lead/)).toBeInTheDocument();
    expect(within(painel).getByLabelText("Rua e número")).toHaveValue("Rua dos Combatentes 12");
    // «Usar a morada do contacto» continua a deixar trocar para a da lead (e deixa de dizer que veio da visita).
    fireEvent.click(within(painel).getByRole("button", { name: "Usar a morada do contacto" }));
    expect(within(painel).queryByText(/Preenchida a partir da visita/)).not.toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).not.toBeInTheDocument());
    expect(negociosNovos()).toHaveLength(0);
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: /^Próxima visita · / })).toBeInTheDocument();
    // Outra vez, e desta vez cria: o pedido é substituído pelo negócio, que leva a visita do pedido.
    fireEvent.keyDown(within(screen.getByRole("dialog")).getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Criar negócio" }));
    painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0].visitas?.map((v) => v.estado)).toEqual(["porFazer"]);
    expect(await screen.findByText(/Lead · Negócio · Orçamento · Sintra/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Negócios/ })).toHaveTextContent("1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Resumo" }));
    expect(screen.queryByRole("heading", { name: /^(Próxima visita|Visita feita|Visita por concluir)/ })).not.toBeInTheDocument();
  }, TEMPO);
});
