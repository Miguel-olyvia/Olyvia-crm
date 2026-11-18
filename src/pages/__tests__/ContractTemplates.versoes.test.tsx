import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ContractTemplates from "../ContractTemplates";

// O jsdom não tem ResizeObserver (os interruptores do Radix dentro de um <form> usam-no).
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverFalso }).ResizeObserver = ResizeObserverFalso;

// Supabase simulado: sem rede, sem base. Regista o que a página lê e escreve em client_contract_templates.
const h = vi.hoisted(() => {
  const estado = {
    templates: [] as Record<string, unknown>[],
    existente: null as Record<string, unknown> | null,
    linhasAtualizadas: [{ id: "t1" }] as Array<{ id: string }>,
    selects: [] as string[],
    updates: [] as Array<Record<string, unknown>>,
    updateEqs: [] as Array<[string, unknown]>,
    inserts: [] as Array<Record<string, unknown>>,
    updateNeqs: [] as Array<[string, unknown]>,
    // Com `store`, os updates comportam-se como na base: filtram as linhas e, como o gatilho BEFORE UPDATE,
    // mudam o updated_at de CADA linha atualizada (incluindo as do reset em massa do «default»).
    store: null as Array<Record<string, unknown>> | null,
    contador: 0,
  };

  function construir(tabela: string) {
    let op: "select" | "update" | "insert" | "delete" = "select";
    const filtros: Array<["eq" | "neq", string, unknown]> = [];
    const casa = (l: Record<string, unknown>) => filtros.every(([k, col, v]) => (k === "eq" ? l[col] === v : l[col] !== v));
    const resultado = () => {
      if (tabela === "client_contract_templates") {
        if (op === "select") return { data: estado.templates, error: null };
        if (op === "update" && estado.store) {
          const alvo = estado.store.filter(casa);
          alvo.forEach((l) => { estado.contador += 1; l.updated_at = `gatilho-${estado.contador}`; });
          return { data: alvo.map((l) => ({ id: l.id })), error: null };
        }
        if (op === "update") return { data: estado.linhasAtualizadas, error: null };
        if (op === "insert") return { data: [{ id: "novo" }], error: null };
      }
      return { data: [], error: null };
    };
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      select: (cols?: string) => {
        if (op === "select" && tabela === "client_contract_templates") estado.selects.push(cols ?? "");
        return c;
      },
      update: (p: Record<string, unknown>) => {
        op = "update";
        if (tabela === "client_contract_templates") estado.updates.push(p);
        return c;
      },
      insert: (p: Record<string, unknown>) => {
        op = "insert";
        estado.inserts.push(p);
        return c;
      },
      delete: () => { op = "delete"; return c; },
      eq: (col: string, val: unknown) => {
        filtros.push(["eq", col, val]);
        if (op === "update" && tabela === "client_contract_templates") estado.updateEqs.push([col, val]);
        return c;
      },
      neq: (col: string, val: unknown) => {
        filtros.push(["neq", col, val]);
        if (op === "update" && tabela === "client_contract_templates") estado.updateNeqs.push([col, val]);
        return c;
      },
      order: () => c,
      not: () => c,
      maybeSingle: () => {
        if (estado.store) {
          const l = estado.store.find(casa);
          return Promise.resolve({ data: l ? { id: l.id, updated_at: l.updated_at } : null, error: null });
        }
        return Promise.resolve({ data: estado.existente, error: null });
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resultado()).then(res, rej),
    });
    return c;
  }

  return {
    estado,
    supabase: {
      from: (t: string) => construir(t),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "auth-1" } } }) },
    },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.supabase }));
vi.mock("@/lib/toast", () => ({ toast: h.toast }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-teste", name: "Org de teste" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, loading: false, isSystemAdmin: false }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve("biz-1") }));
vi.mock("@/hooks/useDocumentSettings", () => ({ useDocumentSettings: () => ({ settings: null, save: vi.fn() }) }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: () => Promise.resolve("erro") }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/Layout", () => ({ default: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/contracts/useOrgHeaderData", async (importar) => ({
  ...(await importar<Record<string, unknown>>()),
  useOrgHeaderData: () => ({ data: null }),
}));
vi.mock("@/components/RichTextEditor", async () => {
  const React = await import("react");
  return {
    RichTextEditor: React.forwardRef(function Falso(props: { value: string; onChange: (v: string) => void }, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ insertVariable: () => {}, execCommand: () => {} }));
      return <textarea aria-label="corpo-do-editor" value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
    }),
  };
});
vi.mock("@/components/document-editor/DocumentPreview", () => ({
  DocumentPreview: (p: { bodyHtml: string; headerSlot?: React.ReactNode; footerSlot?: React.ReactNode }) => (
    <div data-testid="preview">{p.headerSlot}<div data-testid="preview-corpo">{p.bodyHtml}</div>{p.footerSlot}</div>
  ),
}));
vi.mock("@/components/contracts/TemplateFileImport", () => ({ TemplateFileImport: () => null }));
vi.mock("@/components/contracts/TemplateExportButtons", () => ({ TemplateExportButtons: () => null }));
vi.mock("@/components/contracts/CustomVariablesManager", () => ({ CustomVariablesManager: () => null }));
vi.mock("@/components/contracts/SignatoriesPanel", () => ({ SignatoriesPanel: () => null }));
vi.mock("@/components/contracts/SignatoryOtpDialog", () => ({ SignatoryOtpDialog: () => null }));
vi.mock("@/components/contracts/DocumentSettingsPanel", () => ({ DocumentSettingsPanel: () => null }));
vi.mock("@/components/contracts/VariableDetectionAssistant", () => ({ VariableDetectionAssistant: () => null }));

const T1_UPDATED = "2026-11-18T10:00:00.123456+00:00";
const CORPO_PT = "<h2>CONTRATO</h2><p>Texto em português.</p>";

function minuta(extra: Record<string, unknown> = {}) {
  return {
    id: "t1", name: "Minuta A", description: null, body_html: CORPO_PT, is_active: true, is_default: false,
    organization_id: "org-teste", created_at: "2026-11-01T10:00:00+00:00", created_by: "u1", updated_at: T1_UPDATED,
    signatory_user_id: null, signatory_role_id: null, language: "pt",
    doc_settings: { primary_color: "#112233", chave_desconhecida: { a: 1 } },
    ...extra,
  };
}

function montar() {
  localStorage.setItem("language", "pt");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ContractTemplates />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

async function abrirEdicao() {
  const botoes = await screen.findAllByTitle("Editar");
  fireEvent.click(botoes[0]);
  await screen.findByLabelText("corpo-do-editor");
}

beforeEach(() => {
  localStorage.clear();
  h.estado.templates = [minuta()];
  h.estado.existente = null;
  h.estado.linhasAtualizadas = [{ id: "t1" }];
  h.estado.selects.length = 0;
  h.estado.updates.length = 0;
  h.estado.updateEqs.length = 0;
  h.estado.updateNeqs.length = 0;
  h.estado.store = null;
  h.estado.contador = 0;
  h.estado.inserts.length = 0;
  h.toast.success.mockClear();
  h.toast.error.mockClear();
});
afterEach(cleanup);

describe("ContractTemplates: leitura", () => {
  it("o select da lista pede também a coluna language", async () => {
    montar();
    await screen.findByText("Minuta A");
    const cols = h.estado.selects.find((s) => s.includes("doc_settings")) ?? "";
    expect(cols.split(",").map((c) => c.trim())).toContain("language");
  });

  it("um cartão sem versões não mostra chips de idioma", async () => {
    montar();
    const cartao = (await screen.findByText("Minuta A")).closest("div.border") as HTMLElement;
    expect(within(cartao).queryByText(/PT ·/)).toBeNull();
    expect(within(cartao).queryByText(/incompleto/)).toBeNull();
  });

  it("um cartão com versões mostra «PT · EN» e «EN incompleto»", async () => {
    h.estado.templates = [minuta({ doc_settings: { versions: { en: { body_html: CORPO_PT } } } })];
    montar();
    expect(await screen.findByText("PT · EN")).toBeInTheDocument();
    expect(screen.getByText("EN incompleto")).toBeInTheDocument();
  });
});

describe("ContractTemplates: minuta sem versões fica como hoje", () => {
  it("o editor não mostra a barra de idiomas, só o botão «Adicionar idioma»", async () => {
    montar();
    await abrirEdicao();
    expect(screen.queryByRole("tablist", { name: "Idiomas da minuta" })).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar idioma" })).toBeInTheDocument();
    expect((screen.getByLabelText("corpo-do-editor") as HTMLTextAreaElement).value).toBe(CORPO_PT);
  });

  it("guardar sem editar escreve o mesmo de sempre: sem versions, sem language, com a guarda de updated_at", async () => {
    montar();
    await abrirEdicao();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    const payload = h.estado.updates[0];
    expect(Object.keys(payload).sort()).toEqual(["body_html", "doc_settings", "is_active", "is_default", "name", "signatory_role_id", "signatory_user_id"]);
    expect(payload.doc_settings).toEqual({ primary_color: "#112233", chave_desconhecida: { a: 1 } });
    expect(payload.doc_settings).not.toHaveProperty("versions");
    expect(h.estado.updateEqs).toEqual([["id", "t1"], ["updated_at", T1_UPDATED]]);
  });

  it("editar o corpo e guardar mantém as chaves desconhecidas e não cria versions", async () => {
    montar();
    await abrirEdicao();
    fireEvent.change(screen.getByLabelText("corpo-do-editor"), { target: { value: "<p>novo texto</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    expect(h.estado.updates[0].body_html).toBe("<p>novo texto</p>");
    expect(h.estado.updates[0].doc_settings).toEqual({ primary_color: "#112233", chave_desconhecida: { a: 1 } });
  });
});

describe("ContractTemplates: versões por idioma", () => {
  async function adicionarEn(copiar = true) {
    fireEvent.click(screen.getByRole("button", { name: "Adicionar idioma" }));
    const painel = await screen.findByRole("group", { name: "Adicionar uma versão de idioma" });
    fireEvent.click(within(painel).getByRole("radio", { name: "English" }));
    if (!copiar) fireEvent.click(within(painel).getByRole("checkbox", { name: /Começar com uma cópia/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Adicionar versão" }));
  }

  it("adicionar English abre a barra com PT (base) e EN, passa para a versão e mostra a lista de verificação", async () => {
    montar();
    await abrirEdicao();
    await adicionarEn();
    const abas = await screen.findAllByRole("tab", { name: /\(base\)|por traduzir/ });
    expect(abas.map((a) => a.textContent?.replace(/\s+/g, " ").trim())).toEqual(["PT (base)", "EN · 1 por traduzir"]);
    expect(abas[1]).toHaveAttribute("aria-selected", "true");
    expect((screen.getByLabelText("corpo-do-editor") as HTMLTextAreaElement).value).toBe(CORPO_PT);
    expect(screen.getByRole("region", { name: "O que falta traduzir" })).toBeInTheDocument();
    // ARIA válido: o grupo do conteúdo é IRMÃO da barra (não a contém) e está nomeado pela aba ativa.
    const grupo = screen.getByRole("group", { name: "English, 1 por traduzir" });
    expect(grupo).toHaveAttribute("aria-labelledby", abas[1].id);
    const lista = screen.getByRole("tablist", { name: "Idiomas da minuta" });
    expect(grupo.contains(lista)).toBe(false);
    expect(lista.closest('[role="tabpanel"]')).toBeNull();
    expect(grupo.closest('[role="tabpanel"]')).toBeNull();
    expect(grupo.querySelector('[role="tabpanel"]')).not.toBeNull(); // os do Radix (Editor, Layout…) ficam lá dentro
  });

  it("traduzir o corpo e guardar escreve só em doc_settings.versions.en; o corpo base e o resto ficam", async () => {
    montar();
    await abrirEdicao();
    await adicionarEn();
    fireEvent.change(screen.getByLabelText("corpo-do-editor"), { target: { value: "<h2>SERVICES AGREEMENT</h2>" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    const payload = h.estado.updates[0] as { body_html: string; doc_settings: Record<string, any> };
    expect(payload.body_html).toBe(CORPO_PT);
    expect(payload.doc_settings.primary_color).toBe("#112233");
    expect(payload.doc_settings.chave_desconhecida).toEqual({ a: 1 });
    expect(payload.doc_settings.versions.en.body_html).toBe("<h2>SERVICES AGREEMENT</h2>");
    expect(payload.doc_settings.versions.en.base_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(payload).not.toHaveProperty("language");
  });

  it("voltar ao português mostra o corpo base e a pré-visualização muda de idioma", async () => {
    montar();
    await abrirEdicao();
    await adicionarEn();
    fireEvent.change(screen.getByLabelText("corpo-do-editor"), { target: { value: "<h2>SERVICES AGREEMENT</h2>" } });
    await waitFor(() => expect(screen.getByTestId("preview-corpo").textContent).toContain("SERVICES AGREEMENT"));
    expect(screen.getByTestId("preview").textContent).toContain("Page 1 of 1");

    fireEvent.click(screen.getByRole("tab", { name: "Português (base)" }));
    expect((screen.getByLabelText("corpo-do-editor") as HTMLTextAreaElement).value).toBe(CORPO_PT);
    await waitFor(() => expect(screen.getByTestId("preview").textContent).toContain("Página 1 de 1"));
  });

  it("remover a versão volta ao estado sem versões e guarda sem a chave versions", async () => {
    montar();
    await abrirEdicao();
    await adicionarEn();
    fireEvent.click(await screen.findByRole("button", { name: "Remover esta versão" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(screen.queryByRole("tablist", { name: "Idiomas da minuta" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.estado.updates).toHaveLength(1));
    expect(h.estado.updates[0].doc_settings).toEqual({ primary_color: "#112233", chave_desconhecida: { a: 1 } });
  });
});

describe("ContractTemplates: guarda de concorrência", () => {
  it("se outra pessoa guardou entretanto, avisa sem perder o texto do editor", async () => {
    h.estado.linhasAtualizadas = [];
    h.estado.existente = { id: "t1", updated_at: "2026-11-18T11:30:00+00:00" };
    montar();
    await abrirEdicao();
    fireEvent.change(screen.getByLabelText("corpo-do-editor"), { target: { value: "<p>o meu texto</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const aviso = await screen.findByRole("alertdialog");
    expect(within(aviso).getByText("Esta minuta foi alterada por outra pessoa")).toBeInTheDocument();
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect((screen.getByLabelText("corpo-do-editor") as HTMLTextAreaElement).value).toBe("<p>o meu texto</p>");
  });

  it("«Guardar por cima» volta a guardar com o updated_at de agora", async () => {
    h.estado.linhasAtualizadas = [];
    h.estado.existente = { id: "t1", updated_at: "2026-11-18T11:30:00+00:00" };
    montar();
    await abrirEdicao();
    fireEvent.change(screen.getByLabelText("corpo-do-editor"), { target: { value: "<p>o meu texto</p>" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const aviso = await screen.findByRole("alertdialog");

    h.estado.linhasAtualizadas = [{ id: "t1" }];
    h.estado.updateEqs.length = 0;
    fireEvent.click(within(aviso).getByRole("button", { name: "Guardar por cima" }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(h.estado.updateEqs).toEqual([["id", "t1"], ["updated_at", "2026-11-18T11:30:00+00:00"]]);
    expect(h.estado.updates[h.estado.updates.length - 1]?.body_html).toBe("<p>o meu texto</p>");
  });

  it("sem permissão (a minuta não se vê) mostra o erro de sempre e não o aviso de conflito", async () => {
    h.estado.linhasAtualizadas = [];
    h.estado.existente = null;
    montar();
    await abrirEdicao();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("ContractTemplates: guardar a minuta «default» (o gatilho muda updated_at em cada update)", () => {
  function prepararDefault() {
    h.estado.templates = [minuta({ is_default: true }), minuta({ id: "t2", name: "Outra", is_default: false })];
    h.estado.store = [
      { id: "t1", organization_id: "org-teste", updated_at: T1_UPDATED },
      { id: "t2", organization_id: "org-teste", updated_at: "2026-11-10T09:00:00+00:00" },
    ];
  }

  it("guardar a default funciona: o reset em massa deixa de fora a própria minuta", async () => {
    prepararDefault();
    montar();
    await abrirEdicao();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.toast.error).not.toHaveBeenCalled();
    // O reset em massa (is_default:false) exclui a própria minuta e depois grava-se com a guarda de updated_at.
    expect(h.estado.updates[0]).toEqual({ is_default: false });
    expect(h.estado.updateNeqs).toContainEqual(["id", "t1"]);
    expect(h.estado.updates).toHaveLength(2);
    expect(h.estado.updates[1]).toMatchObject({ is_default: true, name: "Minuta A" });
  });

  it("um conflito verdadeiro (outra sessão mudou o updated_at) continua a ser detetado, antes de mexer nas outras minutas", async () => {
    prepararDefault();
    montar();
    await abrirEdicao();
    h.estado.store![0].updated_at = "2026-11-18T11:30:00+00:00"; // outra pessoa guardou entretanto
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const aviso = await screen.findByRole("alertdialog");
    expect(within(aviso).getByText("Esta minuta foi alterada por outra pessoa")).toBeInTheDocument();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.estado.updates).toHaveLength(0); // nem o reset do «default» das outras minutas correu
    expect(h.estado.store![1].updated_at).toBe("2026-11-10T09:00:00+00:00");
  });

  it("«Guardar por cima» também funciona na default", async () => {
    prepararDefault();
    montar();
    await abrirEdicao();
    h.estado.store![0].updated_at = "2026-11-18T11:30:00+00:00";
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const aviso = await screen.findByRole("alertdialog");

    fireEvent.click(within(aviso).getByRole("button", { name: "Guardar por cima" }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(h.estado.updates).toHaveLength(2);
  });
});

describe("ContractTemplates: o foco não se perde ao mexer nos idiomas", () => {
  it("1.º «Adicionar idioma»: o foco vai para o título do painel; ao confirmar, para a aba nova; ao remover, para a aba que fica", async () => {
    montar();
    await abrirEdicao();

    fireEvent.click(screen.getByRole("button", { name: "Adicionar idioma" }));
    await waitFor(() => expect(screen.getByText("Adicionar uma versão de idioma")).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Adicionar versão" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "English, 1 por traduzir" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Remover esta versão" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    // Era a única versão: a barra desaparece e o foco volta ao botão «Adicionar idioma» do cabeçalho.
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar idioma" })).toHaveFocus());
  });

  it("ao remover uma de duas versões, o foco vai para a aba ativa que fica", async () => {
    h.estado.templates = [minuta({ doc_settings: { versions: { en: { body_html: CORPO_PT }, es: { body_html: CORPO_PT } } } })];
    montar();
    await abrirEdicao();
    fireEvent.click(await screen.findByRole("tab", { name: /^English/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remover esta versão" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Português (base)" })).toHaveFocus());
  });
});

describe("ContractTemplates: duplicar", () => {
  it("copia o idioma base e o doc_settings com as versões", async () => {
    const ds = { primary_color: "#112233", versions: { en: { body_html: "<p>x</p>" } } };
    h.estado.templates = [minuta({ doc_settings: ds, language: "pt" })];
    montar();
    fireEvent.click((await screen.findAllByTitle("Duplicar"))[0]);
    await waitFor(() => expect(h.estado.inserts).toHaveLength(1));
    expect(h.estado.inserts[0]).toMatchObject({ name: "Minuta A (cópia)", language: "pt", doc_settings: ds, organization_id: "org-teste" });
  });
});
