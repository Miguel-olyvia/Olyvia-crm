// A lista de ativos (`rpc_ativos_listar`) e as escritas. Cliente tolerante: RPC por aplicar = «indisponivel», sem permissão = «recusado»,
// um defeito = «erro» (e só esse vai para o registo de erros); o ecrã só recebe texto traduzido.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), semOrganizacao: false }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: m.semOrganizacao ? null : { id: "org-1" } }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useAtivos } from "./useAtivos";
import { useAtivoMutacoes } from "./useAtivoMutacoes";
import { useAtivosOpcoes } from "./useAtivosOpcoes";

const cliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente()}>{children}</QueryClientProvider>;

const ATIVO = {
  id: "a1", grupo: "estrutura", tipo: "mobiliario", nome: "Mesa", codigo: null, num_serie: null, cat_equipamento_id: null, data_compra: "2026-01-15",
  valor_compra: 1200, valor_residual: 0, vida_meses: 12, manutencao_ano: 0, centro_custo_id: null, localizacao: "Armazém", notas: null, estado: "ativo",
  desativado_em: null, desativado_motivo: null, desativado_nota: null,
};
const LISTA = {
  servico: [{ ...ATIVO, id: "s1", grupo: "servico", tipo: null, nome: "Berbequim 1", cat_equipamento_id: "c1", vida_meses: null, cat_equipamento: { id: "c1", nome: "Berbequim", vida_anos: 5, vida_horas: null, uso_ano_horas: null } }],
  estrutura: [ATIVO],
  pessoa: {
    ativos: [
      { ...ATIVO, id: "p1", grupo: "pessoa", tipo: "portatil", nome: "Portátil 1", atribuicao: { pessoa_equipamento_id: "pe1", pessoa_nome: "Ana Silva", entrega: "2026-02-01" } },
      { ...ATIVO, id: "p2", grupo: "pessoa", tipo: "telemovel", nome: "Telemóvel 1", atribuicao: null },
    ],
    atribuicoes_sem_ativo: [{ id: "pe9", pessoa_nome: "Rui Costa", tipo: "portatil", descricao: "Portátil velho", valor: 900, entrega: "2025-05-01", estado: "atribuido" }],
    rh_oculto: false,
  },
  centros_custo: [{ id: "cc1", nome: "Obras" }],
  truncado: false,
};

beforeEach(() => {
  m.rpc.mockReset();
  m.captura.mockReset();
  m.semOrganizacao = false;
});

describe("useAtivos: ler", () => {
  it("chama rpc_ativos_listar com a organização e separa os três grupos", async () => {
    m.rpc.mockResolvedValue({ data: LISTA, error: null });
    const { result } = renderHook(() => useAtivos({ incluirDesativados: false }), { wrapper: envolver });
    expect(result.current.estado).toBe("a_carregar");
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_listar", { p_organization_id: "org-1", p_incluir_desativados: false });
    const d = result.current.dados!;
    expect(d.servico.map((a) => a.nome)).toEqual(["Berbequim 1"]);
    expect(d.servico[0].catEquipamento).toMatchObject({ id: "c1", nome: "Berbequim", vidaAnos: 5 });
    expect(d.estrutura.map((a) => a.nome)).toEqual(["Mesa"]);
    expect(d.pessoa.map((a) => a.nome)).toEqual(["Portátil 1", "Telemóvel 1"]);
    expect(d.pessoa[0].atribuicao).toEqual({ pessoaEquipamentoId: "pe1", pessoaNome: "Ana Silva", entrega: "2026-02-01" });
    expect(d.pessoa[1].atribuicao).toBeNull();
    expect(d.atribuicoesSemAtivo).toEqual([{ id: "pe9", pessoaNome: "Rui Costa", tipo: "portatil", descricao: "Portátil velho", valor: 900, entrega: "2025-05-01", estado: "atribuido" }]);
    expect(d.rhOculto).toBe(false);
    expect(d.centrosCusto).toEqual([{ id: "cc1", nome: "Obras" }]);
  });

  it("a chave inclui o interruptor dos desativados: mudá-lo volta a pedir a lista", async () => {
    m.rpc.mockResolvedValue({ data: LISTA, error: null });
    const { result, rerender } = renderHook(({ inc }: { inc: boolean }) => useAtivos({ incluirDesativados: inc }), { wrapper: envolver, initialProps: { inc: false } });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    rerender({ inc: true });
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_listar", { p_organization_id: "org-1", p_incluir_desativados: true }));
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("rh_oculto: sem atribuições nem nomes (a base manda null) e o ecrã sabe porquê", async () => {
    m.rpc.mockResolvedValue({ data: { ...LISTA, pessoa: { ativos: [{ ...LISTA.pessoa.ativos[0], atribuicao: null }], atribuicoes_sem_ativo: null, rh_oculto: true } }, error: null });
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.dados!.rhOculto).toBe(true);
    expect(result.current.dados!.atribuicoesSemAtivo).toBeNull();
    expect(result.current.dados!.pessoa[0].atribuicao).toBeNull();
  });

  it("uma resposta sem chaves vira listas vazias (nunca rebenta)", async () => {
    m.rpc.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("ok"));
    expect(result.current.dados).toMatchObject({ servico: [], estrutura: [], pessoa: [], rhOculto: false, truncado: false });
  });

  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.rpc_ativos_listar" }],
    [{ code: "42883", message: "function does not exist" }],
  ])("RPC por aplicar (%j): «indisponivel», sem ir para o registo de erros", async (erro) => {
    m.rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("indisponivel"));
    expect(result.current.dados).toBeNull();
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("42501: «recusado», com a mensagem traduzida e sem registo de erro", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "insufficient_privilege" } });
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("recusado"));
    expect(result.current.mensagem).toBe("T:ativos.erro.verSemPermissao");
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito é «erro», com texto traduzido, e vai para o registo", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom interno" } });
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.mensagem).toBe("T:ativos.erroLer");
    expect(result.current.mensagem).not.toContain("boom");
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("desligado (enabled false) ou sem organização não chama a base", () => {
    renderHook(() => useAtivos({ enabled: false }), { wrapper: envolver });
    m.semOrganizacao = true;
    const { result } = renderHook(() => useAtivos({}), { wrapper: envolver });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(result.current.semOrganizacao).toBe(true);
  });
});

describe("useAtivoMutacoes", () => {
  const CAMPOS = { p_nome: "Mesa", p_tipo: "mobiliario" };

  it("criar: rpc_ativo_criar com a organização e o grupo; devolve o id", async () => {
    m.rpc.mockResolvedValue({ data: { id: "novo" }, error: null });
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    let r: unknown;
    await act(async () => { r = await result.current.criar("estrutura", CAMPOS); });
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativo_criar", { p_organization_id: "org-1", p_grupo: "estrutura", ...CAMPOS });
    expect(r).toEqual({ ok: true, id: "novo" });
  });

  it("alterar: rpc_ativo_alterar com id e organização, sem o grupo (é imutável)", async () => {
    m.rpc.mockResolvedValue({ data: { id: "a1" }, error: null });
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    await act(async () => { await result.current.alterar("a1", CAMPOS); });
    const [fn, args] = m.rpc.mock.calls[0];
    expect(fn).toBe("rpc_ativo_alterar");
    expect(args).toEqual({ p_id: "a1", p_organization_id: "org-1", ...CAMPOS });
    expect(args).not.toHaveProperty("p_grupo");
  });

  it("desativar, reativar, ligar e desligar chamam as RPCs do desenho com os nomes exatos", async () => {
    m.rpc.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    await act(async () => {
      await result.current.desativar("a1", { data: "2026-05-01", motivo: "vendido", nota: null });
      await result.current.reativar("a1");
      await result.current.ligarPessoa("a1", "pe1");
      await result.current.desligarPessoa("pe1");
    });
    expect(m.rpc.mock.calls).toEqual([
      ["rpc_ativo_desativar", { p_id: "a1", p_organization_id: "org-1", p_data: "2026-05-01", p_motivo: "vendido", p_nota: null }],
      ["rpc_ativo_reativar", { p_id: "a1", p_organization_id: "org-1" }],
      ["rpc_ativo_ligar_pessoa", { p_ativo_id: "a1", p_pessoa_equipamento_id: "pe1", p_organization_id: "org-1" }],
      ["rpc_ativo_desligar_pessoa", { p_pessoa_equipamento_id: "pe1", p_organization_id: "org-1" }],
    ]);
  });

  it.each([
    ["ATV05", "T:ativos.erro.ATV05"], ["ATV09", "T:ativos.erro.ATV09"], ["ATV12", "T:ativos.erro.ATV12"], ["ATV17", "T:ativos.erro.ATV17"], ["ATV18", "T:ativos.erro.ATV18"],
  ])("a regra %s volta com o código e o texto traduzido (nunca o código em bruto)", async (codigo, texto) => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: codigo } });
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    let r: unknown;
    await act(async () => { r = await result.current.criar("servico", CAMPOS); });
    expect(r).toEqual({ ok: false, codigo, mensagem: texto });
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("42501 é «sem permissão»; PGRST202 é «indisponível»; o resto é genérico e vai para o registo", async () => {
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    const chamar = async (erro: unknown) => {
      m.rpc.mockResolvedValue({ data: null, error: erro });
      let r: unknown;
      await act(async () => { r = await result.current.reativar("a1"); });
      return r;
    };
    expect(await chamar({ code: "42501", message: "x" })).toMatchObject({ ok: false, mensagem: "T:ativos.erro.semPermissao" });
    expect(await chamar({ code: "PGRST202", message: "x" })).toMatchObject({ ok: false, mensagem: "T:ativos.erro.indisponivel" });
    expect(m.captura).not.toHaveBeenCalled();
    expect(await chamar({ code: "XX000", message: "boom" })).toMatchObject({ ok: false, mensagem: "T:ativos.erro.generico" });
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("uma exceção na chamada (rede) também é um resultado, não rebenta", async () => {
    m.rpc.mockRejectedValue(new Error("rede"));
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    let r: unknown;
    await act(async () => { r = await result.current.reativar("a1"); });
    expect(r).toMatchObject({ ok: false, mensagem: "T:ativos.erro.generico" });
  });

  it("sem organização não chama a base", async () => {
    m.semOrganizacao = true;
    const { result } = renderHook(() => useAtivoMutacoes(), { wrapper: envolver });
    let r: unknown;
    await act(async () => { r = await result.current.reativar("a1"); });
    expect(r).toEqual({ ok: false, codigo: null, mensagem: "T:ativos.erro.semOrganizacao" });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("depois de escrever, a lista refaz-se (invalida «ativos»)", async () => {
    m.rpc.mockImplementation(async (fn: string) => (fn === "rpc_ativos_listar" ? { data: LISTA, error: null } : { data: { id: "x" }, error: null }));
    const qc = cliente();
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const lista = renderHook(() => useAtivos({}), { wrapper: w });
    await waitFor(() => expect(lista.result.current.estado).toBe("ok"));
    const mut = renderHook(() => useAtivoMutacoes(), { wrapper: w });
    await act(async () => { await mut.result.current.criar("estrutura", CAMPOS); });
    await waitFor(() => expect(m.rpc.mock.calls.filter((c) => c[0] === "rpc_ativos_listar")).toHaveLength(2));
  });
});

describe("useAtivosOpcoes (os seletores)", () => {
  it("chama rpc_ativos_opcoes só quando está ligado e devolve equipamentos e centros de custo", async () => {
    m.rpc.mockResolvedValue({ data: { equipamentos: [{ id: "c1", nome: "Berbequim", vida_anos: 5, vida_horas: null }], centros_custo: [{ id: "cc1", nome: "Obras" }] }, error: null });
    renderHook(() => useAtivosOpcoes(false), { wrapper: envolver });
    expect(m.rpc).not.toHaveBeenCalled();
    const { result } = renderHook(() => useAtivosOpcoes(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.opcoes).not.toBeNull());
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_opcoes", { p_organization_id: "org-1" });
    expect(result.current.opcoes).toEqual({
      equipamentos: [{ id: "c1", nome: "Berbequim", vidaAnos: 5, vidaHoras: null }],
      centrosCusto: [{ id: "cc1", nome: "Obras" }],
    });
  });

  it("falha: sem opções e com mensagem traduzida", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const { result } = renderHook(() => useAtivosOpcoes(true), { wrapper: envolver });
    await waitFor(() => expect(result.current.erro).toBe("T:ativos.opcoes.erro"));
    expect(result.current.opcoes).toBeNull();
  });
});
