// A fila de envios, o que falha e o que se ouve: leituras que falham nunca deixam os botões normais num conflito nem viram «Sem nome» em silêncio,
// os ícones decorativos estão escondidos, cada botão diz de que envio é, o foco não se perde ao resolver e o contador anuncia a mudança.
// Nada chama a base: o Supabase está simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const SUBMISSAO = {
  id: "sub-1", organization_id: "org-nike", entity_id: "ent-1", target_type: "lead", target_id: "ent-1", campaign_id: null, form_id: null,
  field_values: { nome: "Ana (corrigida)", email: "ana@exemplo.pt" }, status: "pending", created_at: "2026-09-01T10:00:00Z", conflicting_entity_id: null,
};
const CONFLITO = { ...SUBMISSAO, id: "sub-2", conflicting_entity_id: "ent-2" };

const estado = vi.hoisted(() => ({
  submissoes: [] as Record<string, unknown>[],
  falham: new Set<string>(),
  rpc: vi.fn(),
  toast: vi.fn(),
}));

function construtor(tabela: string, linhas: unknown[]) {
  const resposta = () =>
    estado.falham.has(tabela)
      ? { data: null, error: { code: "XX000", message: "falhou" } }
      : { data: linhas, error: null };
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, is: () => q, in: () => q, or: () => q, order: () => q,
    limit: () => Promise.resolve(resposta()),
    then: (r: (v: unknown) => unknown) => Promise.resolve(resposta()).then(r),
  };
  return q;
}
const ENTIDADES = [
  { id: "ent-1", display_name: "Ana Ribeiro" },
  { id: "ent-2", display_name: "Beatriz Campos" },
];
const EMAILS = [
  { entity_id: "ent-1", email: "ana@exemplo.pt", is_primary: true },
  { entity_id: "ent-2", email: "bea@exemplo.pt", is_primary: true },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) =>
      construtor(
        tabela,
        tabela === "form_submissions" ? estado.submissoes : tabela === "anew_entities" ? ENTIDADES : tabela === "anew_entity_emails" ? EMAILS : [],
      ),
    rpc: (...a: unknown[]) => estado.rpc(...a),
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: estado.toast }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  resolveLeadDialogFieldDefinitions: () => Promise.resolve([]),
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

import PendingFormSubmissions from "../PendingFormSubmissions";

async function desenhar(linhas: Record<string, unknown>[] = [SUBMISSAO]) {
  estado.submissoes = linhas;
  const r = render(<PendingFormSubmissions />);
  await screen.findAllByRole("button", { name: /Ignorar como duplicado/ });
  return r;
}

beforeEach(() => {
  estado.falham.clear();
  estado.rpc.mockReset().mockResolvedValue({ data: { acao: "criar_negocio", mudou: true }, error: null });
});

describe("Envios de formulário: leituras que falham", () => {
  it.each(["anew_entities", "anew_entity_emails", "anew_entity_phones"])(
    "num conflito, se a leitura de %s falha: aviso, Ligar e Criar negócio desativados, Ignorar possível",
    async (tabela) => {
      estado.falham.add(tabela);
      await desenhar([CONFLITO]);
      expect(screen.getByText(/Não foi possível carregar a outra pessoa/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Ligar à pessoa/ })).toBeNull();
      const ligar = screen.getAllByRole("button", { name: /^Ligar a /, hidden: false });
      const criar = screen.getAllByRole("button", { name: /^Criar negócio/ });
      expect(ligar.length).toBeGreaterThan(0);
      for (const b of [...ligar, ...criar]) expect(b).toBeDisabled();
      expect(screen.getByRole("button", { name: /^Ignorar como duplicado/ })).toBeEnabled();
    },
  );

  it("num conflito lido por inteiro não há aviso e as ações estão ativas", async () => {
    await desenhar([CONFLITO]);
    expect(screen.queryByText(/Não foi possível carregar a outra pessoa/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Ligar a Beatriz Campos/ })).toBeEnabled();
  });

  it("se o nome não se lê, não aparece «Pessoa sem nome» em silêncio: mostra o aviso", async () => {
    estado.falham.add("anew_entities");
    await desenhar([SUBMISSAO]);
    expect(screen.getByText(/Não foi possível ler o nome/)).toBeInTheDocument();
    expect(screen.queryByText("Pessoa sem nome")).toBeNull();
  });
});

describe("Envios de formulário: acessibilidade", () => {
  it("todos os ícones são decorativos (aria-hidden) e não há textos de 10 ou 11 px", async () => {
    const { container } = await desenhar([CONFLITO, SUBMISSAO]);
    const svgs = Array.from(container.querySelectorAll("svg"));
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector('[class*="text-[10px]"], [class*="text-[11px]"]')).toBeNull();
  });

  it("cada botão de ação diz de que envio é", async () => {
    await desenhar([SUBMISSAO]);
    expect(screen.getByRole("button", { name: "Ligar à pessoa: envio de Ana Ribeiro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar negócio: envio de Ana Ribeiro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignorar como duplicado: envio de Ana Ribeiro" })).toBeInTheDocument();
  });

  it("no conflito, os botões de cada candidata também dizem de que envio são", async () => {
    await desenhar([CONFLITO]);
    expect(screen.getByRole("button", { name: "Ligar a Beatriz Campos: envio de Ana Ribeiro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar negócio para Beatriz Campos: envio de Ana Ribeiro" })).toBeInTheDocument();
  });

  it("o contador é uma região de estado que anuncia a mudança", async () => {
    await desenhar([SUBMISSAO, { ...SUBMISSAO, id: "sub-9" }]);
    const estadoContador = screen.getByRole("status");
    expect(estadoContador).toHaveTextContent("2 envios por resolver");
    fireEvent.click(screen.getAllByRole("button", { name: /^Criar negócio/ })[0]);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 envio por resolver"));
  });

  it("depois de resolver um envio o foco vai para o título da lista", async () => {
    await desenhar([SUBMISSAO]);
    fireEvent.click(screen.getByRole("button", { name: /^Criar negócio/ }));
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
    const titulo = screen.getByRole("heading", { name: /^Por resolver/ });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });
});
