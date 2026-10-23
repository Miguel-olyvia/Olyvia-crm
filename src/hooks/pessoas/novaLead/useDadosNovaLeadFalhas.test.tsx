// useDadosNovaLead diz o estado dos campos da campanha (a carregar, em erro) e se alguma leitura de apoio falhou, e deixa repetir.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { montarHook, criarCliente } from "../fichaTestUtil";
import { supabaseFalso } from "./supabaseFalso";
import { useDadosNovaLead } from "./useDadosNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => "ORG", anewUserId: "eu", authUserId: "auth-eu", teamMemberIds: [] }),
}));

const ORG = "org-nike";
type Props = { campanha: string | null; aberto: boolean };
const montar = (props: Props) => montarHook((p: Props) => useDadosNovaLead(ORG, p.campanha, p.aberto), props, { client: criarCliente() });

beforeEach(() => {
  supabaseFalso.reiniciar();
  supabaseFalso.estado.tabelas = {
    campaigns: [{ id: "c1", name: "Verão", status: "active", form_id: null, forms: null }],
    lead_sources: [], forms: [], anew_hierarchy: [],
    anew_organizations: [{ id: ORG, name: "Nike", type: "empresa" }],
    anew_memberships: [], anew_roles: [], anew_users: [], anew_entity_addresses: [],
    lead_field_definitions: [{ id: "d1", field_key: "k", field_label: "K", field_type: "text", is_required: true }],
  };
});

describe("useDadosNovaLead: campos da campanha", () => {
  it("sem campanha: nem a carregar nem em erro", async () => {
    const { result } = montar({ campanha: null, aberto: true });
    await waitFor(() => expect(result.current.erroApoio).toBe(false));
    expect(result.current.camposACarregar).toBe(false);
    expect(result.current.camposErro).toBe(false);
  });

  it("com campanha: a carregar, e depois com os campos", async () => {
    const { result } = montar({ campanha: "c1", aberto: true });
    expect(result.current.camposACarregar).toBe(true);
    await waitFor(() => expect(result.current.camposCampanha.map((c) => c.field_key)).toEqual(["k"]));
    expect(result.current.camposACarregar).toBe(false);
    expect(result.current.camposErro).toBe(false);
  });

  it("falha a ler: erro (e não «sem campos» a sério), sem campos e sem carregar; repetir recupera", async () => {
    supabaseFalso.estado.erros["lead_field_definitions.select"] = { message: "boom" };
    const { result } = montar({ campanha: "c1", aberto: true });
    await waitFor(() => expect(result.current.camposErro).toBe(true));
    expect(result.current.camposACarregar).toBe(false);
    expect(result.current.camposCampanha).toEqual([]);
    delete supabaseFalso.estado.erros["lead_field_definitions.select"];
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.camposCampanha).toHaveLength(1));
    expect(result.current.camposErro).toBe(false);
  });

  it("trocar para «sem campanha» limpa o erro dos campos", async () => {
    supabaseFalso.estado.erros["lead_field_definitions.select"] = { message: "boom" };
    const { result, rerender } = montar({ campanha: "c1", aberto: true });
    await waitFor(() => expect(result.current.camposErro).toBe(true));
    rerender({ campanha: null, aberto: true });
    expect(result.current.camposErro).toBe(false);
    expect(result.current.camposACarregar).toBe(false);
  });
});

describe("useDadosNovaLead: leituras de apoio", () => {
  it("campanhas a falhar levanta erroApoio; repetir recupera", async () => {
    supabaseFalso.estado.erros["campaigns.select"] = { message: "boom" };
    const { result } = montar({ campanha: null, aberto: true });
    await waitFor(() => expect(result.current.erroApoio).toBe(true));
    delete supabaseFalso.estado.erros["campaigns.select"];
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.campanhas).toHaveLength(1));
    expect(result.current.erroApoio).toBe(false);
  });

  it("com o diálogo fechado não há erro nem pedido", async () => {
    const { result } = montar({ campanha: "c1", aberto: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.erroApoio).toBe(false);
    expect(result.current.camposErro).toBe(false);
    expect(supabaseFalso.estado.chamadas).toEqual([]);
  });
});
