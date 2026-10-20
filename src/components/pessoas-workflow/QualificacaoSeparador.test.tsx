// O separador «Qualificação»: duas regras (MQL e SQL), «Guardar» que escreve pela função (via o hook), aviso de «sem alterações»,
// estado ocupado sem duplo clique, erros NG008/NG009/42501 traduzidos e anúncios ao leitor de ecrã. O hook é simulado: aqui só se vê o que o
// ecrã faz com o que o hook dá e devolve (o hook tem os seus testes em hooks/pessoas/workflow).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import type { RegrasQualificacaoHook } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import type { ResultadoGuardar } from "@/hooks/pessoas/workflow/regrasQualificacao";
import { QualificacaoSeparador } from "./QualificacaoSeparador";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));


vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const MQL = { all: [{ type: "has_source" as const }], any: [] };
const SQL = { all: [], any: [{ type: "has_signed_contract" as const }] };
const VAZIO = { mql: null, sql: null, descartadas: 0 };

const hook = (sobre: Partial<RegrasQualificacaoHook> = {}): RegrasQualificacaoHook => ({
  dados: VAZIO, isLoading: false, isError: false, aGuardar: false,
  guardar: vi.fn().mockResolvedValue({ mudou: true, depois: { mql: null, sql: null } } satisfies ResultadoGuardar),
  recarregar: vi.fn(), ...sobre,
});
const regra = (nome: string) => screen.getByRole("group", { name: nome });
const caixa = (grupo: string, coluna: RegExp, rotulo: string) =>
  within(within(regra(grupo)).getByRole("group", { name: coluna })).getByRole("checkbox", { name: rotulo });
const guardarBtn = () => screen.getByRole("button", { name: /guardar regras de qualificação|a guardar/i });
const estado = () => screen.getByRole("status");
const erroNeg = (codigo: string | null) => new ErroNeg(new Error("texto da base"), codigo, codigo ? CHAVES_ERRO_NEG[codigo] : "pessoasPagina.erroNeg.generico");

describe("QualificacaoSeparador: o selo MQL/SQL não vem das regras", () => {
  it("diz que gravar as regras não muda o selo e que o selo se classifica à mão na ficha", () => {
    render(<QualificacaoSeparador regras={hook()} />);
    const nota = screen.getByText(/não muda o selo/i);
    expect(nota).toHaveTextContent(/classifica-se à mão na ficha/i);
  });
});

describe("QualificacaoSeparador: carregar", () => {
  it("enquanto lê mostra «A carregar» e ainda não mostra regras nem o botão Guardar", () => {
    render(<QualificacaoSeparador regras={hook({ dados: null, isLoading: true })} />);
    expect(screen.getByText("A carregar as regras...")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Quando uma lead é MQL" })).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
  });

  it("se a leitura falha, diz-o num alerta com «Tentar de novo», que relê, e não deixa guardar por cima do que não se viu", () => {
    const recarregar = vi.fn();
    render(<QualificacaoSeparador regras={hook({ dados: null, isError: true, recarregar })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as regras.");
    expect(screen.queryByRole("button", { name: /guardar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("mostra as regras gravadas: MQL e SQL, cada uma com o que tem marcado", () => {
    render(<QualificacaoSeparador regras={hook({ dados: { mql: MQL, sql: SQL, descartadas: 0 } })} />);
    expect(caixa("Quando uma lead é MQL", /Todas/, "Tem canal/origem definida")).toBeChecked();
    expect(caixa("Quando uma lead é MQL", /Qualquer/, "Tem contrato assinado")).not.toBeChecked();
    expect(caixa("Quando uma lead é SQL", /Qualquer/, "Tem contrato assinado")).toBeChecked();
    expect(caixa("Quando uma lead é SQL", /Todas/, "Tem canal/origem definida")).not.toBeChecked();
    expect(screen.getByText(/classificação manual/i)).toBeInTheDocument();
  });

  it("sem regras gravadas começa tudo desmarcado", () => {
    render(<QualificacaoSeparador regras={hook()} />);
    expect(screen.getAllByRole("checkbox").every((c) => c.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("avisa quando há condições gravadas que este ecrã não mostra e que vão sair ao guardar", () => {
    const { rerender } = render(<QualificacaoSeparador regras={hook({ dados: { ...VAZIO, descartadas: 2 } })} />);
    expect(screen.getByText(/\(2\).*removidas ao guardar/i)).toBeInTheDocument();
    rerender(<QualificacaoSeparador regras={hook({ dados: VAZIO })} />);
    expect(screen.queryByText(/removidas ao guardar/i)).toBeNull();
  });

  it("a região de estado existe desde o início (as regiões que nascem já com texto não são anunciadas)", () => {
    render(<QualificacaoSeparador regras={hook()} />);
    expect(estado()).toHaveAttribute("aria-live", "polite");
    expect(estado()).toHaveTextContent("");
  });
});

describe("QualificacaoSeparador: guardar", () => {
  it("guarda as duas regras como estão no ecrã, e anuncia «guardadas»", async () => {
    const guardar = vi.fn().mockResolvedValue({ mudou: true, depois: { mql: MQL, sql: null } });
    render(<QualificacaoSeparador regras={hook({ guardar })} />);
    fireEvent.click(caixa("Quando uma lead é MQL", /Todas/, "Tem canal/origem definida"));
    fireEvent.click(guardarBtn());
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar).toHaveBeenCalledWith({ all: [{ type: "has_source" }], any: [] }, null);
    await waitFor(() => expect(estado()).toHaveTextContent("Regras de qualificação guardadas."));
  });

  it("sem tocar em nada também se pode guardar, e se a base diz que não mudou avisa «sem alterações» (e não «guardadas»)", async () => {
    const guardar = vi.fn().mockResolvedValue({ mudou: false, depois: { mql: null, sql: null } });
    render(<QualificacaoSeparador regras={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent(/sem alterações/i));
    expect(estado()).not.toHaveTextContent(/regras de qualificação guardadas/i);
  });

  it("o aviso muda quando se mexe outra vez nas regras (não fica um «guardadas» velho)", async () => {
    render(<QualificacaoSeparador regras={hook()} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("Regras de qualificação guardadas."));
    fireEvent.click(caixa("Quando uma lead é SQL", /Qualquer/, "Já foi contactada"));
    expect(estado()).toHaveTextContent("");
  });

  it("depois de guardar, o ecrã passa a mostrar o que a base devolveu", async () => {
    const guardar = vi.fn().mockResolvedValue({ mudou: true, depois: { mql: MQL, sql: SQL } });
    const { rerender } = render(<QualificacaoSeparador regras={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(estado()).toHaveTextContent("guardadas"));
    rerender(<QualificacaoSeparador regras={hook({ guardar, dados: { mql: MQL, sql: SQL, descartadas: 0 } })} />);
    expect(caixa("Quando uma lead é SQL", /Qualquer/, "Tem contrato assinado")).toBeChecked();
  });

  it("o botão tem 44 px de altura", () => {
    render(<QualificacaoSeparador regras={hook()} />);
    expect(guardarBtn().className).toContain("min-h-11");
  });
});

describe("QualificacaoSeparador: ocupado", () => {
  it("a guardar: botão com aria-busy e aria-disabled (continua focável), texto «A guardar...», caixas bloqueadas e anúncio", () => {
    render(<QualificacaoSeparador regras={hook({ aGuardar: true })} />);
    const b = guardarBtn();
    expect(b).toHaveTextContent("A guardar...");
    expect(b).toHaveAttribute("aria-busy", "true");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
    expect(estado()).toHaveTextContent("A guardar...");
  });

  it("duplo clique: só um pedido, e o foco fica no botão", async () => {
    let acabar: (v: ResultadoGuardar) => void = () => undefined;
    const guardar = vi.fn().mockReturnValue(new Promise<ResultadoGuardar>((r) => { acabar = r; }));
    render(<QualificacaoSeparador regras={hook({ guardar })} />);
    const b = guardarBtn();
    b.focus();
    fireEvent.click(b);
    fireEvent.click(b);
    fireEvent.click(b);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(b).toHaveFocus();
    await act(async () => { acabar({ mudou: true, depois: { mql: null, sql: null } }); });
    await waitFor(() => expect(estado()).toHaveTextContent("guardadas"));
    expect(guardarBtn()).toHaveFocus();
    fireEvent.click(guardarBtn());
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  it("uma gravação que falha liberta o botão: dá para tentar de novo", async () => {
    const guardar = vi.fn().mockRejectedValueOnce(erroNeg("NG009")).mockResolvedValueOnce({ mudou: true, depois: { mql: null, sql: null } });
    render(<QualificacaoSeparador regras={hook({ guardar })} />);
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(guardarBtn());
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(estado()).toHaveTextContent("guardadas");
  });
});

describe("QualificacaoSeparador: erros", () => {
  it.each([
    ["NG008", /não tem o novo fluxo/i],
    ["NG009", /uma das regras não é válida/i],
    ["42501", /permissão de configurar o Workflow/i],
  ])("%s mostra a mensagem própria do Workflow num alerta, e diz que nada foi guardado", async (codigo, texto) => {
    render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(erroNeg(codigo)) })} />);
    fireEvent.click(guardarBtn());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(texto);
    expect(alerta).toHaveTextContent(/nada foi guardado/i);
    expect(alerta).toHaveTextContent("Não foi possível guardar as regras.");
    expect(alerta).not.toHaveTextContent("texto da base");
  });

  it("outro código (NG006) usa a mensagem de código; uma avaria usa a genérica", async () => {
    const { unmount } = render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(erroNeg("NG006")) })} />);
    fireEvent.click(guardarBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/contrato assinado ligado/i);
    unmount();
    render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(new Error("rede")) })} />);
    fireEvent.click(guardarBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível concluir a ação/i);
  });

  it("o que o utilizador marcou fica no ecrã depois de um erro (não se perde o trabalho)", async () => {
    render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(erroNeg("NG009")) })} />);
    fireEvent.click(caixa("Quando uma lead é SQL", /Todas/, "Tem visita agendada"));
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    expect(caixa("Quando uma lead é SQL", /Todas/, "Tem visita agendada")).toBeChecked();
  });

  it("o foco fica no botão Guardar depois de um erro (o alerta é anunciado sem tirar o foco)", async () => {
    render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(erroNeg("42501")) })} />);
    guardarBtn().focus();
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    expect(guardarBtn()).toHaveFocus();
  });

  it("mexer nas regras limpa o erro anterior", async () => {
    render(<QualificacaoSeparador regras={hook({ guardar: vi.fn().mockRejectedValue(erroNeg("NG009")) })} />);
    fireEvent.click(guardarBtn());
    await screen.findByRole("alert");
    fireEvent.click(caixa("Quando uma lead é MQL", /Todas/, "Já foi contactada"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
