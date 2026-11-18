import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// ---- Supabase simulado: cada pedido é registado e respondido por `responder` ----------------------------
interface Pedido {
  table: string;
  op: "select" | "update" | "insert";
  cols: string | null;
  payload: Record<string, unknown> | null;
  filtros: Array<[string, unknown]>;
  uma: boolean;
}

const h = vi.hoisted(() => ({
  pedidos: [] as Pedido[],
  responder: (_: Pedido): { data: unknown; error: { message: string } | null } => ({ data: null, error: null }),
  toast: vi.fn(),
  // O editor tem `activeCompany` nas dependências de um efeito: tem de ser sempre o MESMO objeto.
  empresa: { id: "org-nike", name: "Nike" },
}));

vi.mock("@/integrations/supabase/client", () => {
  function cadeia(table: string) {
    const p: Pedido = { table, op: "select", cols: null, payload: null, filtros: [], uma: false };
    const resolver = () => {
      h.pedidos.push(p);
      return Promise.resolve(h.responder(p));
    };
    const api = {
      select: (cols?: string) => { p.cols = cols ?? "*"; return api; },
      update: (payload: Record<string, unknown>) => { p.op = "update"; p.payload = payload; return api; },
      insert: (payload: Record<string, unknown>) => { p.op = "insert"; p.payload = payload; return api; },
      eq: (c: string, v: unknown) => { p.filtros.push([c, v]); return api; },
      neq: (c: string, v: unknown) => { p.filtros.push([`!${c}`, v]); return api; },
      order: () => api,
      single: () => { p.uma = true; return resolver(); },
      maybeSingle: () => { p.uma = true; return resolver(); },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko),
    };
    return api;
  }
  return {
    supabase: {
      // Como o PostgREST: o construtor de tabela não guarda estado, cada select/update/insert começa um pedido novo.
      from: (table: string) => ({
        select: (cols?: string) => cadeia(table).select(cols),
        update: (payload: Record<string, unknown>) => cadeia(table).update(payload),
        insert: (payload: Record<string, unknown>) => cadeia(table).insert(payload),
      }),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "auth-1" } } }) },
      storage: { from: () => ({}) },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: h.empresa }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: () => Promise.resolve("biz-1") }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/components/GalleryPickerDialog", () => ({ GalleryPickerDialog: () => null }));
vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ProposalTemplateEditor } from "../ProposalTemplateEditor";
import { DEFAULT_DOCUMENT_TEMPLATE_SETTINGS } from "@/utils/documentTemplate/types";

// ---- Dados ---------------------------------------------------------------------------------------------
const ATUALIZADO_EM = "2026-11-10T09:00:00.123456+00:00";

/** Todas as chaves que o editor grava em design_settings, com os valores por omissão dele. */
const DESIGN_COMPLETO: Record<string, unknown> = {
  chave_de_outro_adaptador: { x: 1 },
  header_bg_color: "#ffffff", header_text_color: "#000000", header_gradient: false, header_gradient_to: "#ffffff",
  surface_color: "#f3f4f6", text_secondary_color: "#6b7280", border_color: "#e5e7eb",
  quote_header_bg: "#374151", quote_header_text: "#ffffff", quote_row_alt_bg: "#f9fafb", quote_border_color: "#e5e7eb", content_block_bg: "#ffffff",
  status_pending_color: "#f59e0b", status_accepted_color: "#10b981", status_rejected_color: "#ef4444", status_sent_color: "#3b82f6",
  font_size_base: 16, font_size_heading: 24, font_size_subheading: 18, font_size_small: 14, line_height: 1.6,
  padding_page: 40, padding_section: 24, padding_card: 20, gap_sections: 24, border_radius: 0, max_width: 794,
  accept_button_text: "Aceitar Proposta", accept_button_bg: "#10b981", accept_button_text_color: "#ffffff",
  reject_button_text: "Recusar", reject_button_bg: "#ef4444", reject_button_text_color: "#ffffff",
  items_table: { ...DEFAULT_DOCUMENT_TEMPLATE_SETTINGS.items_table },
};

const SECCOES = [
  { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { layout: "quote_pdf", showLogo: true, alignment: "left", showDate: true, customTitle: "PROPOSTA" } },
  { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { collapsible: false, showIcon: false, customIcon: "", sectionLabel: "CONDIÇÕES GERAIS" } },
];

function linha(design: Record<string, unknown> = DESIGN_COMPLETO) {
  return {
    id: "tpl-1",
    name: "Modelo nike",
    description: null,
    organization_id: "org-nike",
    template_type: "proposal",
    logo_url: null,
    primary_color: "#000000", secondary_color: "#374151", accent_color: "#f59e0b", background_color: "#ffffff", text_color: "#1f2937",
    font_family: "Inter", heading_font_family: "Inter", header_style: "modern",
    header_text: null, footer_text: "Rodapé em português", terms_conditions: "Termos em português", thank_you_message: null,
    email_subject: "Proposta: {{titulo_proposta}}", email_body: "<p>Olá</p>",
    verification_email_subject: null, verification_email_body: null,
    is_default: false, is_active: true, accept_enabled: true, accept_verification_method: "none", show_quote_details: true,
    sections: SECCOES,
    design_settings: design,
    updated_at: ATUALIZADO_EM,
  };
}

function responderCom(row: ReturnType<typeof linha>, aoGuardar?: (p: Pedido) => { data: unknown; error: { message: string } | null }) {
  h.responder = (p) => {
    if (p.table === "anew_organizations") return { data: [], error: null };
    if (p.table === "proposal_templates" && p.op === "select") return { data: p.cols === "updated_at" ? { updated_at: row.updated_at } : row, error: null };
    if (p.table === "proposal_templates" && p.op === "update") return aoGuardar ? aoGuardar(p) : { data: [{ id: row.id }], error: null };
    return { data: null, error: null };
  };
}

function gravacoes(): Pedido[] {
  return h.pedidos.filter((p) => p.table === "proposal_templates" && p.op === "update" && p.payload && "name" in p.payload);
}

/** Espera pelo template e deixa correr o efeito que fixa o baseline do isDirty. */
async function carregado() {
  await screen.findByDisplayValue("Modelo nike");
  await act(async () => {});
}

async function abrir(row = linha()) {
  responderCom(row);
  const onClose = vi.fn();
  render(<ProposalTemplateEditor templateId="tpl-1" onClose={onClose} />);
  await carregado();
  return { onClose };
}

async function guardar() {
  fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
  await waitFor(() => expect(h.toast).toHaveBeenCalled());
}

async function adicionarIngles(copiar: boolean) {
  fireEvent.click(screen.getByRole("button", { name: /Adicionar idioma/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Adicionar idioma" });
  fireEvent.click(within(dialogo).getByRole("radio", { name: "English" }));
  const caixa = within(dialogo).getByRole("checkbox");
  if ((caixa.getAttribute("aria-checked") === "true") !== copiar) fireEvent.click(caixa);
  fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar" }));
  await screen.findByRole("tab", { name: /^EN/ });
}

function abaTexto(nome: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
}

beforeEach(() => {
  h.pedidos.length = 0;
  h.toast.mockReset();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

// ---- Regra dura: um template SEM versões fica exatamente como hoje --------------------------------------
describe("ProposalTemplateEditor — template sem versões", () => {
  it("grava o design_settings igual byte a byte e sem chave `versions`", async () => {
    await abrir();
    await guardar();
    const [g] = gravacoes();
    expect(g).toBeDefined();
    const design = g.payload!.design_settings as Record<string, unknown>;
    expect("versions" in design).toBe(false);
    expect(JSON.stringify(design)).toBe(JSON.stringify(DESIGN_COMPLETO));
  });

  it("não mostra barra de idiomas nem abas de idioma, só o botão «Adicionar idioma»", async () => {
    await abrir();
    expect(screen.queryByRole("tablist", { name: "Idiomas do template" })).toBeNull();
    expect(screen.getByRole("button", { name: /Adicionar idioma/ })).toBeInTheDocument();
  });

  it("sem alterações, sair não pede confirmação", async () => {
    const { onClose } = await abrir();
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Alterações por guardar")).toBeNull();
  });

  it("o update leva a guarda de concorrência pelo updated_at carregado", async () => {
    await abrir();
    await guardar();
    const [g] = gravacoes();
    expect(g.filtros).toEqual([["id", "tpl-1"], ["updated_at", ATUALIZADO_EM]]);
  });
});

// ---- Versões existentes são preservadas ---------------------------------------------------------------
describe("ProposalTemplateEditor — template com versões", () => {
  const VERSOES = { en: { base_hash: "abcd1234", footer_text: "English footer", sections: { header: { customTitle: "PROPOSAL" } } } };

  it("sem editar nada, grava as versões tal como estavam (byte a byte, mesma ordem de chaves)", async () => {
    const design = { ...DESIGN_COMPLETO, versions: VERSOES };
    await abrir(linha(design));
    await guardar();
    const [g] = gravacoes();
    expect(JSON.stringify(g.payload!.design_settings)).toBe(JSON.stringify(design));
  });

  it("as versões não vão parar ao config (o isDirty não muda ao carregar)", async () => {
    const { onClose } = await abrir(linha({ ...DESIGN_COMPLETO, versions: VERSOES }));
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mostra a barra com PT (base) e EN, e o inglês aparece na pré-visualização", async () => {
    await abrir(linha({ ...DESIGN_COMPLETO, versions: VERSOES }));
    const abas = within(screen.getByRole("tablist", { name: "Idiomas do template" })).getAllByRole("tab");
    expect(abas[0]).toHaveTextContent("PT (base)");
    expect(abas[0]).toHaveAttribute("aria-selected", "true");
    // o título da pré-visualização é o único h1; a lista de verificação repete o português noutro sítio
    expect(screen.getByRole("heading", { level: 1, name: "PROPOSTA" })).toBeInTheDocument();
    fireEvent.click(abas[1]);
    expect(screen.getByRole("heading", { level: 1, name: "PROPOSAL" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "PROPOSTA" })).toBeNull();
    fireEvent.click(abas[0]);
    expect(screen.getByRole("heading", { level: 1, name: "PROPOSTA" })).toBeInTheDocument();
  });

  it("num idioma que não é o base só há os separadores de texto; os de cor e tipografia escondem-se", async () => {
    await abrir(linha({ ...DESIGN_COMPLETO, versions: VERSOES }));
    expect(screen.queryByRole("tab", { name: "Secções" })).toBeNull();
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByRole("tab", { name: "Secções" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Conteúdo" })).toBeInTheDocument();
    // só as duas abas de idioma e as duas de texto: os separadores do português (4) ficam escondidos
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tabpanel", { name: /EN/ })).toBeInTheDocument();
  });
});

// ---- Adicionar e editar uma versão ------------------------------------------------------------------
describe("ProposalTemplateEditor — editar uma versão", () => {
  it("adicionar inglês com cópia, traduzir o rodapé e guardar: grava design_settings.versions.en e o português fica igual", async () => {
    await abrir();
    await adicionarIngles(true);
    abaTexto("Conteúdo");
    fireEvent.change(screen.getByLabelText("Texto do rodapé"), { target: { value: "English footer" } });
    await guardar();

    const [g] = gravacoes();
    const payload = g.payload!;
    const design = payload.design_settings as { versions: { en: Record<string, unknown> } } & Record<string, unknown>;
    expect(design.versions.en.footer_text).toBe("English footer");
    expect(design.versions.en.terms_conditions).toBe("Termos em português"); // cópia do português
    expect(typeof design.versions.en.base_hash).toBe("string");
    // o português não mudou
    expect(payload.footer_text).toBe("Rodapé em português");
    expect(payload.terms_conditions).toBe("Termos em português");
    expect(payload.sections).toEqual(SECCOES);
    // o resto do design_settings é o de sempre
    const { versions: _versions, ...resto } = design;
    expect(JSON.stringify(resto)).toBe(JSON.stringify(DESIGN_COMPLETO));
  });

  it("traduzir o título de uma secção grava a sobreposição por id e a pré-visualização segue", async () => {
    await abrir();
    await adicionarIngles(false);
    fireEvent.change(screen.getByLabelText("Cabeçalho · Título personalizado"), { target: { value: "PROPOSAL" } });
    expect(screen.getByText("PROPOSAL")).toBeInTheDocument();
    await guardar();
    const design = gravacoes()[0].payload!.design_settings as { versions: { en: { sections: unknown } } };
    expect(design.versions.en.sections).toEqual({ header: { customTitle: "PROPOSAL" } });
  });

  it("a lista de verificação diz o que falta e o aviso «o português mudou» aparece ao editar o português", async () => {
    await abrir();
    await adicionarIngles(false);
    expect(screen.getByText(/por traduzir/, { selector: "span.text-xs" })).toBeInTheDocument();
    expect(screen.queryByText(/O português mudou desde que esta versão/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^PT/ }));
    // o separador «Conteúdo» do português só tem um ícone: apanha-se pelo aria-controls do Radix
    fireEvent.mouseDown(document.querySelector('[role="tab"][aria-controls$="content-content"]')!, { button: 0 });
    fireEvent.change(screen.getByDisplayValue("Rodapé em português"), { target: { value: "Rodapé novo" } });
    fireEvent.click(screen.getByRole("tab", { name: /^EN/ }));
    expect(screen.getByText(/O português mudou desde que esta versão/)).toBeInTheDocument();
  });

  it("adicionar um idioma deixa o editor com alterações por guardar", async () => {
    await abrir();
    await adicionarIngles(true);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByText("Alterações por guardar")).toBeInTheDocument();
  });

  it("remover a única versão e guardar: a chave `versions` sai do design_settings", async () => {
    await abrir(linha({ ...DESIGN_COMPLETO, versions: { en: { footer_text: "x" } } }));
    fireEvent.click(screen.getAllByRole("tab")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Remover a versão English" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    await guardar();
    const design = gravacoes()[0].payload!.design_settings as Record<string, unknown>;
    expect("versions" in design).toBe(false);
    expect(JSON.stringify(design)).toBe(JSON.stringify(DESIGN_COMPLETO));
  });
});

// ---- Guarda de concorrência ---------------------------------------------------------------------------
describe("ProposalTemplateEditor — guarda de concorrência", () => {
  it("se mais ninguém tocou mas nenhuma linha foi atualizada: mantém a mensagem de sem permissão", async () => {
    const row = linha();
    responderCom(row, () => ({ data: [], error: null }));
    h.responder = ((anterior) => (p: Pedido) => (p.cols === "updated_at" ? { data: null, error: null } : anterior(p)))(h.responder);
    const onClose = vi.fn();
    render(<ProposalTemplateEditor templateId="tpl-1" onClose={onClose} />);
    await carregado();
    await guardar();
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao guardar", description: "Sem permissão para guardar este template" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("se outra pessoa guardou entretanto: avisa, não fecha e não perde o texto; a 2.ª gravação usa o updated_at novo", async () => {
    const row = linha();
    let tentativas = 0;
    const novo = "2026-11-10T09:30:00.000000+00:00";
    responderCom(row, () => {
      tentativas += 1;
      return tentativas === 1 ? { data: [], error: null } : { data: [{ id: row.id }], error: null };
    });
    const base = h.responder;
    h.responder = (p) => (p.table === "proposal_templates" && p.cols === "updated_at" ? { data: { updated_at: novo }, error: null } : base(p));
    const onClose = vi.fn();
    render(<ProposalTemplateEditor templateId="tpl-1" onClose={onClose} />);
    await carregado();

    fireEvent.change(screen.getByPlaceholderText("Nome do Template"), { target: { value: "Modelo nike (editado)" } });
    await guardar();

    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Template alterado por outra pessoa", variant: "destructive" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Modelo nike (editado)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Template alterado por outra pessoa");

    h.toast.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const segunda = gravacoes()[1];
    expect(segunda.filtros).toEqual([["id", "tpl-1"], ["updated_at", novo]]);
  });
});

// ---- Template novo --------------------------------------------------------------------------------------
describe("ProposalTemplateEditor — template novo", () => {
  it("sem versões não grava a chave `versions`; com versões grava-a (insert)", async () => {
    responderCom(linha(), undefined);
    h.responder = ((anterior) => (p: Pedido) => (p.op === "insert" ? { data: [{ id: "novo" }], error: null } : anterior(p)))(h.responder);
    const onClose = vi.fn();
    render(<ProposalTemplateEditor templateId={null} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("Nome do Template"), { target: { value: "Novo" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Guardar/ })).toBeEnabled());
    await adicionarIngles(false);
    await guardar();
    const insercao = h.pedidos.find((p) => p.op === "insert")!;
    const design = insercao.payload!.design_settings as { versions: Record<string, unknown> };
    expect(Object.keys(design.versions)).toEqual(["en"]);
  });
});
