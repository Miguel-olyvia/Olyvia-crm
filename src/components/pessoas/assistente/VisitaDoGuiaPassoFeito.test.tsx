// Abrir um passo já feito da fase Visita: as secções e as medidas do levantamento aparecem no MESMO ecrã do passo, preenchidas com o que ficou guardado
// na base (o rascunho do navegador é apagado ao guardar), só para ler enquanto o levantamento está guardado. Um passo vazio mostra-se vazio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import type { Pessoa } from "../pessoasTipos";
import { VisitaDoGuia, type VisitaDoGuiaProps } from "./VisitaDoGuia";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({ questionario: null as unknown }));

vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({ useAcoesVisita: () => ({ concluir: vi.fn(), cancelar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarRegistos", async (original) => ({
  ...(await original<object>()),
  useGuardarRegistos: () => ({ guardar: vi.fn(), verificar: vi.fn(), aGuardar: false, pronto: true }),
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
const seccao = (id: string, titulo: string, perguntas: string[], extra: Record<string, unknown> = {}) => ({
  id, titulo: [titulo, titulo] as const, literal: true, blocos: perguntas.length ? [{ id: `${id}-0`, literal: true, perguntas: perguntas.map((p) => pergunta(`${id}_${p}`, p)) }] : [], ...extra,
});
const QUESTIONARIO = {
  versao: 4, semBase: false,
  seccoes: [
    seccao("visitas", "Visitas", [], { especial: "visitas" }),
    seccao("exterior", "Exterior do edifício", ["Há elevador?", "Há estacionamento?"]),
    seccao("medidas", "Medidas da área", [], { especial: "medidas" }),
  ],
} as unknown as QuestionarioForm;

const PESSOA = { id: "pe1", nome: "Ana Lopes", contacto: { telefone: null, email: null }, comercial: "Rita", ultimoContactoDias: null } as unknown as Pessoa;
const VISITA: VisitaPessoa = {
  id: "v1", data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "feita", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, nota: "", pessoaId: "pe1", negocioId: "n1",
};
const GUARDADO: LevantamentoPessoa = {
  id: "l1", pessoaId: "pe1", visitaId: null, data: "2026-10-21", feitoPor: "Rita Gomes", estado: "feito", negocioId: "n1",
  rascunho: {
    linhas: [{ id: "a", divisao: "", trabalho: "", trabalhoOutro: "", medida: "12", unidade: "m2", observacoes: "" }],
    observacoes: "Tudo medido", respostas: { "exterior_Há elevador?": "a" },
  },
};

function montar(extra: Partial<VisitaDoGuiaProps> = {}) {
  const props: VisitaDoGuiaProps = {
    pessoa: PESSOA, negocio: { id: "n1" }, visitas: [VISITA], levantamentoGuardado: false, ficha: { pessoa: { id: "pe1" } } as unknown as FichaDb, podeEditar: true,
    aoCriarNegocio: vi.fn(), aoMarcarOutra: vi.fn(), faseRotuloChave: "pessoasPagina.phases.visita", feitas: [], aoVerFase: vi.fn(), nivel: "h3", ...extra,
  };
  render(<VisitaDoGuia {...props} />);
  return props;
}
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));
const irPara = (nome: RegExp) => fireEvent.click(coluna().getByRole("button", { name: nome }));

beforeEach(() => {
  window.sessionStorage.clear();
  estado.questionario = QUESTIONARIO;
});
afterEach(cleanup);

describe("levantamento guardado, rascunho do navegador já apagado", () => {
  it("a secção abre com as respostas guardadas, no mesmo ecrã, só para ler e com a frase a dizer porquê", () => {
    montar({ levantamentoGuardado: true, levantamentos: [GUARDADO] });
    irPara(/^Exterior do edifício/);
    expect(screen.getByText("Há elevador?")).toBeInTheDocument();
    const [sim] = screen.getAllByRole("radio", { name: "Sim" });
    expect(sim).toHaveAttribute("aria-checked", "true");
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
    expect(screen.getByText(/O levantamento já está guardado: esta secção mostra-se só para leitura/)).toBeInTheDocument();
  });

  it("as medidas abrem com as linhas e as observações guardadas, desativadas", () => {
    montar({ levantamentoGuardado: true, levantamentos: [GUARDADO] });
    irPara(/^Medidas da área/);
    expect(screen.getByDisplayValue("12")).toBeDisabled();
    expect(screen.getByDisplayValue("Tudo medido")).toBeDisabled();
  });

  it("a coluna conta a secção respondida como feita (a que não tem respostas fica por fazer)", () => {
    montar({ levantamentoGuardado: true, levantamentos: [GUARDADO] });
    const botaoMedidas = coluna().getByRole("button", { name: /^Medidas da área/ });
    expect(botaoMedidas).toHaveTextContent(/feito/);
  });

  it("Fechar levantamento diz quando e por quem foi guardado, e quanto", () => {
    montar({ levantamentoGuardado: true, levantamentos: [GUARDADO] });
    irPara(/^Fechar levantamento/);
    expect(screen.getByText("O levantamento está guardado.")).toBeInTheDocument();
    expect(screen.getByText(/^Guardado em .* por Rita Gomes\.$/)).toBeInTheDocument();
    expect(screen.getByText("Respostas: 1 · linhas de medidas: 1")).toBeInTheDocument();
  });

  it("guardado mas sem nada lido (só o texto da decisão), a secção vazia mostra-se vazia", () => {
    montar({ levantamentoGuardado: true, levantamentos: [] });
    irPara(/^Exterior do edifício/);
    for (const r of screen.getAllByRole("radio")) expect(r).toHaveAttribute("aria-checked", "false");
  });
});

describe("levantamento ainda por guardar", () => {
  it("a secção continua editável e vazia", () => {
    montar();
    irPara(/^Exterior do edifício/);
    for (const r of screen.getAllByRole("radio")) expect(r).toBeEnabled();
    expect(screen.queryByText(/mostra-se só para leitura/)).not.toBeInTheDocument();
  });
});

describe("sem permissão de editar", () => {
  it("a secção mostra o mesmo ecrã, preenchido e desativado, com a frase da permissão", () => {
    montar({ podeEditar: false, levantamentoGuardado: true, levantamentos: [GUARDADO] });
    irPara(/^Exterior do edifício/);
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: "Sim" })[0]).toHaveAttribute("aria-checked", "true");
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});
