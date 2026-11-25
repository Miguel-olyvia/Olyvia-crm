import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A empresa so se pode pôr ESCOLHENDO «Empresa»: em Pessoa nao ha campo de empresa e o valor
// que a lead ja tinha nao se toca; em Empresa o unico campo e «Nome da empresa». A ordem das
// gravacoes e: primeiro o tipo (rpc_set_entity_kind), depois rpc_update_lead e as sincronizacoes.

const calls: string[] = [];
let entityRow: Record<string, unknown> = {};
let kindResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpc = vi.fn();
const linkFiscal = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "is", "or"]) builder[m] = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: entityRow, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => builder,
      rpc: (...args: unknown[]) => rpc(...args),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});
vi.mock("@/hooks/useLeadPipelineRules", () => ({
  useLeadPipelineRules: () => ({ stages: [], enforceStageTransitions: false, transitions: [] }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
  resolveLeadDialogFieldDefinitions: async () => [],
}));
vi.mock("@/lib/leads/entityOwnerSync", () => ({ setEntityOwner: vi.fn(), notifyOwnerChangeVisits: vi.fn() }));
vi.mock("@/utils/auditContext", () => ({ withAuditContext: (_s: unknown, _u: unknown, fn: () => unknown) => fn() }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async (e: { message?: string }) => e?.message ?? "erro" }));
vi.mock("@/utils/orgFiscalEntity", () => ({ linkEntityFiscalEntity: (...a: unknown[]) => linkFiscal(...a) }));
vi.mock("@/utils/entityContactSync", () => ({
  linkEntityAddress: vi.fn(), linkEntityEmail: vi.fn(), linkEntityPhone: vi.fn(),
}));
vi.mock("@/lib/duplicateBlockingRule", () => ({ checkNifCollisionOnEdit: async () => ({ collisions: [], error: null }) }));
vi.mock("@/components/leads/DynamicFormField", () => ({ DynamicFormField: () => null }));
vi.mock("@/components/leads/LeadPhoneField", () => ({ LeadPhoneField: () => null }));

import { AnewLeadEditDialog } from "@/components/leads/AnewLeadEditDialog";

const baseLead = (field_values: Record<string, unknown>) => ({
  id: "lead-1",
  organization_id: "org-1",
  campaign_id: null,
  entity_id: "ent-1",
  field_values,
  status: "new",
  source: null,
  notes: null,
  assigned_to: null,
});

async function open(field_values: Record<string, unknown>, entity: Record<string, unknown>) {
  entityRow = entity;
  const onLeadUpdated = vi.fn();
  render(
    <AnewLeadEditDialog
      open
      onOpenChange={vi.fn()}
      lead={baseLead(field_values) as never}
      companyId="org-1"
      companyUsers={[]}
      onLeadUpdated={onLeadUpdated}
      userId="user-1"
    />,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: /guardar alterações/i })).not.toBeDisabled());
  // a ficha (tipo e nome) le-se a seguir ao formulario
  await waitFor(() => expect(screen.getByRole("radio", { name: /pessoa/i })).toBeChecked());
  return { onLeadUpdated };
}

const person = { type: "person", display_name: "Rui Silva", first_name: "Rui", last_name: "Silva", company_name: null };
const lead = { first_name: "Rui", last_name: "Silva", company_name: "EVOLAR LDA", vat: "123456789" };

beforeEach(() => {
  calls.length = 0;
  kindResult = { data: { display_name: "EVOLAR MOVEIS LDA", type: "organization", first_name: null, last_name: null }, error: null };
  rpc.mockReset();
  linkFiscal.mockReset();
  rpc.mockImplementation(async (name: string) => {
    calls.push(name);
    return name === "rpc_set_entity_kind" ? kindResult : { data: null, error: null };
  });
});

const updateLeadArgs = () => rpc.mock.calls.find((c) => c[0] === "rpc_update_lead")?.[1] as Record<string, any>;

describe("AnewLeadEditDialog: o campo de empresa so existe em modo Empresa", () => {
  it("em Pessoa nao ha nenhum campo de empresa no DOM (nem o valor que a lead ja tinha)", async () => {
    await open(lead, person);
    expect(screen.queryByRole("textbox", { name: /empresa/i })).toBeNull();
    expect(screen.queryByLabelText(/nome da empresa/i)).toBeNull();
    expect(screen.queryByDisplayValue("EVOLAR LDA")).toBeNull();
    // o nome e o apelido, esses sim
    expect(screen.getByDisplayValue("Rui")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Silva")).toBeInTheDocument();
  });

  it("em Empresa o unico campo de empresa e «Nome da empresa» e nome/apelido saem; voltar a Pessoa devolve-os", async () => {
    await open(lead, person);
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    const company = screen.getByRole("textbox", { name: /nome da empresa/i });
    expect(company).toHaveValue("EVOLAR LDA"); // a empresa que a lead ja tinha
    expect(screen.getAllByRole("textbox", { name: /empresa/i })).toHaveLength(1);
    expect(screen.queryByDisplayValue("Rui")).toBeNull();
    fireEvent.change(company, { target: { value: "EVOLAR MOVEIS LDA" } });
    fireEvent.click(screen.getByRole("radio", { name: /pessoa/i }));
    expect(screen.getByDisplayValue("Rui")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("EVOLAR MOVEIS LDA")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    expect(screen.getByRole("textbox", { name: /nome da empresa/i })).toHaveValue("EVOLAR MOVEIS LDA"); // nao se perdeu
  });

  it("ficha que ja e Empresa: «Nome da empresa» e o nome da ficha", async () => {
    entityRow = { type: "organization", display_name: "Evolar Lda", first_name: "Evolar Lda", last_name: null, company_name: "Evolar Lda" };
    render(
      <AnewLeadEditDialog open onOpenChange={vi.fn()} lead={baseLead({ company_name: "Antiga SA" }) as never}
        companyId="org-1" companyUsers={[]} onLeadUpdated={vi.fn()} userId="user-1" />,
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: /empresa/i })).toBeChecked());
    expect(screen.getByRole("textbox", { name: /nome da empresa/i })).toHaveValue("Evolar Lda");
  });
});

describe("AnewLeadEditDialog: gravar", () => {
  it("em Pessoa, gravar nao altera a empresa de field_values nem chama a RPC do tipo", async () => {
    await open(lead, person);
    fireEvent.click(screen.getByRole("button", { name: /guardar alterações/i }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_update_lead", expect.anything()));
    expect(calls).not.toContain("rpc_set_entity_kind");
    expect(updateLeadArgs().p_field_values.company_name).toBe("EVOLAR LDA");
    expect(updateLeadArgs().p_display_name).toBeNull();
  });

  it("em Empresa: primeiro o tipo, depois a lead; field_values fica com a mesma empresa; a lead nao leva o nome", async () => {
    await open(lead, person);
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /nome da empresa/i }), { target: { value: "EVOLAR  MOVEIS LDA" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar alterações/i }));
    await waitFor(() => expect(calls).toContain("rpc_update_lead"));
    expect(calls.slice(0, 2)).toEqual(["rpc_set_entity_kind", "rpc_update_lead"]);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_entity_id: "ent-1", p_type: "organization", p_company_name: "EVOLAR MOVEIS LDA", p_first_name: null, p_last_name: null,
    });
    expect(updateLeadArgs().p_field_values.company_name).toBe("EVOLAR MOVEIS LDA");
    expect(updateLeadArgs().p_display_name).toBeNull(); // o nome ja ficou certo pela RPC do tipo
    await waitFor(() => expect(linkFiscal).toHaveBeenCalledWith("ent-1", "123456789", "EVOLAR MOVEIS LDA", "PT", "user-1"));
  });

  it("o tipo e recusado: a lead e a sincronizacao do NIF correm na mesma, sem o nome, e o ecra fica aberto", async () => {
    kindResult = { data: null, error: { code: "42501", message: "sem permissao" } };
    const { onLeadUpdated } = await open(lead, person);
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar alterações/i }));
    await waitFor(() => expect(onLeadUpdated).toHaveBeenCalled());
    expect(calls.slice(0, 2)).toEqual(["rpc_set_entity_kind", "rpc_update_lead"]);
    expect(updateLeadArgs().p_display_name).toBeNull();
    expect(updateLeadArgs().p_first_name).toBeNull();
    expect(linkFiscal).toHaveBeenCalledWith("ent-1", "123456789", null, "PT", "user-1");
  });

  it("base ainda sem a RPC (PGRST202): caminho de recurso, a lead leva o nome pelo tipo escolhido", async () => {
    kindResult = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    await open(lead, person);
    fireEvent.click(screen.getByRole("radio", { name: /empresa/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar alterações/i }));
    await waitFor(() => expect(calls).toContain("rpc_update_lead"));
    expect(updateLeadArgs().p_display_name).toBe("EVOLAR LDA");
  });
});
