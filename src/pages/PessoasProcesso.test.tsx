// A Fase 3 na página real: os botões do "A fazer" (no Quadro e nas sub-linhas da Lista) executam os passos da lead até ao negócio.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negociosNovos, repor } from "@/components/negocio-metas/negociosNovos";
import { somarDias } from "@/components/negocio-metas/novoNegocio";
import { repor as reporPessoas } from "@/components/pessoas/pessoasNovas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import { simularSaidaAnimada, type SaidaAnimada } from "@/test/saidaAnimadaTeste";
import Pessoas from "./Pessoas";

const { sucesso, erro } = vi.hoisted(() => ({ sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: sucesso } }));

/** Os fluxos abrem dois painéis e preenchem formulários compridos: com a máquina ocupada passam dos 5 s por omissão. */
const TEMPO = 30_000;

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

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const abrirPagina = (vista: "quadro" | "lista") => {
  window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista }));
  render(<MemoryRouter initialEntries={["/pessoas"]}><Pessoas /></MemoryRouter>);
};
const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
const avisos = () => screen.getAllByRole("status").map((s) => s.textContent).join(" | ");
const botao = (nome: string) => screen.getByRole("button", { name: nome });
const escolher = async (dialogo: HTMLElement, campo: RegExp | string, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};

let saida: SaidaAnimada | null = null;
beforeEach(() => {
  window.localStorage.clear();
  repor();
  reporPessoas();
  sucesso.mockClear();
  erro.mockClear();
});
afterEach(() => { saida?.restaurar(); saida = null; });


/** Todo o texto das regiões live da página (e da ficha), mesmo as que o leitor de ecrã ainda não leu. */
const textoLive = () => Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent ?? "").join(" | ").replace(/\u00a0/g, "");

/** Marca a visita como feita (diálogo) a partir do botão do Quadro. */
const marcarFeita = async (nome: string) => {
  fireEvent.click(botao(`Marcar a visita como feita: Pedido novo de ${nome}`));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "A visita já foi feita?" })).getByRole("button", { name: "Marcar como feita" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

/** Abre o painel do levantamento (Quadro) e acrescenta uma linha completa; devolve o painel. */
const preencherLevantamento = async (nome: string) => {
  fireEvent.click(botao(`Fazer o levantamento: Pedido novo de ${nome}`));
  const painel = await screen.findByRole("dialog");
  fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
  fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
  await escolher(painel, /^Divisão ou zona/, "Cozinha");
  await escolher(painel, /^Trabalho a fazer/, "Bancada nova");
  fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
  return painel;
};

/** Marca a visita como feita e guarda um levantamento de uma linha, tudo a partir dos botões do Quadro. */
const marcarFeitaEGuardarLevantamento = async (nome: string) => {
  await marcarFeita(nome);
  const painel = await preencherLevantamento(nome);
  fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

describe("Quadro: registar a chamada", () => {
  it("abre o diálogo da chamada; guardar leva o cartão de Por contactar a Contactado e avisa", async () => {
    abrirPagina("quadro");
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    expect(within(dialogo).queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Guardar" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Contactado")).getByText("Hugo Teixeira")).toBeInTheDocument();
    expect(within(coluna("Por contactar")).queryByText("Hugo Teixeira")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Chamada registada: Hugo Teixeira passa a Contactado."));
    expect(botao("Marcar a visita: Pedido novo de Hugo Teixeira")).toBeInTheDocument();
  });

  it("cancelar não muda nada e o foco volta ao botão do passo", async () => {
    abrirPagina("quadro");
    const gatilho = botao("Registar a chamada: Pedido novo de Hugo Teixeira");
    gatilho.focus();
    fireEvent.click(gatilho);
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
    await waitFor(() => expect(botao("Registar a chamada: Pedido novo de Hugo Teixeira")).toHaveFocus());
  });

  it("depois de guardar, o foco vai para o botão do novo passo do mesmo cartão (o antigo já não existe)", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(botao("Marcar a visita: Pedido novo de Hugo Teixeira")).toHaveFocus());
  });
});

describe("Quadro: marcar a visita", () => {
  it("abre o diálogo de marcar visita; marcar leva o cartão de Contactado a Visita e avisa", async () => {
    abrirPagina("quadro");
    expect(within(coluna("Contactado")).getByText("Lúcia Faria")).toBeInTheDocument();
    fireEvent.click(botao("Marcar a visita: Pedido novo de Lúcia Faria"));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Lúcia Faria")).toBeInTheDocument();
    expect(within(coluna("Contactado")).queryByText("Lúcia Faria")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Visita marcada: Lúcia Faria passa a Visita."));
    await waitFor(() => expect(botao("Marcar a visita como feita: Pedido novo de Lúcia Faria")).toHaveFocus());
  });
});

describe("Quadro: da visita feita ao negócio", () => {
  it("'A visita já foi feita?': cancelar não muda nada", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
    const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque")).toBeInTheDocument();
  });

  it("a nota tem 200 caracteres no máximo e o erro diz-se por texto", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
    const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
    const nota = within(dialogo).getByLabelText("Nota (opcional)");
    fireEvent.change(nota, { target: { value: "x".repeat(201) } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como feita" }));
    expect(within(dialogo).getByText("A nota não pode ter mais de 200 caracteres.")).toBeInTheDocument();
    expect(nota).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog", { name: "A visita já foi feita?" })).toBeInTheDocument();
    fireEvent.change(nota, { target: { value: "x".repeat(200) } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como feita" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("marcar a visita como feita muda o 'A fazer' para fazer o levantamento, na mesma fase, e avisa", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
    const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
    fireEvent.change(within(dialogo).getByLabelText("Nota (opcional)"), { target: { value: "Cliente simpática" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como feita" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar a visita como feita: Pedido novo de Rita Albuquerque" })).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Visita feita: Rita Albuquerque continua em Visita. A fazer: Fazer o levantamento."));
    // A região live diz tudo: não há toast a repetir o mesmo texto.
    expect(sucesso).not.toHaveBeenCalledWith(expect.stringContaining("Visita feita"));
    await waitFor(() => expect(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque")).toHaveFocus());
  });

  it("fazer o levantamento, guardá-lo e criar o negócio leva o cartão a Orçamento, com a visita concluída", async () => {
    abrirPagina("quadro");
    await marcarFeita("Rita Albuquerque");

    // Fazer o levantamento: o painel abre na aba Visita, com a pessoa e a visita já preenchidas, e o título diz o passo.
    fireEvent.click(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque"));
    let painel = await screen.findByRole("dialog", { name: "Levantamento de Rita Albuquerque" });
    expect(within(painel).getByRole("tab", { name: /^Visita/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
    await escolher(painel, /^Divisão ou zona/, "Cozinha");
    await escolher(painel, /^Trabalho a fazer/, "Bancada nova");
    fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Levantamento guardado: Rita Albuquerque. A fazer: Criar o negócio."));
    // A região live diz tudo: não há toast a repetir o mesmo texto.
    expect(sucesso).not.toHaveBeenCalledWith(expect.stringContaining("Levantamento guardado"));
    await waitFor(() => expect(botao("Criar o negócio: Pedido novo de Rita Albuquerque")).toHaveFocus());

    // Criar o negócio: abre com o levantamento guardado e cria.
    fireEvent.click(botao("Criar o negócio: Pedido novo de Rita Albuquerque"));
    painel = await screen.findByRole("dialog", { name: "Novo negócio de Rita Albuquerque" });
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área.*1 linha/ }));
    expect(within(painel).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveTextContent("Cozinha");
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Orçamento")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(within(coluna("Visita")).queryByText("Rita Albuquerque")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Negócio criado: Rita Albuquerque passa a Orçamento."));

    // A visita ficou concluída: a atividade da ficha regista-o e já não há "Próxima visita".
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).queryByRole("heading", { name: "Próxima visita" })).not.toBeInTheDocument();
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Atividade/ }), { button: 0, ctrlKey: false });
    expect(within(ficha).getByText("Histórico · Visita concluída · negócio criado")).toBeInTheDocument();
    expect(within(ficha).getByText("Histórico · Visita feita")).toBeInTheDocument();
  });

  it("guardar o levantamento sem linhas (visita feita) mostra o erro das linhas no painel e não guarda nada", async () => {
    abrirPagina("quadro");
    await marcarFeita("Rita Albuquerque");
    fireEvent.click(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque"));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
    expect(await within(painel).findByText("Com o estado Feito, acrescenta pelo menos uma linha.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque")).toBeInTheDocument();
  });

  it("fechar o painel do levantamento sem guardar não muda a fase nem o botão, e o foco volta ao botão do passo", async () => {
    abrirPagina("quadro");
    await marcarFeita("Gonçalo Matias");
    fireEvent.click(botao("Fazer o levantamento: Pedido novo de Gonçalo Matias"));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Gonçalo Matias")).toBeInTheDocument();
    await waitFor(() => expect(botao("Fazer o levantamento: Pedido novo de Gonçalo Matias")).toHaveFocus());
  });

  it("um pedido SEM a visita feita só oferece «Marcar a visita como feita»: nem o levantamento nem o negócio avançam", async () => {
    abrirPagina("quadro");
    const visita = within(coluna("Visita"));
    expect(visita.getByRole("button", { name: "Marcar a visita como feita: Pedido novo de Rita Albuquerque" })).toBeInTheDocument();
    expect(visita.queryByRole("button", { name: /^Fazer o levantamento: .* Rita Albuquerque/ })).not.toBeInTheDocument();
    expect(visita.queryByRole("button", { name: /^Criar o negócio: .* Rita Albuquerque/ })).not.toBeInTheDocument();
    // Abrir e cancelar o diálogo da visita feita não adianta o pedido.
    fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "A visita já foi feita?" })).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).queryByRole("button", { name: /^Fazer o levantamento/ })).not.toBeInTheDocument();
    expect(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque")).toBeInTheDocument();
  });
});

describe("Lista: o mesmo passo, a partir da sub-linha", () => {
  /** A linha da tabela da pessoa (o botão dos negócios vive nela). */
  const linhaDe = (nome: string) => screen.getByRole("button", { name: new RegExp(`^(Ver|Esconder) negócios.*${nome}$`) }).closest("tr")!;
  const abrirSublinhas = (nome: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Ver negócios \\(\\d+\\) de ${nome}`) }));

  it("registar a chamada na sub-linha atualiza o 'A fazer' e o resumo da linha", async () => {
    abrirPagina("lista");
    abrirSublinhas("Hugo Teixeira");
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Marcar a visita: Pedido novo de Hugo Teixeira")).toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Chamada registada: Hugo Teixeira passa a Contactado."));
    await waitFor(() => expect(botao("Marcar a visita: Pedido novo de Hugo Teixeira")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: /^Esconder negócios/ }));
    expect(within(linhaDe("Hugo Teixeira")).getByText("1 em curso · A fazer: Marcar a visita")).toBeInTheDocument();
  });

  it("marcar a visita como feita na sub-linha passa a pedir o levantamento", async () => {
    abrirPagina("lista");
    abrirSublinhas("Rita Albuquerque");
    fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "A visita já foi feita?" })).getByRole("button", { name: "Marcar como feita" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Esconder negócios/ }));
    expect(within(linhaDe("Rita Albuquerque")).getByText("1 em curso · A fazer: Fazer o levantamento")).toBeInTheDocument();
  });

  it("os passos das fases 4 e 5 continuam a abrir a ficha, sem diálogo de passo", () => {
    abrirPagina("lista");
    abrirSublinhas("Nuno Barros");
    const passos = screen.getAllByRole("button", { name: /\(abre a ficha\)$/ });
    expect(passos.length).toBeGreaterThan(0);
    fireEvent.click(passos[0]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Nuno Barros", level: 2 })).toBeInTheDocument();
  });
});

describe("Ficha: depois de marcar a visita como feita no Quadro", () => {
  it.each(["Rita Albuquerque", "Gonçalo Matias"])(
    "%s: a ficha diz «Visita feita» (mesmo com o dia já passado) e não oferece «Alterar visita»", async (nome) => {
      abrirPagina("quadro");
      await marcarFeita(nome);
      fireEvent.click(botao(`Abrir a ficha de ${nome}`));
      const ficha = await screen.findByRole("dialog");
      const visita = within(ficha).getByRole("heading", { name: "Visita feita" }).closest("section")!;
      expect(within(ficha).queryByRole("heading", { name: "Próxima visita" })).not.toBeInTheDocument();
      expect(within(ficha).queryByRole("heading", { name: "Visita por concluir" })).not.toBeInTheDocument();
      expect(within(visita).queryByText(/ainda não foi concluída/)).not.toBeInTheDocument();
      expect(within(visita).queryByRole("button", { name: "Alterar visita" })).not.toBeInTheDocument();
      expect(within(visita).getByRole("button", { name: "Visita concluída → Criar negócio" })).toBeInTheDocument();
    }, TEMPO,
  );

  it("com o levantamento guardado: «Visita concluída → Criar negócio» abre com as linhas guardadas e, ao criar o negócio, a visita e o levantamento saem", async () => {
    abrirPagina("quadro");
    await marcarFeitaEGuardarLevantamento("Rita Albuquerque");
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Visita concluída → Criar negócio" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }), { button: 0, ctrlKey: false });
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área.*1 linha/ }));
    expect(within(painel).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveTextContent("Cozinha");
    expect(within(painel).getByRole("combobox", { name: /^Trabalho a fazer/ })).toHaveTextContent("Bancada nova");
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({
      pessoaId: "p-rita", levantamento: { estado: "feito", linhas: [{ divisao: "Cozinha", medida: 3.5 }] },
    });
    // A ficha passa a Negócios; a visita (e com ela o levantamento guardado) sai do Resumo e a atividade regista-o.
    expect(await screen.findByRole("tab", { name: /Negócios/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Resumo" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("heading", { name: "Visita feita" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Próxima visita" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Atividade/ }), { button: 0, ctrlKey: false });
    expect(screen.getByText(/Visita concluída · negócio criado/)).toBeInTheDocument();
  }, TEMPO);

  it("sem o levantamento guardado, o painel da ficha abre sem linhas (como sempre)", async () => {
    abrirPagina("quadro");
    await marcarFeita("Rita Albuquerque");
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Visita concluída → Criar negócio" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Visita/ }), { button: 0, ctrlKey: false });
    expect(within(painel).getByRole("button", { name: /^Medidas da área/ })).toHaveTextContent("0 linhas");
  }, TEMPO);
});

describe("Avisos: uma região live por origem, e um texto igual seguido volta a ser anunciado", () => {
  const abrirComRota = (rota: string) => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
    render(<MemoryRouter initialEntries={[rota]}><Pessoas /></MemoryRouter>);
  };

  it("resolver uma submissão e depois registar uma chamada continua a anunciar o aviso da chamada", async () => {
    abrirComRota("/pessoas?separador=submissoes");
    fireEvent.click(screen.getAllByRole("button", { name: "Registar na ficha como nota" })[0]);
    const confirmar = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmar).getByRole("button", { name: "Registar na ficha" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(textoLive()).toContain("Submissões pendentes: 5.");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Pessoas/ }), { button: 0, ctrlKey: false });
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(textoLive()).toContain("Chamada registada: Hugo Teixeira passa a Contactado."));
  }, TEMPO);

  it("a mesma lead criada duas vezes seguidas: o segundo aviso é o mesmo texto com um espaço inseparável, para o leitor de ecrã o repetir", async () => {
    abrirComRota("/pessoas");
    const regiao = () => Array.from(document.querySelectorAll('[role="status"]')).find((e) => (e.textContent ?? "").includes("Teresa Lobo"));
    const criar = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nova lead" }));
      const painel = await screen.findByRole("dialog", { name: "Nova lead" });
      fireEvent.change(within(painel).getByLabelText(/^Nome/), { target: { value: "Teresa Lobo" } });
      fireEvent.click(within(painel).getByRole("button", { name: "Criar lead" }));
      await screen.findByRole("heading", { name: "Teresa Lobo", level: 2 });
      const ficha = screen.getByRole("dialog");
      fireEvent.keyDown(ficha, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    };
    await criar();
    const primeiro = regiao()?.textContent ?? "";
    expect(primeiro).not.toBe("");
    await criar();
    const segundo = regiao()?.textContent ?? "";
    expect(segundo).not.toBe(primeiro);
    expect(segundo.replace(/\u00a0/g, "")).toBe(primeiro.replace(/\u00a0/g, ""));
  }, TEMPO);
});

describe("Chamada a partir do «A fazer»: o aviso diz o que a chamada fez", () => {
  const amanha = somarDias(HOJE_EXEMPLO, 1);
  const quando = `${amanha.slice(8, 10)}/${amanha.slice(5, 7)} · 10:00`;
  const CASOS: [string, RegExp, string][] = [
    ["marcar a pessoa como perdida", /Sem interesse/, "Chamada registada para Hugo Teixeira, marcada como perdida."],
    ["ligar numa data e hora", /Atendeu · ligar mais tarde/, `Chamada registada para Hugo Teixeira. Ligar a ${quando}.`],
    ["marcar a visita", /Atendeu · interessado/, `Chamada registada para Hugo Teixeira. Visita marcada para ${quando}.`],
  ];

  it.each(CASOS)("%s", async (nome, resultado, esperado) => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: resultado }));
    if (nome === "marcar a pessoa como perdida") {
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Marcar como perdida/ }));
      fireEvent.change(within(dialogo).getByLabelText("Motivo da perda"), { target: { value: "preco" } });
    }
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(textoLive()).toContain(esperado));
    expect(textoLive()).not.toContain("Chamada registada: Hugo Teixeira");
  }, TEMPO);
});

describe("O aviso do passo só sai depois de o diálogo desmontar (a página fica escondida do leitor de ecrã enquanto ele sai)", () => {
  /** Cada fluxo prepara o terreno sem animação, liga a saída animada ANTES de abrir o diálogo e faz o último clique. */
  const FLUXOS: [string, () => Promise<string>][] = [
    ["registar a chamada", async () => {
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
      const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      return "Chamada registada: Hugo Teixeira passa a Contactado.";
    }],
    ["marcar a visita", async () => {
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Marcar a visita: Pedido novo de Lúcia Faria"));
      const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
      fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-20" } });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
      return "Visita marcada: Lúcia Faria passa a Visita.";
    }],
    ["marcar a visita como feita", async () => {
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque"));
      const dialogo = await screen.findByRole("dialog", { name: "A visita já foi feita?" });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como feita" }));
      return "Visita feita: Rita Albuquerque continua em Visita. A fazer: Fazer o levantamento.";
    }],
    ["guardar o levantamento", async () => {
      await marcarFeita("Rita Albuquerque");
      saida = simularSaidaAnimada();
      const painel = await preencherLevantamento("Rita Albuquerque");
      fireEvent.click(within(painel).getByRole("button", { name: "Guardar o levantamento" }));
      return "Levantamento guardado: Rita Albuquerque. A fazer: Criar o negócio.";
    }],
    ["criar o negócio", async () => {
      await marcarFeitaEGuardarLevantamento("Rita Albuquerque");
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Criar o negócio: Pedido novo de Rita Albuquerque"));
      const painel = await screen.findByRole("dialog");
      fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
      return "Negócio criado: Rita Albuquerque passa a Orçamento.";
    }],
  ];

  it.each(FLUXOS)("%s", async (_nome, fluxo) => {
    abrirPagina("quadro");
    const esperado = await fluxo();
    // O diálogo ainda está a sair, com o resto da página escondido do leitor de ecrã: o aviso espera.
    expect(document.querySelectorAll('[role="dialog"]').length).toBeGreaterThan(0);
    expect(textoLive()).not.toContain(esperado);
    saida?.acabar();
    await waitFor(() => expect(textoLive()).toContain(esperado));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(document.querySelectorAll("[data-aria-hidden]")).toHaveLength(0);
  }, TEMPO);
});

describe("Esc nos diálogos dos passos: fecha sem mudar nada e o foco volta ao botão do passo", () => {
  const comEsc = async (nomeBotao: string, dialogo: string | RegExp, aposAbrir?: () => void) => {
    abrirPagina("quadro");
    const gatilho = botao(nomeBotao);
    gatilho.focus();
    fireEvent.click(gatilho);
    const aberto = await screen.findByRole("dialog", { name: dialogo });
    aposAbrir?.();
    fireEvent.keyDown(aberto, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(botao(nomeBotao)).toHaveFocus());
    expect(textoLive()).not.toMatch(/registada|marcada|feita|guardado|criado/i);
  };

  it("registar a chamada", async () => {
    await comEsc("Registar a chamada: Pedido novo de Hugo Teixeira", "Registar chamada");
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
  });

  it("marcar a visita", async () => {
    await comEsc("Marcar a visita: Pedido novo de Lúcia Faria", "Marcar visita");
    expect(within(coluna("Contactado")).getByText("Lúcia Faria")).toBeInTheDocument();
  });

  it("«A visita já foi feita?»", async () => {
    await comEsc("Marcar a visita como feita: Pedido novo de Rita Albuquerque", "A visita já foi feita?");
    expect(botao("Marcar a visita como feita: Pedido novo de Rita Albuquerque")).toBeInTheDocument();
  });

  it("o painel do levantamento", async () => {
    abrirPagina("quadro");
    await marcarFeita("Rita Albuquerque");
    const gatilho = botao("Fazer o levantamento: Pedido novo de Rita Albuquerque");
    gatilho.focus();
    fireEvent.click(gatilho);
    const painel = await screen.findByRole("dialog");
    fireEvent.keyDown(painel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(botao("Fazer o levantamento: Pedido novo de Rita Albuquerque")).toHaveFocus());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
  }, TEMPO);
});

describe("Diálogos dos passos: títulos", () => {
  it("o diálogo da chamada tem um só título, o visível, e é por ele que o diálogo se chama", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Pedido novo de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    const titulos = within(dialogo).getAllByText("Registar chamada");
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toBeVisible();
    expect(dialogo).toHaveAttribute("aria-labelledby", titulos[0].id);
  });
});
