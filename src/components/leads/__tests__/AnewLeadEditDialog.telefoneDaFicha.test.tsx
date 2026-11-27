import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFrom, type FakeTables } from "@/test/fakeSupabaseTables";

// O telefone e o email de uma pessoa vivem na FICHA (anew_entity_phones / anew_entity_emails);
// field_values e so o retrato que a lead guardou. O Editar tem de abrir com o principal mais
// recente da ficha, gravar PRIMEIRO na ficha e so depois na lead, e nunca gravar a lead se a
// ficha recusar. Caso real: a lead da Idalina tinha ...033 em field_values e a ficha ...833;
// o Editar mostrava 033, o Info 833, e gravar de novo era «sem mudanca» (033 = 033).

const calls: string[] = [];
let tables: FakeTables = {};
let rpcResults: Record<string, { data: unknown; error: unknown }> = {};
let fichaReadError: { code: string; message: string } | null = null;
let fieldDefs: unknown[] = [];
const rpc = vi.fn();
const toast = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (fichaReadError && (table === "anew_entity_phones" || table === "anew_entity_emails")) {
        const failing: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order", "limit", "is"]) failing[m] = () => failing;
        failing.maybeSingle = () => Promise.resolve({ data: null, error: fichaReadError });
        failing.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: fichaReadError });
        return failing;
      }
      return fakeFrom(tables)(table);
    },
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));
vi.mock("@/hooks/useLeadPipelineRules", () => ({
  useLeadPipelineRules: () => ({ stages: [], enforceStageTransitions: false, transitions: [] }),
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
  resolveLeadDialogFieldDefinitions: async () => fieldDefs,
}));
vi.mock("@/lib/leads/entityOwnerSync", () => ({ setEntityOwner: vi.fn(), notifyOwnerChangeVisits: vi.fn() }));
vi.mock("@/utils/auditContext", () => ({ withAuditContext: (_s: unknown, _u: unknown, fn: () => unknown) => fn() }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async (e: { message?: string }) => e?.message ?? "erro" }));
vi.mock("@/utils/orgFiscalEntity", () => ({ linkEntityFiscalEntity: vi.fn() }));
vi.mock("@/lib/duplicateBlockingRule", () => ({ checkNifCollisionOnEdit: async () => ({ collisions: [], error: null }) }));
vi.mock("@/components/leads/DynamicFormField", () => ({ DynamicFormField: () => null }));

import { AnewLeadEditDialog } from "@/components/leads/AnewLeadEditDialog";

const OLD = "2026-10-01T10:00:00+00:00";
const NEW = "2026-11-20T10:00:00+00:00";

// O formulario da campanha chama ao telefone `po_telefone`: e essa a chave que o Editar le primeiro.
const PHONE_DEFS = [
  { id: "f-tel", field_key: "po_telefone", contact_field_mapping: "phone", field_label: "Telefone", field_type: "phone" },
];

const ficha = (extra: Partial<FakeTables> = {}): FakeTables => ({
  anew_entities: [{ id: "ent-1", type: "person", display_name: "Idalina Andrade", first_name: "Idalina", last_name: "Andrade" }],
  anew_entity_phones: [
    { id: "ph-1", entity_id: "ent-1", phone_number: "965818833", country_code: "+351", is_primary: true, created_at: OLD },
  ],
  anew_entity_emails: [
    { id: "em-1", entity_id: "ent-1", email: "idalinaluis@sapo.pt", is_primary: true, created_at: OLD },
  ],
  ...extra,
});

// Lead da Idalina: o telefone da lead acaba em 033, o da ficha em 833.
const leadValues = (extra: Record<string, unknown> = {}) => ({
  first_name: "Idalina",
  last_name: "Andrade",
  email: "idalinaluis@sapo.pt",
  phone: "+351 965818033",
  po_telefone: "+351 965818033",
  ...extra,
});

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

const phoneInput = () => screen.getByLabelText("Telefone") as HTMLInputElement;
const emailInput = () =>
  screen.getByText("Email", { selector: "label" }).parentElement!.querySelector("input") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /guardar alterações/i });

async function open(field_values: Record<string, unknown>) {
  const onLeadUpdated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AnewLeadEditDialog
      open
      onOpenChange={onOpenChange}
      lead={baseLead(field_values) as never}
      companyId="org-1"
      companyUsers={[]}
      onLeadUpdated={onLeadUpdated}
      userId="user-1"
    />,
  );
  await waitFor(() => expect(saveButton()).not.toBeDisabled());
  // a ficha (tipo, nome, telefone, email) le-se a seguir ao formulario
  await waitFor(() => expect(screen.getByRole("radio", { name: /pessoa/i })).toBeChecked());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { onLeadUpdated, onOpenChange };
}

/** Espera que a gravacao tenha chegado a uma conclusao: a lead gravada ou um erro mostrado. */
async function saveAndSettle(onLeadUpdated: ReturnType<typeof vi.fn>) {
  fireEvent.click(saveButton());
  await waitFor(() => expect(onLeadUpdated.mock.calls.length > 0 || screen.queryByRole("alert") !== null).toBe(true));
}

const argsOf = (name: string) => rpc.mock.calls.find((c) => c[0] === name)?.[1] as Record<string, any>;
const strip = (v: unknown) => String(v).replace(/\s+/g, "");

beforeEach(() => {
  calls.length = 0;
  tables = ficha();
  rpcResults = {};
  fichaReadError = null;
  fieldDefs = PHONE_DEFS;
  toast.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => {
    calls.push(name);
    return rpcResults[name] ?? { data: null, error: null };
  });
});

describe("T1: o Editar abre com o telefone da ficha", () => {
  it("a lead tem ...033 e a ficha ...833: o campo Telefone mostra o da ficha", async () => {
    await open(leadValues());
    await waitFor(() => expect(phoneInput()).toHaveValue("965818833"));
  });

  it("com dois principais a mesma hora, mostra o de id maior (a ordem do portal)", async () => {
    tables = ficha({
      anew_entity_phones: [
        { id: "ph-7", entity_id: "ent-1", phone_number: "900000007", country_code: "+351", is_primary: true, created_at: NEW },
        { id: "ph-3", entity_id: "ent-1", phone_number: "900000003", country_code: "+351", is_primary: true, created_at: NEW },
        { id: "ph-9", entity_id: "ent-1", phone_number: "900000009", country_code: "+351", is_primary: true, created_at: OLD },
      ],
    });
    await open(leadValues());
    await waitFor(() => expect(phoneInput()).toHaveValue("900000007"));
  });

  it("ficha sem telefone principal: fica o da lead (recurso)", async () => {
    tables = ficha({
      anew_entity_phones: [
        { id: "ph-1", entity_id: "ent-1", phone_number: "965818833", country_code: "+351", is_primary: false, created_at: OLD },
      ],
    });
    await open(leadValues());
    expect(phoneInput()).toHaveValue("965818033");
  });

  it("ficha que nao se consegue ler: fica o da lead e gravar sem mexer nao reenvia nada para a ficha", async () => {
    fichaReadError = { code: "42501", message: "permission denied" };
    const { onLeadUpdated } = await open(leadValues());
    expect(phoneInput()).toHaveValue("965818033");
    await saveAndSettle(onLeadUpdated);
    expect(calls).toEqual(["rpc_update_lead"]);
  });
});

describe("T2: gravar o telefone grava primeiro na ficha", () => {
  it("o caso da Idalina: escrever 965818033 (igual ao da lead) chama a funcao da ficha ANTES de rpc_update_lead", async () => {
    const { onLeadUpdated } = await open(leadValues());
    fireEvent.change(phoneInput(), { target: { value: "965818033" } });
    await saveAndSettle(onLeadUpdated);

    expect(calls).toEqual(["rpc_set_entity_primary_phone", "rpc_update_lead"]);
    expect(argsOf("rpc_set_entity_primary_phone")).toEqual({
      p_entity_id: "ent-1",
      p_phone: "965818033",
      p_country_code: "+351",
    });
    // field_values continua a levar o numero normalizado nas duas chaves
    const sent = argsOf("rpc_update_lead").p_field_values;
    expect(strip(sent.phone)).toBe("+351965818033");
    expect(strip(sent.po_telefone)).toBe("+351965818033");
    expect(onLeadUpdated).toHaveBeenCalled();
  });

  it("gravar sem mexer no telefone nem no email nao toca na ficha (nao volta a promover contactos)", async () => {
    const { onLeadUpdated } = await open(leadValues());
    await saveAndSettle(onLeadUpdated);
    expect(calls).toEqual(["rpc_update_lead"]);
  });

  it("o mesmo numero escrito de outra forma nao conta como mudanca", async () => {
    const { onLeadUpdated } = await open(leadValues());
    fireEvent.change(phoneInput(), { target: { value: "965 818 833" } });
    await saveAndSettle(onLeadUpdated);
    expect(calls).toEqual(["rpc_update_lead"]);
  });
});

describe("T3 e T4: se a ficha recusa o telefone, a lead nao se grava", () => {
  async function typeNewPhoneAndSave() {
    const { onLeadUpdated, onOpenChange } = await open(leadValues());
    fireEvent.change(phoneInput(), { target: { value: "965818033" } });
    await saveAndSettle(onLeadUpdated);
    return { onLeadUpdated, onOpenChange };
  }

  it("T3: funcao em falta na base (PGRST202): nada se grava, erro a vista e o ecra fica aberto", async () => {
    rpcResults.rpc_set_entity_primary_phone = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.rpc_set_entity_primary_phone" },
    };
    const { onLeadUpdated, onOpenChange } = await typeNewPhoneAndSave();

    expect(calls).not.toContain("rpc_update_lead");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/O telefone não foi guardado: .*rpc_set_entity_primary_phone/);
    expect(onLeadUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // pode tentar de novo
    expect(saveButton()).not.toBeDisabled();
  });

  it("T4: sem permissao nos contactos da ficha (42501): nada se grava e o erro aparece", async () => {
    rpcResults.rpc_set_entity_primary_phone = {
      data: null,
      error: { code: "42501", message: "sem permissao para editar os contactos desta ficha" },
    };
    const { onLeadUpdated, onOpenChange } = await typeNewPhoneAndSave();

    expect(calls).not.toContain("rpc_update_lead");
    expect(screen.getByRole("alert")).toHaveTextContent("O telefone não foi guardado: sem permissao para editar os contactos desta ficha");
    expect(onLeadUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("o erro sai quando se volta a gravar com sucesso, e o ecra fecha", async () => {
    rpcResults.rpc_set_entity_primary_phone = { data: null, error: { code: "42501", message: "recusado" } };
    const { onLeadUpdated, onOpenChange } = await typeNewPhoneAndSave();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rpcResults.rpc_set_entity_primary_phone = { data: null, error: null };
    fireEvent.click(saveButton());
    await waitFor(() => expect(onLeadUpdated).toHaveBeenCalled());
    expect(calls).toContain("rpc_update_lead");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("T5: o mesmo para o email", () => {
  const emailLead = () => leadValues({ email: "novo@sapo.pt" });
  const emailFicha = () =>
    ficha({
      anew_entity_emails: [
        { id: "em-1", entity_id: "ent-1", email: "antigo@sapo.pt", is_primary: true, created_at: OLD },
      ],
    });

  it("abre com o email da ficha", async () => {
    tables = emailFicha();
    await open(emailLead());
    await waitFor(() => expect(emailInput()).toHaveValue("antigo@sapo.pt"));
  });

  it("escrever o email da lead grava primeiro na ficha (rpc_set_entity_primary_email) e depois a lead", async () => {
    tables = emailFicha();
    const { onLeadUpdated } = await open(emailLead());
    fireEvent.change(emailInput(), { target: { value: "novo@sapo.pt" } });
    await saveAndSettle(onLeadUpdated);

    expect(calls).toEqual(["rpc_set_entity_primary_email", "rpc_update_lead"]);
    expect(argsOf("rpc_set_entity_primary_email")).toEqual({ p_entity_id: "ent-1", p_email: "novo@sapo.pt" });
    expect(argsOf("rpc_update_lead").p_field_values.email).toBe("novo@sapo.pt");
  });

  it("se a ficha recusa o email, a lead nao se grava e o erro diz que e o email", async () => {
    tables = emailFicha();
    rpcResults.rpc_set_entity_primary_email = {
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.rpc_set_entity_primary_email" },
    };
    const { onLeadUpdated, onOpenChange } = await open(emailLead());
    fireEvent.change(emailInput(), { target: { value: "novo@sapo.pt" } });
    await saveAndSettle(onLeadUpdated);

    expect(calls).not.toContain("rpc_update_lead");
    expect(screen.getByRole("alert")).toHaveTextContent(/O email não foi guardado: /);
    expect(onLeadUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
