// Guardar o levantamento no formato novo (neg_guardar_levantamento): refs e escolhas em p_respostas, a versão do questionário em p_dados,
// recusa de gravar com o questionário por carregar, e, se a base disser que o questionário mudou, recarregar as perguntas e avisar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lerQuestionarioForm, QUESTIONARIO_CODIGO } from "@/components/negocio-metas/questionarioForm";
import { ErroNeg } from "./chamarNeg";
import { captureMock, criarCliente, fonteReal, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { paramsGuardarLevantamento, useGuardarLevantamento, type EntradaGuardarLevantamento } from "./guardarLevantamento";
import { QuestionarioFormularioProvider } from "./QuestionarioFormularioProvider";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { QUESTIONARIO_BRUTO } from "./workflow/questionarioTestUtil";

const { avisar } = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));
vi.mock("@/lib/toast", () => ({ toast: { info: avisar, error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => negocioMetasTranslations.pt[key] ?? key }) };
});

const QUESTIONARIO = lerQuestionarioForm(QUESTIONARIO_BRUTO)!;
const ENTRADA: EntradaGuardarLevantamento = {
  id: "lev-1", organizationId: "org-1", entityId: "ent-1",
  dados: { data_levantamento: "2026-10-20", estado: "feito", notas: "n" },
  linhas: [{ divisao: "cozinha", trabalho: "pavimento", medida: 10, unidade: "m2" }],
  respostas: { acesso: "dificil", imovel: "moradia,apartamento", notas: "portão", orcCliente: "12,5" },
};
const RESPOSTA_BASE = { levantamento_id: "lev-1", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false };

describe("paramsGuardarLevantamento", () => {
  it("manda as respostas no formato novo e a versão do questionário em que a pessoa preencheu, sem tocar nos outros dados", () => {
    const p = paramsGuardarLevantamento(ENTRADA, QUESTIONARIO);
    expect(p).toEqual({
      p_id: "lev-1", p_organization_id: "org-1", p_entity_id: "ent-1",
      p_dados: { data_levantamento: "2026-10-20", estado: "feito", notas: "n", versao_questionario: 7 },
      p_linhas: ENTRADA.linhas,
      p_respostas: {
        acesso: { escolhas: ["dificil"] }, imovel: { escolhas: ["apartamento", "moradia"] }, notas: { texto: "portão" }, orcCliente: { numero: 12.5 },
      },
    });
  });

  it("o negócio só vai se houver (a base tem o seu valor por omissão)", () => {
    expect("p_negocio_id" in paramsGuardarLevantamento(ENTRADA, QUESTIONARIO)).toBe(false);
    expect(paramsGuardarLevantamento({ ...ENTRADA, negocioId: "neg-1" }, QUESTIONARIO).p_negocio_id).toBe("neg-1");
    expect(paramsGuardarLevantamento({ ...ENTRADA, negocioId: null }, QUESTIONARIO).p_negocio_id).toBeUndefined();
  });

  it("com o catálogo do código (sem versão) não manda versão", () => {
    const p = paramsGuardarLevantamento(ENTRADA, QUESTIONARIO_CODIGO) as { p_dados: Record<string, unknown> };
    expect("versao_questionario" in p.p_dados).toBe(false);
  });

  it("não muda a entrada", () => {
    const antes = JSON.stringify(ENTRADA);
    paramsGuardarLevantamento(ENTRADA, QUESTIONARIO);
    expect(JSON.stringify(ENTRADA)).toBe(antes);
  });

  it("VALIDA antes de montar o pedido: um número fora dos limites ou um texto demasiado comprido não segue (ErroNeg com a chave das respostas por corrigir)", () => {
    const erro = (respostas: Record<string, string>) => {
      try { paramsGuardarLevantamento({ ...ENTRADA, respostas }, QUESTIONARIO); } catch (e) { return e; }
      return null;
    };
    for (const respostas of [{ orcCliente: "abc" }, { orcCliente: "100001" }, { orcCliente: "1,234" }, { notas: "x".repeat(2001) }]) {
      const e = erro(respostas);
      expect(e).toBeInstanceOf(ErroNeg);
      expect((e as ErroNeg).chave).toBe("businessGoals.new.qform.invalid");
    }
    expect(erro({ orcCliente: "12,5", notas: "ok" })).toBeNull();
  });
});

function montar(opcoes: { fonte?: FontePessoas; gravadas?: Parameters<typeof QuestionarioFormularioProvider>[0]["gravadas"] } = {}) {
  const client = criarCliente();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={opcoes.fonte ?? fonteReal()}>
        <QuestionarioFormularioProvider gravadas={opcoes.gravadas}>{children}</QuestionarioFormularioProvider>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, ...renderHook(() => useGuardarLevantamento(), { wrapper }) };
}
const chamadasDe = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);
const pronto = async (r: { result: { current: ReturnType<typeof useGuardarLevantamento> } }) => waitFor(() => expect(r.result.current.pronto).toBe(true));

beforeEach(() => {
  [rpcMock, captureMock, avisar].forEach((m) => m.mockReset());
  rpcMock.mockImplementation((nome: string) => respostaOk(nome === "neg_questionario_levantamento" ? QUESTIONARIO_BRUTO : RESPOSTA_BASE));
});

describe("useGuardarLevantamento", () => {
  it("grava com o questionário já carregado: parâmetros do formato novo e o resultado lido", async () => {
    const h = montar();
    await pronto(h);
    let resultado: unknown;
    await act(async () => { resultado = await h.result.current.guardar(ENTRADA); });
    const [chamada] = chamadasDe("neg_guardar_levantamento");
    expect(chamada[1]).toEqual(paramsGuardarLevantamento(ENTRADA, QUESTIONARIO));
    expect(resultado).toEqual({ levantamentoId: "lev-1", criado: true, mudou: true, ligadoA: null, versaoQuestionario: 7, questionarioMudou: false });
    expect(avisar).not.toHaveBeenCalled();
  });

  it("NÃO grava respostas inválidas (número fora dos limites): recusa sem chamar a base de gravação", async () => {
    const h = montar();
    await pronto(h);
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar({ ...ENTRADA, respostas: { orcCliente: "abc" } }).catch((e: unknown) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).chave).toBe("businessGoals.new.qform.invalid");
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(0);
    expect(h.result.current.aGuardar).toBe(false);
  });

  it("NÃO grava com o questionário por carregar: recusa sem chamar a base de gravação", async () => {
    rpcMock.mockImplementation(() => new Promise(() => {}));
    const h = montar();
    expect(h.result.current.pronto).toBe(false);
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar(ENTRADA).catch((e: unknown) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).chave).toBe("businessGoals.new.qform.notReady");
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(0);
  });

  it("NÃO grava se a leitura das perguntas falhou", async () => {
    rpcMock.mockImplementation(() => respostaErro("NG008"));
    const h = montar();
    await waitFor(() => expect(h.result.current.pronto).toBe(false));
    await new Promise((r) => setTimeout(r, 30));
    const erro = await h.result.current.guardar(ENTRADA).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(0);
  });

  it("sem base (exemplo) deixa gravar com o catálogo do código", async () => {
    const h = montar({ fonte: { modo: "exemplo" } });
    expect(h.result.current.pronto).toBe(true);
    await act(async () => { await h.result.current.guardar(ENTRADA); });
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(1);
    expect(nomeChamado(0)).toBe("neg_guardar_levantamento");
    expect((parametros(0).p_dados as Record<string, unknown>).versao_questionario).toBeUndefined();
  });

  it("questionario_mudou: recarrega as perguntas e avisa quem preenche (a gravação já foi feita)", async () => {
    rpcMock.mockImplementation((nome: string) => respostaOk(
      nome === "neg_questionario_levantamento" ? { ...QUESTIONARIO_BRUTO, versao: 8 } : { ...RESPOSTA_BASE, versao_questionario: 8, questionario_mudou: true },
    ));
    const h = montar();
    await pronto(h);
    const lidasAntes = chamadasDe("neg_questionario_levantamento").length;
    let resultado: { questionarioMudou: boolean } | undefined;
    await act(async () => { resultado = await h.result.current.guardar(ENTRADA); });
    expect(resultado?.questionarioMudou).toBe(true);
    expect(chamadasDe("neg_questionario_levantamento").length).toBe(lidasAntes + 1);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(String(avisar.mock.calls[0][0])).toMatch(/alterad/i);
  });

  it("sem questionario_mudou não relê nem avisa", async () => {
    const h = montar();
    await pronto(h);
    const lidasAntes = chamadasDe("neg_questionario_levantamento").length;
    await act(async () => { await h.result.current.guardar(ENTRADA); });
    expect(chamadasDe("neg_questionario_levantamento")).toHaveLength(lidasAntes);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("os erros da base passam como ErroNeg com o código (NG009, NG005...)", async () => {
    const h = montar();
    await pronto(h);
    rpcMock.mockImplementation((nome: string) => (nome === "neg_guardar_levantamento" ? respostaErro("NG009") : respostaOk(QUESTIONARIO_BRUTO)));
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar(ENTRADA).catch((e: unknown) => e); });
    expect((erro as ErroNeg).codigo).toBe("NG009");
    expect(h.result.current.aGuardar).toBe(false);
  });

  it("um duplo clique não manda duas gravações", async () => {
    const h = montar();
    await pronto(h);
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    await act(async () => {
      a = h.result.current.guardar(ENTRADA);
      b = h.result.current.guardar(ENTRADA);
      await Promise.all([a, b]);
    });
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(1);
    expect(a).toBe(b);
  });
});

describe("QuestionarioFormularioProvider", () => {
  it("aplica as respostas já gravadas (snapshot) ao questionário que o formulário vê", async () => {
    const gravada = {
      seccao: "exterior", pergunta: "acesso", tipo: "escolha_unica" as const, resposta: "facil", perguntaTexto: "Acesso de então", seccaoTitulo: null,
      bloco: null, ordem: null, escolhas: ["facil"], escolhasTexto: ["Fácil de então"], valorTexto: null, valorNumero: null,
    };
    const { useQuestionario } = await import("@/components/negocio-metas/QuestionarioContexto");
    const { todasAsPerguntas } = await import("@/components/negocio-metas/questionarioForm");
    const client = criarCliente();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <FontePessoasContext.Provider value={fonteReal()}><QuestionarioFormularioProvider gravadas={[gravada]}>{children}</QuestionarioFormularioProvider></FontePessoasContext.Provider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useQuestionario(), { wrapper });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(todasAsPerguntas(result.current.questionario.seccoes).find((p) => p.id === "acesso")?.rotulo[0]).toBe("Acesso de então");
  });
});

describe("useGuardarLevantamento: sem fornecedor das perguntas", () => {
  const semFornecedor = (fonte: FontePessoas) => {
    const client = criarCliente();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}><FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider></QueryClientProvider>
    );
    return renderHook(() => useGuardarLevantamento(), { wrapper });
  };

  it("em modo real NÃO grava contra o catálogo do código (sem versão e com chaves que a base pode não ter): fica por pronto e recusa sem chamar a base", async () => {
    const h = semFornecedor(fonteReal());
    expect(h.result.current.pronto).toBe(false);
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar(ENTRADA).catch((e: unknown) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).chave).toBe("businessGoals.new.qform.notReady");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("no protótipo sem base (modo exemplo) o catálogo do código continua a poder gravar", async () => {
    const h = semFornecedor({ modo: "exemplo" });
    expect(h.result.current.pronto).toBe(true);
    await act(async () => { await h.result.current.guardar(ENTRADA); });
    expect(chamadasDe("neg_guardar_levantamento")).toHaveLength(1);
  });
});

describe("useGuardarLevantamento: o questionário mudou e não se conseguiu recarregar", () => {
  it("avisa de outra forma: as perguntas no ecrã são as antigas, e diz para as recarregar antes de continuar", async () => {
    const h = montar();
    await pronto(h);
    rpcMock.mockImplementation((nome: string) => (
      nome === "neg_questionario_levantamento" ? respostaErro("NG008") : respostaOk({ ...RESPOSTA_BASE, versao_questionario: 8, questionario_mudou: true })
    ));
    await act(async () => { await h.result.current.guardar(ENTRADA); });
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(String(avisar.mock.calls[0][0])).toMatch(/não foi possível recarregar/i);
    expect(String(avisar.mock.calls[0][0])).toMatch(/ficou guardado/i);
    expect(String(avisar.mock.calls[0][0])).not.toMatch(/foram recarregadas/i);
  });
});
