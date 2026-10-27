// Abrir um passo já feito da fase Contacto: aparece o MESMO ecrã do passo (os mesmos campos e opções), com o que se escolheu e escreveu já preenchido,
// e não uma lista de resumo. O rascunho do navegador ganha; quando já não existe, o que a base guardou (a visita marcada, as chamadas) preenche o passo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { ContactoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { Pessoa } from "../pessoasTipos";
import { ContactoDoGuia, type ContactoDoGuiaProps } from "./ContactoDoGuia";
import { guardarRascunho, rascunhoVazio } from "./rascunhoAssistente";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({ questionario: null as unknown }));

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
    blocos: [{ id: "q-0", literal: true, perguntas: [pergunta("p1", "Tipo de imóvel")] }],
  }],
};

const PESSOA = {
  id: "pe1", nome: "Ana Lopes", contacto: { telefone: "927 118 300", email: "ana@exemplo.pt" }, comercial: "Rita", ultimoContactoDias: null,
  moradaCampos: { rua: "Rua da Ana 9", codigoPostal: "4000-001", localidade: "Porto", andar: "2.º" }, lingua: "pt",
} as unknown as Pessoa;

const VISITA: VisitaPessoa = {
  id: "v1", data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1m30",
  morada: { rua: "Rua da Obra 5", codigoPostal: "4000-010", localidade: "Porto", andar: "" }, igualALead: null, nota: "Levar escada", pessoaId: "pe1", negocioId: "n1",
};

function props(extra: Partial<ContactoDoGuiaProps> = {}): ContactoDoGuiaProps {
  return {
    pessoa: PESSOA, negocio: { id: "n1", pedidoCliente: "", qualificacaoGravada: [] }, chamadas: 1, visitaMarcada: false, podeEditar: true,
    podeRegistarChamada: true, aoRegistarChamada: vi.fn(), aoCriarNegocio: vi.fn(), aoMarcarVisita: vi.fn(), feitas: [], aoVerFase: vi.fn(), nivel: "h3",
    faseRotuloChave: "pessoasPagina.board.col.contactado", ...extra,
  };
}
const montar = (extra: Partial<ContactoDoGuiaProps> = {}) => render(<ContactoDoGuia {...props(extra)} />);
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));
const irPara = (nome: RegExp) => fireEvent.click(coluna().getByRole("button", { name: nome }));

beforeEach(() => {
  window.sessionStorage.clear();
  estado.questionario = QUESTIONARIO;
});
afterEach(cleanup);

describe("Preparar a visita, com a visita já marcada e sem rascunho", () => {
  it("abre com a duração, quem vai estar e a nota da visita, nos mesmos campos do passo", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Preparar a visita/);
    expect(screen.getByRole("button", { name: "1 h 30" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "O casal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 h" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Nota para a visita (opcional)")).toHaveValue("Levar escada");
  });

  it("continua editável: mudar uma escolha guarda no rascunho sem perder o resto", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Preparar a visita/);
    fireEvent.click(screen.getByRole("button", { name: "2 h" }));
    expect(screen.getByRole("button", { name: "2 h" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "O casal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Nota para a visita (opcional)")).toHaveValue("Levar escada");
  });

  it("o que está no rascunho ganha ao que a visita tem", () => {
    guardarRascunho("n1", { ...rascunhoVazio(), preparar: { duracao: "h2", quem: "familia", nota: "" } });
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Preparar a visita/);
    expect(screen.getByRole("button", { name: "2 h" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "A família" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sem visita nem rascunho, o passo vazio mostra-se vazio", () => {
    montar();
    irPara(/^Preparar a visita/);
    expect(screen.getByRole("button", { name: "1 h 30" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Nota para a visita (opcional)")).toHaveValue("");
  });
});

describe("Morada da obra e Marcar a visita, com a visita já marcada", () => {
  it("a morada abre com a da visita", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua da Obra 5");
    expect(screen.getByLabelText("Localidade")).toHaveValue("Porto");
  });

  it("a morada escrita no rascunho ganha à da visita", () => {
    guardarRascunho("n1", { ...rascunhoVazio(), morada: { rua: "Rua Nova 3", codigoPostal: "", localidade: "", andar: "" } });
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Morada da obra/);
    expect(screen.getByLabelText("Rua e número")).toHaveValue("Rua Nova 3");
  });

  it("Marcar a visita diz quando está marcada, para além de dizer que já há uma", () => {
    montar({ visitaMarcada: true, visita: VISITA });
    irPara(/^Marcar a visita/);
    expect(screen.getByText("Já há uma visita marcada.")).toBeInTheDocument();
    expect(screen.getByText(/^Marcada para .*10:30 · Rita Gomes/)).toBeInTheDocument();
  });
});

describe("Chamada", () => {
  const CHAMADA: ContactoPessoa = { id: "c1", pessoaId: "pe1", data: "2026-10-19", hora: "09:15", resultado: "naoAtendeu", nota: "Sem resposta", negocioId: "n1" };

  it("mostra, no próprio passo, as chamadas já registadas com o resultado e a nota", () => {
    montar({ chamadas: 1, historicoChamadas: [CHAMADA] });
    irPara(/^Chamada/);
    expect(screen.getByText(/09:15 · Não atendeu · Sem resposta/)).toBeInTheDocument();
    expect(screen.getByLabelText("Telefone")).toHaveValue("927 118 300");
  });

  it("uma chamada sem resultado conhecido diz-o em texto", () => {
    montar({ chamadas: 1, historicoChamadas: [{ ...CHAMADA, resultado: null, nota: "" }] });
    irPara(/^Chamada/);
    expect(screen.getByText(/09:15 · Sem resultado/)).toBeInTheDocument();
  });

  it("sem chamadas não há lista", () => {
    montar({ chamadas: 0, historicoChamadas: [] });
    expect(screen.queryByText("Chamadas registadas")).not.toBeInTheDocument();
  });

  it("se a ficha chega depois de montar, o telefone e o email aparecem preenchidos", () => {
    const vazia = { ...PESSOA, contacto: { telefone: null, email: null } } as unknown as Pessoa;
    const { rerender } = render(<ContactoDoGuia {...props({ pessoa: vazia, chamadas: 0 })} />);
    expect(screen.getByLabelText("Telefone")).toHaveValue("");
    rerender(<ContactoDoGuia {...props({ pessoa: PESSOA, chamadas: 0 })} />);
    expect(screen.getByLabelText("Telefone")).toHaveValue("927 118 300");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@exemplo.pt");
  });

  it("o que a pessoa já escreveu não é pisado quando a ficha se refaz", () => {
    const { rerender } = render(<ContactoDoGuia {...props({ chamadas: 0 })} />);
    fireEvent.change(screen.getByLabelText("Telefone"), { target: { value: "911 000 000" } });
    rerender(<ContactoDoGuia {...props({ pessoa: { ...PESSOA, contacto: { telefone: "900 000 000", email: "ana@exemplo.pt" } } as unknown as Pessoa, chamadas: 0 })} />);
    expect(screen.getByLabelText("Telefone")).toHaveValue("911 000 000");
  });
});

describe("Sem permissão de editar", () => {
  it("Preparar a visita mostra o mesmo ecrã preenchido, com as escolhas desativadas e a frase a dizer porquê", () => {
    montar({ podeEditar: false, visitaMarcada: true, visita: VISITA });
    irPara(/^Preparar a visita/);
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 h 30" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 h 30" })).toBeDisabled();
    expect(screen.getByLabelText("Nota para a visita (opcional)")).toBeDisabled();
  });
});
