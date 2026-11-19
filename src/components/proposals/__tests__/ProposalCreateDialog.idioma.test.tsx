// ProposalCreateDialog: escolha do idioma do documento ao criar/editar uma proposta.
//  - Sem escolha (template sem versões, ou só português): o payload das RPCs é EXATAMENTE o de hoje (nenhum campo
//    novo) e não há nenhum update a `proposals`: language fica nulo.
//  - Com inglês ou «os dois»: as RPCs continuam sem `language` (não têm esse parâmetro); grava-se num update
//    separado a seguir, tolerante a falha (a proposta existe sempre). No caminho de insert direto («Criar
//    orçamento aqui») a coluna vai no próprio insert.
// Tudo simulado (Supabase, hooks, subcomponentes pesados): nada vai à rede nem à base.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { createContext, useContext } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  eventos: [] as string[],
  rpcs: [] as Array<{ nome: string; args: any }>,
  escritas: [] as Array<{ tabela: string; op: string; valores: any; filtros: Array<[string, unknown]> }>,
  selects: [] as Array<{ tabela: string; colunas: string }>,
  estado: { erroUpdateProposals: null as { message: string } | null, propostaEdicao: null as any },
  toast: vi.fn(),
  onSaved: vi.fn(),
  navigate: vi.fn(),
}));

const ESTAGIO = { id: "s1", name: "draft", label: "Rascunho", color: "#999999", stage_order: 1, is_active: true, organization_id: "org-nike" };
const T_SIMPLES = { id: "t0", name: "Modelo simples", is_default: false, design_settings: { primary: "#111" } };
const T_BILINGUE = { id: "t1", name: "Modelo bilingue", is_default: false, design_settings: { versions: { en: { footer_text: "Footer" } } } };
const TEMPLATES = [T_SIMPLES, T_BILINGUE];

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const e: any = { tabela, op: "select", colunas: "", valores: undefined, filtros: [] as Array<[string, unknown]> };
    const b: any = {};
    const resolver = (um: boolean) => {
      if (tabela === "proposal_workflow_stages") return { data: [ESTAGIO], error: null };
      if (tabela === "proposal_templates") {
        const completa = (t: any) => (e.colunas.includes("*") || e.colunas === "" ? t : Object.fromEntries(Object.entries(t).filter(([k]) => e.colunas.split(",").map((c: string) => c.trim()).includes(k))));
        if (um) {
          const id = e.filtros.find(([c]: [string, unknown]) => c === "id")?.[1];
          return { data: TEMPLATES.find((t) => t.id === id) ?? null, error: null };
        }
        return { data: TEMPLATES.map(completa), error: null };
      }
      if (tabela === "proposals") {
        if (e.op === "insert") return { data: { id: "novo-direto" }, error: null };
        if (e.op === "update") return { data: null, error: h.estado.erroUpdateProposals };
        return { data: um ? h.estado.propostaEdicao : [], error: null };
      }
      return { data: um ? null : [], error: null };
    };
    b.select = (c: string) => { e.colunas = c; h.selects.push({ tabela, colunas: c }); return b; };
    b.insert = (v: unknown) => { e.op = "insert"; e.valores = v; h.escritas.push(e); h.eventos.push(`insert:${tabela}`); return b; };
    b.update = (v: unknown) => { e.op = "update"; e.valores = v; h.escritas.push(e); h.eventos.push(`update:${tabela}`); return b; };
    for (const m of ["eq", "neq", "in", "is", "or", "not"]) b[m] = (c: string, v: unknown) => { e.filtros.push([c, v]); return b; };
    for (const m of ["order", "limit"]) b[m] = () => b;
    b.single = () => Promise.resolve(resolver(true));
    b.maybeSingle = () => Promise.resolve(resolver(true));
    b.then = (ok: any, err: any) => Promise.resolve(resolver(false)).then(ok, err);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => construtor(t),
      rpc: (nome: string, args: any) => {
        h.rpcs.push({ nome, args });
        h.eventos.push(`rpc:${nome}`);
        if (nome === "rpc_create_proposal") return Promise.resolve({ data: { id: "novo-rpc", entity_id: null }, error: null });
        return Promise.resolve({ data: nome === "rpc_update_proposal" ? { id: "p9", entity_id: null } : null, error: null });
      },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "auth-1" } } }) },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});
// Ramo RH: o dialogo tambem le a localizacao (voltar a ficha de Pessoas) e se pode abrir /quotes.
vi.mock("react-router-dom", () => ({ useNavigate: () => h.navigate, useLocation: () => ({ pathname: "/proposals", search: "", hash: "", state: null }) }));
vi.mock("@/hooks/usePodeAbrirDestino", () => ({ usePodeAbrirDestino: () => () => true }));
vi.mock("@/lib/clientSearch", () => ({ searchEntityIds: vi.fn(async () => ({ ids: [] })) }));
vi.mock("@/hooks/useScopedEntitySearch", () => {
  const vazio: unknown[] = [];
  const procurar = vi.fn();
  const resultado = { results: vazio, search: procurar };
  return { useScopedEntitySearch: () => resultado };
});
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: vi.fn(async () => "u1") }));
vi.mock("@/lib/notifications/resolveSendProposalAlerts", () => ({ resolveSendProposalAlerts: vi.fn(async () => {}) }));
vi.mock("@/lib/orgHierarchy", () => ({ resolveRootOrgIdLogic: vi.fn(async (id: string) => id) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/contexts/CompanyContext", () => {
  const valor = { activeCompany: { id: "org-nike" } };
  return { useCompany: () => valor };
});
vi.mock("@/hooks/usePermissions", () => {
  const valor = { isSystemAdmin: false };
  return { usePermissions: () => valor };
});
vi.mock("@/hooks/usePermissionScope", () => {
  const valor = { getPermissionScope: () => "all", anewUserId: "u1", teamMemberIds: [] };
  return { usePermissionScope: () => valor };
});
vi.mock("@/components/proposals/InlineQuoteBuilder", () => ({
  InlineQuoteBuilder: () => null,
  createEmptyInlineQuote: () => ({ tempId: "iq", lines: [] }),
  calcInlineQuoteTotal: () => 0,
}));
vi.mock("@/components/proposals/ProposalItemsEditor", () => ({ calculateProposalItemsTotal: () => 0 }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/pipeline/ProposalManualItemsEditor", () => ({ ProposalManualItemsEditor: () => null }));
vi.mock("@/components/common/MissingTemplateDialog", () => ({ MissingTemplateDialog: () => null }));
// O Select do Radix não é fiável em jsdom: cada opção passa a ser um botão.
vi.mock("@/components/ui/select", () => {
  const Ctx = createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: any) => <Ctx.Provider value={onValueChange}>{children}</Ctx.Provider>,
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const mudar = useContext(Ctx);
      return <button type="button" data-select-item={value} onClick={() => mudar(value)}>{children}</button>;
    },
  };
});

import { ProposalCreateDialog } from "../ProposalCreateDialog";

const PREFERENCIA_T1 = "olyvia:idioma-proposta:u1:t1";

function montar(props: Record<string, unknown> = {}) {
  return render(<ProposalCreateDialog open onOpenChange={() => {}} onSaved={h.onSaved} {...props} />);
}

async function aberto() {
  await waitFor(() => expect(document.querySelector("[data-select-item='t1']")).not.toBeNull());
}

async function escolherTemplate(nome: string) {
  await act(async () => { fireEvent.click(screen.getByText(nome)); });
}

async function preencherEEnviar() {
  const titulo = document.querySelector("#title") as HTMLInputElement;
  const valor = document.querySelector("#value") as HTMLInputElement;
  await act(async () => {
    fireEvent.change(titulo, { target: { value: "Remodelação cozinha" } });
    fireEvent.change(valor, { target: { value: "100" } });
  });
  const botao = screen.getByRole("button", { name: /proposals\.form\.(create|update)/ });
  await act(async () => { fireEvent.click(botao); });
}

const rpc = (nome: string) => h.rpcs.find((r) => r.nome === nome);
const atualizacoesDeProposals = () => h.escritas.filter((w) => w.tabela === "proposals" && w.op === "update");
const radio = (nome: string) => screen.getByRole("radio", { name: nome });

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  document.elementFromPoint = () => null;
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  window.localStorage.clear();
  h.eventos.length = 0;
  h.rpcs.length = 0;
  h.escritas.length = 0;
  h.selects.length = 0;
  h.estado.erroUpdateProposals = null;
  h.estado.propostaEdicao = null;
  h.toast.mockReset();
  h.onSaved.mockReset();
  h.navigate.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  window.localStorage.clear();
});

describe("ProposalCreateDialog: seletor de idioma", () => {
  it("a lista de templates pede design_settings (é de lá que vêm os idiomas)", async () => {
    montar();
    await aberto();
    const lista = h.selects.find((s) => s.tabela === "proposal_templates");
    expect(lista?.colunas).toContain("design_settings");
  });

  it("template sem versões: nenhum seletor", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo simples");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("template com inglês: seletor com os três botões, português por omissão", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    expect(screen.getByRole("radiogroup", { name: "contractTemplates.versoes.seletor.rotulo" })).toBeInTheDocument();
    expect(radio("Português").getAttribute("aria-checked")).toBe("true");
    expect(radio("English").getAttribute("aria-checked")).toBe("false");
    expect(radio("Português + English").getAttribute("aria-checked")).toBe("false");
  });

  it("pré-seleciona o último idioma usado por este utilizador com este template", async () => {
    window.localStorage.setItem(PREFERENCIA_T1, "en");
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await waitFor(() => expect(radio("English").getAttribute("aria-checked")).toBe("true"));
  });

  it("localStorage indisponível: abre em português e continua a funcionar", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("cheio"); });
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    expect(radio("Português").getAttribute("aria-checked")).toBe("true");
    await act(async () => { fireEvent.click(radio("English")); });
    expect(radio("English").getAttribute("aria-checked")).toBe("true");
  });
});

describe("ProposalCreateDialog: criar com português (igual a hoje)", () => {
  it("template sem versões: payload sem `language`, sem update a proposals", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo simples");
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("novo-rpc"));

    const dados = rpc("rpc_create_proposal")!.args.p_proposal_data;
    expect("language" in dados).toBe(false);
    expect(Object.keys(dados).sort()).toEqual([
      "deal_id", "description", "entity_id", "notes", "organization_id", "probability", "root_organization_id",
      "stage_id", "status", "template_id", "template_snapshot", "title", "valid_until", "value",
    ]);
    expect(atualizacoesDeProposals()).toHaveLength(0);
    expect(window.localStorage.getItem(PREFERENCIA_T1)).toBeNull();
  });

  it("template bilingue com português escolhido: o mesmo payload, e nenhum update", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("novo-rpc"));

    const dados = rpc("rpc_create_proposal")!.args.p_proposal_data;
    expect("language" in dados).toBe(false);
    expect(Object.keys(dados)).toHaveLength(14);
    expect(atualizacoesDeProposals()).toHaveLength(0);
  });

  it("os dois caminhos geram o mesmo payload com e sem seletor (mesmas chaves e valores, exceto template)", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo simples");
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledTimes(1));
    const simples = rpc("rpc_create_proposal")!.args.p_proposal_data;
    cleanup();
    h.rpcs.length = 0;
    h.onSaved.mockReset();

    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledTimes(1));
    const bilingue = rpc("rpc_create_proposal")!.args.p_proposal_data;

    const { template_id: _a, template_snapshot: _b, ...restoSimples } = simples;
    const { template_id: _c, template_snapshot: _d, ...restoBilingue } = bilingue;
    expect(restoBilingue).toEqual(restoSimples);
  });
});

describe("ProposalCreateDialog: criar com inglês ou com os dois", () => {
  it("«os dois»: RPC sem language, depois um update só com language='pt+en' na proposta criada", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await act(async () => { fireEvent.click(radio("Português + English")); });
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("novo-rpc"));

    expect("language" in rpc("rpc_create_proposal")!.args.p_proposal_data).toBe(false);
    const [upd, ...resto] = atualizacoesDeProposals();
    expect(resto).toHaveLength(0);
    expect(upd.valores).toEqual({ language: "pt+en" });
    expect(upd.filtros).toEqual([["id", "novo-rpc"]]);
    expect(h.eventos.indexOf("rpc:rpc_create_proposal")).toBeLessThan(h.eventos.indexOf("update:proposals"));
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "proposals.toast.createSuccess" }));
    await waitFor(() => expect(window.localStorage.getItem(PREFERENCIA_T1)).toBe("pt+en"));
  });

  it("só inglês: language='en'", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await act(async () => { fireEvent.click(radio("English")); });
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalled());
    expect(atualizacoesDeProposals().map((u) => u.valores)).toEqual([{ language: "en" }]);
  });

  it("o update falha: a proposta fica criada, avisa-se (sem erro vermelho de criação) e segue-se", async () => {
    h.estado.erroUpdateProposals = { message: "boom" };
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await act(async () => { fireEvent.click(radio("English")); });
    await preencherEEnviar();

    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("novo-rpc"));
    const avisos = h.toast.mock.calls.map(([t]) => t);
    expect(avisos.some((t: any) => t.title === "proposals.toast.createSuccess")).toBe(true);
    expect(avisos.some((t: any) => /seletor\.proposta\.falhou/.test(`${t.title} ${t.description}`))).toBe(true);
    expect(avisos.some((t: any) => t.title === "proposals.toast.createError")).toBe(false);
  });
});

describe("ProposalCreateDialog: «Criar orçamento aqui» (insert direto)", () => {
  async function criarOrcamentoAqui() {
    const titulo = document.querySelector("#title") as HTMLInputElement;
    await act(async () => { fireEvent.change(titulo, { target: { value: "Cozinha" } }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Criar orçamento aqui/ })); });
    await waitFor(() => expect(h.onSaved).toHaveBeenCalled());
  }

  it("português: o insert não leva `language`", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await criarOrcamentoAqui();
    const ins = h.escritas.find((w) => w.tabela === "proposals" && w.op === "insert")!;
    expect("language" in ins.valores).toBe(false);
    expect(atualizacoesDeProposals()).toHaveLength(0);
  });

  it("«os dois»: a coluna vai no próprio insert (atómico), sem update", async () => {
    montar();
    await aberto();
    await escolherTemplate("Modelo bilingue");
    await act(async () => { fireEvent.click(radio("Português + English")); });
    await criarOrcamentoAqui();
    const ins = h.escritas.find((w) => w.tabela === "proposals" && w.op === "insert")!;
    expect(ins.valores.language).toBe("pt+en");
    expect(atualizacoesDeProposals()).toHaveLength(0);
    expect(h.navigate).toHaveBeenCalledWith(expect.stringContaining("proposal_id=novo-direto"));
  });
});

describe("ProposalCreateDialog: editar", () => {
  const proposta = (language: string | null) => ({
    id: "p9", title: "Existente", description: "", value: 100, deal_id: null, valid_until: null, notes: "",
    stage_id: "s1", template_id: "t1", language, deals: null,
  });

  it("mostra o idioma gravado (não a preferência) e, sem lhe tocar, não escreve nada", async () => {
    window.localStorage.setItem(PREFERENCIA_T1, "pt");
    h.estado.propostaEdicao = proposta("en");
    montar({ editingId: "p9" });
    await waitFor(() => expect(radio("English").getAttribute("aria-checked")).toBe("true"));
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("p9"));
    expect(rpc("rpc_update_proposal")).toBeDefined();
    expect("language" in rpc("rpc_update_proposal")!.args.p_proposal_data).toBe(false);
    expect(atualizacoesDeProposals()).toHaveLength(0);
  });

  it("proposta sem idioma gravado e preferência em inglês: abre em português e não escreve", async () => {
    window.localStorage.setItem(PREFERENCIA_T1, "en");
    h.estado.propostaEdicao = proposta(null);
    montar({ editingId: "p9" });
    await waitFor(() => expect(radio("Português").getAttribute("aria-checked")).toBe("true"));
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("p9"));
    expect(atualizacoesDeProposals()).toHaveLength(0);
  });

  it("mudar o idioma grava num update separado, depois da RPC", async () => {
    h.estado.propostaEdicao = proposta(null);
    montar({ editingId: "p9" });
    await waitFor(() => expect(radio("Português")).toBeInTheDocument());
    await act(async () => { fireEvent.click(radio("Português + English")); });
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("p9"));
    expect(atualizacoesDeProposals().map((u) => [u.valores, u.filtros])).toEqual([[{ language: "pt+en" }, [["id", "p9"]]]]);
    expect(h.eventos.indexOf("rpc:rpc_update_proposal")).toBeLessThan(h.eventos.indexOf("update:proposals"));
  });

  it("voltar ao português limpa a coluna (language = null)", async () => {
    h.estado.propostaEdicao = proposta("pt+en");
    montar({ editingId: "p9" });
    await waitFor(() => expect(radio("Português + English").getAttribute("aria-checked")).toBe("true"));
    await act(async () => { fireEvent.click(radio("Português")); });
    await preencherEEnviar();
    await waitFor(() => expect(h.onSaved).toHaveBeenCalledWith("p9"));
    expect(atualizacoesDeProposals().map((u) => u.valores)).toEqual([{ language: null }]);
  });
});
