// A «Nova lead» com um pedido em curso: um segundo pedido (outro submeter com valores diferentes, ou «Confirmar» duas vezes) é ignorado, e
// o que se grava é o que estava no formulário ao clicar. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { PESSOA_ID } from "../fichaFabrica";
import { criarCliente, montarHook } from "../fichaTestUtil";
import { camposBase } from "./fluxoNovaLead";
import { entidadesDaNovaLead, supabaseFalso } from "./supabaseFalso";
import { useNovaLead, type EntradaNovaLead } from "./useNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const ORG = "org-1";
const t = (k: string) => k;
const entrada = (nome: string): EntradaNovaLead => ({
  base: camposBase(t), campanha: [], origemId: null, origemNome: "manual", campanhaId: null,
  valores: { first_name: nome, last_name: "Lopes", email: "ana@x.pt", phone: "+351912345678" },
});
const linha = { pessoa: 1, campo: "email", ambito: "organizacao", entity_id: PESSOA_ID, nome: "Ana Lopes", visivel: true, organizacao_id: ORG, organizacao_nome: null };
const nomesRpc = () => supabaseFalso.rpc.mock.calls.map((c) => c[0] as string);
const aoConcluir = vi.fn();

/** A verificação de duplicados fica à espera até `libertar()`; o resto responde de imediato. */
function rpcComEspera(duplicados: unknown[]) {
  let libertar: () => void = () => undefined;
  const espera = new Promise<void>((r) => { libertar = r; });
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome === "neg_procurar_duplicados") { await espera; return { data: duplicados, error: null }; }
    return { data: null, error: null };
  });
  return libertar;
}

beforeEach(() => {
  supabaseFalso.reiniciar();
  aoConcluir.mockReset();
  supabaseFalso.estado.tabelas = {
    anew_entities: entidadesDaNovaLead(PESSOA_ID),
    anew_users: [], anew_hierarchy: [],
  };
});

describe("useNovaLead: pedidos em curso", () => {
  it("com a verificação ainda a correr, um segundo submeter com valores diferentes é ignorado: grava o que estava ao clicar", async () => {
    const libertar = rpcComEspera([]);
    const { result } = montarHook(() => useNovaLead(aoConcluir), undefined, { client: criarCliente() });
    let primeiro: Promise<void> = Promise.resolve();
    act(() => { primeiro = result.current.submeter(entrada("Ana")); });
    await act(async () => { await result.current.submeter(entrada("Outra")); });
    expect(nomesRpc()).toEqual(["neg_procurar_duplicados"]);
    await act(async () => { libertar(); await primeiro; });
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toHaveLength(1);
    expect(aoConcluir).toHaveBeenCalledTimes(1);
    expect(aoConcluir.mock.calls[0][0].mensagem).toContain("Ana Lopes");
    expect(aoConcluir.mock.calls[0][0].mensagem).not.toContain("Outra");
  });

  it("«Confirmar e atualizar» duas vezes seguidas escreve uma só vez", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (nome === "neg_procurar_duplicados" ? { data: [linha], error: null } : { data: null, error: null }));
    const { result } = montarHook(() => useNovaLead(aoConcluir), undefined, { client: criarCliente() });
    await act(async () => { await result.current.submeter(entrada("Ana")); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    const libertar = rpcComEspera([linha]);
    let a: Promise<void> = Promise.resolve();
    let b: Promise<void> = Promise.resolve();
    act(() => { a = result.current.confirmarAtualizar(); b = result.current.confirmarAtualizar(); });
    await act(async () => { libertar(); await Promise.all([a, b]); });
    expect(supabaseFalso.chamadasA("anew_entities", "update").filter((c) => "phone" in (c.dados as object) || "email" in (c.dados as object))).toHaveLength(1);
    expect(aoConcluir).toHaveBeenCalledTimes(1);
  });

  it("submeter enquanto uma atualização está em curso é ignorado", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (nome === "neg_procurar_duplicados" ? { data: [linha], error: null } : { data: null, error: null }));
    const { result } = montarHook(() => useNovaLead(aoConcluir), undefined, { client: criarCliente() });
    await act(async () => { await result.current.submeter(entrada("Ana")); });
    act(() => result.current.atualizar(result.current.duplicados!.pessoas[0]));
    const libertar = rpcComEspera([linha]);
    let atualizacao: Promise<void> = Promise.resolve();
    act(() => { atualizacao = result.current.confirmarAtualizar(); });
    await act(async () => { await result.current.submeter(entrada("Outra")); });
    await act(async () => { libertar(); await atualizacao; });
    expect(supabaseFalso.chamadasA("anew_entities", "insert")).toEqual([]);
  });
});
