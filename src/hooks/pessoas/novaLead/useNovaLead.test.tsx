// A orquestração da «Nova lead»: verificar duplicados, criar (pessoa nova), bloquear com o diálogo, «Atualizar dados» com confirmação,
// invalidação só depois de um sucesso, um clique duplo vale uma criação. O Supabase é simulado; nada vai à rede.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { PESSOA_ID } from "../fichaFabrica";
import { criarCliente, montarHook } from "../fichaTestUtil";
import { CHAVES_ERRO_NEG } from "../errosNeg";
import { camposBase } from "./fluxoNovaLead";
import { entidadesDaNovaLead, supabaseFalso } from "./supabaseFalso";
import { useNovaLead, type EntradaNovaLead } from "./useNovaLead";
import type { PessoaBloqueio } from "./tiposNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const ORG = "org-1";
const t = (k: string) => k;
const ENTRADA: EntradaNovaLead = {
  base: camposBase(t), campanha: [], origemId: null, origemNome: "manual", campanhaId: null,
  valores: { first_name: "Ana", last_name: "Lopes", email: "ana@x.pt", phone: "+351912345678" },
};
const linha = (sobre: Record<string, unknown> = {}) => ({
  pessoa: 1, campo: "email", ambito: "organizacao", entity_id: PESSOA_ID, nome: "Ana Lopes", visivel: true, organizacao_id: ORG, organizacao_nome: null, ...sobre,
});

/** A rpc simulada: por omissão sem duplicados e a criação a correr bem. */
function rpc(sobre: Record<string, unknown> = {}) {
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome in sobre) return sobre[nome];
    if (nome === "neg_procurar_duplicados") return { data: [], error: null };
    return { data: null, error: null };
  });
}
const nomesRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);

const aoConcluir = vi.fn();
function montar() {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", ORG, "ent-novo"], { x: 1 });
  client.setQueryData(["neg-resumo-pessoas", ORG, { papel: null }], { x: 2 });
  const r = montarHook(() => useNovaLead(aoConcluir), undefined, { client });
  const invalidadas = () => [client.getQueryState(["neg-ficha-pessoa", ORG, "ent-novo"])?.isInvalidated, client.getQueryState(["neg-resumo-pessoas", ORG, { papel: null }])?.isInvalidated];
  return { ...r, client, invalidadas };
}

const bloqueioP = (sobre: Partial<PessoaBloqueio> = {}): PessoaBloqueio => ({
  entityId: PESSOA_ID, nome: "Ana Lopes", papel: "lead", jaECliente: false, estado: "new", encerrada: false, motivoEncerramento: null, atribuidoA: null,
  criadaEm: null, campos: ["email"], ladoALado: [], podeAbrir: true,
  atualizar: { leadId: PESSOA_ID, reabrirLead: false, reabrirAbordagem: false, email: null, telefone: { antigo: "9", novo: "+351912345678" } }, ...sobre,
});

beforeEach(() => {
  supabaseFalso.reiniciar();
  toastMock.mockReset();
  aoConcluir.mockReset();
  supabaseFalso.estado.tabelas = {
    anew_entities: entidadesDaNovaLead(PESSOA_ID),
    anew_users: [], anew_hierarchy: [],
  };
  rpc();
});

describe("useNovaLead: criar", () => {
  it("sem duplicados cria a pessoa (a lead é a entidade), invalida lista e ficha e entrega o id da pessoa nova", async () => {
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toHaveLength(1);
    expect(aoConcluir).toHaveBeenCalledWith({ entityId: "ent-novo", mensagem: "Lead criada: Ana Lopes." });
    expect(invalidadas()).toEqual([true, true]);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Lead criada com sucesso" }));
    expect(result.current.aCriar).toBe(false);
    expect(result.current.duplicados).toBeNull();
  });

  it("a procura leva a organização da página e os valores escritos (o telefone com indicativo, o email como escrito)", async () => {
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(supabaseFalso.rpc).toHaveBeenNthCalledWith(1, "neg_procurar_duplicados", {
      p_organization_id: ORG, p_email: "ana@x.pt", p_telefone: "+351912345678", p_nif_hash: null, p_pais: "PT",
    });
    expect(supabaseFalso.chamadasA("anew_entities", "insert")[0].dados).toMatchObject({ organization_id: ORG, type: "person", email: "ana@x.pt" });
  });

  it("campos obrigatórios em falta: avisa e não toca na base", async () => {
    const { result } = montar();
    await act(async () => { await result.current.submeter({ ...ENTRADA, valores: { email: "ana@x.pt" } }); });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Faltam campos obrigatórios", variant: "destructive" }));
  });

  it("os erros ficam por campo (para o formulário marcar cada um) e limpam-se quando a lead passa a ser válida", async () => {
    const { result } = montar();
    await act(async () => { await result.current.submeter({ ...ENTRADA, valores: { email: "ana@x.pt" } }); });
    expect(Object.keys(result.current.errosCampo).sort()).toEqual(["first_name", "last_name"]);
    expect(result.current.errosCampo.first_name).toMatch(/obrigat/);
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.errosCampo).toEqual({});
  });

  it("um clique duplo vale uma só criação", async () => {
    const { result } = montar();
    await act(async () => { await Promise.all([result.current.submeter(ENTRADA), result.current.submeter(ENTRADA)]); });
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toHaveLength(1);
    expect(nomesRpc().filter((n) => n === "neg_procurar_duplicados")).toHaveLength(1);
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("só noutra empresa do grupo: cria uma pessoa própria e avisa, sem diálogo", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha({ pessoa: null, ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o2", organizacao_nome: "Loja Norte" })], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.duplicados).toBeNull();
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Loja Norte") }));
    expect(aoConcluir).toHaveBeenCalled();
  });
});

describe("useNovaLead: bloqueios e falhas (nada se cria, nada se invalida)", () => {
  it("email igual ao de uma pessoa: abre o diálogo e não cria nada", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.duplicados?.pessoas.map((p) => p.entityId)).toEqual([PESSOA_ID]);
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(aoConcluir).not.toHaveBeenCalled();
    expect(invalidadas()).toEqual([false, false]);
  });

  it("caso 16: a verificação falha: não cria, mostra «tentar de novo» e nada se invalida", async () => {
    rpc({ neg_procurar_duplicados: { data: null, error: { code: "57014", message: "timeout" } } });
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.erro).toEqual({ tipo: "verificar", chave: "pessoasPagina.real.newLead.error.checkFailed" });
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    expect(invalidadas()).toEqual([false, false]);
    // «Tentar de novo» repete a verificação, e desta vez cria
    rpc();
    await act(async () => { await result.current.tentarDeNovo(); });
    expect(result.current.erro).toBeNull();
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("NG020 (demasiadas verificações) mostra a mensagem do código e não cria", async () => {
    rpc({ neg_procurar_duplicados: { data: null, error: { code: "NG020", message: "x" } } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.erro).toEqual({ tipo: "verificar", chave: CHAVES_ERRO_NEG.NG020 });
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
  });

  it("o insert da pessoa falha: toast de erro, nada para desfazer e nada se invalida", async () => {
    supabaseFalso.estado.erros["anew_entities.insert"] = { message: "boom" };
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao criar a lead", description: "mensagem amigável", variant: "destructive" }));
    expect(supabaseFalso.chamadasA("anew_entities", "delete")).toEqual([]);
    expect(aoConcluir).not.toHaveBeenCalled();
    expect(invalidadas()).toEqual([false, false]);
    expect(result.current.aCriar).toBe(false);
  });

  it("a atribuição do comercial falha: toast de erro, pessoa desfeita e nada se invalida", async () => {
    rpc({ neg_atribuir_pessoa: { data: null, error: { message: "boom" } } });
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.submeter({ ...ENTRADA, valores: { ...ENTRADA.valores, _assigned_to: "u1" } }); });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao criar a lead", description: "mensagem amigável", variant: "destructive" }));
    expect(supabaseFalso.chamadasA("anew_entities", "delete")).toHaveLength(1);
    expect(aoConcluir).not.toHaveBeenCalled();
    expect(invalidadas()).toEqual([false, false]);
    expect(result.current.aCriar).toBe(false);
  });

  it("se a limpeza também falha, avisa que ficou por limpar", async () => {
    rpc({ neg_atribuir_pessoa: { data: null, error: { message: "boom" } } });
    supabaseFalso.estado.erros["anew_entities.delete"] = { message: "x" };
    const { result } = montar();
    await act(async () => { await result.current.submeter({ ...ENTRADA, valores: { ...ENTRADA.valores, _assigned_to: "u1" } }); });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao criar a lead: limpeza incompleta" }));
  });

  it("a morada que não sincroniza só avisa: a lead fica criada", async () => {
    rpc({ sync_entity_primary_address: { data: null, error: { message: "x" } } });
    const { result } = montar();
    await act(async () => {
      await result.current.submeter({ ...ENTRADA, valores: { ...ENTRADA.valores, po_morada: "Rua das Flores 10", po_codigo_postal: "1000-001" } });
    });
    expect(aoConcluir).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Lead criada, mas a morada não foi sincronizada" }));
  });
});

describe("useNovaLead: o diálogo de duplicados", () => {
  it("«Abrir existente» entrega o id da pessoa e não escreve nada", async () => {
    const { result } = montar();
    act(() => result.current.abrirExistente(bloqueioP()));
    expect(aoConcluir).toHaveBeenCalledWith({ entityId: PESSOA_ID, mensagem: "" });
    expect(supabaseFalso.rpc).not.toHaveBeenCalled();
  });

  it("«Cancelar» fecha o diálogo sem escrever", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    expect(result.current.duplicados).not.toBeNull();
    act(() => result.current.cancelarDuplicados());
    expect(result.current.duplicados).toBeNull();
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
  });

  it("«Atualizar dados» pede primeiro a confirmação e só escreve depois dela", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    const pessoa = result.current.duplicados!.pessoas[0];
    act(() => result.current.atualizar(pessoa));
    expect(result.current.confirmar?.entityId).toBe(PESSOA_ID);
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    act(() => result.current.voltarDaConfirmacao());
    expect(result.current.confirmar).toBeNull();
    expect(result.current.duplicados).not.toBeNull();
  });

  it("confirmar: substitui o contacto na entidade, junta ao extra, invalida e abre a ficha da pessoa existente", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result, client } = montar();
    client.setQueryData(["neg-ficha-pessoa", ORG, PESSOA_ID], { x: 1 });
    await act(async () => { await result.current.submeter(ENTRADA); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    await act(async () => { await result.current.confirmarAtualizar(); });
    expect(supabaseFalso.chamadasA("anew_entities", "update").length).toBeGreaterThanOrEqual(1);
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toEqual([]);
    expect(aoConcluir).toHaveBeenCalledWith({ entityId: PESSOA_ID, mensagem: "Dados de Ana Lopes atualizados." });
    expect(client.getQueryState(["neg-ficha-pessoa", ORG, PESSOA_ID])?.isInvalidated).toBe(true);
  });

  it("caso 14: ao confirmar, aparece outra pessoa dona do contacto: volta ao diálogo, sem gravar", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    supabaseFalso.estado.tabelas.anew_entities = entidadesDaNovaLead("p-outra");
    rpc({ neg_procurar_duplicados: { data: [linha({ entity_id: "p-outra", nome: "Bea", campo: "telefone" })], error: null } });
    await act(async () => { await result.current.confirmarAtualizar(); });
    expect(result.current.confirmar).toBeNull();
    expect(result.current.duplicados?.pessoas.map((p) => p.entityId)).toEqual(["p-outra"]);
    expect(supabaseFalso.chamadasA("anew_entities", "update")).toEqual([]);
    expect(aoConcluir).not.toHaveBeenCalled();
  });

  it("caso 15: a revalidação falha ao atualizar: nada se grava e fica «tentar de novo» (na confirmação)", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    rpc({ neg_procurar_duplicados: { data: null, error: { code: "57014", message: "t" } } });
    await act(async () => { await result.current.confirmarAtualizar(); });
    expect(result.current.erro).toEqual({ tipo: "atualizar", chave: "pessoasPagina.real.newLead.dup.checkFailed" });
    expect(result.current.confirmar).not.toBeNull();
    expect(supabaseFalso.chamadasA("anew_entities", "update")).toEqual([]);
  });

  it("falha a meio: o aviso parcial diz o que ficou feito, a lista refaz-se e o diálogo fica aberto", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result, client } = montar();
    client.setQueryData(["neg-ficha-pessoa", ORG, PESSOA_ID], { x: 1 });
    await act(async () => { await result.current.submeter(ENTRADA); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    let updates = 0;
    const base = entidadesDaNovaLead(PESSOA_ID);
    supabaseFalso.estado.tabelas.anew_entities = (c) => (c.operacao === "update" && ++updates === 2 ? { data: null, error: { message: "boom" } } : base(c));
    await act(async () => { await result.current.confirmarAtualizar(); });
    expect(result.current.parcial).toMatchObject({ feito: ["contacto"], falhou: "lead" });
    expect(aoConcluir).not.toHaveBeenCalled();
    expect(client.getQueryState(["neg-ficha-pessoa", ORG, PESSOA_ID])?.isInvalidated).toBe(true);
  });

  it("reiniciar limpa tudo (ao fechar o diálogo)", async () => {
    rpc({ neg_procurar_duplicados: { data: [linha()], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.submeter(ENTRADA); });
    act(() => result.current.reiniciar());
    expect(result.current).toMatchObject({ duplicados: null, confirmar: null, erro: null, parcial: null, aCriar: false });
  });
});
