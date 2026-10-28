// Os hooks reais do canal de denúncias, com a base e a Edge SIMULADAS: que RPC chamam e com que argumentos, como tratam os
// erros (visíveis, nunca «sem denúncias»), o que reportam (só a operação e o código) e o que NUNCA fazem (JWT numa anónima,
// identidade em cache, guardar sessões fora da memória). As RPCs e a Edge ainda não existem na base.
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { FORMULARIO_VAZIO } from "@/components/canal-denuncias/lib/formulario";
import { esquecerTodasAsSessoes, lerSessao } from "@/lib/denuncias/edgePublica";

const mocks = vi.hoisted(() => ({
  hrRpc: vi.fn(),
  getSession: vi.fn(),
  captureFlowError: vi.fn(),
}));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: mocks.hrRpc }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: mocks.captureFlowError }));

import {
  chavesDenuncias, useDenunciaAberta, useDenunciasAccoes, useDenunciasConfiguracao, useDenunciasListar, useDenunciasMinhas,
  useDenunciasPorConfirmar, useDenunciasResponsaveis, useVistaDoDenunciante,
} from "./useDenunciasCanal";

const ORG = "org-nike";
const fetchFalso = vi.fn();

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, codigo: `DEN-2026-00${id}`, tipo: "fraude", resumo: "Despesas duplicadas", estado: "recebida", gravidade: "media", anonima: true,
  responsavel_id: null, recebida_em: "2026-10-15T09:30:00Z", confirmada_em: null, ...extra,
});

const aberta = (id: string, extra: Record<string, unknown> = {}) => ({
  ...linha(id), descricao: "Há despesas lançadas duas vezes.", quando: "Em Setembro", ainda_acontece: "sim", onde: null, envolvidos: null,
  testemunhas: "nao_sei", ja_reportado: null, avaliacao_inicial: null, resultado: null, medidas: null, fundamentacao: null, decidida_em: null,
  motivo_arquivo: null, mensagens: [], notas: [], eventos: [], anexos: [], impedidos: [], ...extra,
});

/** A base simulada: cada RPC responde com o que está no mapa; o que não está falha como «função inexistente». */
function base(respostas: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>): void {
  mocks.hrRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (!(fn in respostas)) return Promise.resolve({ data: null, error: { code: "42883", message: `function ${fn} does not exist` } });
    const r = respostas[fn];
    const v = typeof r === "function" ? (r as (a: Record<string, unknown>) => unknown)(args) : r;
    if (v && typeof v === "object" && "__erro" in (v as object)) return Promise.resolve({ data: null, error: (v as { __erro: unknown }).__erro });
    return Promise.resolve({ data: v, error: null });
  });
}
const erroRpc = (code: string, message = "Mensagem da base com dados do caso") => ({ __erro: { code, message, details: "descrição privada do caso" } });

function edge(estado: number, corpo: unknown): void {
  fetchFalso.mockResolvedValueOnce({ ok: estado >= 200 && estado < 300, status: estado, json: () => Promise.resolve(corpo) });
}

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.hrRpc.mockReset();
  mocks.getSession.mockReset();
  mocks.captureFlowError.mockReset();
  fetchFalso.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
  vi.stubGlobal("fetch", fetchFalso);
  esquecerTodasAsSessoes();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reportados = (): string[] => mocks.captureFlowError.mock.calls.map((c) => (c[0] as Error).message);

describe("leituras", () => {
  it("a lista chama rpc_denuncias_listar com a organização e mapeia as linhas", async () => {
    base({ rpc_denuncias_listar: [linha("1"), linha("2", { estado: "em_analise", anonima: false })] });
    const { result } = renderHook(() => useDenunciasListar(ORG), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_listar", { p_organization_id: ORG });
    expect(result.current.data?.[1]).toMatchObject({ estado: "em_analise", anonima: false, organizationId: ORG });
  });

  it("uma lista vazia é uma lista vazia (a base respondeu), não um erro", async () => {
    base({ rpc_denuncias_listar: [] });
    const { result } = renderHook(() => useDenunciasListar(ORG), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("com a RPC por aplicar a leitura FALHA (isError, sem dados) e reporta só a operação e o código", async () => {
    base({});
    const { result } = renderHook(() => useDenunciasListar(ORG), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(reportados()).toEqual(["denuncias:listar:42883"]);
    expect(JSON.stringify(mocks.captureFlowError.mock.calls)).not.toContain("does not exist");
  });

  it("uma resposta com a forma errada falha a leitura em vez de mostrar uma denúncia adivinhada", async () => {
    base({ rpc_denuncias_listar: [linha("1", { estado: "inventado" })] });
    const { result } = renderHook(() => useDenunciasListar(ORG), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(reportados()).toHaveLength(1);
  });

  it("sem organização não pergunta nada à base", () => {
    renderHook(() => useDenunciasListar(""), { wrapper });
    expect(mocks.hrRpc).not.toHaveBeenCalled();
  });

  it("abrir um caso chama rpc_denuncia_abrir com a organização E o id", async () => {
    base({ rpc_denuncia_abrir: aberta("7") });
    const { result } = renderHook(() => useDenunciaAberta(ORG, "7"), { wrapper });
    await waitFor(() => expect(result.current.data?.descricao).toBe("Há despesas lançadas duas vezes."));
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_abrir", { p_organization_id: ORG, p_denuncia_id: "7" });
  });

  it("não ver o caso (HRD09) é uma falha de leitura e NÃO se reporta (é a resposta correta)", async () => {
    base({ rpc_denuncia_abrir: () => erroRpc("HRD09") });
    const { result } = renderHook(() => useDenunciaAberta(ORG, "7"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(reportados()).toEqual([]);
  });

  it("o contador é um inteiro; uma resposta má é erro, nunca «0»", async () => {
    base({ rpc_denuncias_por_confirmar: 4 });
    const bom = renderHook(() => useDenunciasPorConfirmar(ORG), { wrapper });
    await waitFor(() => expect(bom.result.current.data).toBe(4));
    qc.clear();
    base({ rpc_denuncias_por_confirmar: "muitas" });
    const mau = renderHook(() => useDenunciasPorConfirmar(ORG), { wrapper });
    await waitFor(() => expect(mau.result.current.isError).toBe(true));
    expect(mau.result.current.data).toBeUndefined();
  });

  it("os responsáveis trazem a lista e quem sou (eu)", async () => {
    base({ rpc_denuncias_responsaveis: { eu: "u1", responsaveis: [{ id: "u1", nome: "Helena Matos" }, { id: "u2", nome: "Rui Barbosa" }] } });
    const { result } = renderHook(() => useDenunciasResponsaveis(ORG), { wrapper });
    await waitFor(() => expect(result.current.data?.lista).toHaveLength(2));
    expect(result.current.data?.euId).toBe("u1");
  });

  it("a configuração é nula para quem não tem permissão (HRD17), sem reportar; outros erros são erro", async () => {
    base({ rpc_denuncias_canal_ler: () => erroRpc("HRD17") });
    const semPermissao = renderHook(() => useDenunciasConfiguracao(ORG), { wrapper });
    await waitFor(() => expect(semPermissao.result.current.isSuccess).toBe(true));
    expect(semPermissao.result.current.data).toBeNull();
    expect(reportados()).toEqual([]);
    qc.clear();
    base({ rpc_denuncias_canal_ler: () => erroRpc("57014") });
    const falhou = renderHook(() => useDenunciasConfiguracao(ORG), { wrapper });
    await waitFor(() => expect(falhou.result.current.isError).toBe(true));
  });

  it("a configuração lida traz o slug, os candidatos e quantos casos ninguém pode tratar", async () => {
    base({ rpc_denuncias_canal_ler: { ativo: true, slug_publico: "nike-canal", responsaveis: [], candidatos: [{ id: "u9", nome: "Ana Dias" }], sem_quem_trate: 2 } });
    const { result } = renderHook(() => useDenunciasConfiguracao(ORG), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ ativo: true, slug: "nike-canal", semQuemTrate: 2 }));
    expect(result.current.data?.candidatos).toEqual([{ id: "u9", nome: "Ana Dias", area: "" }]);
  });

  it("«As minhas» deixa cada vista na cache para o painel abrir já com ela", async () => {
    base({
      rpc_denuncias_minhas: [{ id: "m1", codigo: "DEN-2026-0031", resumo: "O meu caso", estado: "em_analise", anonima: false, recebida_em: "2026-10-01T10:00:00Z", confirmada_em: "2026-10-02T10:00:00Z", resultado: null, medidas: null, motivo_arquivo: null, mensagens: [] }],
    });
    const { result } = renderHook(() => useDenunciasMinhas(ORG), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(qc.getQueryData(chavesDenuncias.vista("m1"))).toMatchObject({ id: "m1", codigo: "DEN-2026-0031" });
    const vista = renderHook(() => useVistaDoDenunciante("m1", ORG), { wrapper });
    await waitFor(() => expect(vista.result.current.data?.codigo).toBe("DEN-2026-0031"));
    expect(mocks.hrRpc).toHaveBeenCalledTimes(1);
  });
});

describe("ações do responsável", () => {
  const acoes = () => renderHook(() => useDenunciasAccoes(), { wrapper }).result.current;

  it.each([
    ["confirmar a receção", (a: ReturnType<typeof acoes>) => a.confirmarRececao(ORG, "7"), "rpc_denuncia_confirmar_rececao", {}],
    ["mudar a gravidade", (a: ReturnType<typeof acoes>) => a.mudarGravidade(ORG, "7", "alta"), "rpc_denuncia_gravidade", { p_gravidade: "alta" }],
    ["atribuir", (a: ReturnType<typeof acoes>) => a.atribuir(ORG, "7", "u2"), "rpc_denuncia_atribuir", { p_user: "u2" }],
    ["declarar conflito", (a: ReturnType<typeof acoes>) => a.impedir(ORG, "7", "u1", "conflito"), "rpc_denuncia_impedir", { p_user: "u1", p_motivo: "conflito" }],
    ["marcar visado", (a: ReturnType<typeof acoes>) => a.impedir(ORG, "7", "u3", "visado"), "rpc_denuncia_impedir", { p_user: "u3", p_motivo: "visado" }],
    ["enviar mensagem", (a: ReturnType<typeof acoes>) => a.enviarMensagem(ORG, "7", "Olá"), "rpc_denuncia_mensagem", { p_texto: "Olá" }],
    ["pedir informação", (a: ReturnType<typeof acoes>) => a.pedirInformacao(ORG, "7", "Desde quando?"), "rpc_denuncia_pedir_informacao", { p_texto: "Desde quando?" }],
    ["nota interna", (a: ReturnType<typeof acoes>) => a.adicionarNota(ORG, "7", "Cruzar"), "rpc_denuncia_nota", { p_texto: "Cruzar" }],
    ["concluir", (a: ReturnType<typeof acoes>) => a.concluir(ORG, "7", { resultado: "procedente", medidas: "M", fundamentacao: "F" }), "rpc_denuncia_concluir", { p_resultado: "procedente", p_medidas: "M", p_fundamentacao: "F" }],
    ["arquivar", (a: ReturnType<typeof acoes>) => a.arquivar(ORG, "7", "Duplicada"), "rpc_denuncia_arquivar", { p_motivo: "Duplicada" }],
    ["reabrir", (a: ReturnType<typeof acoes>) => a.reabrir(ORG, "7"), "rpc_denuncia_reabrir", {}],
  ])("%s chama %s com a organização, o id e os argumentos certos", async (_nome, fazer, rpc, extra) => {
    base({ [rpc as string]: aberta("7") });
    const r = await fazer(acoes());
    expect(r).toEqual({ ok: true });
    expect(mocks.hrRpc).toHaveBeenCalledWith(rpc, { p_organization_id: ORG, p_denuncia_id: "7", ...(extra as object) });
  });

  it("depois de uma ação relê a lista, o contador e o caso", async () => {
    base({ rpc_denuncia_reabrir: aberta("7") });
    qc.setQueryData(chavesDenuncias.lista(ORG), []);
    qc.setQueryData(chavesDenuncias.porConfirmar(ORG), 1);
    qc.setQueryData(chavesDenuncias.caso(ORG, "7"), {});
    await acoes().reabrir(ORG, "7");
    for (const k of [chavesDenuncias.lista(ORG), chavesDenuncias.porConfirmar(ORG), chavesDenuncias.caso(ORG, "7")]) {
      expect(qc.getQueryState(k)?.isInvalidated).toBe(true);
    }
  });

  it("uma regra do canal volta como erro do ecrã e não se reporta; o resto é «indisponivel» e reporta-se sem dados", async () => {
    base({ rpc_denuncia_concluir: () => erroRpc("HRD06"), rpc_denuncia_nota: () => erroRpc("57014") });
    const a = acoes();
    expect(await a.concluir(ORG, "7", { resultado: "", medidas: "", fundamentacao: "" })).toEqual({ ok: false, erro: "resultado_em_falta" });
    expect(reportados()).toEqual([]);
    expect(await a.adicionarNota(ORG, "7", "texto privado do caso")).toEqual({ ok: false, erro: "indisponivel" });
    expect(reportados()).toEqual(["denuncias:nota:57014"]);
    expect(JSON.stringify(mocks.captureFlowError.mock.calls)).not.toMatch(/privad|Mensagem da base/);
  });

  it("uma exceção inesperada (rede) nunca rebenta: devolve «indisponivel»", async () => {
    mocks.hrRpc.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await acoes().reabrir(ORG, "7")).toEqual({ ok: false, erro: "indisponivel" });
    expect(reportados()).toEqual(["denuncias:reabrir:sem_codigo"]);
  });

  it("ver a identidade envia o motivo, devolve a identidade e NÃO a deixa em nenhuma cache", async () => {
    base({ rpc_denuncia_identidade_ver: { nome: "Inês Cardoso", email: "ines@exemplo.pt", telefone: null, pode_contactar: true, so_responsavel: true } });
    const r = await acoes().verIdentidade(ORG, "7", "Preciso de a contactar");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_identidade_ver", { p_organization_id: ORG, p_denuncia_id: "7", p_motivo: "Preciso de a contactar" });
    expect(r).toEqual({ ok: true, identidade: { nome: "Inês Cardoso", email: "ines@exemplo.pt", telefone: "", podemContactar: true, soResponsavel: true } });
    const guardado = JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data));
    expect(guardado).not.toContain("Inês");
  });

  it("ver a identidade sem motivo, de uma anónima ou sem ser o responsável devolve o erro da base", async () => {
    const a = acoes();
    for (const [code, erro] of [["HRD12", "motivo_identidade"], ["HRD11", "anonima"], ["HRD16", "so_responsavel"]] as const) {
      base({ rpc_denuncia_identidade_ver: () => erroRpc(code) });
      expect(await a.verIdentidade(ORG, "7", "x")).toEqual({ ok: false, erro });
    }
    expect(reportados()).toEqual([]);
  });

  it("configurar: guardar o canal e designar/remover responsáveis usam as RPCs certas", async () => {
    base({ rpc_denuncias_canal_guardar: null, rpc_denuncias_responsavel_designar: null, rpc_denuncias_responsavel_remover: null });
    const a = acoes();
    expect(await a.guardarCanal(ORG, true, "nike-canal")).toEqual({ ok: true });
    expect(await a.designarResponsavel(ORG, "u2")).toEqual({ ok: true });
    expect(await a.removerResponsavel(ORG, "u2")).toEqual({ ok: true });
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_canal_guardar", { p_organization_id: ORG, p_ativo: true, p_slug: "nike-canal" });
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_responsavel_designar", { p_organization_id: ORG, p_user: "u2" });
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_responsavel_remover", { p_organization_id: ORG, p_user: "u2" });
  });

  it("um slug já usado volta como «slug_em_uso» e sem permissão como «sem_permissao»", async () => {
    const a = acoes();
    base({ rpc_denuncias_canal_guardar: () => erroRpc("HRD18") });
    expect(await a.guardarCanal(ORG, true, "x")).toEqual({ ok: false, erro: "slug_em_uso" });
    base({ rpc_denuncias_responsavel_designar: () => erroRpc("HRD17") });
    expect(await a.designarResponsavel(ORG, "u2")).toEqual({ ok: false, erro: "sem_permissao" });
  });
});

describe("denunciar pela Edge", () => {
  const completo = { ...FORMULARIO_VAZIO, tipo: "fraude" as const, descricao: "Despesas duplicadas com a mesma fatura.", quando: "Em Setembro", boaFe: true, nome: "Inês", email: "i@x.pt" };
  const cabecalhos = (): Record<string, string> => fetchFalso.mock.calls.at(-1)![1].headers;
  const corpo = (): Record<string, unknown> => JSON.parse(fetchFalso.mock.calls.at(-1)![1].body);
  const acoes = () => renderHook(() => useDenunciasAccoes(), { wrapper }).result.current;

  it("ANÓNIMA: vai sem Authorization, sem ler a sessão do CRM e sem identidade, e devolve código e PIN", async () => {
    edge(200, { codigo: "DEN-2026-0050", pin: "482913" });
    const r = await acoes().submeter({ ...completo, anonima: true }, { organizationId: "casa-aurora", slug: "casa-aurora" });
    expect(r).toEqual({ ok: true, codigo: "DEN-2026-0050", pin: "482913" });
    expect(cabecalhos()).not.toHaveProperty("Authorization");
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(corpo()).toMatchObject({ action: "criar", slug: "casa-aurora", modo: "anonima" });
    expect(corpo()).not.toHaveProperty("identidade");
  });

  it("anónima feita dentro da app (com pessoa ligada) também vai sem JWT", async () => {
    base({ rpc_denuncias_canal_publico: { ativo: true, slug_publico: "nike-canal" } });
    edge(200, { codigo: "DEN-2026-0051", pin: "111111" });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-secreto" } } });
    const r = await acoes().submeter({ ...completo, anonima: true }, { organizationId: ORG, pessoaId: "p1" });
    expect(r.ok).toBe(true);
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_canal_publico", { p_organization_id: ORG });
    expect(corpo().slug).toBe("nike-canal");
    expect(cabecalhos()).not.toHaveProperty("Authorization");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("IDENTIFICADA dentro da app leva o JWT; sem sessão não envia nada", async () => {
    edge(200, { codigo: "DEN-2026-0052", pin: "222222" });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "jwt-1" } } });
    const r = await acoes().submeter({ ...completo, anonima: false }, { organizationId: ORG, pessoaId: "p1", slug: "nike-canal" });
    expect(r.ok).toBe(true);
    expect(cabecalhos().Authorization).toBe("Bearer jwt-1");
    expect(corpo()).toMatchObject({ modo: "identificada", identidade: { nome: "Inês", email: "i@x.pt" } });
    fetchFalso.mockClear();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await acoes().submeter({ ...completo, anonima: false }, { organizationId: ORG, pessoaId: "p1", slug: "nike-canal" })).toEqual({ ok: false, erro: "sem_permissao" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("identificada na página pública (sem pessoa) nunca envia o JWT", async () => {
    edge(200, { codigo: "DEN-2026-0053", pin: "333333" });
    await acoes().submeter({ ...completo, anonima: false }, { organizationId: "casa-aurora", slug: "casa-aurora" });
    expect(cabecalhos()).not.toHaveProperty("Authorization");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("canal desligado ou sem slug: «canal_inativo» e nada vai para a Edge", async () => {
    base({ rpc_denuncias_canal_publico: { ativo: false, slug_publico: "nike-canal" } });
    expect(await acoes().submeter({ ...completo, anonima: true }, { organizationId: ORG })).toEqual({ ok: false, erro: "canal_inativo" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("a Edge a falhar ou a devolver sem PIN dá erro visível, nunca um código sem PIN", async () => {
    edge(500, { error: "indisponivel" });
    expect(await acoes().submeter({ ...completo, anonima: true }, { organizationId: "s", slug: "s" })).toEqual({ ok: false, erro: "indisponivel" });
    edge(200, { codigo: "DEN-2026-0054" });
    expect(await acoes().submeter({ ...completo, anonima: true }, { organizationId: "s", slug: "s" })).toEqual({ ok: false, erro: "indisponivel" });
    expect(reportados()).toEqual(["denuncias:criar:forma_invalida"]);
  });
});

describe("acompanhar com código e PIN", () => {
  const acoes = () => renderHook(() => useDenunciasAccoes(), { wrapper }).result.current;
  const vistaEdge = { codigo: "DEN-2026-0039", estado: "em_analise", anonima: true, recebida_em: "2026-09-21T10:00:00Z", confirmada_em: null, resultado: null, medidas: null, motivo_arquivo: null, mensagens: [] };

  it("entrar normaliza o código e o PIN, guarda a sessão só em memória e deixa a vista na cache", async () => {
    edge(200, { sessao: "sessao-aleatoria" });
    edge(200, { ok: true, denuncia: vistaEdge });
    const r = await acoes().entrar({ codigo: " den-2026-0039 ", pin: "205 861", slug: "casa-aurora" });
    expect(r).toEqual({ ok: true, id: "acomp:DEN-2026-0039" });
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body)).toEqual({ slug: "casa-aurora", codigo: "DEN-2026-0039", pin: "205861", action: "entrar" });
    expect(fetchFalso.mock.calls[1][1].headers["x-denuncia-sessao"]).toBe("sessao-aleatoria");
    expect(lerSessao("acomp:DEN-2026-0039")?.token).toBe("sessao-aleatoria");
    expect(qc.getQueryData(chavesDenuncias.vista("acomp:DEN-2026-0039"))).toMatchObject({ codigo: "DEN-2026-0039", estado: "em_analise" });
  });

  it("código ou PIN errados, bloqueio e falha são respostas distintas só onde convém: errado e inexistente são a mesma", async () => {
    const a = acoes();
    edge(401, { error: "codigo_ou_pin_invalido" });
    expect(await a.entrar({ codigo: "DEN-1", pin: "1", slug: "s" })).toEqual({ ok: false, erro: "invalido" });
    edge(429, { error: "demasiadas_tentativas" });
    expect(await a.entrar({ codigo: "DEN-1", pin: "1", slug: "s" })).toEqual({ ok: false, erro: "limite" });
    edge(500, { error: "indisponivel" });
    expect(await a.entrar({ codigo: "DEN-1", pin: "1", slug: "s" })).toEqual({ ok: false, erro: "indisponivel" });
    expect(lerSessao("acomp:DEN-1")).toBeUndefined();
  });

  it("código ou PIN vazios não chegam à Edge", async () => {
    expect(await acoes().entrar({ codigo: "  ", pin: "123456", slug: "s" })).toEqual({ ok: false, erro: "invalido" });
    expect(await acoes().entrar({ codigo: "DEN-1", pin: " ", slug: "s" })).toEqual({ ok: false, erro: "invalido" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("se a leitura da vista falha depois de entrar, a sessão é esquecida", async () => {
    edge(200, { sessao: "s1" });
    edge(401, { error: "sessao_invalida" });
    expect(await acoes().entrar({ codigo: "DEN-2026-0039", pin: "205861", slug: "s" })).toEqual({ ok: false, erro: "invalido" });
    expect(lerSessao("acomp:DEN-2026-0039")).toBeUndefined();
  });

  it("a vista vem dentro do envelope da Edge ({ok, denuncia}); sem `denuncia` a leitura falha e reporta a forma", async () => {
    edge(200, { sessao: "s1" });
    edge(200, vistaEdge);
    expect(await acoes().entrar({ codigo: "DEN-2026-0039", pin: "205861", slug: "s" })).toEqual({ ok: false, erro: "indisponivel" });
    expect(lerSessao("acomp:DEN-2026-0039")).toBeUndefined();
    expect(reportados()).toHaveLength(1);
  });

  it("responder por sessão atualiza a vista; com a sessão recusada esquece-a e diz que acabou", async () => {
    const a = acoes();
    edge(200, { sessao: "s1" });
    edge(200, { ok: true, denuncia: vistaEdge });
    await a.entrar({ codigo: "DEN-2026-0039", pin: "205861", slug: "s" });
    edge(200, { ok: true, denuncia: { ...vistaEdge, mensagens: [{ id: "m1", autor: "denunciante", texto: "Foi em Setembro.", criada_em: "2026-10-01T10:00:00Z" }] } });
    expect(await a.responderComoDenunciante(null, "acomp:DEN-2026-0039", "Foi em Setembro.", [])).toEqual({ ok: true });
    expect(JSON.parse(fetchFalso.mock.calls.at(-1)![1].body)).toEqual({ texto: "Foi em Setembro.", action: "responder" });
    expect((qc.getQueryData(chavesDenuncias.vista("acomp:DEN-2026-0039")) as { mensagens: unknown[] }).mensagens).toHaveLength(1);
    edge(401, { error: "sessao_invalida" });
    expect(await a.responderComoDenunciante(null, "acomp:DEN-2026-0039", "mais", [])).toEqual({ ok: false, erro: "sessao_expirada" });
    expect(lerSessao("acomp:DEN-2026-0039")).toBeUndefined();
  });

  it("uma identificada responde pela RPC com a organização e o id", async () => {
    base({ rpc_denuncia_minha_responder: null });
    expect(await acoes().responderComoDenunciante(ORG, "m1", "Obrigada", [])).toEqual({ ok: true });
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_minha_responder", { p_organization_id: ORG, p_denuncia_id: "m1", p_texto: "Obrigada" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sem sessão e sem organização não há onde responder", async () => {
    expect(await acoes().responderComoDenunciante(null, "m1", "x", [])).toEqual({ ok: false, erro: "nao_encontrada" });
  });

  it("sair esquece a sessão e a vista", async () => {
    const a = acoes();
    edge(200, { sessao: "s1" });
    edge(200, { ok: true, denuncia: vistaEdge });
    await a.entrar({ codigo: "DEN-2026-0039", pin: "205861", slug: "s" });
    a.sair("acomp:DEN-2026-0039");
    expect(lerSessao("acomp:DEN-2026-0039")).toBeUndefined();
    expect(qc.getQueryData(chavesDenuncias.vista("acomp:DEN-2026-0039"))).toBeUndefined();
  });

  it("nem a sessão nem o código vão para o armazenamento do navegador", async () => {
    edge(200, { sessao: "sessao-secreta" });
    edge(200, { ok: true, denuncia: vistaEdge });
    const a = acoes();
    await act(async () => { await a.entrar({ codigo: "DEN-2026-0039", pin: "205861", slug: "s" }); });
    const tudo = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(tudo).not.toMatch(/sessao-secreta|205861|DEN-2026-0039/);
  });
});
