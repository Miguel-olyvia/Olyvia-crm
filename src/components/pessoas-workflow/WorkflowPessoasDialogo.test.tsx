// O diálogo do Workflow de Pessoas: título, separadores «Qualificação» e «Levantamento», foco ao abrir e ao fechar, não se fecha enquanto
// grava e pergunta antes de fechar com alterações do levantamento por gravar. Os hooks de leitura e gravação são simulados.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { ConfigNegociosHook } from "@/hooks/pessoas/workflow/useConfigNegocios";
import type { RegrasQualificacaoHook } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import { lerQuestionario } from "@/hooks/pessoas/workflow/questionario";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import type { QuestionarioHook } from "@/hooks/pessoas/workflow/useQuestionarioLevantamento";
import { WorkflowPessoasDialogo } from "./WorkflowPessoasDialogo";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));


vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const usarRegras = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/workflow/useRegrasQualificacao", () => ({ useRegrasQualificacao: (h: boolean) => usarRegras(h) }));
const usarConfig = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/workflow/useConfigNegocios", () => ({ useConfigNegocios: (h: boolean) => usarConfig(h) }));
// Com a bandeira CONSEQUENCIAS_ATIVO ligada, o separador «Negócios» lê as consequências e a permissão pessoas.config: ambos simulados (com permissão).
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => p === "pessoas.config", hasAnyPermission: (ps: string[]) => ps.includes("pessoas.config"),
    permissions: ["pessoas.config"], loading: false,
  }),
}));
vi.mock("@/hooks/pessoas/workflow/useConsequencias", () => ({
  useConsequencias: () => ({
    estado: "pronto", dados: { recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: true, propostaCriaContrato: false }, aGuardar: false,
    recarregar: vi.fn(), guardarCadeia: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
    guardarRecusaOrcamento: vi.fn().mockResolvedValue({ mudou: true, depois: null }),
  }),
}));
const usarQuest = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/workflow/useQuestionarioLevantamento", () => ({ useQuestionarioLevantamento: (h: boolean) => usarQuest(h) }));
beforeAll(prepararRadixNoJsdom);

const hook = (sobre: Partial<RegrasQualificacaoHook> = {}): RegrasQualificacaoHook => ({
  dados: { mql: null, sql: null, descartadas: 0 }, isLoading: false, isError: false, aGuardar: false,
  guardar: vi.fn(), recarregar: vi.fn(), ...sobre,
});

const configNegocios = (sobre: Partial<ConfigNegociosHook> = {}): ConfigNegociosHook => ({
  estado: "pronto", aGuardar: false, guardar: vi.fn(), recarregar: vi.fn(), ...sobre,
  dados: { conversaoAoGanhar: "automatica", recusaProposta: "perder", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexaoDias: null },
});

const questionario = (sobre: Partial<QuestionarioHook> = {}): QuestionarioHook => ({
  dados: lerQuestionario(QUESTIONARIO_BRUTO), erro: null, isLoading: false, isError: false, aGuardar: false,
  guardar: vi.fn(), recarregar: vi.fn(), ...sobre,
});

beforeEach(() => {
  usarRegras.mockReset(); usarRegras.mockReturnValue(hook());
  usarConfig.mockReset(); usarConfig.mockReturnValue(configNegocios());
  usarQuest.mockReset(); usarQuest.mockReturnValue(questionario());
});

const irParaNegocios = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Negócios" }), { button: 0, ctrlKey: false });
const irParaLevantamento = () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Levantamento" }), { button: 0, ctrlKey: false });
const tituloExterior = () => within(screen.getByRole("region", { name: /Exterior|Fachada/ })).getByLabelText("Título da secção");

const desenhar = (aberto = true, sobre: Partial<Parameters<typeof WorkflowPessoasDialogo>[0]> = {}) => {
  const props = { aberto, aoMudarAberto: vi.fn(), aoFocarOrigem: vi.fn(), ...sobre };
  return { ...render(<WorkflowPessoasDialogo {...props} />), props };
};

describe("WorkflowPessoasDialogo", () => {
  it("fechado não mostra nada e não lê as regras", () => {
    desenhar(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(usarRegras).toHaveBeenCalledWith(false);
  });

  it("aberto: diálogo com título e descrição, e as regras passam a ser lidas", () => {
    desenhar();
    const d = screen.getByRole("dialog", { name: "Configuração de Workflow" });
    expect(d).toHaveAccessibleDescription(/Pessoas desta organização/);
    expect(usarRegras).toHaveBeenCalledWith(true);
  });

  it("tem os separadores «Qualificação» (selecionado, com as regras MQL e SQL), «Levantamento» e «Negócios»", () => {
    desenhar();
    const lista = screen.getByRole("tablist", { name: "Secções do Workflow" });
    const separadores = within(lista).getAllByRole("tab");
    expect(separadores.map((s) => s.textContent)).toEqual(["Qualificação", "Levantamento", "Negócios"]);
    expect(separadores[0]).toHaveAttribute("aria-selected", "true");
    expect(separadores[1]).toHaveAttribute("aria-selected", "false");
    expect(separadores[2]).toHaveAttribute("aria-selected", "false");
    const painel = screen.getByRole("tabpanel", { name: "Qualificação" });
    expect(within(painel).getByRole("group", { name: "Quando uma lead é MQL" })).toBeInTheDocument();
    expect(within(painel).getByRole("group", { name: "Quando uma lead é SQL" })).toBeInTheDocument();
  });

  it("a configuração dos negócios só se lê quando o separador «Negócios» está à vista, e mostra os cinco campos e a tabela das consequências", () => {
    desenhar();
    expect(usarConfig).toHaveBeenLastCalledWith(false);
    irParaNegocios();
    expect(usarConfig).toHaveBeenLastCalledWith(true);
    const painel = screen.getByRole("tabpanel", { name: "Negócios" });
    // Quatro escolhas dos cinco campos, mais a recusa do orçamento que a tabela traz.
    expect(within(painel).getAllByRole("radiogroup")).toHaveLength(5);
    expect(within(painel).getByRole("table")).toBeInTheDocument();
    expect(within(painel).getByRole("textbox", { name: "Prazo de reflexão (dias)" })).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Guardar configuração" })).toBeInTheDocument();
  });

  it("fechado não lê a configuração dos negócios", () => {
    desenhar(false);
    expect(usarConfig).toHaveBeenCalledWith(false);
  });

  it("enquanto grava a configuração dos negócios o diálogo não fecha (Escape)", () => {
    usarConfig.mockReturnValue(configNegocios({ aGuardar: true }));
    const { props } = desenhar();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });

  it("o questionário só se lê quando o separador «Levantamento» está à vista", () => {
    desenhar();
    expect(usarQuest).toHaveBeenLastCalledWith(false);
    irParaLevantamento();
    expect(usarQuest).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("tabpanel", { name: "Levantamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar levantamento" })).toBeInTheDocument();
  });

  it("fechado não lê o questionário", () => {
    desenhar(false);
    expect(usarQuest).toHaveBeenLastCalledWith(false);
  });

  it("ao abrir o foco fica dentro do diálogo", () => {
    desenhar();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("Escape pede para fechar", () => {
    const { props } = desenhar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
  });

  it("ao fechar, devolve o foco à origem (o botão Workflow) pelo callback", async () => {
    const { rerender, props } = desenhar();
    rerender(<WorkflowPessoasDialogo {...props} aberto={false} />);
    await waitFor(() => expect(props.aoFocarOrigem).toHaveBeenCalled());
  });

  it("a gravar: Escape não fecha e o botão de fechar sai (o resultado não chegava a ninguém)", () => {
    usarRegras.mockReturnValue(hook({ aGuardar: true }));
    const { props } = desenhar();
    expect(screen.queryByRole("button", { name: /close|fechar/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });

  it("com o botão de fechar visível quando não grava", () => {
    desenhar();
    expect(screen.getByRole("button", { name: /close|fechar/i })).toBeInTheDocument();
  });

  it("a gravar o levantamento: Escape não fecha e o botão de fechar sai", () => {
    usarQuest.mockReturnValue(questionario({ aGuardar: true }));
    const { props } = desenhar();
    expect(screen.queryByRole("button", { name: /close|fechar/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });
});

describe("WorkflowPessoasDialogo: alterações dos negócios por gravar", () => {
  const editarNegocios = () => {
    irParaNegocios();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Manter o negócio aberto" }));
  };
  const escape = () => fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });

  it("sem alterações, Escape fecha logo", () => {
    const { props } = desenhar();
    irParaNegocios();
    escape();
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("com uma escolha por gravar, Escape pergunta primeiro", async () => {
    const { props } = desenhar();
    editarNegocios();
    escape();
    expect(await screen.findByRole("alertdialog", { name: "Alterações por gravar" })).toBeInTheDocument();
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });

  it("voltar ao valor gravado deixa de contar como alteração", () => {
    const { props } = desenhar();
    editarNegocios();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Perder o negócio" }));
    escape();
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
  });

  it("o que se escolheu sobrevive à troca de separador", () => {
    desenhar();
    editarNegocios();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Qualificação" }), { button: 0, ctrlKey: false });
    irParaNegocios();
    expect(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Manter o negócio aberto" })).toBeChecked();
  });

  it("«Descartar e fechar» fecha e ao reabrir a escolha não fica", async () => {
    const { rerender, props } = desenhar();
    editarNegocios();
    escape();
    fireEvent.click(await screen.findByRole("button", { name: "Descartar e fechar" }));
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
    rerender(<WorkflowPessoasDialogo {...props} aberto={false} />);
    rerender(<WorkflowPessoasDialogo {...props} aberto />);
    irParaNegocios();
    expect(within(screen.getByRole("radiogroup", { name: "Quando a proposta é recusada" })).getByRole("radio", { name: "Perder o negócio" })).toBeChecked();
  });
});

describe("WorkflowPessoasDialogo: alterações do levantamento por gravar", () => {
  const editar = () => {
    irParaLevantamento();
    fireEvent.change(tituloExterior(), { target: { value: "Fachada" } });
  };

  it("sem alterações, Escape fecha logo, sem perguntar", () => {
    const { props } = desenhar();
    irParaLevantamento();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("com alterações, Escape não fecha: pergunta primeiro, com o foco no botão seguro («Continuar a editar»)", async () => {
    const { props } = desenhar();
    editar();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });
    const aviso = await screen.findByRole("alertdialog", { name: "Alterações por gravar" });
    expect(aviso).toHaveTextContent(/perdem-se/i);
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
    await waitFor(() => expect(within(aviso).getByRole("button", { name: "Continuar a editar" })).toHaveFocus());
  });

  it("«Continuar a editar» fecha só o aviso e conserva o que se escreveu", async () => {
    const { props } = desenhar();
    editar();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Continuar a editar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
    expect(tituloExterior()).toHaveValue("Fachada");
  });

  it("«Descartar e fechar» fecha o diálogo", async () => {
    const { props } = desenhar();
    editar();
    fireEvent.click(screen.getByRole("button", { name: /close|fechar/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar e fechar" }));
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
  });

  it("o que se escreveu sobrevive à troca de separador", () => {
    desenhar();
    editar();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Qualificação" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("region", { name: "Fachada" })).toBeNull();
    irParaLevantamento();
    expect(tituloExterior()).toHaveValue("Fachada");
  });

  it("com alterações no levantamento e o separador «Qualificação» à vista, fechar também pergunta", async () => {
    const { props } = desenhar();
    editar();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Qualificação" }), { button: 0, ctrlKey: false });
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Configuração de Workflow" }), { key: "Escape" });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });

  it("ao reabrir o diálogo o rascunho não fica para a próxima vez", () => {
    const { rerender, props } = desenhar();
    editar();
    rerender(<WorkflowPessoasDialogo {...props} aberto={false} />);
    rerender(<WorkflowPessoasDialogo {...props} aberto />);
    irParaLevantamento();
    expect(within(screen.getByRole("region", { name: "Exterior do edifício" })).getByLabelText("Título da secção")).toHaveValue("Exterior do edifício");
  });
});
