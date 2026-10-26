// A fase Contacto do assistente, ligada à gravação que já existe (os hooks da base estão simulados): os 5 passos, o que cada «Continuar» grava, o que fica em
// rascunho (morada da obra e Preparar a visita), e o que acontece quando a pessoa ainda não tem negócio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { Pessoa } from "../pessoasTipos";
import { ContactoDoGuia, type ContactoDoGuiaProps } from "./ContactoDoGuia";
import { chaveDoRascunho, lerRascunho } from "./rascunhoAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({
  guardarQual: vi.fn(),
  substituir: vi.fn(),
  preferencias: vi.fn(),
  questionario: null as unknown,
}));

vi.mock("@/hooks/pessoas/useGuardarQualificacao", async (original) => ({
  ...(await original<object>()),
  useGuardarQualificacao: () => ({ guardar: estado.guardarQual, aGuardar: false, pronto: true }),
}));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: estado.substituir }) }));
vi.mock("@/hooks/pessoas/useGuardarNifPessoa", () => ({ useGuardarNifPessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", async (original) => ({
  ...(await original<object>()),
  useGuardarContactoPessoa: () => ({ guardar: estado.preferencias }),
}));
vi.mock("@/hooks/pessoas/QuestionarioFormularioProvider", async () => {
  const { QuestionarioContext } = await import("@/components/negocio-metas/QuestionarioContexto");
  return {
    QuestionarioFormularioProvider: ({ children }: { children: ReactNode }) => (
      <QuestionarioContext.Provider
        value={{ questionario: estado.questionario as QuestionarioForm, estado: "pronto", erro: null, podeGuardar: true, repetir: vi.fn(), recarregar: async () => null }}
      >
        {children}
      </QuestionarioContext.Provider>
    ),
  };
});

const pergunta = (id: string, rotulo: string) => ({ id, rotulo: [rotulo, rotulo] as const, literal: true, opcoes: [["a", "Sim", "Sim"], ["b", "Não", "Não"]] as const });
const QUESTIONARIO: QuestionarioForm = {
  versao: 4, semBase: false,
  seccoes: [{
    id: "qualificacao", titulo: ["Qualificação", "Qualification"], aba: "qualificacao", literal: true,
    blocos: [{ id: "q-0", literal: true, perguntas: ["Tipo de imóvel", "O cliente é", "Quem decide", "Orçamento", "Para quando", "Outros orçamentos"].map((r, i) => pergunta(`p${i + 1}`, r)) }],
  }],
};

const PESSOA = {
  id: "pe1", nome: "Ana Lopes", contacto: { telefone: "927 118 300", email: "ana@exemplo.pt" }, comercial: "Rita", ultimoContactoDias: null,
  moradaCampos: { rua: "Rua da Ana 9", codigoPostal: "4000-001", localidade: "Porto", andar: "2.º" }, lingua: "pt",
} as unknown as Pessoa;

function montar(extra: Partial<ContactoDoGuiaProps> = {}) {
  const props: ContactoDoGuiaProps = {
    pessoa: PESSOA, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 1, visitaMarcada: false, podeEditar: true,
    podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
    faseRotuloChave: "pessoasPagina.board.col.contactado", ...extra,
  };
  render(<ContactoDoGuia {...props} />);
  return props;
}
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));
const irPara = (nome: RegExp) => fireEvent.click(coluna().getByRole("button", { name: nome }));
const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

beforeEach(() => {
  window.sessionStorage.clear();
  estado.questionario = QUESTIONARIO;
  estado.guardarQual.mockReset().mockResolvedValue({ mudou: true, questionarioMudou: false });
  estado.substituir.mockReset().mockResolvedValue({ mudou: true });
  estado.preferencias.mockReset().mockResolvedValue({ mudou: true });
});
afterEach(cleanup);

describe("a fase Contacto: os cinco passos", () => {
  it("lista Chamada, Qualificação, Morada da obra, Preparar a visita e Marcar a visita", () => {
    montar();
    // Os números são as bolinhas do telemóvel (escondidas no ecrã largo).
    expect(coluna().getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, "").replace(/, .*$/, ""))).toEqual([
      "Chamada", "Qualificação", "Morada da obra", "Preparar a visita", "Marcar a visita",
    ]);
  });

  it("abre no primeiro passo que ainda falta (com a chamada feita, a Qualificação)", () => {
    montar({ chamadas: 1 });
    expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument();
    expect(screen.getByText(/^Passo 2 de 5 · faltam 6 respostas/)).toBeInTheDocument();
  });

  it("sem chamadas abre na Chamada, com telefone e email da pessoa", () => {
    montar({ chamadas: 0 });
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toHaveValue("927 118 300");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@exemplo.pt");
  });
});

describe("Chamada", () => {
  it("«Registar a chamada» abre o registo existente", () => {
    const p = montar({ chamadas: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Registar a chamada" }));
    expect(p.aoRegistarChamada).toHaveBeenCalledTimes(1);
  });

  it("Continuar grava o telefone novo (e só ele) e avança", async () => {
    montar({ chamadas: 0 });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "910 000 000" } });
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument());
    expect(estado.substituir).toHaveBeenCalledWith({ email: undefined, telefone: "910 000 000" });
    expect(estado.preferencias).not.toHaveBeenCalled();
  });

  it("as preferências da PESSOA gravam-se à parte do telefone", async () => {
    montar({ chamadas: 0 });
    fireEvent.change(screen.getByLabelText("Melhor hora"), { target: { value: "tarde" } });
    fireEvent.change(screen.getByLabelText("Prefere ser contactado"), { target: { value: "whatsapp" } });
    continuar();
    await waitFor(() => expect(estado.preferencias).toHaveBeenCalledWith({ contacto: "whatsapp", hora: "tarde", lingua: undefined }));
    expect(estado.substituir).not.toHaveBeenCalled();
  });

  it("sem alterações não chama a base", async () => {
    montar({ chamadas: 0 });
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument());
    expect(estado.substituir).not.toHaveBeenCalled();
    expect(estado.preferencias).not.toHaveBeenCalled();
  });

  it("um email inválido não grava, fica no passo, diz porquê e marca o campo", async () => {
    montar({ chamadas: 0 });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "isto-nao-e-email" } });
    continuar();
    expect(await screen.findByRole("alert")).toHaveTextContent("Indique um email válido.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(estado.substituir).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
  });

  it("se a base recusa, fica no passo com o erro dito em texto", async () => {
    estado.substituir.mockRejectedValue(new Error("falhou"));
    montar({ chamadas: 0 });
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "910 000 000" } });
    continuar();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Chamada" })).toBeInTheDocument();
  });
});

describe("Qualificação", () => {
  it("mostra as 6 perguntas do questionário e «o que o cliente pediu» à parte", () => {
    montar();
    for (const r of ["Tipo de imóvel", "O cliente é", "Quem decide", "Orçamento", "Para quando", "Outros orçamentos"]) expect(screen.getByText(r)).toBeInTheDocument();
    expect(screen.getByLabelText("O que o cliente pediu")).toBeInTheDocument();
    expect(screen.getByText("0 de 6 respondidas")).toBeInTheDocument();
  });

  it("responder reduz o «faltam X»", () => {
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    expect(screen.getByText(/^Passo 2 de 5 · faltam 5 respostas/)).toBeInTheDocument();
  });

  it("Continuar grava as respostas e o pedido no negócio, com a entidade, e avança", async () => {
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    fireEvent.change(screen.getByLabelText("O que o cliente pediu"), { target: { value: "Casa de banho nova" } });
    continuar();
    await waitFor(() => expect(estado.guardarQual).toHaveBeenCalledTimes(1));
    expect(estado.guardarQual).toHaveBeenCalledWith({ negocioId: "n1", entityId: "pe1", respostas: { p1: "a" }, pedidoCliente: "Casa de banho nova" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument());
  });

  it("sem alterações não grava", async () => {
    montar();
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument());
    expect(estado.guardarQual).not.toHaveBeenCalled();
  });

  it("repetir Continuar depois de gravar não volta a mandar o mesmo", async () => {
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument());
    irPara(/^Qualificação/);
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument());
    expect(estado.guardarQual).toHaveBeenCalledTimes(1);
  });

  it("abre com as respostas e o pedido que o negócio já tem", () => {
    montar({
      negocio: {
        id: "n1", pedidoCliente: "Pintar tudo",
        qualificacaoGravada: [{
          seccao: "qualificacao", pergunta: "p2", resposta: "b", tipo: "escolha_unica", perguntaTexto: "O cliente é", seccaoTitulo: "Qualificação", bloco: null, ordem: 2,
          escolhas: ["b"], escolhasTexto: ["Não"], valorTexto: null, valorNumero: null,
        }],
      },
    });
    expect(screen.getByLabelText("O que o cliente pediu")).toHaveValue("Pintar tudo");
    expect(screen.getByText(/^Passo 2 de 5 · faltam 5 respostas/)).toBeInTheDocument();
  });

  it("se a gravação falha, fica no passo e diz o erro", async () => {
    estado.guardarQual.mockRejectedValue(new Error("falhou"));
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    continuar();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument();
  });

  it("sem negócio mostra a razão em texto e «Criar o negócio»; não há perguntas nem gravação", async () => {
    const p = montar({ negocio: null });
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    expect(screen.queryByText("Tipo de imóvel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar o negócio" }));
    expect(p.aoCriarNegocio).toHaveBeenCalledTimes(1);
    continuar();
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument());
    expect(estado.guardarQual).not.toHaveBeenCalled();
  });

  it("sem permissão de editar diz-o e não deixa escrever", () => {
    montar({ podeEditar: false });
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
    expect(screen.queryByText("Tipo de imóvel")).not.toBeInTheDocument();
  });
});

describe("Morada da obra", () => {
  it("começa vazia, com «Preencher com os dados da entidade»", () => {
    montar();
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Preencher com os dados da entidade" }));
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua da Ana 9");
    expect(screen.getByLabelText("Localidade")).toHaveValue("Porto");
    expect(screen.getByLabelText("Andar / fração")).toHaveValue("2.º");
  });

  it("o que se escreve fica em rascunho, que sobrevive a mudar de passo e a recarregar", () => {
    montar();
    irPara(/^Morada da obra/);
    fireEvent.change(screen.getByLabelText("Rua e número"), { target: { value: "Rua Nova 3" } });
    expect(lerRascunho("n1").morada.rua).toBe("Rua Nova 3");
    cleanup();
    montar();
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua Nova 3");
  });

  it("conta rua, código postal e localidade no «faltam X»", () => {
    montar();
    irPara(/^Morada da obra/);
    expect(screen.getByText(/^Passo 3 de 5 · faltam 3 respostas/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rua e número"), { target: { value: "Rua Nova 3" } });
    expect(screen.getByText(/^Passo 3 de 5 · faltam 2 respostas/)).toBeInTheDocument();
  });

  it("um código postal fora do formato não deixa continuar", async () => {
    montar();
    irPara(/^Morada da obra/);
    fireEvent.change(screen.getByLabelText("Código postal"), { target: { value: "12" } });
    continuar();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Morada da obra" })).toBeInTheDocument();
  });

  it("sem negócio mostra a razão e «Criar o negócio»", () => {
    montar({ negocio: null });
    irPara(/^Morada da obra/);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Rua e número")).not.toBeInTheDocument();
  });
});

describe("Preparar a visita e Marcar a visita", () => {
  it("Preparar começa sem nada escolhido e guarda como rascunho do assistente", () => {
    montar();
    irPara(/^Preparar a visita/);
    expect(screen.getByRole("button", { name: "1 h" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "1 h 30" }));
    fireEvent.click(screen.getByRole("button", { name: "O casal" }));
    fireEvent.change(screen.getByLabelText("Nota para a visita (opcional)"), { target: { value: "Levar escada" } });
    expect(lerRascunho("n1").preparar).toEqual({ duracao: "h1m30", quem: "casal", nota: "Levar escada" });
    expect(window.sessionStorage.getItem(chaveDoRascunho("n1"))).toContain("h1m30");
  });

  it("Preparar sem negócio mostra a razão e «Criar o negócio»", () => {
    montar({ negocio: null });
    irPara(/^Preparar a visita/);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
  });

  it("os valores preparados seguem para «Marcar a visita»", () => {
    const p = montar();
    irPara(/^Preparar a visita/);
    fireEvent.click(screen.getByRole("button", { name: "2 h" }));
    fireEvent.click(screen.getByRole("button", { name: "A família" }));
    irPara(/^Marcar a visita/);
    expect(screen.getByText(/Preparado: 2 h · A família/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar a visita" }));
    expect(p.aoMarcarVisita).toHaveBeenCalledWith({ duracao: "h2", quemVaiEstar: "familia", nota: "" }, expect.anything());
  });

  it("Marcar a visita funciona sem negócio (a visita nasce com a pessoa)", () => {
    const p = montar({ negocio: null });
    irPara(/^Marcar a visita/);
    fireEvent.click(screen.getByRole("button", { name: "Marcar a visita" }));
    expect(p.aoMarcarVisita).toHaveBeenCalledTimes(1);
  });

  it.each([["semInteresse", /Sem interesse/], ["numeroErrado", /Número errado/]] as const)("%s: avisa, bloqueia a visita e não a marca", (resultado, texto) => {
    const p = montar({ ultimoResultado: resultado });
    irPara(/^Marcar a visita/);
    const botao = screen.getByRole("button", { name: "Marcar a visita" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText(texto).length).toBeGreaterThan(0);
    fireEvent.click(botao);
    expect(p.aoMarcarVisita).not.toHaveBeenCalled();
  });

  it("com interesse a visita marca-se normalmente", () => {
    const p = montar({ ultimoResultado: "atendeuInteressado" });
    irPara(/^Marcar a visita/);
    fireEvent.click(screen.getByRole("button", { name: "Marcar a visita" }));
    expect(p.aoMarcarVisita).toHaveBeenCalledTimes(1);
  });

  it("com visita marcada diz-o", () => {
    montar({ visitaMarcada: true });
    irPara(/^Marcar a visita/);
    expect(screen.getByText("Já há uma visita marcada.")).toBeInTheDocument();
  });
});
