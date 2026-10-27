// O passo «Morada da obra» abre com a morada gravada no levantamento quando não há rascunho (e a visita não tem morada), e numa fase feita lê-se com
// «Por preencher» nos campos vazios; a lista de chamadas diz quem as fez; o quadro da visita diz-se em «Marcar a visita».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { ContactoPessoa, LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { Pessoa } from "../pessoasTipos";
import { ContactoDoGuia, type ContactoDoGuiaProps } from "./ContactoDoGuia";
import { guardarRascunho, rascunhoVazio } from "./rascunhoAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

vi.mock("@/hooks/pessoas/useGuardarQualificacao", async (original) => ({
  ...(await original<object>()),
  useGuardarQualificacao: () => ({ guardar: vi.fn(), aGuardar: false, pronto: true }),
}));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarNifPessoa", () => ({ useGuardarNifPessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarIdentidadePessoa", () => ({ useGuardarIdentidadePessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", async (original) => ({
  ...(await original<object>()),
  useGuardarContactoPessoa: () => ({ guardar: vi.fn() }),
}));
vi.mock("@/hooks/pessoas/QuestionarioFormularioProvider", async () => {
  const { QuestionarioContext } = await import("@/components/negocio-metas/QuestionarioContexto");
  const questionario: QuestionarioForm = { versao: 4, semBase: false, seccoes: [] };
  return {
    QuestionarioFormularioProvider: ({ children }: { children: ReactNode }) => (
      <QuestionarioContext.Provider value={{ questionario, estado: "pronto", erro: null, podeGuardar: true, repetir: vi.fn(), recarregar: async () => null }}>
        {children}
      </QuestionarioContext.Provider>
    ),
  };
});

const PESSOA = {
  id: "pe1", nome: "Ana Lopes", contacto: { telefone: "927 118 300", email: "ana@exemplo.pt" }, comercial: "Rita", ultimoContactoDias: null, lingua: "pt",
} as unknown as Pessoa;

const SEM_MORADA = { rua: "", codigoPostal: "", localidade: "", andar: "" };
const VISITA: VisitaPessoa = {
  id: "v1", data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "m30",
  morada: SEM_MORADA, igualALead: null, nota: "", pessoaId: "pe1", negocioId: "n1", agenda: { boardId: "q1", boardNome: "Agenda Porto", recursos: [], duracaoMinutos: 30 },
};
const LEVANTAMENTO: LevantamentoPessoa = {
  id: "l1", pessoaId: "pe1", visitaId: null, data: "2026-10-21", feitoPor: "Rita", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId: "n1",
  moradaOrigem: "localizacao", morada: { rua: "Rua do Levantamento 9", codigoPostal: "1000-100", localidade: "Lisboa", andar: "" },
};
const CHAMADA: ContactoPessoa = {
  id: "c1", pessoaId: "pe1", data: "2026-10-12", hora: "10:30", resultado: "atendeuInteressado", nota: "", negocioId: "n1", criadoPor: "Rita Gomes",
  proximaAcao: { data: "2026-10-15", hora: "15:30" },
};

function props(extra: Partial<ContactoDoGuiaProps> = {}): ContactoDoGuiaProps {
  return {
    pessoa: PESSOA, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 1, visitaMarcada: false, podeEditar: true,
    podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
    faseRotuloChave: "pessoasPagina.board.col.contactado", ...extra,
  };
}
const montar = (extra: Partial<ContactoDoGuiaProps> = {}) => render(<ContactoDoGuia {...props(extra)} />);
const irPara = (nome: RegExp) => fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: nome }));

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe("Morada da obra, com a morada gravada no levantamento", () => {
  it("sem rascunho nem morada na visita, abre com a morada do levantamento e diz de onde veio", () => {
    montar({ visita: VISITA, levantamento: LEVANTAMENTO });
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua do Levantamento 9");
    expect(screen.getByLabelText("Código postal")).toHaveValue("1000-100");
    expect(screen.getByLabelText("Localidade")).toHaveValue("Lisboa");
  });

  it("o rascunho ganha à morada do levantamento", () => {
    guardarRascunho("n1", { ...rascunhoVazio(), morada: { rua: "Rua Escrita 1", codigoPostal: "", localidade: "", andar: "" }, moradaOrigem: "manual" });
    montar({ levantamento: LEVANTAMENTO });
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua Escrita 1");
  });

  it("numa fase feita lê-se: o campo vazio diz «Por preencher» e os preenchidos mostram o valor", () => {
    montar({ levantamento: LEVANTAMENTO, fasePassada: { id: "contactado", aoVoltar: vi.fn() } });
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua do Levantamento 9");
    expect(screen.getByLabelText("Rua e número")).toBeDisabled();
    expect(screen.getByLabelText(/Andar/)).toHaveValue("");
    expect(screen.getByLabelText(/Andar/)).toHaveAttribute("placeholder", "Por preencher");
  });

  it("sem levantamento nem visita, a morada continua vazia", () => {
    montar();
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("");
  });
});

describe("Chamada e Marcar a visita, com o que a base guardou", () => {
  it("a chamada diz quem a fez e a próxima ação", () => {
    montar({ historicoChamadas: [CHAMADA] });
    irPara(/^Chamada/);
    const linha = screen.getByText(/por Rita Gomes/);
    expect(linha).toHaveTextContent(/próxima ação .*15:30/);
  });

  it("a visita marcada diz o dia, a hora, quem a faz e o quadro", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Marcar a visita/);
    expect(screen.getByText(/Agenda Porto/)).toBeInTheDocument();
  });

  it("a duração de 30 min da visita marcada abre escolhida em «Preparar a visita»", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Preparar a visita/);
    expect(screen.getByRole("button", { name: "30 min" })).toHaveAttribute("aria-pressed", "true");
  });
});
