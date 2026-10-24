// «Tentar de novo» depois de um erro ao verificar: repete com o que o formulário tem AGORA (os campos voltam a ser editáveis depois do erro),
// e só sem entrada nova recorre à última enviada. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { criarCliente, montarHook } from "../fichaTestUtil";
import { camposBase } from "./fluxoNovaLead";
import { supabaseFalso } from "./supabaseFalso";
import { useNovaLead, type EntradaNovaLead } from "./useNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const t = (k: string) => k;
const entrada = (email: string): EntradaNovaLead => ({
  base: camposBase(t), campanha: [], origemId: null, origemNome: "manual", campanhaId: null,
  valores: { first_name: "Ana", last_name: "Lopes", email, phone: "+351912345678" },
});
const aoConcluir = vi.fn();
const procuras = () => supabaseFalso.rpc.mock.calls.filter((c) => c[0] === "neg_procurar_duplicados");

beforeEach(() => {
  supabaseFalso.reiniciar();
  aoConcluir.mockReset();
  supabaseFalso.estado.tabelas = { anew_users: [], anew_hierarchy: [], anew_organizations: [] };
});

describe("useNovaLead: tentar de novo com a entrada atual", () => {
  it("depois de um erro ao verificar, a repetição leva o email que está agora no formulário, não o antigo", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (
      nome === "neg_procurar_duplicados" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: null, error: null }
    ));
    const { result } = montarHook(() => useNovaLead(aoConcluir), undefined, { client: criarCliente() });
    await act(async () => { await result.current.submeter(entrada("antigo@x.pt")); });
    expect(result.current.erro?.tipo).toBe("verificar");
    await act(async () => { await result.current.tentarDeNovo(entrada("novo@x.pt")); });
    expect(procuras()).toHaveLength(2);
    expect(JSON.stringify(procuras()[1])).toContain("novo@x.pt");
    expect(JSON.stringify(procuras()[1])).not.toContain("antigo@x.pt");
  });

  it("sem entrada nova, repete a última enviada (como antes)", async () => {
    supabaseFalso.rpc.mockImplementation(async (nome: string) => (
      nome === "neg_procurar_duplicados" ? { data: null, error: { code: "57014", message: "timeout" } } : { data: null, error: null }
    ));
    const { result } = montarHook(() => useNovaLead(aoConcluir), undefined, { client: criarCliente() });
    await act(async () => { await result.current.submeter(entrada("antigo@x.pt")); });
    await act(async () => { await result.current.tentarDeNovo(); });
    expect(procuras()).toHaveLength(2);
    expect(JSON.stringify(procuras()[1])).toContain("antigo@x.pt");
  });
});
