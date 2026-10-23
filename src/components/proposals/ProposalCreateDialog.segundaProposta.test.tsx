// O `ProposalCreateDialog` é partilhado com a Mudelar: a propriedade `propostaVivaNoNegocio` (só a ficha da pessoa a passa) avisa que o negócio já tem uma
// proposta enviada ou aceite e não deixa criar outra: com duas propostas vivas, recusar uma pode perder o negócio com a outra enviada. Sem ela nada muda.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  rpc: null as unknown as (...args: unknown[]) => unknown,
}));
m.rpc = vi.fn(async () => ({ data: { id: "pr-novo", entity_id: "e1" }, error: null }));
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
  return { supabase: { from: construtor, rpc: (...args: unknown[]) => m.rpc(...args), auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) }, functions: { invoke: async () => ({ error: null }) } } };
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
// Sem modelo escolhido, a última porta antes de gravar abre este aviso: é o sinal observável de que o envio chegou à gravação.
vi.mock("@/components/common/MissingTemplateDialog", () => ({
  MissingTemplateDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => (open ? <div><p>CHEGOU A GRAVAR</p><button type="button" onClick={onConfirm}>Gravar sem modelo</button></div> : null),
}));

import { ProposalCreateDialog } from "./ProposalCreateDialog";

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  m.chamadas.length = 0;
  m.rpc = vi.fn(async () => ({ data: { id: "pr-novo", entity_id: "e1" }, error: null }));
  m.navegar.mockReset();
  m.toast.mockReset();
  m.resolver = (c) => {
    if (c.tabela === "proposals") return { data: { id: "pr-novo" }, error: null };
    if (c.tabela === "proposal_workflow_stages" || c.tabela === "proposal_templates") return { data: [], error: null };
    return { data: null, error: null };
  };
});
afterEach(cleanup);

const AVISO = "Este negócio já tem uma proposta enviada ou aceite. Responda-lhe antes de criar outra: com duas propostas vivas, recusar uma pode perder o negócio.";
/** Envia o formulário como o Enter ou o botão fariam (o jsdom não deixa o clique passar pelos campos obrigatórios nativos). */
const enviarFormulario = (): void => { fireEvent.submit(screen.getByRole("button", { name: "Criar Proposta" }).closest("form") as HTMLFormElement); };
const tick = () => new Promise((r) => setTimeout(r, 30));

function Caso(p: { viva?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/pessoas?open=p1&negocio=n1"]}>
      <ProposalCreateDialog open onOpenChange={vi.fn()} presetEntityId="e1" propostaVivaNoNegocio={p.viva} />
    </MemoryRouter>
  );
}

describe("ProposalCreateDialog sem propostaVivaNoNegocio (o comportamento de sempre)", () => {
  it("não mostra aviso e o botão de criar não está desativado", async () => {
    render(<Caso />);
    await tick();
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(screen.getByRole("button", { name: "Criar Proposta" })).not.toHaveAttribute("aria-disabled");
  });

  it("com a propriedade a falso também não", async () => {
    render(<Caso viva={false} />);
    await tick();
    expect(screen.queryByText(AVISO)).toBeNull();
    expect(screen.getByRole("button", { name: "Criar Proposta" })).not.toHaveAttribute("aria-disabled");
  });
});

describe("ProposalCreateDialog: o controlo do teste de gravação", () => {
  it("sem a propriedade o mesmo clique, com o título preenchido, chega à gravação (por isso o teste de baixo não é vazio)", async () => {
    render(<Caso />);
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    enviarFormulario();
    expect(await screen.findByText("CHEGOU A GRAVAR")).toBeInTheDocument();
  });
});

describe("ProposalCreateDialog com propostaVivaNoNegocio", () => {
  it("mostra o aviso, liga-o ao botão e o botão fica aria-disabled", async () => {
    render(<Caso viva />);
    const aviso = await screen.findByText(AVISO);
    const botao = screen.getByRole("button", { name: "Criar Proposta" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao.getAttribute("aria-describedby")).toBe(aviso.id);
  });

  it("clicar em criar não grava nada, mesmo com o título preenchido", async () => {
    render(<Caso viva />);
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    enviarFormulario();
    await tick();
    expect(screen.queryByText("CHEGOU A GRAVAR")).toBeNull();
  });
});

describe("ProposalCreateDialog: criar já ligado ao negócio (fecho v4, só com a bandeira ligada)", () => {
  function CasoNegocio(p: { negocioId?: string }) {
    return (
      <MemoryRouter initialEntries={["/pessoas?open=p1&negocio=n1"]}>
        <ProposalCreateDialog open onOpenChange={vi.fn()} presetEntityId="e1" criarNoNegocioId={p.negocioId} onSaved={m.navegar} />
      </MemoryRouter>
    );
  }
  const gravar = async () => {
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    enviarFormulario();
    fireEvent.click(await screen.findByText("Gravar sem modelo"));
    await tick();
    await tick();
  };
  const chamadas = () => (m.rpc as ReturnType<typeof vi.fn>).mock.calls;

  it("sem a propriedade grava como sempre: rpc_create_proposal, sem p_negocio_id", async () => {
    render(<CasoNegocio />);
    await gravar();
    expect(chamadas().map((c) => c[0])).toContain("rpc_create_proposal");
    expect(chamadas().map((c) => c[0])).not.toContain("neg_criar_proposta");
    expect(chamadas().find((c) => c[0] === "rpc_create_proposal")?.[1]).not.toHaveProperty("p_negocio_id");
  });

  it("com a propriedade grava por neg_criar_proposta, com o negócio e os mesmos parâmetros", async () => {
    render(<CasoNegocio negocioId="neg-1" />);
    await gravar();
    expect(chamadas().map((c) => c[0])).not.toContain("rpc_create_proposal");
    const params = chamadas().find((c) => c[0] === "neg_criar_proposta")?.[1] as Record<string, unknown>;
    expect(params).toMatchObject({ p_negocio_id: "neg-1", p_selected_quote_ids: [], p_proposal_items: [] });
    expect(params.p_proposal_data).toMatchObject({ title: "Proposta Ana", entity_id: "e1", organization_id: "org-1" });
    expect(Object.keys(params).sort()).toEqual(["p_inline_quotes", "p_negocio_id", "p_proposal_data", "p_proposal_items", "p_quote_entity_id", "p_selected_quote_ids"]);
    expect(m.navegar).toHaveBeenCalledWith("pr-novo");
  });

  it("um erro da base (NG) vem traduzido, nunca o texto em bruto", async () => {
    m.rpc = vi.fn(async () => ({ data: null, error: { code: "NG002", message: "texto cru da base" } }));
    render(<CasoNegocio negocioId="neg-1" />);
    await gravar();
    const aviso = m.toast.mock.calls.map((c) => c[0] as { description?: string }).find((a) => a.description !== undefined);
    expect(aviso?.description).toBeTruthy();
    expect(aviso?.description).not.toBe("texto cru da base");
  });
});

describe("ProposalCreateDialog: feedback ao carregar em criar com uma proposta viva", () => {
  it("dá um aviso (toast) em vez de não fazer nada, e continua sem gravar", async () => {
    render(<Caso viva />);
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    enviarFormulario();
    await tick();
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Já existe uma proposta viva neste negócio.", variant: "destructive" }));
    expect(screen.queryByText("CHEGOU A GRAVAR")).toBeNull();
  });
});

describe("ProposalCreateDialog: um erro que não é da base de negócios mantém o texto real", () => {
  it("um erro sem código NG ligado a um negócio mostra a mensagem do erro, não a genérica", async () => {
    m.rpc = vi.fn(async () => ({ data: null, error: { message: "falhou a ligação ao modelo" } }));
    render(
      <MemoryRouter initialEntries={["/pessoas?open=p1&negocio=n1"]}>
        <ProposalCreateDialog open onOpenChange={vi.fn()} presetEntityId="e1" criarNoNegocioId="neg-1" />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: /^Título/ }), { target: { value: "Proposta Ana" } });
    enviarFormulario();
    fireEvent.click(await screen.findByText("Gravar sem modelo"));
    await tick();
    await tick();
    const avisos = m.toast.mock.calls.map((c) => c[0] as { description?: string }).filter((a) => a.description !== undefined);
    expect(avisos.some((a) => a.description === "falhou a ligação ao modelo")).toBe(true);
  });
});
