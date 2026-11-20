// «Editar Lead»: o email e o telefone vêm da ficha do cliente (a entidade), a
// mesma fonte que o separador Info e a proposta usam; a cópia do lead
// (field_values) só serve quando a ficha não tem o valor ou não há ficha.
// E não há meias verdades ao gravar: se a ficha recusar o email novo (já
// pertence a outra ficha da mesma organização), nada do lead é gravado.
// Tudo simulado (Supabase e hooks): nada vai à rede nem à base.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const OUTRA_FICHA = "0f9e8d7c-6b5a-4321-9fed-cba987654321";

const h = vi.hoisted(() => ({
  eventos: [] as string[],
  rpcs: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  entidade: {
    emails: [] as Array<{ email: string }>,
    phones: [] as Array<{ phone_number: string; country_code: string | null }>,
    nomeOutraFicha: null as string | null,
  },
  linkEntityEmail: vi.fn(),
  linkEntityPhone: vi.fn(),
  toast: vi.fn(),
  onLeadUpdated: vi.fn(),
  onOpenChange: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const b: Record<string, unknown> = {};
    const resolver = (um: boolean) => {
      if (tabela === "anew_entity_emails") return { data: h.entidade.emails, error: null };
      if (tabela === "anew_entity_phones") return { data: h.entidade.phones, error: null };
      if (tabela === "anew_entities") {
        return { data: um && h.entidade.nomeOutraFicha ? { display_name: h.entidade.nomeOutraFicha } : null, error: null };
      }
      return { data: um ? null : [], error: null };
    };
    b.select = () => b;
    for (const m of ["eq", "neq", "in", "is", "or", "not", "order", "limit"]) b[m] = () => b;
    b.single = () => Promise.resolve(resolver(true));
    b.maybeSingle = () => Promise.resolve(resolver(true));
    b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve(resolver(false)).then(ok, err);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: (nome: string, args: Record<string, unknown>) => {
        h.rpcs.push({ nome, args });
        h.eventos.push(`rpc:${nome}`);
        return Promise.resolve({ data: null, error: null });
      },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

vi.mock("@/utils/entityContactSync", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/entityContactSync")>();
  return {
    ...real,
    linkEntityEmail: (...args: unknown[]) => {
      h.eventos.push("linkEntityEmail");
      return h.linkEntityEmail(...args);
    },
    linkEntityPhone: (...args: unknown[]) => {
      h.eventos.push("linkEntityPhone");
      return h.linkEntityPhone(...args);
    },
    linkEntityAddress: vi.fn(async () => undefined),
  };
});
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
  resolveLeadDialogFieldDefinitions: vi.fn(async () => []),
}));
vi.mock("@/hooks/useLeadPipelineRules", () => {
  const valor = { stages: [], enforceStageTransitions: false, transitions: [] };
  return { useLeadPipelineRules: () => valor };
});
vi.mock("@/utils/auditContext", () => ({
  withAuditContext: (_s: unknown, _u: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: async (e: unknown) => (e as { message?: string })?.message ?? "erro",
}));
vi.mock("@/lib/leads/entityOwnerSync", () => ({
  setEntityOwner: vi.fn(async () => ({ affectedVisitIds: [] })),
  notifyOwnerChangeVisits: vi.fn(async () => 0),
}));
vi.mock("@/utils/orgFiscalEntity", () => ({ linkEntityFiscalEntity: vi.fn(async () => undefined) }));
vi.mock("@/lib/duplicateBlockingRule", () => ({
  checkNifCollisionOnEdit: vi.fn(async () => ({ collisions: [], error: null })),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/hooks/useTranslation", () => {
  const t = (k: string, vars?: Record<string, unknown>) => (vars ? `${k} ${JSON.stringify(vars)}` : k);
  const valor = { t };
  return { useTranslation: () => valor };
});

import { AnewLeadEditDialog } from "../AnewLeadEditDialog";

beforeAll(() => {
  // Radix (Dialog/Select) precisa destes no jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

const leadBase = {
  id: "lead-1",
  organization_id: "org-nike",
  campaign_id: null,
  entity_id: "ent-1" as string | null,
  field_values: { first_name: "Diana", last_name: "Silva", email: "copia-b@x.pt", phone: "+351911111111" } as Record<string, unknown>,
  status: "new",
  source: null,
  notes: null,
  assigned_to: null,
  workflow_stage_id: null,
};

function abrir(lead = leadBase) {
  return render(
    <AnewLeadEditDialog
      open
      onOpenChange={h.onOpenChange}
      lead={lead as never}
      companyId="org-nike"
      companyUsers={[]}
      onLeadUpdated={h.onLeadUpdated}
      userId="u1"
    />,
  );
}

function guardar() {
  fireEvent.click(screen.getByRole("button", { name: /Guardar Alterações/i }));
}

beforeEach(() => {
  h.eventos.length = 0;
  h.rpcs.length = 0;
  h.entidade.emails = [{ email: "ficha-a@x.pt" }];
  h.entidade.phones = [{ phone_number: "922222222", country_code: "+351" }];
  h.entidade.nomeOutraFicha = null;
  h.linkEntityEmail.mockReset().mockResolvedValue(undefined);
  h.linkEntityPhone.mockReset().mockResolvedValue(undefined);
  h.toast.mockReset();
  h.onLeadUpdated.mockReset();
  h.onOpenChange.mockReset();
});

afterEach(() => cleanup());

describe("Editar Lead: email e telefone vêm da ficha do cliente", () => {
  it("(a) com ficha A e cópia B, abre com o email A (e o telefone da ficha), nunca com B", async () => {
    abrir();
    expect(await screen.findByDisplayValue("ficha-a@x.pt")).toBeTruthy();
    expect(screen.queryByDisplayValue("copia-b@x.pt")).toBeNull();
    // O telefone da ficha (+351 922222222) aparece nos dígitos do campo.
    expect(screen.getByDisplayValue(/922\s?222\s?222/)).toBeTruthy();
  });

  it("(d) sem ficha ligada, abre com o email da cópia do lead", async () => {
    abrir({ ...leadBase, entity_id: null });
    expect(await screen.findByDisplayValue("copia-b@x.pt")).toBeTruthy();
  });

  it("ficha sem email: cai para a cópia do lead", async () => {
    h.entidade.emails = [];
    abrir();
    expect(await screen.findByDisplayValue("copia-b@x.pt")).toBeTruthy();
  });

  it("abrir e guardar sem tocar no email (ficha A, cópia B) não volta a empurrar o email", async () => {
    abrir();
    await screen.findByDisplayValue("ficha-a@x.pt");
    guardar();
    await waitFor(() => expect(h.onLeadUpdated).toHaveBeenCalled());
    expect(h.linkEntityEmail).not.toHaveBeenCalled();
    // A cópia do lead fica alinhada com a ficha.
    const update = h.rpcs.find((r) => r.nome === "rpc_update_lead");
    expect((update?.args.p_field_values as Record<string, unknown>).email).toBe("ficha-a@x.pt");
  });
});

describe("Editar Lead: gravação sem meias verdades", () => {
  it("(b) email C recusado por unicidade: o lead NÃO é gravado, aparece o erro e o diálogo fica aberto", async () => {
    h.entidade.nomeOutraFicha = "Diana Silva (antiga)";
    h.linkEntityEmail.mockRejectedValue({
      code: "23505",
      message: `Já existe outra entidade (${OUTRA_FICHA}) com este email na mesma organização (b6ffce4f-f630-4933-833a-008649757a33)`,
    });
    abrir();
    const email = await screen.findByDisplayValue("ficha-a@x.pt");
    fireEvent.change(email, { target: { value: "nova-c@x.pt" } });
    guardar();

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.linkEntityEmail).toHaveBeenCalledWith("ent-1", "nova-c@x.pt", "u1");
    expect(h.rpcs.find((r) => r.nome === "rpc_update_lead")).toBeUndefined();
    expect(h.linkEntityPhone).not.toHaveBeenCalled();
    expect(h.onLeadUpdated).not.toHaveBeenCalled();
    expect(h.onOpenChange).not.toHaveBeenCalledWith(false);

    const erro = h.toast.mock.calls.map((c) => c[0]).find((a) => a.variant === "destructive");
    expect(erro.title).toBe("leads.edit.emailInUseTitle");
    expect(erro.description).toContain("leads.edit.emailInUseDescription");
    expect(erro.description).toContain("Diana Silva (antiga)");
    // O valor escrito continua no formulário para a pessoa corrigir.
    expect(screen.getByDisplayValue("nova-c@x.pt")).toBeTruthy();
  });

  it("(b2) outro erro ao gravar o email: também não grava o lead", async () => {
    h.linkEntityEmail.mockRejectedValue({ code: "42501", message: "permission denied" });
    abrir();
    const email = await screen.findByDisplayValue("ficha-a@x.pt");
    fireEvent.change(email, { target: { value: "nova-c@x.pt" } });
    guardar();

    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(h.rpcs.find((r) => r.nome === "rpc_update_lead")).toBeUndefined();
    expect(h.onLeadUpdated).not.toHaveBeenCalled();
    const erro = h.toast.mock.calls.map((c) => c[0]).find((a) => a.variant === "destructive");
    expect(erro.title).toBe("leads.edit.emailSyncErrorTitle");
  });

  it("(c) email C aceite: grava a ficha ANTES do lead e o lead é gravado como hoje", async () => {
    abrir();
    const email = await screen.findByDisplayValue("ficha-a@x.pt");
    fireEvent.change(email, { target: { value: "nova-c@x.pt" } });
    guardar();

    await waitFor(() => expect(h.onLeadUpdated).toHaveBeenCalled());
    expect(h.linkEntityEmail).toHaveBeenCalledWith("ent-1", "nova-c@x.pt", "u1");
    expect(h.eventos.indexOf("linkEntityEmail")).toBeLessThan(h.eventos.indexOf("rpc:rpc_update_lead"));
    expect(h.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("(e) mudar só o nome não chama linkEntityEmail nem linkEntityPhone", async () => {
    abrir();
    await screen.findByDisplayValue("ficha-a@x.pt");
    fireEvent.change(screen.getByDisplayValue("Diana"), { target: { value: "Diana Maria" } });
    guardar();

    await waitFor(() => expect(h.onLeadUpdated).toHaveBeenCalled());
    expect(h.linkEntityEmail).not.toHaveBeenCalled();
    expect(h.linkEntityPhone).not.toHaveBeenCalled();
    const update = h.rpcs.find((r) => r.nome === "rpc_update_lead");
    expect(update?.args.p_first_name).toBe("Diana Maria");
  });
});
