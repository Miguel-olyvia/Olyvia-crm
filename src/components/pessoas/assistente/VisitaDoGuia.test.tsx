// A fase Visita do assistente, ligada à gravação que já existe (os hooks da base estão simulados): a lista de visitas do negócio, um passo por secção do
// levantamento vinda do questionário da base (sem Necessidades), e «Fechar levantamento», que só guarda. O levantamento é um por negócio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import type { Pessoa } from "../pessoasTipos";
import { RASCUNHO_VAZIO, guardarRascunho, lerRascunho } from "./rascunhoAssistente";
import { VisitaDoGuia, type VisitaDoGuiaProps } from "./VisitaDoGuia";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const estado = vi.hoisted(() => ({ guardar: vi.fn(), concluir: vi.fn(), questionario: null as unknown, aGuardar: false, pronto: true }));

vi.mock("@/hooks/pessoas/useAcoesVisita", () => ({ useAcoesVisita: () => ({ concluir: estado.concluir }) }));

vi.mock("@/hooks/pessoas/useGuardarRegistos", async (original) => ({
  ...(await original<object>()),
  useGuardarRegistos: () => ({ guardar: estado.guardar, verificar: vi.fn(), aGuardar: estado.aGuardar, pronto: estado.pronto }),
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
    seccao("interior", "Interior do espaço", ["Estado das paredes?"]),
    seccao("area", "Área de intervenção", ["Que divisões?"]),
    seccao("medidas", "Medidas da área", [], { especial: "medidas" }),
    seccao("necessidades", "Necessidades do cliente", ["Que serviços?"]),
    seccao("escolhas", "Escolhas do cliente", ["Que acabamento?"]),
    seccao("qualificacao", "Qualificação", ["Tipo de imóvel"], { aba: "qualificacao" }),
  ],
} as unknown as QuestionarioForm;

const PESSOA = { id: "pe1", nome: "Ana Lopes", contacto: { telefone: null, email: null }, comercial: "Rita", ultimoContactoDias: null } as unknown as Pessoa;
const VISITA = (id: string, extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, data: "2026-10-20", hora: "10:30", feitoPor: "Rita Gomes", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "casal", duracao: "h1",
  morada: { rua: "", codigoPostal: "", localidade: "", andar: "" }, igualALead: null, nota: "", pessoaId: "pe1", negocioId: "n1", ...extra,
});

function montar(extra: Partial<VisitaDoGuiaProps> = {}) {
  const props: VisitaDoGuiaProps = {
    pessoa: PESSOA, negocio: { id: "n1" }, visitas: [VISITA("v1")], levantamentoGuardado: false, ficha: { pessoa: { id: "pe1" } } as unknown as FichaDb, podeEditar: true,
    aoCriarNegocio: vi.fn(), aoMarcarOutra: vi.fn(), faseRotuloChave: "pessoasPagina.phases.visita", feitas: [], aoVerFase: vi.fn(), nivel: "h3", ...extra,
  };
  render(<VisitaDoGuia {...props} />);
  return props;
}
const coluna = () => within(screen.getByRole("navigation", { name: "Passos da fase" }));
const irPara = (nome: RegExp) => fireEvent.click(coluna().getByRole("button", { name: nome }));
const titulo = (nome: string) => screen.getByRole("heading", { level: 3, name: nome });

beforeEach(() => {
  window.sessionStorage.clear();
  estado.questionario = QUESTIONARIO;
  estado.aGuardar = false;
  estado.pronto = true;
  estado.guardar.mockReset().mockResolvedValue({ feitos: ["levantamento"], levantamento: { questionarioMudou: false } });
  estado.concluir.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("a fase Visita: os passos", () => {
  it("Visitas, uma secção do levantamento por passo (as da base, sem Necessidades nem Qualificação) e Fechar levantamento", () => {
    montar();
    expect(coluna().getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, "").replace(/, .*$/, ""))).toEqual([
      "Visitas", "Exterior do edifício", "Interior do espaço", "Área de intervenção", "Medidas da área", "Escolhas do cliente", "Fechar levantamento",
    ]);
  });

  it("com uma visita marcada abre na primeira secção que falta, no próprio ecrã", () => {
    montar();
    expect(titulo("Exterior do edifício")).toBeInTheDocument();
    expect(screen.getByText("Há elevador?")).toBeInTheDocument();
    expect(screen.getByText("Há estacionamento?")).toBeInTheDocument();
    expect(screen.getByText(/^Passo 2 de 7 · faltam 2 respostas/)).toBeInTheDocument();
  });

  it("não há painel lateral «Visita e levantamento» nem a pergunta de Necessidades", () => {
    montar();
    expect(screen.queryByText("Que serviços?")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Visitas", () => {
  it("lista as visitas do negócio e «Marcar outra visita» abre a agenda", () => {
    const p = montar({ visitas: [VISITA("v1", { estado: "feita" }), VISITA("v2", { tipo: "medicao" })] });
    irPara(/^Visitas/);
    expect(screen.getByText(/^Visita 1 · Levantamento/)).toBeInTheDocument();
    expect(screen.getByText(/^Visita 2 · Medição técnica/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar outra visita" }));
    expect(p.aoMarcarOutra).toHaveBeenCalledTimes(1);
  });

  it("«Marcar como feita» grava a visita (é manual) com a ação que já existe", async () => {
    montar();
    irPara(/^Visitas/);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como feita" }));
    await waitFor(() => expect(estado.concluir).toHaveBeenCalledWith("v1"));
  });

  it("se concluir falha, o erro diz-se no cartão", async () => {
    estado.concluir.mockRejectedValue(new Error("falhou"));
    montar();
    irPara(/^Visitas/);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como feita" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("sem permissão de editar não há «Marcar como feita» nem «Marcar outra visita»", () => {
    montar({ podeEditar: false });
    irPara(/^Visitas/);
    expect(screen.queryByRole("button", { name: "Marcar como feita" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar outra visita" })).not.toBeInTheDocument();
  });

  it("as visitas canceladas aparecem na lista mas não contam como visita marcada", () => {
    montar({ visitas: [VISITA("v1", { estado: "cancelada" })] });
    expect(titulo("Visitas")).toBeInTheDocument();
    expect(screen.getByText(/^Passo 1 de 7 · falta 1 resposta/)).toBeInTheDocument();
    expect(screen.getByText(/Cancelada/)).toBeInTheDocument();
  });

  it("Visitas funciona sem negócio (as visitas da pessoa)", () => {
    montar({ negocio: null, visitas: [] });
    expect(titulo("Visitas")).toBeInTheDocument();
    expect(screen.getByText("Ainda não há visitas neste negócio.")).toBeInTheDocument();
  });
});

describe("as secções do levantamento", () => {
  it("responder grava no rascunho (que sobrevive a recarregar) e reduz o «faltam X»", () => {
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    expect(screen.getByText(/^Passo 2 de 7 · falta 1 resposta/)).toBeInTheDocument();
    expect(Object.values(lerRascunho("n1").respostas)).toEqual(["a"]);
    cleanup();
    montar();
    expect(screen.getByText(/^Passo 2 de 7 · falta 1 resposta/)).toBeInTheDocument();
  });

  it("Continuar não grava nada na base: as respostas esperam pelo último passo", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(titulo("Interior do espaço")).toBeInTheDocument());
    expect(estado.guardar).not.toHaveBeenCalled();
  });

  it("sem negócio cada secção mostra a razão e «Criar o negócio»", () => {
    const p = montar({ negocio: null });
    irPara(/^Exterior do edifício/);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    expect(screen.queryByText("Há elevador?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar o negócio" }));
    expect(p.aoCriarNegocio).toHaveBeenCalledTimes(1);
  });

  it("Medidas da área: adiciona uma linha de medidas", () => {
    montar();
    irPara(/^Medidas da área/);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    expect(lerRascunho("n1").linhas).toHaveLength(1);
    expect(screen.getByText(/^Passo 5 de 7 · completo/)).toBeInTheDocument();
  });
});

describe("Fechar levantamento", () => {
  it("só guarda: o levantamento segue com as respostas, as linhas e a morada do rascunho, ligado ao negócio", async () => {
    guardarRascunho("n1", { ...RASCUNHO_VAZIO, morada: { rua: "Rua Nova 3", codigoPostal: "4000-001", localidade: "Porto", andar: "" }, moradaOrigem: "manual" });
    montar();
    fireEvent.click(screen.getAllByText("Sim")[0]);
    irPara(/^Fechar levantamento/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    await waitFor(() => expect(estado.guardar).toHaveBeenCalledTimes(1));
    const [visitas, rascunho, comercial] = estado.guardar.mock.calls[0];
    expect(visitas).toEqual([]);
    expect(comercial).toBe("");
    expect(rascunho.respostas).toEqual({ "exterior_Há elevador?": "a" });
    expect(rascunho.moradaObra).toEqual({ rua: "Rua Nova 3", codigoPostal: "4000-001", localidade: "Porto", andar: "" });
    expect(rascunho.moradaOrigem).toBe("manual");
    expect(await screen.findByText("O levantamento está guardado.")).toBeInTheDocument();
  });

  it("se não havia nada para gravar não diz «guardado» nem apaga o rascunho: diz «Nada novo para guardar»", async () => {
    estado.guardar.mockResolvedValue({ feitos: [], levantamento: null });
    guardarRascunho("n1", { ...RASCUNHO_VAZIO, morada: { rua: "Rua Nova 3", codigoPostal: "4000-001", localidade: "Porto", andar: "" }, moradaOrigem: "manual" });
    montar();
    irPara(/^Fechar levantamento/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    expect(await screen.findByText("Nada novo para guardar.")).toBeInTheDocument();
    expect(screen.queryByText("O levantamento está guardado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar o levantamento" })).toBeInTheDocument();
    expect(lerRascunho("n1").morada.rua).toBe("Rua Nova 3");
  });

  it("não marca a visita como feita (continua manual)", async () => {
    montar();
    irPara(/^Fechar levantamento/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    await waitFor(() => expect(estado.guardar).toHaveBeenCalledTimes(1));
    expect(estado.guardar.mock.calls[0][0]).toEqual([]);
  });

  it("uma linha de medidas por preencher não deixa guardar e mostra os erros", async () => {
    montar();
    irPara(/^Medidas da área/);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    irPara(/^Fechar levantamento/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(estado.guardar).not.toHaveBeenCalled();
  });

  it("se a base recusa, diz o erro e deixa repetir", async () => {
    estado.guardar.mockRejectedValue(new Error("falhou"));
    montar();
    irPara(/^Fechar levantamento/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o levantamento" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar o levantamento" })).not.toHaveAttribute("aria-disabled");
  });

  it("se o negócio já tem levantamento, diz que está guardado e não guarda outro (é um por negócio)", () => {
    montar({ levantamentoGuardado: true });
    irPara(/^Fechar levantamento/);
    expect(screen.getByText("O levantamento está guardado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar o levantamento" })).not.toBeInTheDocument();
  });

  it("sem ficha da base não se pode guardar e diz porquê", () => {
    montar({ ficha: null });
    irPara(/^Fechar levantamento/);
    expect(screen.getByRole("button", { name: "Guardar o levantamento" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Só se pode guardar com a ficha da base aberta.")).toBeInTheDocument();
  });

  it("sem negócio mostra a razão e «Criar o negócio»", () => {
    montar({ negocio: null });
    irPara(/^Fechar levantamento/);
    expect(screen.getByText(/ainda não tem um negócio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar o levantamento" })).not.toBeInTheDocument();
  });
});
