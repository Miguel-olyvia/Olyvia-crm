// O `ProposalCreateDialog` é partilhado com a Mudelar: as propriedades que a ficha da pessoa (P3) lhe acrescentou não podem mudar nada a quem
// não as usa. Sem `presetQuoteIds` o efeito novo não vai à base; com ele pede os orçamentos por id uma só vez (um array novo de conteúdo igual
// não repete); uma falha desse pedido diz-se; e o botão «Criar orçamento aqui» só leva `?voltar=` quando o P3 está presente.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

interface Chamada { tabela: string; ops: [string, unknown[]][] }
const m = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  resolver: (_c: Chamada): unknown => ({ data: null, error: null }),
  navegar: vi.fn(),
  toast: vi.fn(),
  // Referências estáveis, como nos hooks reais: um array novo a cada render põe os efeitos do diálogo em ciclo.
  pesquisa: { results: [] as never[], search: () => undefined },
  empresa: { activeCompany: { id: "org-1" } },
  permissoes: { isSystemAdmin: true },
  ambito: { getPermissionScope: () => "ORG", anewUserId: "u-1", teamMemberIds: [] as string[] },
  aviso: { toast: null as unknown },
}));
m.aviso.toast = m.toast;

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const c: Chamada = { tabela, ops: [] };
    m.chamadas.push(c);
    const q: unknown = new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === "then") return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(m.resolver(c)).then(ok, ko);
        return (...args: unknown[]) => { c.ops.push([String(prop), args]); return q; };
      },
    });
    return q;
  };
  return { supabase: { from: construtor, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) }, functions: { invoke: async () => ({ error: null }) } } };
});
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => m.navegar }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => m.aviso }));
vi.mock("@/hooks/useScopedEntitySearch", () => ({ useScopedEntitySearch: () => m.pesquisa }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.empresa }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permissoes }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => m.ambito }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u-1" }));
vi.mock("@/lib/notifications/resolveSendProposalAlerts", () => ({ resolveSendProposalAlerts: async () => undefined }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/components/proposals/InlineQuoteBuilder", () => ({ InlineQuoteBuilder: () => null, createEmptyInlineQuote: () => ({}), calcInlineQuoteTotal: () => 0 }));
vi.mock("@/components/proposals/ProposalItemsEditor", () => ({ calculateProposalItemsTotal: () => 0 }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/pipeline/ProposalManualItemsEditor", () => ({ ProposalManualItemsEditor: () => null }));
vi.mock("@/components/common/MissingTemplateDialog", () => ({ MissingTemplateDialog: () => null }));

import { ProposalCreateDialog } from "./ProposalCreateDialog";

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  m.chamadas.length = 0;
  m.navegar.mockReset();
  m.toast.mockReset();
  m.resolver = (c) => {
    if (c.tabela === "quotes") return { data: [{ id: "q1", quote_number: "O-1", total: 100, estado: "rascunho" }], error: null };
    if (c.tabela === "proposals") return { data: { id: "pr-novo" }, error: null };
    if (c.tabela === "proposal_workflow_stages" || c.tabela === "proposal_templates") return { data: [], error: null };
    return { data: null, error: null };
  };
});
afterEach(cleanup);

const quotesPorId = () => m.chamadas.filter((c) => c.tabela === "quotes" && c.ops.some(([nome]) => nome === "in"));

function Caso(p: { quotes?: string[]; endereco?: string; aberto?: boolean }) {
  return (
    <MemoryRouter initialEntries={[p.endereco ?? "/proposals"]}>
      <ProposalCreateDialog open={p.aberto ?? true} onOpenChange={vi.fn()} presetEntityId="e1" presetQuoteIds={p.quotes} />
    </MemoryRouter>
  );
}
const tick = () => new Promise((r) => setTimeout(r, 20));

describe("ProposalCreateDialog sem as props do P3 (o comportamento de sempre)", () => {
  it("o efeito dos orçamentos pré-escolhidos não vai à tabela de orçamentos", async () => {
    render(<Caso />);
    await tick();
    expect(m.chamadas.filter((c) => c.tabela === "quotes")).toHaveLength(0);
  });

  it("um erro nunca aparece sem as props (não há pedido que falhe)", async () => {
    m.resolver = () => ({ data: null, error: { message: "falhou" } });
    render(<Caso />);
    await tick();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ProposalCreateDialog com presetQuoteIds", () => {
  it("pede os orçamentos por id uma só vez e mostra-os escolhidos", async () => {
    render(<Caso quotes={["q1"]} />);
    expect(await screen.findByText(/O-1/)).toBeInTheDocument();
    expect(quotesPorId()).toHaveLength(1);
    expect(quotesPorId()[0].ops.find(([nome]) => nome === "in")?.[1]).toEqual(["id", ["q1"]]);
  });

  it("um array novo com o mesmo conteúdo não repete o pedido", async () => {
    const r = render(<Caso quotes={["q1"]} />);
    await screen.findByText(/O-1/);
    r.rerender(<Caso quotes={["q1"]} />);
    r.rerender(<Caso quotes={["q1"]} />);
    await tick();
    expect(quotesPorId()).toHaveLength(1);
  });

  it("fechado não pede nada", async () => {
    render(<Caso quotes={["q1"]} aberto={false} />);
    await tick();
    expect(quotesPorId()).toHaveLength(0);
  });

  it("se o pedido falha, diz-o com um aviso visível (e não deixa o orçamento por escolher em silêncio)", async () => {
    m.resolver = (c) => (c.tabela === "quotes" ? { data: null, error: { message: "falhou" } } : { data: [], error: null });
    render(<Caso quotes={["q1"]} />);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Não foi possível carregar o orçamento do negócio. Escolha o orçamento à mão.");
  });
});

describe("ProposalCreateDialog: «Criar orçamento aqui» e o regresso à ficha", () => {
  async function criarOrcamentoAqui(p: Parameters<typeof Caso>[0]) {
    render(<Caso {...p} />);
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar orçamento aqui/ }));
    await waitFor(() => expect(m.navegar).toHaveBeenCalledTimes(1));
    return m.navegar.mock.calls[0][0] as string;
  }

  it("sem as props do P3 vai ao orçamento como sempre, sem ?voltar=", async () => {
    expect(await criarOrcamentoAqui({ endereco: "/pessoas?open=p1&negocio=n1" })).toBe("/quotes?new=1&proposal_id=pr-novo");
  });

  it("com presetQuoteIds, na ficha, leva o ?voltar= com o endereço da ficha", async () => {
    const destino = await criarOrcamentoAqui({ quotes: ["q1"], endereco: "/pessoas?open=p1&negocio=n1" });
    expect(destino).toBe(`/quotes?new=1&proposal_id=pr-novo&voltar=${encodeURIComponent("/pessoas?open=p1&negocio=n1")}`);
  });

  it("com presetQuoteIds mas fora da ficha (um endereço que não é /pessoas) não leva ?voltar=", async () => {
    expect(await criarOrcamentoAqui({ quotes: ["q1"], endereco: "/proposals?x=1" })).toBe("/quotes?new=1&proposal_id=pr-novo");
  });
});
