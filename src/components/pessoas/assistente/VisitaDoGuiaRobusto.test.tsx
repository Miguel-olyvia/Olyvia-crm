// A fase Visita do assistente, os casos que só se veem a mexer no tempo: criar o negócio a meio não remonta o ecrã nem perde o escrito (o rascunho
// migra da chave da pessoa para a do negócio), gravar com sucesso apaga o rascunho, o passo inicial espera pelo questionário, e «Cancelar visita» usa a
// ação que já existe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { EstadoDoQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { Pessoa } from "../pessoasTipos";
import { RASCUNHO_VAZIO, chaveDoRascunho, guardarRascunho, lerRascunho } from "./rascunhoAssistente";
import { VisitaDoGuia, type VisitaDoGuiaProps } from "./VisitaDoGuia";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

const estado = vi.hoisted(() => ({
  guardar: vi.fn(), concluir: vi.fn(), cancelar: vi.fn(), questionario: null as unknown, estadoQ: "pronto" as string,
}));

vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({ useAcoesVisita: () => ({ concluir: estado.concluir, cancelar: estado.cancelar }) }));
vi.mock("@/hooks/pessoas/useGuardarRegistos", async (original) => ({
  ...(await original<object>()),
  useGuardarRegistos: () => ({ guardar: estado.guardar, verificar: vi.fn(), aGuardar: false, pronto: true }),
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
const seccao = (id: string, titulo: string, perguntas: string[], extra: Record<string, unknown> = {}) => ({
  id, titulo: [titulo, titulo] as const, literal: true, blocos: perguntas.length ? [{ id: `${id}-0`, literal: true, perguntas: perguntas.map((p) => pergunta(`${id}_${p}`, p)) }] : [], ...extra,
});
const COMPLETO = {
  versao: 4, semBase: false,
  seccoes: [seccao("visitas", "Visitas", [], { especial: "visitas" }), seccao("exterior", "Exterior do edifício", ["Há elevador?"]), seccao("interior", "Interior do espaço", ["Estado das paredes?"])],
} as unknown as QuestionarioForm;
const VAZIO = { versao: 0, semBase: false, seccoes: [] } as unknown as QuestionarioForm;

const PESSOA = { id: "pe1", nome: "Ana Lopes", contacto: { telefone: null, email: null }, comercial: "Rita", ultimoContactoDias: null } as unknown as Pessoa;
const VISITA = (id: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, nota: "", pessoaId: "pe1", negocioId: "n1", ...extra,
});
const propsBase = (extra: Partial<VisitaDoGuiaProps> = {}): VisitaDoGuiaProps => ({
  pessoa: PESSOA, negocio: { id: "n1" }, visitas: [VISITA("v1")], levantamentoGuardado: false, ficha: { pessoa: { id: "pe1" } } as unknown as FichaDb, podeEditar: true,
  aoCriarNegocio: vi.fn(), aoMarcarOutra: vi.fn(), faseRotuloChave: "pessoasPagina.phases.visita", feitas: [], aoVerFase: vi.fn(), nivel: "h3", ...extra,
});
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));

beforeEach(() => {
  prepararRadixNoJsdom();
  window.sessionStorage.clear();
  estado.questionario = COMPLETO;
  estado.estadoQ = "pronto";
  estado.guardar.mockReset().mockResolvedValue({ feitos: ["levantamento"], levantamento: { questionarioMudou: false } });
  estado.concluir.mockReset().mockResolvedValue(undefined);
  estado.cancelar.mockReset().mockResolvedValue({ mudou: true });
  sucesso.mockReset();
});
afterEach(cleanup);

describe("criar o negócio a meio não perde o escrito", () => {
  it("o ecrã não remonta quando o negócio aparece: um cartão de visita aberto continua aberto", () => {
    const { rerender } = render(<VisitaDoGuia {...propsBase({ negocio: null, visitas: [VISITA("v1"), VISITA("v2", { estado: "feita" })] })} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Visitas/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Visita 2/ }));
    expect(screen.getByRole("button", { name: /^Visita 2/ })).toHaveAttribute("aria-expanded", "true");
    rerender(<VisitaDoGuia {...propsBase({ negocio: { id: "n1" }, visitas: [VISITA("v1"), VISITA("v2", { estado: "feita" })] })} />);
    expect(screen.getByRole("button", { name: /^Visita 2/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("o rascunho guardado na chave da pessoa passa para a do negócio, e a antiga fica vazia", async () => {
    guardarRascunho("pessoa-pe1", { ...RASCUNHO_VAZIO, observacoes: "Escrito antes do negócio", respostas: { "exterior_Há elevador?": "a" } });
    const { rerender } = render(<VisitaDoGuia {...propsBase({ negocio: null })} />);
    rerender(<VisitaDoGuia {...propsBase({ negocio: { id: "n1" } })} />);
    await waitFor(() => expect(lerRascunho("n1").observacoes).toBe("Escrito antes do negócio"));
    expect(lerRascunho("n1").respostas).toEqual({ "exterior_Há elevador?": "a" });
    expect(window.sessionStorage.getItem(chaveDoRascunho("pessoa-pe1"))).toBeNull();
  });
});

describe("gravar com sucesso apaga o rascunho", () => {
  it("depois de «Guardar o levantamento» correr bem, a base é que guarda: o rascunho do navegador deixa de existir", async () => {
    guardarRascunho("n1", { ...RASCUNHO_VAZIO, respostas: { "exterior_Há elevador?": "a" } });
    render(<VisitaDoGuia {...propsBase()} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Fechar levantamento/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    await waitFor(() => expect(estado.guardar).toHaveBeenCalledTimes(1));
    await screen.findByText("O levantamento está guardado.");
    expect(window.sessionStorage.getItem(chaveDoRascunho("n1"))).toBeNull();
  });

  it("se a gravação falha o rascunho fica (nada se perde)", async () => {
    estado.guardar.mockRejectedValue(new Error("falhou"));
    guardarRascunho("n1", { ...RASCUNHO_VAZIO, respostas: { "exterior_Há elevador?": "a" } });
    render(<VisitaDoGuia {...propsBase()} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Fechar levantamento/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    await screen.findByRole("alert");
    expect(lerRascunho("n1").respostas).toEqual({ "exterior_Há elevador?": "a" });
  });
});

describe("o passo inicial com o questionário a carregar", () => {
  it("não abre em «Fechar levantamento» só porque as secções ainda não chegaram: quando chegam abre na primeira que falta", () => {
    estado.questionario = VAZIO;
    estado.estadoQ = "a-carregar";
    const { rerender } = render(<VisitaDoGuia {...propsBase()} />);
    estado.questionario = COMPLETO;
    estado.estadoQ = "pronto";
    rerender(<VisitaDoGuia {...propsBase()} />);
    expect(screen.getByRole("heading", { level: 3, name: "Exterior do edifício" })).toBeInTheDocument();
  });
});

describe("«Cancelar visita» no assistente", () => {
  it("cancela com a ação que já existe, depois de confirmar", async () => {
    render(<VisitaDoGuia {...propsBase()} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Visitas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar visita" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar a visita" }));
    await waitFor(() => expect(estado.cancelar).toHaveBeenCalledWith("v1"));
  });

  it("sem permissão de editar não há «Cancelar visita»", () => {
    render(<VisitaDoGuia {...propsBase({ podeEditar: false })} />);
    fireEvent.click(coluna().getByRole("button", { name: /^Visitas/ }));
    expect(screen.queryByRole("button", { name: "Cancelar visita" })).toBeNull();
  });
});
