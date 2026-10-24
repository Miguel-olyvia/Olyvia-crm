// O `QuoteBuilder` é partilhado com a Mudelar. As propriedades que a ficha da pessoa (P3) lhe acrescentou não podem mudar nada a quem não as usa:
// sem `initialEntity` a pessoa/ficha do orçamento começa por escolher (como sempre); com `onSaved` o orçamento é entregue com o id ANTES de
// o editor fechar, e um `onSaved` que lança não faz o editor dizer que a gravação falhou (o orçamento já existe).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

interface Chamada { tabela: string; ops: [string, unknown[]][] }
const m = vi.hoisted(() => ({
  ordem: [] as string[],
  toast: vi.fn(),
  rpc: vi.fn(),
  captura: vi.fn(),
  empresa: { activeCompany: { id: "org-1", parent_id: null }, companies: [] as unknown[], userType: "user" },
  ambito: { getPermissionScope: () => "ORG", anewUserId: "u-1", teamMemberIds: [] as string[], loading: false },
  permissoes: { hasPermission: () => true, isSystemAdmin: true },
  pesquisa: { results: [] as never[], loading: false, error: null, search: () => undefined, clear: () => undefined, hasMore: false, loadMore: () => undefined },
  comerciais: { comercialUsers: [] as never[] },
  orgs: { orgIds: [] as string[] },
  uom: { getBaseCode: () => null },
  aviso: { toast: null as unknown },
}));
m.aviso.toast = m.toast;

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const c: Chamada = { tabela, ops: [] };
    const q: unknown = new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
        if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
        return (...args: unknown[]) => { c.ops.push([String(prop), args]); return q; };
      },
    });
    return q;
  };
  return {
    supabase: {
      from: construtor,
      rpc: (nome: string, ...args: unknown[]) => m.rpc(nome, ...args),
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined,
    },
  };
});
vi.mock("@/hooks/useTranslation", async () => ({ useTranslation: () => ({ t: (k: string) => k, language: "pt" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => m.aviso }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.empresa }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => m.ambito, applyScopeFilter: (q: unknown) => q }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permissoes }));
vi.mock("@/hooks/useScopedEntitySearch", () => ({ useScopedEntitySearch: () => m.pesquisa }));
vi.mock("@/hooks/useComercialUsers", () => ({ useComercialUsers: () => m.comerciais }));
vi.mock("@/hooks/useDescendantOrgIds", () => ({ useDescendantOrgIds: () => m.orgs }));
vi.mock("@/hooks/useProductBaseUomCodes", () => ({ useProductBaseUomCodes: () => m.uom }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u-1" }));
vi.mock("@/utils/quotes/resolveQuoteAssignedTo", () => ({ resolveQuoteAssignedTo: async () => null }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: async () => "erro" }));
vi.mock("@/components/quote/QuotePipelineBar", () => ({ QuotePipelineBar: () => null }));
vi.mock("@/components/quote/QuoteDealCard", () => ({ QuoteDealCard: () => null }));
vi.mock("@/components/quote/QuoteEntityPreview", () => ({ QuoteEntityPreview: () => null }));
vi.mock("@/components/quote/QuoteMoradaFiscal", () => ({ QuoteMoradaFiscal: () => null }));
vi.mock("@/components/quote/QuoteMoradaEntrega", () => ({ QuoteMoradaEntrega: () => null }));
vi.mock("@/components/EntitySearchInput", () => ({ EntitySearchInput: () => null }));
vi.mock("@/components/quote/QuoteBuilderSidebar", () => ({ QuoteBuilderSidebar: () => null }));
vi.mock("@/components/quote/QuoteConditions", () => ({ QuoteConditions: () => null }));
vi.mock("@/components/quote/QuotePdfPreviewDialog", () => ({ QuotePdfPreviewDialog: () => null }));
vi.mock("@/components/quotes/SendQuoteDialog", () => ({ SendQuoteDialog: () => null }));
vi.mock("@/components/quotes/QuoteRejectReasonDialog", () => ({ QuoteRejectReasonDialog: () => null }));
vi.mock("@/components/whatsapp/WhatsAppSendDialog", () => ({ WhatsAppSendDialog: () => null }));
vi.mock("@/components/LineAttributesDialog", () => ({ default: () => null }));
vi.mock("@/components/quote/BundleEditAttributesDialog", () => ({ BundleEditAttributesDialog: () => null }));
vi.mock("@/components/quote/InlineProductSelector", () => ({ InlineProductSelector: () => null }));
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
vi.mock("@/components/common/MissingTemplateDialog", () => ({
  MissingTemplateDialog: (p: { open: boolean; onConfirm: () => void }) => (p.open ? <button type="button" onClick={p.onConfirm}>confirmar-sem-template</button> : null),
}));
vi.mock("@/components/quote/AddItemsDialog", () => ({
  AddItemsDialog: (p: { replaceMode?: boolean; onAddItems: (itens: unknown[]) => void }) => (p.replaceMode ? null : (
    <button
      type="button"
      onClick={() => p.onAddItems([{
        item: { id: "prod-1", name: "Azulejo", description: null, sku: "AZ-1", category_name: null, retail_price: 10, vat_rate: 23, organization_id: "org-1", type: "product" },
        quantity: 2, attributes: {},
      }])}
    >
      adicionar-item-de-teste
    </button>
  )),
}));

import { QuoteBuilder } from "./QuoteBuilder";

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  m.ordem.length = 0;
  m.toast.mockReset();
  m.captura.mockReset();
  m.rpc.mockReset();
  m.rpc.mockImplementation(async (nome: string) => (nome === "rpc_save_quote" ? { data: { id: "q-novo" }, error: null } : { data: null, error: null }));
});
afterEach(cleanup);

const ENTIDADE = { kind: "lead" as const, id: "lead-1", name: "Ana Lopes", entity_id: "ent-1", organization_id: "org-1" };

function montar(extra: { initialEntity?: typeof ENTIDADE | null; onSaved?: (id: string) => void | Promise<void> } = {}) {
  const onClose = vi.fn(() => { m.ordem.push("fechou"); });
  render(<MemoryRouter><QuoteBuilder quoteId={null} onClose={onClose} {...extra} /></MemoryRouter>);
  return { onClose };
}

async function guardar() {
  fireEvent.click(await screen.findByRole("button", { name: "adicionar-item-de-teste" }));
  fireEvent.click(await screen.findByRole("button", { name: /Guardar Orçamento/ }));
  fireEvent.click(await screen.findByRole("button", { name: "confirmar-sem-template" }));
}
const errosDeGravacao = () => m.toast.mock.calls.filter((c) => (c[0] as { title?: string }).title === "quoteBuilder.toast.errorSavingQuote");

describe("QuoteBuilder: a pessoa do orçamento novo", () => {
  it("sem initialEntity o orçamento não traz ninguém escolhido (como sempre)", async () => {
    montar();
    await screen.findByRole("button", { name: /Guardar Orçamento/ });
    expect(screen.queryByText("Ana Lopes")).toBeNull();
    expect(screen.queryByText(/ligado ao orçamento/)).toBeNull();
  });

  it("com initialEntity traz a pessoa já escolhida", async () => {
    montar({ initialEntity: ENTIDADE });
    expect(await screen.findByText("Ana Lopes")).toBeInTheDocument();
    expect(screen.getByText(/ligado ao orçamento/)).toBeInTheDocument();
  });
});

describe("QuoteBuilder: onSaved", () => {
  it("sem onSaved guarda e fecha como sempre", async () => {
    const { onClose } = montar();
    await guardar();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(m.rpc).toHaveBeenCalledWith("rpc_save_quote", expect.anything());
    expect(errosDeGravacao()).toHaveLength(0);
  });

  it("onSaved recebe o id do orçamento guardado e acaba ANTES de o editor fechar", async () => {
    const onSaved = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      m.ordem.push("ligou");
    });
    const { onClose } = montar({ onSaved });
    await guardar();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith("q-novo");
    expect(m.ordem).toEqual(["ligou", "fechou"]);
  });

  it("um onSaved que lança não faz aparecer «erro a gravar»: o orçamento já existe e o editor fecha", async () => {
    const onSaved = vi.fn(async () => { throw new Error("a ligação falhou"); });
    const { onClose } = montar({ onSaved });
    await guardar();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(errosDeGravacao()).toHaveLength(0);
  });
});
