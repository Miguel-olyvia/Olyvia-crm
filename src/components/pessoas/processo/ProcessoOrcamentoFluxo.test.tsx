// O processo do orçamento à proposta na página (Fase 4): criar o orçamento, verificá-lo (com um bloqueio resolvido) e enviar a proposta, a
// partir dos botões do "A fazer", com o estado em memória a ser o MESMO no Quadro de Pessoas e no Quadro de Negócios.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { faseDoNegocio, valorDoNegocio } from "@/components/negocio-metas/negocioMetas";
import { alteracoesAtuais, perderNegocio, repor as reporNegocios } from "@/components/negocio-metas/negociosAlterados";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { simularSaidaAnimada } from "@/test/saidaAnimadaTeste";
import { HOJE, negocioEmOrcamento } from "@/test/fabricaProcessoTestes";
import { PaginaDeTeste } from "@/test/PaginaDeTeste";
import { extrasAtuais, repor as reporExtras } from "./processoNegocios";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { reporExtras(); reporNegocios(); });
afterEach(() => { reporExtras(); reporNegocios(); });

const botao = (passo: string, aFicha = false) => screen.getByRole("button", { name: `${passo}: Cozinha de a${aFicha ? " (abre a ficha)" : ""}` });
const negocioAtual = () => alteracoesAtuais().editados.n1;
const aviso = () => screen.getByTestId("aviso");
const colunaDe = (quadro: string, fase: string) => {
  const titulo = within(screen.getByTestId(quadro)).getByRole("heading", { name: new RegExp(`^${fase}`) });
  return within(titulo.closest("section") as HTMLElement);
};
const esperarSemDialogo = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

const juntar = async (dialogo: HTMLElement, servico: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: "Juntar um serviço" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: servico }));
};

describe("do orçamento à proposta: um negócio em Orçamento percorre os três passos", () => {
  it("criar o orçamento → verificar (um preço abaixo do custo resolvido com 'Usar X €') → enviar a proposta; os dois quadros dizem o mesmo", async () => {
    render(<PaginaDeTeste negocio={negocioEmOrcamento()} />);
    expect(colunaDe("quadro-pessoas", "Negócio").getByRole("button", { name: "Criar o orçamento: Cozinha de a" })).toBeInTheDocument();

    // 1. Criar o orçamento: 10 m² de pavimento a 17 € (abaixo do custo, que é de 18 €).
    fireEvent.click(botao("Criar o orçamento"));
    let dialogo = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    await juntar(dialogo, "Pavimento");
    fireEvent.change(within(dialogo).getByLabelText("Quantidade de Pavimento"), { target: { value: "10" } });
    fireEvent.change(within(dialogo).getByLabelText("Preço unit. (€) de Pavimento"), { target: { value: "17" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o orçamento" }));
    await esperarSemDialogo();
    expect(valorDoNegocio(negocioAtual())).toBeCloseTo(180.2, 9);
    expect(faseDoNegocio(negocioAtual())).toBe("orcamento");
    expect(extrasAtuais().n1.orcamento).toMatchObject({ verificado: false, direcao: null, desconto: 0, versao: 1 });
    await waitFor(() => expect(aviso()).toHaveTextContent("Orçamento guardado: a. A fazer: Verificar o orçamento."));
    expect(botao("Verificar o orçamento")).toBeInTheDocument();

    // 2. Verificar: o preço abaixo do custo bloqueia; "Usar 25,00 €" resolve-o.
    fireEvent.click(botao("Verificar o orçamento"));
    dialogo = await screen.findByRole("dialog", { name: "Verificar o orçamento de Cozinha" });
    expect(within(dialogo).getByText(/Preço abaixo do custo em Pavimento: 17,00 € contra um custo de 18,00 €\./)).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Marcar como verificado" })).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Usar 25,00 € em Pavimento" }));
    fireEvent.click(await within(dialogo).findByRole("button", { name: "Marcar como verificado" }));
    await esperarSemDialogo();
    expect(valorDoNegocio(negocioAtual())).toBeCloseTo(265, 9);
    expect(extrasAtuais().n1.orcamento).toMatchObject({ verificado: true, linhas: [expect.objectContaining({ trabalho: "pavimento", precoUnitario: 25 })] });
    await waitFor(() => expect(aviso()).toHaveTextContent("Orçamento verificado: a. A fazer: Enviar a proposta."));

    // 3. Enviar a proposta.
    fireEvent.click(botao("Enviar a proposta"));
    dialogo = await screen.findByRole("dialog", { name: "Enviar a proposta de Cozinha" });
    fireEvent.change(within(dialogo).getByLabelText("Início previsto"), { target: { value: "2026-11-16" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar a proposta" }));
    await esperarSemDialogo();

    // O negócio e o extra mudaram juntos; o cartão passou a Proposta, nos dois quadros, com o mesmo valor.
    expect(negocioAtual().proposta).toEqual({ estado: "enviada" });
    expect(faseDoNegocio(negocioAtual())).toBe("proposta");
    expect(valorDoNegocio(negocioAtual())).toBeCloseTo(265, 9);
    expect(extrasAtuais().n1.condicoes).toEqual({ validade: 30, prazo: 5, inicio: "2026-11-16", pagamento: "metade", garantia: 2, notas: "" });
    // O Quadro de Pessoas tem uma só coluna «Negócio» (a fase vê-se ao abrir o negócio): o cartão fica lá, com o valor da proposta.
    expect(colunaDe("quadro-pessoas", "Negócio").getAllByText("€265").length).toBeGreaterThan(0);
    expect(colunaDe("quadro-negocios", "Proposta").getAllByText("€265").length).toBeGreaterThan(0);
    expect(colunaDe("quadro-negocios", "Orçamento").queryByText("€265")).not.toBeInTheDocument();
    await waitFor(() => expect(aviso()).toHaveTextContent("Proposta enviada: a passa a Proposta."));
    expect(botao("Registar a resposta do cliente")).toBeInTheDocument();
  });

  it("o editor abre com as linhas do levantamento da visita (os trabalhos iguais somam, o texto livre fica como 'Outro')", async () => {
    const levantamento = {
      data: "2026-10-12", feitoPor: "Ana", estado: "feito" as const, observacoes: "",
      linhas: [
        { divisao: "Sala", trabalho: "Pavimento", medida: 12, unidade: "m²", observacoes: "" },
        { divisao: "Quarto", trabalho: "Pavimento", medida: 8, unidade: "m²", observacoes: "" },
        { divisao: "Exterior", trabalho: "Lareira", medida: 1, unidade: "un", observacoes: "" },
      ],
    };
    render(<PaginaDeTeste negocio={negocioEmOrcamento({ levantamento })} />);
    fireEvent.click(botao("Criar o orçamento"));
    const dialogo = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    expect(within(dialogo).getByLabelText("Quantidade de Pavimento")).toHaveValue("20");
    expect(within(dialogo).getByLabelText("Preço unit. (€) de Pavimento")).toHaveValue("30");
    expect(within(dialogo).getByLabelText("Quantidade de Lareira")).toHaveValue("1");
  });

  it("sem levantamento o editor abre vazio; guardar sem linhas diz o que falta, dentro do diálogo, e não grava nada", async () => {
    render(<PaginaDeTeste negocio={negocioEmOrcamento()} />);
    fireEvent.click(botao("Criar o orçamento"));
    const dialogo = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    expect(within(dialogo).getByText("Ainda sem linhas. Junte o primeiro serviço.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o orçamento" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Criar o orçamento: ainda não é possível. O orçamento precisa de pelo menos uma linha.");
    expect(screen.getByRole("dialog")).toBe(dialogo);
    expect(alteracoesAtuais().editados).toEqual({});
    expect(extrasAtuais()).toEqual({});
  });
});

describe("o aviso só sai depois de o diálogo desmontar", () => {
  let saida: ReturnType<typeof simularSaidaAnimada>;
  afterEach(() => saida?.restaurar());

  it("guardar o orçamento: durante a saída animada nada é anunciado; depois de desmontar, anuncia uma vez, sem diálogos nem aria-hidden", async () => {
    const levantamento = {
      data: "2026-10-12", feitoPor: "Ana", estado: "feito" as const, observacoes: "",
      linhas: [{ divisao: "Sala", trabalho: "Pavimento", medida: 12, unidade: "m²", observacoes: "" }],
    };
    const noAviso = { dialogos: -1, escondidos: -1 };
    const aoAnunciar = vi.fn(() => {
      noAviso.dialogos = document.querySelectorAll('[role="dialog"]').length;
      noAviso.escondidos = document.querySelectorAll("[data-aria-hidden]").length;
    });
    render(<PaginaDeTeste negocio={negocioEmOrcamento({ levantamento })} aoAnunciar={aoAnunciar} />);
    saida = simularSaidaAnimada();
    fireEvent.click(botao("Criar o orçamento"));
    const dialogo = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o orçamento" }));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
    saida.acabar();
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(noAviso).toEqual({ dialogos: 0, escondidos: 0 });
    expect(aoAnunciar).toHaveBeenCalledWith("Orçamento guardado: a. A fazer: Verificar o orçamento.");
    // O botão do passo que ficou é o do mesmo item e recebe o foco.
    expect(botao("Verificar o orçamento")).toHaveFocus();
  });
});

describe("uma proposta em rascunho do exemplo (sem orçamento detalhado)", () => {
  it("'Enviar a proposta' abre as condições e, ao enviar, passa a Proposta enviada, com o mesmo valor", async () => {
    const rascunho = negocioEmOrcamento({ orcamentos: [{ id: "x4-o1", valor: 5600, escolhido: true }], proposta: { estado: "rascunho" } });
    render(<PaginaDeTeste negocio={rascunho} />);
    fireEvent.click(botao("Enviar a proposta"));
    const dialogo = await screen.findByRole("dialog", { name: "Enviar a proposta de Cozinha" });
    expect(dialogo).toHaveAccessibleDescription(/5\.600,00 €/);
    fireEvent.change(within(dialogo).getByLabelText("Início previsto"), { target: { value: "2026-11-02" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar a proposta" }));
    await esperarSemDialogo();
    expect(negocioAtual().proposta).toEqual({ estado: "enviada" });
    expect(valorDoNegocio(negocioAtual())).toBe(5600);
    expect(extrasAtuais().n1.orcamento).toBeUndefined();
    expect(botao("Registar a resposta do cliente")).toBeInTheDocument();
  });
});

describe("guardar quando o negócio já não está em aberto", () => {
  it("o diálogo não fecha em silêncio: fica aberto e diz, num alerta, que o negócio já não está em aberto; nada se grava", async () => {
    render(<PaginaDeTeste negocio={negocioEmOrcamento()} />);
    fireEvent.click(botao("Criar o orçamento"));
    const dialogo = await screen.findByRole("dialog", { name: "Orçamento de Cozinha" });
    await juntar(dialogo, "Pavimento");
    // Entretanto o negócio perde-se (outro separador, outro utilizador): a pessoa deixa de o ter em aberto.
    act(() => perderNegocio(negocioEmOrcamento(), "Sem resposta", HOJE));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o orçamento" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Criar o orçamento: ainda não é possível. Este negócio já não está em aberto: não há nada a guardar.");
    expect(screen.getByRole("dialog")).toBe(dialogo);
    expect(extrasAtuais()).toEqual({});
  });
});
