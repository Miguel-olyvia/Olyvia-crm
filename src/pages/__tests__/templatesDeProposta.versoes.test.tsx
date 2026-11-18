import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

interface Pedido {
  op: "select" | "insert";
  payload: Record<string, unknown> | null;
  uma: boolean;
}

const h = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  pedidos: [] as Array<{ op: string; payload: Record<string, unknown> | null; uma: boolean }>,
  empresa: { id: "org-nike", name: "Nike" },
  empresas: [{ id: "org-nike", name: "Nike" }],
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  function cadeia() {
    const p: Pedido = { op: "select", payload: null, uma: false };
    const resolver = () => {
      h.pedidos.push(p);
      if (p.op === "insert") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: p.uma ? h.linhas[0] : h.linhas, error: null });
    };
    const api = {
      select: () => api,
      insert: (payload: Record<string, unknown>) => { p.op = "insert"; p.payload = payload; return api; },
      eq: () => api,
      in: () => api,
      order: () => api,
      single: () => { p.uma = true; return resolver(); },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko),
    };
    return api;
  }
  return { supabase: { from: () => ({ select: () => cadeia().select(), insert: (x: Record<string, unknown>) => cadeia().insert(x) }) } };
});
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: h.empresa, companies: h.empresas }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve("biz-1") }));
vi.mock("@/components/ProposalTemplateEditor", () => ({ ProposalTemplateEditor: () => null }));

import ProposalTemplates from "../ProposalTemplates";
import QuoteTemplates from "../QuoteTemplates";

function linha(id: string, nome: string, design: unknown, tipo = "proposal") {
  return {
    id, name: nome, description: null, template_type: tipo,
    primary_color: "#000000", secondary_color: "#111111", accent_color: "#222222",
    is_default: false, is_active: true, created_at: "2026-11-01T10:00:00Z",
    footer_text: "Rodapé", sections: [], design_settings: design,
    organization_id: "org-nike", updated_at: "2026-11-02T10:00:00Z",
  };
}

const COM_VERSOES = { accept_button_text: "Aceitar", versions: { en: { base_hash: "x" } } };
const SEM_VERSOES = { accept_button_text: "Aceitar" };

beforeEach(() => {
  h.pedidos.length = 0;
  h.toast.mockReset();
});

describe.each([
  ["ProposalTemplates", ProposalTemplates, "proposal"],
  ["QuoteTemplates", QuoteTemplates, "quote"],
])("%s — idiomas nos cartões", (_nome, Pagina, tipo) => {
  it("template com versões mostra «PT · EN» e «EN incompleto»; sem versões não mostra nada", async () => {
    h.linhas = [linha("a", "Com inglês", COM_VERSOES, tipo), linha("b", "Só português", SEM_VERSOES, tipo)];
    render(<Pagina />);
    const celulaCom = (await screen.findByText("Com inglês")).closest("td")!;
    expect(within(celulaCom).getByText("PT · EN")).toBeInTheDocument();
    expect(within(celulaCom).getByText("EN incompleto")).toBeInTheDocument();
    const celulaSem = screen.getByText("Só português").closest("td")!;
    expect(within(celulaSem).queryByText(/PT/)).toBeNull();
    expect(within(celulaSem).queryByText(/incompleto/)).toBeNull();
    expect(screen.getAllByText(/^PT · /)).toHaveLength(1);
  });

  it("duplicar leva as versões (e o design_settings inteiro) para a cópia", async () => {
    h.linhas = [linha("a", "Com inglês", COM_VERSOES, tipo)];
    render(<Pagina />);
    await screen.findByText("Com inglês");
    const linhaDaTabela = screen.getByText("Com inglês").closest("tr")!;
    const botoes = within(linhaDaTabela).getAllByRole("button");
    fireEvent.click(botoes[1]); // editar, duplicar, eliminar
    await waitFor(() => expect(h.pedidos.some((p) => p.op === "insert")).toBe(true));
    const insercao = h.pedidos.find((p) => p.op === "insert")!;
    expect(insercao.payload!.design_settings).toEqual(COM_VERSOES);
    expect(insercao.payload!.name).toBe("Com inglês — Cópia");
    expect("id" in insercao.payload!).toBe(false);
    expect("updated_at" in insercao.payload!).toBe(false);
  });
});
