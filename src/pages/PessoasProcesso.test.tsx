// Os passos da pessoa até ao negócio, na página real: os botões do "A fazer" (no Quadro e nas sub-linhas da Lista) executam a chamada, a visita e o
// levantamento, que são REGISTOS da pessoa (não há pedidos); o negócio cria-se à mão e liga registos que já existem.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { negociosNovos, repor } from "@/components/negocio-metas/negociosNovos";
import { registosAtuais, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { somarDias } from "@/components/negocio-metas/novoNegocio";
import { repor as reporPessoas } from "@/components/pessoas/pessoasNovas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import { simularSaidaAnimada, type SaidaAnimada } from "@/test/saidaAnimadaTeste";
import Pessoas from "./Pessoas";

const { sucesso, erro } = vi.hoisted(() => ({ sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: sucesso } }));

/** Os fluxos abrem dois painéis e preenchem formulários compridos: com a máquina ocupada passam dos 5 s por omissão. */
const TEMPO = 30_000;

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
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
  reporRegistos();
  reporPessoas();
  sucesso.mockClear();
  erro.mockClear();
});
afterEach(() => { saida?.restaurar(); saida = null; });


/** Todo o texto das regiões live da página (e da ficha), mesmo as que o leitor de ecrã ainda não leu. */
const textoLive = () => Array.from(document.querySelectorAll('[role="status"]')).map((e) => e.textContent ?? "").join(" | ").replace(/\u00a0/g, "");

/** Abre o painel de visita e levantamento da pessoa (botão do Quadro); devolve o painel. */
const abrirPainelVisita = async (nome: string) => {
  fireEvent.click(botao(`Marcar a visita como feita: Abordagem de ${nome}`));
  return screen.findByRole("dialog", { name: `Visita e levantamento de ${nome}` });
};

/** No painel, marca a visita como feita (o botão da própria visita). */
const marcarFeitaNoPainel = (painel: HTMLElement) =>
  fireEvent.click(within(painel).getByRole("button", { name: /^Marcar como feita a visita de/ }));

/** No painel, acrescenta uma linha de medidas completa. */
const preencherLinha = async (painel: HTMLElement) => {
  fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
  fireEvent.click(within(painel).getByRole("button", { name: "Adicionar linha" }));
  await escolher(painel, /^Divisão ou zona/, "Cozinha");
  await escolher(painel, /^Trabalho a fazer/, "Bancada nova");
  fireEvent.change(within(painel).getByLabelText(/^Medida(?!s)/), { target: { value: "3.5" } });
};

/** O passo todo a partir do Quadro: abre o painel da pessoa, marca a visita como feita, tira uma medida e guarda (uma só gravação). */
const marcarFeitaEGuardar = async (nome: string) => {
  const painel = await abrirPainelVisita(nome);
  marcarFeitaNoPainel(painel);
  await preencherLinha(painel);
  fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};
describe("Quadro: registar a chamada", () => {
  it("abre o diálogo da chamada; guardar leva o cartão de Por contactar a Contactado e avisa", async () => {
    abrirPagina("quadro");
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    expect(within(dialogo).queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Guardar" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Contactado")).getByText("Hugo Teixeira")).toBeInTheDocument();
    expect(within(coluna("Por contactar")).queryByText("Hugo Teixeira")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Chamada registada: Hugo Teixeira passa a Contactado."));
    expect(botao("Marcar a visita: Abordagem de Hugo Teixeira")).toBeInTheDocument();
  });

  it("cancelar não muda nada e o foco volta ao botão do passo", async () => {
    abrirPagina("quadro");
    const gatilho = botao("Registar a chamada: Abordagem de Hugo Teixeira");
    gatilho.focus();
    fireEvent.click(gatilho);
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
    await waitFor(() => expect(botao("Registar a chamada: Abordagem de Hugo Teixeira")).toHaveFocus());
  });

  it("depois de guardar, o foco vai para o botão do novo passo do mesmo cartão (o antigo já não existe)", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(botao("Marcar a visita: Abordagem de Hugo Teixeira")).toHaveFocus());
  });
});

describe("Quadro: marcar a visita", () => {
  it("abre o diálogo de marcar visita; marcar leva o cartão de Contactado a Visita e avisa", async () => {
    abrirPagina("quadro");
    expect(within(coluna("Contactado")).getByText("Lúcia Faria")).toBeInTheDocument();
    fireEvent.click(botao("Marcar a visita: Abordagem de Lúcia Faria"));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-20" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Lúcia Faria")).toBeInTheDocument();
    expect(within(coluna("Contactado")).queryByText("Lúcia Faria")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Visita marcada: Lúcia Faria passa a Visita."));
    await waitFor(() => expect(botao("Marcar a visita como feita: Abordagem de Lúcia Faria")).toHaveFocus());
  });
});

describe("Quadro: da visita feita ao negócio", () => {
  it("«Marcar a visita como feita» abre o painel de visita e levantamento na secção Visitas, com as 7 secções e a visita do pedido", async () => {
    abrirPagina("quadro");
    const painel = await abrirPainelVisita("Rita Albuquerque");
    expect(within(painel).getByRole("tab", { name: /^Visita/ })).toHaveAttribute("aria-selected", "true");
    const seccoes = within(painel).getByRole("navigation", { name: "Secções da visita" });
    expect(within(seccoes).getAllByRole("listitem")).toHaveLength(7);
    expect(within(seccoes).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    // A visita da Rita (hoje, às 15:00, por fazer) está na lista do painel, com o botão para a marcar como feita.
    expect(within(painel).getByText(/Por fazer · 13\/10\/2026 · 15:00/)).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /^Marcar como feita a visita de/ })).toBeInTheDocument();
  }, TEMPO);

  it("cancelar o painel não muda nada e o foco volta ao botão do passo", async () => {
    abrirPagina("quadro");
    const gatilho = botao("Marcar a visita como feita: Abordagem de Rita Albuquerque");
    gatilho.focus();
    const painel = await abrirPainelVisita("Rita Albuquerque");
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    await waitFor(() => expect(botao("Marcar a visita como feita: Abordagem de Rita Albuquerque")).toHaveFocus());
  }, TEMPO);

  it("marcar a visita como feita e guardar (uma só gravação) muda o 'A fazer' para criar o negócio, na mesma fase, e avisa", async () => {
    abrirPagina("quadro");
    await marcarFeitaEGuardar("Rita Albuquerque");
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar a visita como feita: Abordagem de Rita Albuquerque" })).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Visita feita: Rita Albuquerque continua em Visita. A fazer: Criar o negócio."));
    // A região live diz tudo: não há toast a repetir o mesmo texto.
    expect(sucesso).not.toHaveBeenCalledWith(expect.stringContaining("Visita feita"));
    await waitFor(() => expect(botao("Criar o negócio: Abordagem de Rita Albuquerque")).toHaveFocus());
  }, TEMPO);

  it("guardar só a visita (por fazer, sem medidas) fica no pedido: continua por marcar como feita", async () => {
    abrirPagina("quadro");
    const painel = await abrirPainelVisita("Rita Albuquerque");
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(avisos()).toContain("Visita guardada: Rita Albuquerque continua em Visita. A fazer: Marcar a visita como feita."));
    expect(botao("Marcar a visita como feita: Abordagem de Rita Albuquerque")).toBeInTheDocument();
  }, TEMPO);

  it("criar o negócio leva a pessoa à Parte 2, em Orçamento: liga os registos que já existem (nada se copia) e a pessoa sai da abordagem", async () => {
    abrirPagina("quadro");
    await marcarFeitaEGuardar("Rita Albuquerque");

    // Criar o negócio à mão: o painel abre com a pessoa escolhida e os registos dela por ligar marcados.
    fireEvent.click(botao("Criar o negócio: Abordagem de Rita Albuquerque"));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de Rita Albuquerque" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Registos/ }), { button: 0, ctrlKey: false });
    expect(within(painel).getByRole("checkbox", { name: /Visita de 13\/10\/2026/ })).toBeChecked();
    expect(within(painel).getByRole("radio", { name: /Usar um que já existe/ })).toBeChecked();
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Orçamento")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(within(coluna("Visita")).queryByText("Rita Albuquerque")).not.toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Negócio criado: Rita Albuquerque passa a Orçamento."));
    expect(negociosNovos()).toHaveLength(1);
    const criado = negociosNovos()[0];
    expect(criado).toMatchObject({ pessoaId: "p-rita", decisaoLevantamento: "ligado" });
    // Nada se copiou para o negócio: ele só liga os registos da pessoa.
    for (const campo of ["levantamento", "visitas", "visita"]) expect(criado, campo).not.toHaveProperty(campo);
    const ligados = (lista: readonly { pessoaId: string; negocioId: string | null }[]) => lista.filter((r) => r.pessoaId === "p-rita" && r.negocioId === criado.id);
    expect(ligados(registosAtuais().visitas).length).toBeGreaterThan(0);
    expect(ligados(registosAtuais().levantamentos)).toHaveLength(1);

    // A ficha mostra as visitas dela, agora ligadas ao negócio, e a atividade guarda o que se fez.
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getAllByText(/^Ligada ao negócio /).length).toBeGreaterThan(0);
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Atividade/ }), { button: 0, ctrlKey: false });
    expect(within(ficha).getByText("Histórico · Visita feita")).toBeInTheDocument();
  }, TEMPO);
  it("guardar com a visita feita e sem linhas guarda na mesma (o levantamento é opcional): o painel fecha e o cartão passa a «Criar o negócio»", async () => {
    abrirPagina("quadro");
    const painel = await abrirPainelVisita("Rita Albuquerque");
    marcarFeitaNoPainel(painel);
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
    expect(botao("Criar o negócio: Abordagem de Rita Albuquerque")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar a visita como feita: Abordagem de Rita Albuquerque" })).not.toBeInTheDocument();
  }, TEMPO);

  it("fechar o painel sem guardar não muda a fase nem o botão, e o foco volta ao botão do passo", async () => {
    abrirPagina("quadro");
    const painel = await abrirPainelVisita("Gonçalo Matias");
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).getByText("Gonçalo Matias")).toBeInTheDocument();
    await waitFor(() => expect(botao("Marcar a visita como feita: Abordagem de Gonçalo Matias")).toHaveFocus());
  }, TEMPO);

  it("um pedido SEM a visita feita só oferece «Marcar a visita como feita»: o negócio não avança", async () => {
    abrirPagina("quadro");
    const visita = within(coluna("Visita"));
    expect(visita.getByRole("button", { name: "Marcar a visita como feita: Abordagem de Rita Albuquerque" })).toBeInTheDocument();
    expect(visita.queryByRole("button", { name: /^Fazer o levantamento/ })).not.toBeInTheDocument();
    expect(visita.queryByRole("button", { name: /^Criar o negócio: .* Rita Albuquerque/ })).not.toBeInTheDocument();
    // Abrir e cancelar o painel não adianta o pedido.
    const painel = await abrirPainelVisita("Rita Albuquerque");
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(coluna("Visita")).queryByRole("button", { name: /^Criar o negócio: .* Rita Albuquerque/ })).not.toBeInTheDocument();
    expect(botao("Marcar a visita como feita: Abordagem de Rita Albuquerque")).toBeInTheDocument();
  }, TEMPO);
});
describe("Lista: o mesmo passo, a partir da sub-linha", () => {
  /** A linha da tabela da pessoa (o botão dos negócios vive nela). */
  const linhaDe = (nome: string) => screen.getByRole("button", { name: new RegExp(`^(Ver|Esconder) negócios.*${nome}$`) }).closest("tr")!;
  const abrirSublinhas = (nome: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Ver negócios \\(\\d+\\) de ${nome}`) }));

  it("registar a chamada na sub-linha atualiza o 'A fazer' e o resumo da linha", async () => {
    abrirPagina("lista");
    abrirSublinhas("Hugo Teixeira");
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Marcar a visita: Abordagem de Hugo Teixeira")).toBeInTheDocument();
    await waitFor(() => expect(avisos()).toContain("Chamada registada: Hugo Teixeira passa a Contactado."));
    await waitFor(() => expect(botao("Marcar a visita: Abordagem de Hugo Teixeira")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: /^Esconder negócios/ }));
    expect(within(linhaDe("Hugo Teixeira")).getByText("1 em curso · A fazer: Marcar a visita")).toBeInTheDocument();
  });

  it("marcar a visita como feita e guardar na sub-linha passa a pedir o negócio", async () => {
    abrirPagina("lista");
    abrirSublinhas("Rita Albuquerque");
    fireEvent.click(botao("Marcar a visita como feita: Abordagem de Rita Albuquerque"));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Rita Albuquerque" });
    marcarFeitaNoPainel(painel);
    await preencherLinha(painel);
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao("Criar o negócio: Abordagem de Rita Albuquerque")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Esconder negócios/ }));
    expect(within(linhaDe("Rita Albuquerque")).getByText("1 em curso · A fazer: Criar o negócio")).toBeInTheDocument();
  }, TEMPO);

  it("os passos das fases 4 e 5 executam-se no diálogo do passo: nenhum botão se limita a abrir a ficha", () => {
    abrirPagina("lista");
    abrirSublinhas("Nuno Barros");
    expect(screen.queryAllByRole("button", { name: /\(abre a ficha\)$/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Registar a resposta do cliente: Janelas de Nuno Barros" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Nuno Barros", level: 2 })).not.toBeInTheDocument();
  });
});

describe("Ficha: as visitas da pessoa, e o mesmo caminho dos botões do Quadro", () => {
  it.each(["Rita Albuquerque", "Gonçalo Matias"])(
    "%s: depois de marcar a visita como feita, a ficha mostra a visita Feita (mesmo com o dia já passado), sem «Alterar visita», e o botão é o do passo", async (nome) => {
      abrirPagina("quadro");
      await marcarFeitaEGuardar(nome);
      fireEvent.click(botao(`Abrir a ficha de ${nome}`));
      const ficha = await screen.findByRole("dialog");
      const visitas = within(ficha).getByRole("heading", { name: "Visitas" }).closest("section")!;
      expect(within(visitas).getByText("Feita")).toBeInTheDocument();
      expect(within(visitas).queryByText(/ainda não foi concluída/)).not.toBeInTheDocument();
      expect(within(visitas).queryByRole("button", { name: /^Alterar visita/ })).not.toBeInTheDocument();
      expect(within(visitas).getByRole("button", { name: `Criar o negócio: Abordagem de ${nome}` })).toBeInTheDocument();
      // Uma visita feita sem resultado pede o resultado: interessado, a pensar, sem interesse ou obra inviável.
      expect(within(visitas).getByRole("button", { name: /^Registar o resultado da visita/ })).toBeInTheDocument();
    }, TEMPO,
  );
  it("«Criar o negócio» na ficha é o mesmo caminho do Quadro: abre com os registos da pessoa marcados e, ao criar o negócio, a ficha passa a Negócios", async () => {
    abrirPagina("quadro");
    await marcarFeitaEGuardar("Rita Albuquerque");
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Criar o negócio: Abordagem de Rita Albuquerque" }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de Rita Albuquerque" });
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: /^Registos/ }), { button: 0, ctrlKey: false });
    expect(within(painel).getByRole("checkbox", { name: /Visita de 13\/10\/2026/ })).toBeChecked();
    expect(within(painel).getByRole("radio", { name: /Usar um que já existe/ })).toBeChecked();
    fireEvent.click(within(painel).getByRole("button", { name: "Criar negócio" }));
    expect(negociosNovos()).toHaveLength(1);
    expect(negociosNovos()[0]).toMatchObject({ pessoaId: "p-rita", decisaoLevantamento: "ligado" });
    // A ficha passa a Negócios; as visitas continuam no Resumo, agora ligadas ao negócio.
    expect(await screen.findByRole("tab", { name: /Negócios/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Resumo" }), { button: 0, ctrlKey: false });
    expect(screen.getAllByText(/^Ligada ao negócio /).length).toBeGreaterThan(0);
  }, TEMPO);
  it("com a visita por fazer, o botão da ficha («Marcar a visita como feita») abre o painel de visita e levantamento, sem linhas", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: "Visitas" })).toBeInTheDocument();
    fireEvent.click(within(ficha).getByRole("button", { name: "Marcar a visita como feita: Abordagem de Rita Albuquerque" }));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Rita Albuquerque" });
    fireEvent.click(within(painel).getByRole("button", { name: /^Medidas da área/ }));
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
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
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

  it("um passo feito a partir da ficha anuncia o aviso na região live DENTRO da ficha (a página fica escondida) e não o repete na da página", async () => {
    abrirComRota("/pessoas");
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Marcar a visita como feita: Abordagem de Rita Albuquerque" }));
    const painel = await screen.findByRole("dialog", { name: "Visita e levantamento de Rita Albuquerque" });
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Visita e levantamento de Rita Albuquerque" })).not.toBeInTheDocument());
    const regioes = () => Array.from(document.querySelectorAll('[role="status"]'));
    const aviso = "Visita guardada: Rita Albuquerque continua em Visita.";
    await waitFor(() => expect(regioes().filter((r) => ficha.contains(r)).map((r) => r.textContent).join("|")).toContain(aviso));
    expect(regioes().filter((r) => !ficha.contains(r)).map((r) => r.textContent).join("|")).not.toContain(aviso);
  }, TEMPO);

  it("um passo feito a partir da página (a ficha fechada) anuncia só na região da página, e ao abrir a ficha depois o aviso não se repete lá dentro", async () => {
    abrirComRota("/pessoas");
    const painel = await abrirPainelVisita("Rita Albuquerque");
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    const aviso = "Visita guardada: Rita Albuquerque continua em Visita.";
    await waitFor(() => expect(textoLive()).toContain(aviso));
    fireEvent.click(botao("Abrir a ficha de Rita Albuquerque"));
    const ficha = await screen.findByRole("dialog");
    expect(Array.from(ficha.querySelectorAll('[role="status"]')).map((r) => r.textContent).join("|")).not.toContain(aviso);
  }, TEMPO);
});

describe("Chamada a partir do «A fazer»: o aviso diz o que a chamada fez", () => {
  const amanha = somarDias(HOJE_EXEMPLO, 1);
  const quando = `${amanha.slice(8, 10)}/${amanha.slice(5, 7)} · 10:00`;
  const CASOS: [string, RegExp, string][] = [
    ["encerrar a abordagem", /Sem interesse/, "Chamada registada para Hugo Teixeira: a abordagem foi encerrada."],
    ["ligar numa data e hora", /Atendeu · ligar mais tarde/, `Chamada registada para Hugo Teixeira. Ligar a ${quando}.`],
    ["marcar a visita", /Atendeu · interessado/, `Chamada registada para Hugo Teixeira. Visita marcada para ${quando}.`],
  ];

  it.each(CASOS)("%s", async (nome, resultado, esperado) => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: resultado }));
    if (nome === "encerrar a abordagem") {
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Encerrar a abordagem/ }));
      fireEvent.change(within(dialogo).getByLabelText(/^Motivo/), { target: { value: "preco" } });
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
      fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
      const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Não atendeu/ }));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      return "Chamada registada: Hugo Teixeira passa a Contactado.";
    }],
    ["marcar a visita", async () => {
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Marcar a visita: Abordagem de Lúcia Faria"));
      const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
      fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-10-20" } });
      fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar visita" }));
      return "Visita marcada: Lúcia Faria passa a Visita.";
    }],
    ["guardar a visita e o levantamento", async () => {
      saida = simularSaidaAnimada();
      const painel = await abrirPainelVisita("Rita Albuquerque");
      marcarFeitaNoPainel(painel);
      await preencherLinha(painel);
      fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
      return "Visita feita: Rita Albuquerque continua em Visita. A fazer: Criar o negócio.";
    }],
    ["criar o negócio", async () => {
      await marcarFeitaEGuardar("Rita Albuquerque");
      saida = simularSaidaAnimada();
      fireEvent.click(botao("Criar o negócio: Abordagem de Rita Albuquerque"));
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
    await comEsc("Registar a chamada: Abordagem de Hugo Teixeira", "Registar chamada");
    expect(within(coluna("Por contactar")).getByText("Hugo Teixeira")).toBeInTheDocument();
  });

  it("marcar a visita", async () => {
    await comEsc("Marcar a visita: Abordagem de Lúcia Faria", "Marcar visita");
    expect(within(coluna("Contactado")).getByText("Lúcia Faria")).toBeInTheDocument();
  });

  it("o painel de visita e levantamento (marcar a visita como feita)", async () => {
    await comEsc("Marcar a visita como feita: Abordagem de Rita Albuquerque", "Visita e levantamento de Rita Albuquerque");
    expect(botao("Marcar a visita como feita: Abordagem de Rita Albuquerque")).toBeInTheDocument();
  }, TEMPO);

  it("o painel de criar o negócio", async () => {
    abrirPagina("quadro");
    await marcarFeitaEGuardar("Rita Albuquerque");
    const gatilho = botao("Criar o negócio: Abordagem de Rita Albuquerque");
    gatilho.focus();
    fireEvent.click(gatilho);
    const painel = await screen.findByRole("dialog", { name: "Novo negócio de Rita Albuquerque" });
    fireEvent.keyDown(painel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(botao("Criar o negócio: Abordagem de Rita Albuquerque")).toHaveFocus());
    expect(within(coluna("Visita")).getByText("Rita Albuquerque")).toBeInTheDocument();
  }, TEMPO);
});


describe("Diálogos dos passos: títulos", () => {
  it("o diálogo da chamada tem um só título, o visível, e é por ele que o diálogo se chama", async () => {
    abrirPagina("quadro");
    fireEvent.click(botao("Registar a chamada: Abordagem de Hugo Teixeira"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    const titulos = within(dialogo).getAllByText("Registar chamada");
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toBeVisible();
    expect(dialogo).toHaveAttribute("aria-labelledby", titulos[0].id);
  });
});
