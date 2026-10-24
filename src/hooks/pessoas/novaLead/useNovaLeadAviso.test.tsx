// Depois de criar: o sucesso, o aviso do grupo e o aviso da morada vão JUNTOS num só toast (o `use-toast` real guarda um de cada vez e
// o seguinte apaga o anterior), a morada falhada também se anuncia na região viva, e o motivo em bruto nunca chega ao ecrã.
// Aqui o `useToast` é o verdadeiro; o resto (Supabase) é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { useToast } from "@/hooks/use-toast";
import { criarCliente, montarHook } from "../fichaTestUtil";
import { camposBase } from "./fluxoNovaLead";
import { entidadesDaNovaLead, supabaseFalso } from "./supabaseFalso";
import { useNovaLead, type EntradaNovaLead } from "./useNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "mensagem amigável" }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "user-1", authUserId: "auth-1", teamMemberIds: [] }),
}));

const ORG = "org-1";
const t = (k: string) => k;
const ENTRADA: EntradaNovaLead = {
  base: camposBase(t), campanha: [], origemId: null, origemNome: "manual", campanhaId: null,
  valores: { first_name: "Ana", last_name: "Lopes", email: "ana@x.pt", phone: "+351912345678", po_morada: "Rua das Flores 10", po_codigo_postal: "1000-001" },
};
const MOTIVO_EM_BRUTO = "duplicate key value violates unique constraint anew_addresses_pkey";

function rpc(sobre: Record<string, unknown> = {}) {
  supabaseFalso.rpc.mockImplementation(async (nome: string) => {
    if (nome in sobre) return sobre[nome];
    if (nome === "neg_procurar_duplicados") return { data: [], error: null };
    return { data: null, error: null };
  });
}
const aoConcluir = vi.fn();
const montar = () => montarHook(() => ({ nova: useNovaLead(aoConcluir), toasts: useToast().toasts }), undefined, { client: criarCliente() });
const grupo = { pessoa: null, campo: "email", ambito: "grupo", entity_id: null, nome: null, visivel: null, organizacao_id: "o2", organizacao_nome: "Loja Norte" };

beforeEach(() => {
  supabaseFalso.reiniciar();
  aoConcluir.mockReset();
  supabaseFalso.estado.tabelas = { anew_entities: entidadesDaNovaLead("p1"), anew_hierarchy: [], anew_users: [] };
  rpc();
});

describe("useNovaLead: um só toast com tudo o que o utilizador precisa de ver", () => {
  it("morada falhada + grupo: o toast que fica no ecrã diz a falha da morada e o aviso do grupo", async () => {
    rpc({
      sync_entity_primary_address: { data: null, error: { message: MOTIVO_EM_BRUTO } },
      neg_procurar_duplicados: { data: [grupo], error: null },
    });
    const { result } = montar();
    await act(async () => { await result.current.nova.submeter(ENTRADA); });
    expect(aoConcluir).toHaveBeenCalledTimes(1);
    const visiveis = result.current.toasts.filter((x) => x.open !== false);
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].title).toBe("Lead criada, mas a morada não foi sincronizada");
    expect(String(visiveis[0].description)).toContain("Loja Norte");
  });

  it("morada falhada: o aviso também vai para a mensagem anunciada na região viva", async () => {
    rpc({ sync_entity_primary_address: { data: null, error: { message: MOTIVO_EM_BRUTO } } });
    const { result } = montar();
    await act(async () => { await result.current.nova.submeter(ENTRADA); });
    const { mensagem } = aoConcluir.mock.calls[0][0] as { mensagem: string };
    expect(mensagem).toContain("Lead criada: Ana Lopes.");
    expect(mensagem).toContain("a morada não foi sincronizada");
  });

  it("o motivo em bruto da falha da morada nunca aparece no toast nem no anúncio", async () => {
    rpc({ sync_entity_primary_address: { data: null, error: { message: MOTIVO_EM_BRUTO } } });
    const { result } = montar();
    await act(async () => { await result.current.nova.submeter(ENTRADA); });
    const texto = JSON.stringify(result.current.toasts.map((x) => [x.title, x.description])) + JSON.stringify(aoConcluir.mock.calls);
    expect(texto).not.toContain("duplicate key");
    expect(texto).not.toContain("anew_addresses_pkey");
  });

  it("só sucesso (sem grupo nem falha de morada): toast simples e anúncio simples", async () => {
    const { result } = montar();
    await act(async () => { await result.current.nova.submeter({ ...ENTRADA, valores: { first_name: "Ana", last_name: "Lopes", email: "ana@x.pt", phone: "+351912345678" } }); });
    const visiveis = result.current.toasts.filter((x) => x.open !== false);
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].title).toBe("Lead criada com sucesso");
    expect(visiveis[0].description).toBeUndefined();
    expect(aoConcluir).toHaveBeenCalledWith({ entityId: "ent-novo", mensagem: "Lead criada: Ana Lopes." });
  });

  it("só grupo: o sucesso leva o aviso do grupo na descrição", async () => {
    rpc({ neg_procurar_duplicados: { data: [grupo], error: null } });
    const { result } = montar();
    await act(async () => { await result.current.nova.submeter({ ...ENTRADA, valores: { first_name: "Ana", last_name: "Lopes", email: "ana@x.pt", phone: "+351912345678" } }); });
    const visiveis = result.current.toasts.filter((x) => x.open !== false);
    expect(visiveis).toHaveLength(1);
    expect(visiveis[0].title).toBe("Lead criada com sucesso");
    expect(String(visiveis[0].description)).toContain("Loja Norte");
  });
});
