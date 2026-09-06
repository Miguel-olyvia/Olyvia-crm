import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// A fila de submissoes pendentes so faz duas coisas: escreve uma nota na ficha
// que ja existe, e leva a pessoa aos Agendamentos. Nao cria leads nem as edita.
// Exigir `leads.create` / `leads.edit` para mostrar os botoes punha gente numa
// fila que nao podia despachar. Quem chega aqui ja passou por
// `platform.pending_submissions.view`, e as linhas que ve ja vem filtradas pelo
// ambito do servidor -- nao ha nada para uma segunda permissao decidir.

const SUBMISSAO = {
  id: "sub-1",
  organization_id: "org-nike",
  entity_id: "ent-1",
  target_type: "lead",
  target_id: "lead-1",
  campaign_id: null,
  form_id: null,
  field_values: { nome: "Ana Ribeiro", email: "ana@exemplo.pt" },
  status: "pending",
  created_at: "2026-09-01T10:00:00Z",
  conflicting_entity_id: null,
};

function construtorDeConsulta(linhas: any[]) {
  const q: any = {
    select: () => q,
    eq: () => q,
    is: () => q,
    in: () => q,
    or: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: linhas, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (r: any) => Promise.resolve({ data: linhas, error: null }).then(r),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) =>
      construtorDeConsulta(tabela === "form_submissions" ? [SUBMISSAO] : []),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

// Estaveis de proposito: o `load` da pagina depende do `toast`, e devolver um
// objecto novo a cada render poe o useEffect em ciclo.
const toast = vi.fn();
const navigate = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("@/lib/leads/fieldDefinitions", () => ({
  resolveLeadDialogFieldDefinitions: () => Promise.resolve([]),
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
}));

// O ponto do teste: sem UMA unica permissao de leads.
const hasPermission = vi.fn(() => false);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission }),
}));

describe("Submissoes pendentes: quem chega a pagina consegue despachar", () => {
  beforeEach(() => {
    hasPermission.mockClear();
  });

  it("mostra o botao de registar na ficha sem leads.create nem leads.edit", async () => {
    const { default: PendingFormSubmissions } = await import("../PendingFormSubmissions");
    render(<PendingFormSubmissions />);

    await waitFor(() => {
      expect(screen.getByText(/Registar na ficha como nota/i)).toBeTruthy();
    });
  });

  it("nao pergunta por permissoes de leads para decidir o que mostrar", async () => {
    const { default: PendingFormSubmissions } = await import("../PendingFormSubmissions");
    render(<PendingFormSubmissions />);

    await waitFor(() => {
      expect(screen.getByText(/Registar na ficha como nota/i)).toBeTruthy();
    });

    const pedidas = hasPermission.mock.calls.map((c: any[]) => c[0]);
    expect(pedidas).not.toContain("leads.create");
    expect(pedidas).not.toContain("leads.edit");
  });
});
