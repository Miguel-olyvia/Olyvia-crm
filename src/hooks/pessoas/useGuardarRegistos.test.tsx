// useGuardarRegistos: o painel «Visita e levantamento» da ficha real a gravar. Faz o plano (planoGravacao) e executa-o por ordem: as visitas (criar,
// alterar, concluir, cancelar) e só depois o levantamento, ligado ao id da visita que a base devolveu. A primeira falha pára; se já havia coisas
// gravadas o erro diz o que ficou e o que falhou, e repetir só retoma o que falta (nada se duplica). O Supabase está simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { invalidadas, semear } from "./acoesFichaTestUtil";
import { adaptarRegistos } from "./adaptarRegistos";
import { ErroNeg } from "./chamarNeg";
import { fichaDb, levantamentoDb, PESSOA_ID, seccaoDb, visitaDb } from "./fichaFabrica";
import type { FichaDb } from "./fichaTipos";
import { captureMock, criarCliente, fonteReal, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { QuestionarioFormularioProvider } from "./QuestionarioFormularioProvider";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { ErroGuardarParcial, useGuardarRegistos } from "./useGuardarRegistos";
import { QUESTIONARIO_BRUTO } from "./workflow/questionarioTestUtil";

const { agenda } = vi.hoisted(() => ({ agenda: { omissao: { boardId: "q1" as string | null, recursoId: "r1" as string | null } } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("./useAgendaVisita", async (importar) => ({
  ...(await importar<typeof import("./useAgendaVisita")>()),
  useAgendaVisita: () => ({
    quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: agenda.omissao,
  }),
}));

const RASCUNHO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };
const COM_NOTA: RascunhoLevantamento = { ...RASCUNHO, observacoes: "portão estreito" };
const visita = (id: string, extra: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-22", hora: "10:00", feitoPor: "Rita", estado: "porFazer", tipo: "levantamento", quemVaiEstar: "", duracao: "h1",
  morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: false, nota: "", ...extra,
});
const FICHA_VAZIA = fichaDb();
const FICHA_COM_VISITA: FichaDb = fichaDb({
  visitas: seccaoDb([visitaDb({
    id: "v-base", inicio: "2026-10-22T09:00:00Z", fim: "2026-10-22T10:00:00Z", board_id: "q-base", recursos: [{ id: "r-base", nome: "Rita", user_id: "u1", ativo: true }],
    detalhes: { morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa" }, igual_a_lead: false },
  })]),
});
const daFicha = (ficha: FichaDb): VisitaNegocio[] => adaptarRegistos(ficha).visitas;

const RESPOSTA_VISITA = { visita_id: "v-novo", mudou: true, ligado_a: null };
const RESPOSTA_LEV = { levantamento_id: "lev-x", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false };

type Respostas = Record<string, () => Promise<unknown>>;
function responder(respostas: Respostas = {}): void {
  rpcMock.mockImplementation((nome: string) => {
    if (respostas[nome]) return respostas[nome]();
    if (nome === "neg_questionario_levantamento") return respostaOk(QUESTIONARIO_BRUTO);
    if (nome === "neg_guardar_visita") return respostaOk(RESPOSTA_VISITA);
    if (nome === "neg_guardar_levantamento") return respostaOk(RESPOSTA_LEV);
    return respostaOk({ mudou: true });
  });
}

async function montar(opcoes: { ficha?: FichaDb | null; fonte?: FontePessoas; negocioId?: string | null } = {}) {
  const client = criarCliente();
  semear(client);
  const ficha = opcoes.ficha === undefined ? FICHA_VAZIA : opcoes.ficha;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={opcoes.fonte ?? fonteReal()}><QuestionarioFormularioProvider>{children}</QuestionarioFormularioProvider></FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  const h = renderHook(() => useGuardarRegistos(ficha, { negocioId: opcoes.negocioId ?? null }), { wrapper });
  if (opcoes.fonte === undefined && ficha !== null) await waitFor(() => expect(h.result.current.pronto).toBe(true));
  return { client, ...h };
}
const chamadas = (): string[] => rpcMock.mock.calls.map((c) => c[0] as string).filter((n) => n !== "neg_questionario_levantamento");
const argumentos = (nome: string, n = 0): Record<string, unknown> => rpcMock.mock.calls.filter((c) => c[0] === nome)[n][1] as Record<string, unknown>;
async function falhar(p: Promise<unknown>): Promise<unknown> {
  let e: unknown = null;
  await act(async () => { e = await p.then(() => null, (x: unknown) => x); });
  return e;
}

beforeEach(() => {
  rpcMock.mockReset();
  captureMock.mockReset();
  agenda.omissao = { boardId: "q1", recursoId: "r1" };
  vi.useRealTimers();
  responder();
});

describe("visitas novas e levantamento", () => {
  it("cria a visita e depois o levantamento, ligado ao id que a base devolveu (e sem negócio nem contacto nem nota)", async () => {
    const { result } = await montar();
    let r: Awaited<ReturnType<typeof result.current.guardar>> | undefined;
    await act(async () => { r = await result.current.guardar([visita("nova")], COM_NOTA, "Rita"); });
    expect(chamadas()).toEqual(["neg_guardar_visita", "neg_guardar_levantamento"]);
    expect(argumentos("neg_guardar_visita")).toMatchObject({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_board_id: "q1", p_recursos: ["r1"], p_visit_kind: "levantamento", p_negocio_id: null, p_lat: null, p_lng: null,
    });
    const lev = argumentos("neg_guardar_levantamento");
    expect(lev).toMatchObject({ p_organization_id: "org-1", p_entity_id: PESSOA_ID });
    expect("p_negocio_id" in lev).toBe(false);
    expect(lev.p_dados).toMatchObject({ data_levantamento: "2026-10-22", estado: "por_fazer", visita_id: "v-novo", notas: "portão estreito", versao_questionario: 7 });
    expect(r?.feitos).toEqual(["criarVisita", "levantamento"]);
  });

  it("uma visita nova já feita: cria, conclui sem resultado (com o id novo) e só depois o levantamento", async () => {
    const { result } = await montar();
    await act(async () => { await result.current.guardar([visita("nova", { estado: "feita", data: "2020-01-01" })], COM_NOTA, "Rita"); });
    expect(chamadas()).toEqual(["neg_guardar_visita", "neg_resultado_visita", "neg_guardar_levantamento"]);
    expect(argumentos("neg_resultado_visita")).toEqual({ p_visita_id: "v-novo", p_resultado: null, p_feita: true });
    expect(argumentos("neg_guardar_levantamento").p_dados).toMatchObject({ estado: "feito", visita_id: "v-novo" });
  });

  it("o negócio vai com a visita e com o levantamento, na mesma chamada (nunca neg_ligar_registo)", async () => {
    const { result } = await montar({ negocioId: "neg-1" });
    await act(async () => { await result.current.guardar([visita("nova")], COM_NOTA, "Rita"); });
    expect(argumentos("neg_guardar_visita").p_negocio_id).toBe("neg-1");
    expect(argumentos("neg_guardar_levantamento").p_negocio_id).toBe("neg-1");
    expect(chamadas()).not.toContain("neg_ligar_registo");
  });

  it("só marcar uma visita não cria levantamento, e invalida a ficha e as listas", async () => {
    const { result, client } = await montar();
    await act(async () => { await result.current.guardar([visita("nova")], RASCUNHO, "Rita"); });
    expect(chamadas()).toEqual(["neg_guardar_visita"]);
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("o levantamento escreve-se na pessoa livre: um id novo na primeira vez, o que já existe nas seguintes", async () => {
    const { result } = await montar({ ficha: fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "lev-existente", data: "2026-10-12" })]) }) });
    await act(async () => { await result.current.guardar([], COM_NOTA, "Rita"); });
    expect(argumentos("neg_guardar_levantamento").p_id).toBe("lev-existente");
    expect(argumentos("neg_guardar_levantamento").p_dados).toMatchObject({ data_levantamento: "2026-10-12", notas: "portão estreito" });
  });

  it("nada a gravar: não chama a base e devolve um resultado vazio", async () => {
    const { result } = await montar();
    let r: Awaited<ReturnType<typeof result.current.guardar>> | undefined;
    await act(async () => { r = await result.current.guardar([], RASCUNHO, "Rita"); });
    expect(chamadas()).toEqual([]);
    expect(r).toEqual({ feitos: [], levantamento: null });
  });
});

describe("visitas que já existem", () => {
  it("alterar reenvia tudo e, com os mesmos recursos, p_recursos vai nulo; cancelar vai à base; por esta ordem, antes do levantamento", async () => {
    const ficha = fichaDb({ visitas: seccaoDb([
      ...FICHA_COM_VISITA.visitas!.itens,
      visitaDb({ id: "v-outra", inicio: "2026-10-23T09:00:00Z", fim: "2026-10-23T10:00:00Z", board_id: "q-base", recursos: [{ id: "r-base", nome: "Rita", user_id: "u1", ativo: true }] }),
    ]) });
    const [a, b] = daFicha(ficha);
    const { result } = await montar({ ficha });
    await act(async () => { await result.current.guardar([{ ...a, nota: "mudei" }, { ...b, estado: "cancelada" }], COM_NOTA, "Rita"); });
    expect(chamadas()).toEqual(["neg_alterar_visita", "neg_cancelar_visita", "neg_guardar_levantamento"]);
    expect(argumentos("neg_alterar_visita")).toMatchObject({ p_visita_id: "v-base", p_board_id: "q-base", p_recursos: null, p_notas: "mudei" });
    expect(argumentos("neg_cancelar_visita")).toEqual({ p_visita_id: "v-outra" });
  });

  it("passar a feita conclui a visita da base", async () => {
    const ficha = fichaDb({ visitas: seccaoDb([visitaDb({ id: "v-passada", inicio: "2020-01-01T09:00:00Z", fim: "2020-01-01T10:00:00Z", board_id: "q", recursos: [{ id: "r", nome: "R", user_id: null, ativo: true }] })]) });
    const [v] = daFicha(ficha);
    const { result } = await montar({ ficha });
    await act(async () => { await result.current.guardar([{ ...v, estado: "feita" }], RASCUNHO, "Rita"); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
    expect(argumentos("neg_resultado_visita")).toEqual({ p_visita_id: "v-passada", p_resultado: null, p_feita: true });
  });
});

describe("recusas antes de escrever", () => {
  it("sem hora numa visita nova recusa-se com a mensagem própria e nada vai à base", async () => {
    const { result } = await montar();
    const e = await falhar(result.current.guardar([visita("nova", { hora: "" })], RASCUNHO, "Rita"));
    expect(e).toBeInstanceOf(ErroNeg);
    expect((e as ErroNeg).chave).toBe("pessoasPagina.real.records.err.timeMissing");
    expect(chamadas()).toEqual([]);
  });

  it("sem quadro ou recurso por omissão a mensagem remete para «Marcar visita», que deixa escolher", async () => {
    agenda.omissao = { boardId: null, recursoId: null };
    const { result } = await montar();
    const e = await falhar(result.current.guardar([visita("nova")], RASCUNHO, "Rita"));
    expect((e as ErroNeg).chave).toBe("pessoasPagina.real.records.err.noAgenda");
    expect(chamadas()).toEqual([]);
  });

  it("uma visita no futuro marcada como feita recusa-se antes de criar o que quer que seja", async () => {
    const { result } = await montar();
    const e = await falhar(result.current.guardar([visita("a"), visita("nova", { estado: "feita", data: "2999-01-01" })], RASCUNHO, "Rita"));
    expect((e as ErroNeg).chave).toBe("pessoasPagina.real.records.err.doneInFuture");
    expect(chamadas()).toEqual([]);
  });

  it("com o questionário por carregar não se grava nada (nem as visitas): a gravação a meio por esta razão é evitável", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? new Promise(() => {}) : respostaOk({})));
    const { result } = await montar({ fonte: fonteReal() });
    expect(result.current.pronto).toBe(false);
    const e = await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    expect((e as ErroNeg).chave).toBe("businessGoals.new.qform.notReady");
    expect(chamadas()).toEqual([]);
  });

  it("respostas por corrigir também se recusam antes de escrever as visitas", async () => {
    const { result } = await montar();
    const e = await falhar(result.current.guardar([visita("nova")], { ...COM_NOTA, respostas: { orcCliente: "abc" } }, "Rita"));
    expect((e as ErroNeg).chave).toBe("businessGoals.new.qform.invalid");
    expect(chamadas()).toEqual([]);
  });

  it("sem a base (o exemplo) ou sem ficha não grava: erro genérico", async () => {
    const exemplo = await montar({ fonte: { modo: "exemplo" } });
    expect(((await falhar(exemplo.result.current.guardar([visita("nova")], RASCUNHO, "Rita"))) as ErroNeg).chave).toBe("pessoasPagina.erroNeg.generico");
    const semFicha = await montar({ ficha: null });
    expect(((await falhar(semFicha.result.current.guardar([visita("nova")], RASCUNHO, "Rita"))) as ErroNeg).chave).toBe("pessoasPagina.erroNeg.generico");
    expect(chamadas()).toEqual([]);
  });
});

describe("falhas", () => {
  it("a falha do primeiro passo é um erro simples, lido para o diálogo da visita (NG010: recurso ocupado), sem aviso de parcial", async () => {
    responder({ neg_guardar_visita: () => respostaErro("NG010") });
    const { result, client } = await montar();
    const e = await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    expect(e).not.toBeInstanceOf(ErroGuardarParcial);
    expect((e as ErroNeg).codigo).toBe("NG010");
    expect((e as ErroNeg).chave).toBe("pessoasPagina.real.visit.err.marcar.ng010");
    expect(chamadas()).toEqual(["neg_guardar_visita"]);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("o levantamento falha depois de a visita ficar gravada: o erro diz o que ficou e o que falhou, traz a causa, e a ficha refaz-se", async () => {
    responder({ neg_guardar_levantamento: () => respostaErro("NG009") });
    const { result, client } = await montar();
    const e = await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    expect(e).toBeInstanceOf(ErroGuardarParcial);
    const parcial = e as ErroGuardarParcial;
    expect(parcial.feitos).toEqual(["criarVisita"]);
    expect(parcial.falhou).toBe("levantamento");
    expect(parcial.codigo).toBe("NG009");
    expect(parcial.chave).toBe("pessoasPagina.real.records.partial");
    expect(parcial.chaveExtra).toBeTruthy();
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("repetir depois de uma falha a meio NÃO cria a visita outra vez: retoma só o levantamento, com o mesmo id e a visita já criada", async () => {
    let falha = true;
    responder({ neg_guardar_levantamento: () => (falha ? respostaErro("NG009") : respostaOk(RESPOSTA_LEV)) });
    const { result } = await montar();
    await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    falha = false;
    await act(async () => { await result.current.guardar([visita("nova")], COM_NOTA, "Rita"); });
    expect(chamadas()).toEqual(["neg_guardar_visita", "neg_guardar_levantamento", "neg_guardar_levantamento"]);
    expect(argumentos("neg_guardar_levantamento", 1).p_id).toBe(argumentos("neg_guardar_levantamento", 0).p_id);
    expect(argumentos("neg_guardar_levantamento", 1).p_dados).toMatchObject({ visita_id: "v-novo" });
  });

  it("depois de uma falha a meio, uma alteração à visita já criada altera-a (com o id da base) em vez de criar outra", async () => {
    let falha = true;
    responder({ neg_guardar_levantamento: () => (falha ? respostaErro("NG009") : respostaOk(RESPOSTA_LEV)) });
    const { result } = await montar();
    await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    falha = false;
    await act(async () => { await result.current.guardar([visita("nova", { nota: "outra" })], COM_NOTA, "Rita"); });
    expect(chamadas().filter((n) => n === "neg_guardar_visita")).toHaveLength(1);
    expect(argumentos("neg_alterar_visita")).toMatchObject({ p_visita_id: "v-novo", p_notas: "outra", p_board_id: "q1", p_recursos: null });
  });

  it("depois de uma falha a meio, tirar do painel a visita já criada cancela-a na base", async () => {
    let falha = true;
    responder({ neg_guardar_levantamento: () => (falha ? respostaErro("NG009") : respostaOk(RESPOSTA_LEV)) });
    const { result } = await montar();
    await falhar(result.current.guardar([visita("nova")], COM_NOTA, "Rita"));
    falha = false;
    await act(async () => { await result.current.guardar([], COM_NOTA, "Rita"); });
    expect(argumentos("neg_cancelar_visita")).toEqual({ p_visita_id: "v-novo" });
  });

  it("falha num passo a seguir a outro (alterar depois de criar): feitos e falhou dizem qual", async () => {
    responder({ neg_alterar_visita: () => respostaErro("NG017") });
    const [base] = daFicha(FICHA_COM_VISITA);
    const { result } = await montar({ ficha: FICHA_COM_VISITA });
    const e = await falhar(result.current.guardar([visita("nova"), { ...base, nota: "x" }], RASCUNHO, "Rita"));
    expect(e).toBeInstanceOf(ErroGuardarParcial);
    expect((e as ErroGuardarParcial).feitos).toEqual(["criarVisita"]);
    expect((e as ErroGuardarParcial).falhou).toBe("alterarVisita");
  });
});

describe("duplo clique e estado", () => {
  it("dois pedidos seguidos partilham a mesma gravação: só uma chamada à base", async () => {
    const { result } = await montar();
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    await act(async () => {
      a = result.current.guardar([visita("nova")], COM_NOTA, "Rita");
      b = result.current.guardar([visita("nova")], COM_NOTA, "Rita");
      await Promise.all([a, b]);
    });
    expect(chamadas()).toEqual(["neg_guardar_visita", "neg_guardar_levantamento"]);
    expect(a).toBe(b);
    expect(result.current.aGuardar).toBe(false);
  });

  it("aGuardar liga durante a gravação e desliga no fim, mesmo com erro", async () => {
    let largar: (() => void) | undefined;
    responder({ neg_guardar_visita: () => new Promise((resolver) => { largar = () => resolver({ data: RESPOSTA_VISITA, error: null }); }) });
    const { result } = await montar();
    let p: Promise<unknown> | undefined;
    act(() => { p = result.current.guardar([visita("nova")], RASCUNHO, "Rita"); });
    await waitFor(() => expect(result.current.aGuardar).toBe(true));
    await act(async () => { largar?.(); await p; });
    expect(result.current.aGuardar).toBe(false);
  });

  it("pronto acompanha o questionário carregado", async () => {
    const { result } = await montar();
    expect(result.current.pronto).toBe(true);
    const exemplo = await montar({ fonte: { modo: "exemplo" } });
    expect(exemplo.result.current.pronto).toBe(false);
  });
});
