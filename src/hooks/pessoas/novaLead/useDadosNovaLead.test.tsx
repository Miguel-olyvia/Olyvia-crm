// Os dados de apoio da «Nova lead»: as chaves levam a organização, só se lê com o diálogo aberto e os comerciais respeitam o âmbito de quem cria.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { montarHook, criarCliente } from "../fichaTestUtil";
import { supabaseFalso } from "./supabaseFalso";
import { chavesNovaLead, useDadosNovaLead } from "./useDadosNovaLead";

vi.mock("@/integrations/supabase/client", async () => ({ supabase: (await import("./supabaseFalso")).supabaseFalso }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
const escopo = vi.hoisted(() => ({ nivel: "ORG" as "ORG" | "TEAM" | "OWNED" | "NONE" }));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({ getPermissionScope: () => escopo.nivel, anewUserId: "eu", authUserId: "auth-eu", teamMemberIds: ["colega"] }),
}));

const ORG = "org-nike";
type Props = { org: string | null; campanha: string | null; aberto: boolean };
const montar = (props: Props, client = criarCliente()) => montarHook((p: Props) => useDadosNovaLead(p.org, p.campanha, p.aberto), props, { client });

beforeEach(() => {
  supabaseFalso.reiniciar();
  escopo.nivel = "ORG";
  supabaseFalso.estado.tabelas = {
    campaigns: [{ id: "c1", name: "Verão", status: "active", form_id: null, forms: null }],
    lead_sources: [{ id: "s1", name: "Feira", icon: null, color: null }],
    forms: [],
    anew_hierarchy: [],
    anew_organizations: [{ id: ORG, name: "Nike", type: "empresa" }],
    anew_memberships: [
      { user_id: "eu", organization_id: ORG, role_id: "r" }, { user_id: "colega", organization_id: ORG, role_id: "r" },
      { user_id: "outro", organization_id: ORG, role_id: "r" },
    ],
    anew_roles: [{ id: "r", code: "vendedor" }],
    anew_users: [
      { id: "eu", name: "Eu", entity_id: null, status: "active" }, { id: "colega", name: "Colega", entity_id: null, status: "active" },
      { id: "outro", name: "Outro", entity_id: null, status: "active" },
    ],
    anew_entity_addresses: [],
    lead_field_definitions: [{ id: "d1", field_key: "k", field_label: "K", field_type: "text", is_required: false }],
  };
});

describe("useDadosNovaLead", () => {
  it("com o diálogo fechado não lê nada da base", async () => {
    montar({ org: ORG, campanha: null, aberto: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(supabaseFalso.estado.chamadas).toEqual([]);
  });

  it("aberto, lê campanhas, origens, formulários e comerciais e as chaves levam a organização", async () => {
    const client = criarCliente();
    const { result } = montar({ org: ORG, campanha: null, aberto: true }, client);
    await waitFor(() => expect(result.current.comerciais).toHaveLength(3));
    expect(result.current.campanhas).toEqual([{ id: "c1", name: "Verão", form_id: null }]);
    expect(result.current.origens).toEqual([{ id: "s1", name: "Feira", icon: null, color: null }]);
    expect(client.getQueryData(chavesNovaLead.comerciais(ORG))).toBeDefined();
    expect(chavesNovaLead.campanhas(ORG)).toContain(ORG);
    expect(chavesNovaLead.campos(ORG, "c1")).toEqual(expect.arrayContaining([ORG, "c1"]));
  });

  it("os comerciais respeitam o âmbito: TEAM vê quem cria e a equipa, OWNED só quem cria", async () => {
    escopo.nivel = "TEAM";
    const equipa = montar({ org: ORG, campanha: null, aberto: true });
    await waitFor(() => expect(equipa.result.current.comerciais.map((u) => u.id)).toEqual(["eu", "colega"]));
    escopo.nivel = "OWNED";
    const meu = montar({ org: ORG, campanha: null, aberto: true });
    await waitFor(() => expect(meu.result.current.comerciais.map((u) => u.id)).toEqual(["eu"]));
  });

  it("sem campanha não há campos extra; com campanha lê-os", async () => {
    const { result, rerender } = montar({ org: ORG, campanha: null, aberto: true });
    await waitFor(() => expect(result.current.comerciais.length).toBeGreaterThan(0));
    expect(result.current.camposCampanha).toEqual([]);
    rerender({ org: ORG, campanha: "c1", aberto: true });
    await waitFor(() => expect(result.current.camposCampanha.map((c) => c.field_key)).toEqual(["k"]));
    rerender({ org: ORG, campanha: null, aberto: true });
    expect(result.current.camposCampanha).toEqual([]);
  });

  it("sem organização não lê nada", async () => {
    montar({ org: null, campanha: null, aberto: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(supabaseFalso.estado.chamadas).toEqual([]);
  });
});
