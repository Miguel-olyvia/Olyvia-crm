// A fase Contacto do assistente, os casos que só se veem a mexer no tempo: criar o negócio a meio não remonta o ecrã nem perde o escrito, o rascunho
// migra da chave da pessoa para a do negócio, o que o negócio já tinha chega ao ecrã quando ele aparece, e o passo inicial espera pelo questionário.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { EstadoDoQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import type { Pessoa } from "../pessoasTipos";
import { ContactoDoGuia, type ContactoDoGuiaProps } from "./ContactoDoGuia";
import { chaveDoRascunho, lerRascunho } from "./rascunhoAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({ guardarQual: vi.fn(), substituir: vi.fn(), preferencias: vi.fn(), questionario: null as unknown, estadoQ: "pronto" as string }));

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
        value={{ questionario: estado.questionario as QuestionarioForm, estado: estado.estadoQ as EstadoDoQuestionario, erro: null, podeGuardar: true, repetir: vi.fn(), recarregar: async () => null }}
      >
        {children}
      </QuestionarioContext.Provider>
    ),
  };
});

const pergunta = (id: string, rotulo: string) => ({ id, rotulo: [rotulo, rotulo] as const, literal: true, opcoes: [["a", "Sim", "Sim"], ["b", "Não", "Não"]] as const });
const COM_PERGUNTAS: QuestionarioForm = {
  versao: 4, semBase: false,
  seccoes: [{ id: "qualificacao", titulo: ["Qualificação", "Qualification"], aba: "qualificacao", literal: true, blocos: [{ id: "q-0", literal: true, perguntas: [pergunta("p1", "Tipo de imóvel"), pergunta("p2", "O cliente é")] }] }],
};
const SEM_PERGUNTAS: QuestionarioForm = { versao: 0, semBase: false, seccoes: [] };

const PESSOA = {
  id: "pe1", nome: "Ana Lopes", contacto: { telefone: "927 118 300", email: "ana@exemplo.pt" }, comercial: "Rita", ultimoContactoDias: null,
  moradaCampos: { rua: "", codigoPostal: "", localidade: "", andar: "" }, lingua: "pt",
} as unknown as Pessoa;

const propsBase = (extra: Partial<ContactoDoGuiaProps> = {}): ContactoDoGuiaProps => ({
  pessoa: PESSOA, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 1, visitaMarcada: false, podeEditar: true,
  podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
  faseRotuloChave: "pessoasPagina.board.col.contactado", ...extra,
});
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));

beforeEach(() => {
  window.sessionStorage.clear();
  estado.questionario = COM_PERGUNTAS;
  estado.estadoQ = "pronto";
  estado.guardarQual.mockReset().mockResolvedValue({ mudou: true, questionarioMudou: false });
  estado.substituir.mockReset().mockResolvedValue({ mudou: true });
  estado.preferencias.mockReset().mockResolvedValue({ mudou: true });
});
afterEach(cleanup);

describe("criar o negócio a meio não perde o escrito", () => {
  it("o ecrã não remonta quando o negócio aparece: o telefone que se estava a escrever continua lá", () => {
    const { rerender } = render(<ContactoDoGuia {...propsBase({ negocio: null, chamadas: 0 })} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "910 000 000" } });
    rerender(<ContactoDoGuia {...propsBase({ negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 0 })} />);
    expect(screen.getByLabelText("Telefone")).toHaveValue("910 000 000");
  });

  it("o rascunho guardado na chave da pessoa passa para a do negócio, e a antiga fica vazia", async () => {
    window.sessionStorage.setItem(chaveDoRascunho("pessoa-pe1"), JSON.stringify({ preparar: { duracao: "h2", quem: "casal", nota: "Levar escada" } }));
    const { rerender } = render(<ContactoDoGuia {...propsBase({ negocio: null })} />);
    rerender(<ContactoDoGuia {...propsBase()} />);
    await waitFor(() => expect(lerRascunho("n1").preparar).toEqual({ duracao: "h2", quem: "casal", nota: "Levar escada" }));
    expect(window.sessionStorage.getItem(chaveDoRascunho("pessoa-pe1"))).toBeNull();
    fireEvent.click(coluna().getByRole("button", { name: /^Preparar a visita/ }));
    expect(screen.getByLabelText("Nota para a visita (opcional)")).toHaveValue("Levar escada");
  });

  it("o que o negócio já tinha (o pedido do cliente) chega ao ecrã quando ele aparece depois de montar", () => {
    const { rerender } = render(<ContactoDoGuia {...propsBase({ negocio: null })} />);
    rerender(<ContactoDoGuia {...propsBase({ negocio: { id: "n1", pedidoCliente: "Casa de banho completa", qualificacaoGravada: [] } })} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Qualificação/ }));
    expect(screen.getByDisplayValue("Casa de banho completa")).toBeInTheDocument();
  });
});

describe("o passo inicial com o questionário a carregar", () => {
  it("não salta a Qualificação só porque as perguntas ainda não chegaram: quando chegam abre nela", () => {
    estado.questionario = SEM_PERGUNTAS;
    estado.estadoQ = "a-carregar";
    const { rerender } = render(<ContactoDoGuia {...propsBase({ chamadas: 1 })} />);
    estado.questionario = COM_PERGUNTAS;
    estado.estadoQ = "pronto";
    rerender(<ContactoDoGuia {...propsBase({ chamadas: 1 })} />);
    expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toBeInTheDocument();
  });
});
