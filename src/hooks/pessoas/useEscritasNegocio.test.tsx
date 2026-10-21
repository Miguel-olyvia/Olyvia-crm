// As escritas diretas do negócio (UPDATE em `negocios` e em `proposals.terms`): as colunas enviadas, a tradução dos erros, o duplo clique e o
// que se refaz depois. A base é simulada; nada fala com o remoto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { ValoresNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { CondicoesTermos } from "@/components/negocio-metas/termosProposta";
import { ErroNeg } from "./chamarNeg";
import { CHAVES_ESCRITA } from "./escritasNegocio";
import { captureMock, criarCliente, fonteReal, montarHook, ORG } from "./fichaTestUtil";
import { PESSOA_ID } from "./fichaFabrica";
import { useEscritasNegocio } from "./useEscritasNegocio";

const { fromMock, passos } = vi.hoisted(() => ({ fromMock: vi.fn(), passos: [] as { metodo: string; args: unknown[] }[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

type Resposta = { data: unknown; error: unknown };
let resposta: () => Promise<Resposta>;

/** Uma cadeia de consulta que regista cada passo (from, update, eq, is, not) e acaba em `select`, que devolve a resposta simulada. */
function cadeia() {
  const c: Record<string, unknown> = {};
  for (const metodo of ["update", "eq", "is", "not", "or"]) c[metodo] = (...args: unknown[]) => { passos.push({ metodo, args }); return c; };
  c.select = (...args: unknown[]) => { passos.push({ metodo: "select", args }); return resposta(); };
  return c;
}

const ok = (linhas: unknown[] = [{ id: "n1" }]) => () => Promise.resolve({ data: linhas, error: null });
const falha = (code: string, message = "x") => () => Promise.resolve({ data: null, error: { code, message } });
const passo = (metodo: string, n = 0) => passos.filter((p) => p.metodo === metodo)[n]?.args;

const NEG = "n1";
const ANTES: ValoresNegocio = { titulo: "Cozinha", notas: "nota", comercialId: "u1" };

function montar() {
  const client = criarCliente();
  const r = montarHook(() => useEscritasNegocio(PESSOA_ID), undefined, { client, fonte: fonteReal() });
  const invalidar = vi.spyOn(client, "invalidateQueries");
  return { ...r, client, invalidar };
}

const erroDe = async (p: Promise<unknown>): Promise<ErroNeg> => (await p.then(() => null, (e) => e)) as ErroNeg;

beforeEach(() => {
  passos.length = 0;
  captureMock.mockReset();
  fromMock.mockReset();
  fromMock.mockImplementation((tabela: string) => { passos.push({ metodo: "from", args: [tabela] }); return cadeia(); });
  resposta = ok();
});
afterEach(() => vi.restoreAllMocks());

describe("editar", () => {
  it("envia só a coluna que mudou, na tabela negocios, presa ao negócio e à organização", async () => {
    const { result } = montar();
    await act(async () => { await result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "Cozinha nova" } }); });
    expect(passo("from")).toEqual(["negocios"]);
    expect(passo("update")).toEqual([{ titulo: "Cozinha nova" }]);
    expect(passos.filter((p) => p.metodo === "eq").map((p) => p.args)).toEqual([["id", NEG], ["organization_id", ORG]]);
  });

  it("nunca envia estado, fase nem motivo de perda", async () => {
    const { result } = montar();
    await act(async () => { await result.current.editar({ negocioId: NEG, antes: ANTES, depois: { titulo: "B", notas: "B", comercialId: "u2" } }); });
    const colunas = Object.keys(passo("update")?.[0] as object).sort();
    expect(colunas).toEqual(["assigned_to", "notas", "titulo"]);
  });

  it("sem mudanças não chama a base e diz que não mudou", async () => {
    const { result } = montar();
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES } }); });
    expect(r).toEqual({ mudou: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("em sucesso diz que mudou e refaz a ficha, a lista e o lixo", async () => {
    const { result, invalidar } = montar();
    let r: { mudou: boolean } | undefined;
    await act(async () => { r = await result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, notas: "outra" } }); });
    expect(r).toEqual({ mudou: true });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(chaves.some((k) => k.includes("neg-ficha-pessoa"))).toBe(true);
    expect(chaves.some((k) => k.includes("neg-resumo-pessoas"))).toBe(true);
    expect(chaves.some((k) => k.includes("negocios-lixo"))).toBe(true);
  });

  it("recusa um título vazio ou comprido sem chamar a base", async () => {
    const { result } = montar();
    const vazio = await erroDe(result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "  " } }));
    expect(vazio.chave).toBe(CHAVES_ESCRITA.titulo);
    const longas = await erroDe(result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, notas: "n".repeat(5001) } }));
    expect(longas.chave).toBe(CHAVES_ESCRITA.notas);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it.each([
    ["42501", "new row violates row-level security policy", CHAVES_ESCRITA.permissao],
    ["23514", "O comercial tem de ser membro activo da organização do negócio.", CHAVES_ESCRITA.comercial],
    ["23514", 'violates check constraint "negocios_titulo_check"', CHAVES_ESCRITA.titulo],
    ["23514", "Este negócio está no lixo: tem de ser restaurado antes de ser alterado.", CHAVES_ESCRITA.lixo],
  ])("o erro %s da base chega ao ecrã com a chave certa e não refaz nada", async (code, message, chave) => {
    resposta = falha(code, message);
    const { result, invalidar } = montar();
    const e = await erroDe(result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, comercialId: "u9" } }));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.chave).toBe(chave);
    expect(invalidar).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("uma falha que a base não explica vai para a observabilidade e dá a mensagem genérica", async () => {
    resposta = falha("XX000");
    const { result } = montar();
    const e = await erroDe(result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "Novo" } }));
    expect(e.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("um UPDATE que não tocou em nenhuma linha (a política escondeu-a) é «indisponível» e refaz a ficha", async () => {
    resposta = ok([]);
    const { result, invalidar } = montar();
    const e = await erroDe(result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "Novo" } }));
    expect(e.chave).toBe(CHAVES_ESCRITA.indisponivel);
    expect(invalidar).toHaveBeenCalled();
  });

  it("duplo clique: o mesmo pedido em curso faz uma só chamada", async () => {
    let terminar: (r: Resposta) => void = () => undefined;
    resposta = () => new Promise<Resposta>((res) => { terminar = res; });
    const { result } = montar();
    const pedido = { negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "Novo" } };
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
    act(() => { a = result.current.editar(pedido); b = result.current.editar(pedido); });
    expect(fromMock).toHaveBeenCalledTimes(1);
    await act(async () => { terminar({ data: [{ id: NEG }], error: null }); await Promise.all([a, b]); });
  });

  it("fora do modo real (sem organização) não escreve", async () => {
    const r = montarHook(() => useEscritasNegocio(PESSOA_ID), undefined, { fonte: { modo: "exemplo" } });
    const e = await erroDe(r.result.current.editar({ negocioId: NEG, antes: ANTES, depois: { ...ANTES, titulo: "Novo" } }));
    expect(e.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("lixo e restaurar", () => {
  it("enviar para o lixo carimba deleted_at só em negócios que ainda não estão no lixo", async () => {
    const { result } = montar();
    await act(async () => { await result.current.enviarParaLixo(NEG); });
    expect(passo("from")).toEqual(["negocios"]);
    const colunas = passo("update")?.[0] as Record<string, unknown>;
    expect(Object.keys(colunas)).toEqual(["deleted_at"]);
    expect(typeof colunas.deleted_at).toBe("string");
    expect(passos.filter((p) => p.metodo === "eq").map((p) => p.args)).toEqual([["id", NEG], ["organization_id", ORG]]);
    expect(passo("is")).toEqual(["deleted_at", null]);
  });

  it("restaurar põe deleted_at a null, só em negócios que estão no lixo", async () => {
    const { result } = montar();
    await act(async () => { await result.current.restaurar(NEG); });
    expect(passo("update")).toEqual([{ deleted_at: null }]);
    expect(passo("not")).toEqual(["deleted_at", "is", null]);
  });

  it("refaz a ficha, a lista e o lixo depois de cada um", async () => {
    const { result, invalidar } = montar();
    await act(async () => { await result.current.enviarParaLixo(NEG); });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(chaves.some((k) => k.includes("negocios-lixo"))).toBe(true);
    expect(chaves.some((k) => k.includes("neg-ficha-pessoa"))).toBe(true);
  });

  it("sem permissão (42501) traduz o erro e não refaz nada", async () => {
    resposta = falha("42501", "Sem permissão para enviar este negócio para o lixo ou para o restaurar (pessoas.delete).");
    const { result, invalidar } = montar();
    const e = await erroDe(result.current.enviarParaLixo(NEG));
    expect(e.chave).toBe(CHAVES_ESCRITA.permissao);
    expect(invalidar).not.toHaveBeenCalled();
  });

  it("um negócio que já estava no lixo (nenhuma linha tocada) diz «indisponível»", async () => {
    resposta = ok([]);
    const { result } = montar();
    expect((await erroDe(result.current.enviarParaLixo(NEG))).chave).toBe(CHAVES_ESCRITA.indisponivel);
    expect((await erroDe(result.current.restaurar(NEG))).chave).toBe(CHAVES_ESCRITA.indisponivel);
  });

  it("duplo clique em «Enviar para o lixo»: uma só chamada", async () => {
    let terminar: (r: Resposta) => void = () => undefined;
    resposta = () => new Promise<Resposta>((res) => { terminar = res; });
    const { result } = montar();
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
    act(() => { a = result.current.enviarParaLixo(NEG); b = result.current.enviarParaLixo(NEG); });
    expect(fromMock).toHaveBeenCalledTimes(1);
    await act(async () => { terminar({ data: [{ id: NEG }], error: null }); await Promise.all([a, b]); });
  });
});

describe("guardarCondicoes (proposals.terms)", () => {
  const CONDICOES: CondicoesTermos = { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 };

  it("faz PATCH só de terms, preso à proposta, ao negócio e à organização; sem validade nem notas", async () => {
    const { result } = montar();
    await act(async () => { await result.current.guardarCondicoes(NEG, "p1", CONDICOES); });
    expect(passo("from")).toEqual(["proposals"]);
    expect(passo("update")).toEqual([{ terms: { prazo_execucao_dias: 20, inicio_previsto: "2026-11-02", pagamento: "metade", garantia_anos: 2 } }]);
    expect(passos.filter((p) => p.metodo === "eq").map((p) => p.args)).toEqual([["id", "p1"], ["negocio_id", NEG], ["organization_id", ORG]]);
  });

  it("refaz a ficha depois de gravar", async () => {
    const { result, invalidar } = montar();
    await act(async () => { await result.current.guardarCondicoes(NEG, "p1", CONDICOES); });
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(chaves.some((k) => k.includes("neg-ficha-pessoa"))).toBe(true);
  });

  it("o UPDATE só toca em propostas que ainda não foram aceites nem recusadas (a guarda vai na base, não só no ecrã)", async () => {
    const { result } = montar();
    await act(async () => { await result.current.guardarCondicoes(NEG, "p1", CONDICOES); });
    expect(passo("or")).toEqual(["status.is.null,status.not.in.(accepted,rejected)"]);
  });

  it("uma proposta que ficou aceite ou recusada entretanto (nenhuma linha tocada) diz que as condições já não se mudam e refaz a ficha", async () => {
    resposta = ok([]);
    const { result, invalidar } = montar();
    expect((await erroDe(result.current.guardarCondicoes(NEG, "p1", CONDICOES))).chave).toBe(CHAVES_ESCRITA.propostaFechada);
    const chaves = invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(chaves.some((k) => k.includes("neg-ficha-pessoa"))).toBe(true);
  });

  it("sem permissão (42501) traduz o erro", async () => {
    resposta = falha("42501");
    const { result } = montar();
    expect((await erroDe(result.current.guardarCondicoes(NEG, "p1", CONDICOES))).chave).toBe(CHAVES_ESCRITA.permissao);
  });
});
