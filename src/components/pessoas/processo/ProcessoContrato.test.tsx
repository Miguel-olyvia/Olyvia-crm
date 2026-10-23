// O fim do percurso do negócio a partir do «A fazer»: criar e enviar a proposta (sem orçamento detalhado), registar a resposta do cliente
// (aceitou: o Workflow decide se há contrato; recusou: o negócio perde-se com motivo) e registar a assinatura. O estado em memória é o
// MESMO nos dois quadros, e o aviso só sai depois de o diálogo desmontar.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { faseDoNegocio, isNegocioGanho, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { alteracoesAtuais, perdaDoNegocio, repor as reporNegocios } from "@/components/negocio-metas/negociosAlterados";
import { guardarWorkflow } from "@/components/negocio-metas/workflowGuardado";
import { copiarConfig, PREDEFINICAO } from "@/components/negocio-metas/workflowNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { simularSaidaAnimada } from "@/test/saidaAnimadaTeste";
import { negocioEmOrcamento } from "@/test/fabricaProcessoTestes";
import { PaginaDeTeste } from "@/test/PaginaDeTeste";
import { repor as reporExtras } from "./processoNegocios";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { reporExtras(); reporNegocios(); window.localStorage.clear(); });
afterEach(() => { reporExtras(); reporNegocios(); window.localStorage.clear(); });

const ORCAMENTOS = [{ id: "o1", valor: 1000, escolhido: true }];
const enviada = (extra: Partial<NegocioMes> = {}) => negocioEmOrcamento({ orcamentos: ORCAMENTOS, proposta: { estado: "enviada" }, ...extra });
const emContrato = () => negocioEmOrcamento({ orcamentos: ORCAMENTOS, proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });
const botao = (passo: string) => screen.getByRole("button", { name: `${passo}: Cozinha de a` });
const negocioAtual = () => alteracoesAtuais().editados.n1;
const aviso = () => screen.getByTestId("aviso");
const esperarSemDialogo = () => waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("criar a proposta de um negócio sem orçamento detalhado (os de exemplo)", () => {
  it("'Criar a proposta' já não só abre a ficha: abre as condições e, ao enviar, passa a Proposta", async () => {
    render(<PaginaDeTeste negocio={negocioEmOrcamento({ orcamentos: ORCAMENTOS })} />);
    fireEvent.click(botao("Criar a proposta"));
    const dialogo = await screen.findByRole("dialog", { name: "Enviar a proposta de Cozinha" });
    fireEvent.change(within(dialogo).getByLabelText("Início previsto"), { target: { value: "2026-11-02" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar a proposta" }));
    await esperarSemDialogo();
    expect(negocioAtual().proposta).toEqual({ estado: "enviada" });
    expect(botao("Registar a resposta do cliente")).toBeInTheDocument();
  });
});

describe("registar a resposta do cliente", () => {
  it("o botão executa (abre um diálogo com a resposta) e não se limita a abrir a ficha", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    expect(within(dialogo).getByRole("radio", { name: "O cliente aceitou" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("radio", { name: "O cliente recusou" })).toBeInTheDocument();
  });

  it("aceitou, e o Workflow pergunta: escolhe criar o contrato → o negócio passa a Contrato, nos dois quadros, e o aviso di-lo", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente aceitou" }));
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Criar o contrato" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(faseDoNegocio(negocioAtual())).toBe("contrato");
    expect(negocioAtual().contrato).toEqual({ estado: "pendente" });
    await waitFor(() => expect(aviso()).toHaveTextContent("Proposta aceite: a passa a Contrato. A fazer: Registar a assinatura."));
    expect(botao("Registar a assinatura")).toBeInTheDocument();
  });

  it("aceitou e fechou sem contrato → o negócio fica ganho e sai dos dois quadros", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente aceitou" }));
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Fechar o negócio sem contrato" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(isNegocioGanho(negocioAtual())).toBe(true);
    await waitFor(() => expect(aviso()).toHaveTextContent("Proposta aceite: o negócio de a está ganho."));
  });

  it("com o Workflow guardado a criar sempre o contrato, não pergunta: aceitar basta", async () => {
    guardarWorkflow({ ...copiarConfig(PREDEFINICAO), propostaGanho: "criarContrato" });
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente aceitou" }));
    expect(within(dialogo).queryByRole("radio", { name: "Criar o contrato" })).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(faseDoNegocio(negocioAtual())).toBe("contrato");
  });

  it("sem escolher a resposta, ou aceitando sem escolher o que fazer, não grava: o erro diz-se em texto e o diálogo fica", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    expect(within(dialogo).getByText("Escolha o que o cliente respondeu.")).toHaveClass("text-foreground");
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente aceitou" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    expect(within(dialogo).getByText("Escolha o que fazer a seguir.")).toHaveClass("text-foreground");
    expect(screen.getByRole("dialog")).toBe(dialogo);
    expect(alteracoesAtuais().editados).toEqual({});
  });

  it("recusou, com um motivo da lista → o negócio perde-se em Proposta, com o motivo, e sai dos quadros", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente recusou" }));
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    await esperarSemDialogo();
    expect(perdaDoNegocio("n1")).toMatchObject({ motivo: "Preço", fase: "proposta" });
    expect(screen.queryByRole("button", { name: /Cozinha de a/ })).not.toBeInTheDocument();
    await waitFor(() => expect(aviso()).toHaveTextContent("Proposta recusada: o negócio de a está perdido. Motivo: Preço."));
  });

  it("recusou sem motivo: não perde, e diz o que falta", async () => {
    render(<PaginaDeTeste negocio={enviada()} />);
    fireEvent.click(botao("Registar a resposta do cliente"));
    const dialogo = await screen.findByRole("dialog", { name: "Resposta do cliente: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "O cliente recusou" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Registar a resposta" }));
    expect(within(dialogo).getByText("Escolha o motivo da perda.")).toHaveClass("text-foreground");
    expect(perdaDoNegocio("n1")).toBeUndefined();
  });
});

describe("registar a assinatura", () => {
  it("confirmar a assinatura fecha o negócio como ganho e di-lo", async () => {
    render(<PaginaDeTeste negocio={emContrato()} />);
    fireEvent.click(botao("Registar a assinatura"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar a assinatura: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar a assinatura" }));
    await esperarSemDialogo();
    expect(isNegocioGanho(negocioAtual())).toBe(true);
    await waitFor(() => expect(aviso()).toHaveTextContent("Contrato assinado: o negócio de a está ganho."));
  });

  it("Cancelar fecha sem mudar nada", async () => {
    render(<PaginaDeTeste negocio={emContrato()} />);
    fireEvent.click(botao("Registar a assinatura"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar a assinatura: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await esperarSemDialogo();
    expect(alteracoesAtuais().editados).toEqual({});
  });
});

describe("o aviso só sai depois de o diálogo desmontar", () => {
  let saida: ReturnType<typeof simularSaidaAnimada>;
  afterEach(() => saida?.restaurar());

  it("registar a assinatura: durante a saída animada nada é anunciado; depois de desmontar, anuncia uma vez", async () => {
    const noAviso = { dialogos: -1 };
    const aoAnunciar = vi.fn(() => { noAviso.dialogos = document.querySelectorAll('[role="dialog"]').length; });
    render(<PaginaDeTeste negocio={emContrato()} aoAnunciar={aoAnunciar} />);
    saida = simularSaidaAnimada();
    fireEvent.click(botao("Registar a assinatura"));
    const dialogo = await screen.findByRole("dialog", { name: "Registar a assinatura: Cozinha" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar a assinatura" }));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
    saida.acabar();
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(noAviso.dialogos).toBe(0);
  });
});
