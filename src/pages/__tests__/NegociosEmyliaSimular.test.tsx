// «Simular função» em /negocios: o ecrã responde, só no ecrã, como se quem entrou tivesse apenas as permissões da função escolhida.
// Os dados e as gravações seguem as permissões reais (nada disto toca na base).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
// 12/11: a página lê as visitas do negócio aberto com o React Query (useVisitasDoNegocio, eb14c0bd)
const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const comQuery = (ui: ReactNode) => <QueryClientProvider client={cliente}>{ui}</QueryClientProvider>;

const ORG = "11111111-1111-4111-a111-111111111111";
const ORG2 = "22222222-aaaa-4222-a222-222222222222";
const rpc = vi.fn();
const empresa = vi.hoisted(() => ({ id: "11111111-1111-4111-a111-111111111111" }));
const funcoesBase = vi.hoisted(() => ({
  roles: { data: [] as unknown, error: null as unknown },
  codigos: {} as Record<string, string[]>,
  espera: null as Promise<void> | null,
}));
// a conta REAL: o perfil (null: todas as permissões) e os papéis do RH; hasPermission e fn_cat_pode respondem por eles
const real = vi.hoisted(() => ({
  perfil: null as string[] | null,
  papeis: { papeis: [] as string[], pessoa: null as { id: string; nome: string } | null, todos: true },
  negocios: [] as unknown[],
}));
const hoje = vi.hoisted(() => ({ simples: null as Record<string, unknown> | null, tecnico: null as Record<string, unknown> | null }));
const perda = vi.hoisted(() => ({ atual: null as null | { perder: (d: unknown, fase: string, motivo: string) => void } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => {
      if (t === "anew_roles" || t === "anew_role_permissions") {
        const filtros: Record<string, unknown> = {};
        const q: Record<string, unknown> = {};
        for (const m of ["select", "order", "limit", "is"]) q[m] = () => q;
        q.eq = (c: string, v: unknown) => { filtros[c] = v; return q; };
        q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(t === "anew_roles" ? funcoesBase.roles
          : funcoesBase.espera ? funcoesBase.espera.then(() => ({ data: (funcoesBase.codigos[filtros.role_id as string] ?? []).map((permission_code) => ({ permission_code })), error: null }))
          : { data: (funcoesBase.codigos[filtros.role_id as string] ?? []).map((permission_code) => ({ permission_code })), error: null }).then(ok, ko);
        return q;
      }
      return t === "schedule_items"
        ? { select: () => { const q: Record<string, unknown> = {}; for (const m of ["eq", "neq", "not", "is", "gte"]) q[m] = () => q; q.lte = async () => ({ data: [], error: null }); return q; } }
        : { select: () => ({ eq: () => ({ single: async () => ({ data: { numero: 1201 }, error: null }), maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: empresa.id }, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => !real.perfil || real.perfil.includes(c), loading: false }) }));
vi.mock("@/emylia/HojeSimples", async (orig) => {
  const m = await orig<typeof import("@/emylia/HojeSimples")>();
  return { ...(m as object), HojeSimples: (p: Record<string, unknown>) => { hoje.simples = p; return <m.HojeSimples {...(p as unknown as import("react").ComponentProps<typeof m.HojeSimples>)} />; } };
});
vi.mock("@/emylia/HojeTecnico", async (orig) => {
  const m = await orig<typeof import("@/emylia/HojeTecnico")>();
  return { ...(m as object), HojeTecnico: (p: Record<string, unknown>) => { hoje.tecnico = p; return <m.HojeTecnico {...(p as unknown as import("react").ComponentProps<typeof m.HojeTecnico>)} />; } };
});
vi.mock("@/emylia/motor", async (orig) => {
  const m = await orig<typeof import("@/emylia/motor")>();
  return { ...m, definirPerdaReal: (x: typeof perda.atual) => { perda.atual = x; (m.definirPerdaReal as (y: unknown) => void)(x); } };
});
vi.mock("@/hooks/pessoas/novaLead/gravarNovaLead", () => ({ gravarNovaLead: vi.fn() }));
vi.mock("@/hooks/pessoas/novaLead/comerciaisNovaLead", () => ({ resolverOrgRaiz: async () => ORG, lerComerciais: async () => ({ users: [], tree: [] }) }));
vi.mock("@/hooks/useMinhaPessoa", () => ({ useMinhaPessoa: () => ({ pessoaId: null, nome: "Rúben Carvalho", cargo: null, dataAdmissao: null, loading: false, semFicha: true }) }));

import NegociosEmylia from "../NegociosEmylia";
import { comPermissoesReais, permEmFaltaDoPasso, soAteAoContacto } from "@/emylia/permissoes";

const CATALOGO = {
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  margemLinha: [], categorias: [], perfis: [], equipamentos: [], estrutura: [], servicos: [], precosServico: [], passos: [], usosEquip: [], usosCons: [],
  produtos: [], precosProduto: [], fornecedores: [], tecnicos: [],
};
const NEGOCIO = {
  negocio: { id: "22222222-2222-4222-a222-222222222222", entity_id: "33333333-3333-4333-a333-333333333333", estado_crm: "aberto", fluxo_emylia: true,
    numero: 1101, titulo: "Marta Lima", telefone: "916 004 552", fase: 0, linha: "wc", linha_por_definir: false, servico_pedido: "WC social",
    morada_obra: "Odivelas", origem: "site", pedido_em: "2026-10-20T10:00:00", dono_papel: "comercial", estado: "aberto", motivo_perda: null,
    anulado_em: null, anulado_por: null, anulado_motivo: null, anulado_origem: null, fatura_numero: null, fatura_em: null, fatura_paga: false, recibo_numero: null, recibo_em: null },
  respostas: [], visitas: [], medidas: { pav: 0, par: 0, pts: 0, pcs: 0, ptf: null, ptq: null, necessidades: [], slot: "", fotos_total: 0, fotos_exterior: null, fotos_interior: null, fotos_area: null, fechada: false },
  servicos: [], produtos: null, partes_fora: null, orcamentos: [], contratos: [], faturas: null, historico: [{ ordem: 0, texto: "Pedido pelo site", tipo: "a", ocorrido_em: "2026-10-20T10:00:00" }],
};
const NEGOCIO_COM_EC = { ...NEGOCIO, ec: { contract_id: "c1", order_number: "EC1", emitida_em: "2026-10-30T10:00:00" } };
const ASSISTENTE = ["negocios.contacto.registar", "pessoas.view", "pessoas.edit"];
const COMERCIAL = [...ASSISTENTE, "negocios.visita.gerir", "negocios.visita.preencher", "negocios.orcamento.editar", "negocios.proposta.enviar"];

const abrir = async () => {
  render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
  await waitFor(() => expect(screen.queryAllByText("Marta Lima").length).toBeGreaterThan(0), { timeout: 8000 });
  await screen.findByLabelText("Simular função");
};
const simular = async (nome: string) => {
  const sel = screen.getByLabelText("Simular função") as HTMLSelectElement;
  await waitFor(() => expect(sel.disabled).toBe(false), { timeout: 8000 });
  const op = [...sel.options].find((o) => o.textContent === nome)!;
  fireEvent.change(sel, { target: { value: op.value } });
};
const papeisDoAVerComo = () => [...(screen.getByLabelText("A ver como") as HTMLSelectElement).options].map((o) => o.textContent);

describe("Simular função (só no ecrã)", { timeout: 20000 }, () => {
  beforeEach(() => {
    rpc.mockReset(); empresa.id = ORG; real.perfil = null; real.papeis = { papeis: [], pessoa: null, todos: true }; real.negocios = [NEGOCIO];
    funcoesBase.espera = null; hoje.simples = null; hoje.tecnico = null; perda.atual = null;
    funcoesBase.roles = { data: [{ id: "r1", code: "assistente", name: "Assistente comercial" }, { id: "r2", code: "comercial", name: "Comercial" }], error: null };
    funcoesBase.codigos = { r1: ASSISTENTE, r2: COMERCIAL };
    rpc.mockImplementation(async (fn: string, a?: unknown) => {
      if (fn === "neg_meus_papeis") return { data: real.papeis, error: null };
      if (fn === "neg_historico_autores" || fn === "neg_rececoes_ler" || fn === "neg_respostas_ler" || fn === "neg_gestores_obra") return { data: [], error: null };
      if (fn === "cat_ler_catalogo") return { data: CATALOGO, error: null };
      if (fn === "neg_ler_negocios") return { data: real.negocios, error: null };
      if (fn === "obra_ler_negocios") return { data: [], error: null };
      if (fn === "neg_sugestoes_formulario") return { data: null, error: { code: "PGRST202" } };
      if (fn === "rh_agenda_tecnicos") return { data: [], error: null };
      if (fn === "neg_guardar_negocio") return { data: { negocio_id: "x" }, error: null };
      if (fn === "fn_cat_pode") return { data: !real.perfil || real.perfil.includes((a as { p_perm: string }).p_perm), error: null };
      return { data: null, error: { message: "inesperado: " + fn } };
    });
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
  });

  it("oferece «A minha (real)» e as funções da organização, e sem simular não há faixa", async () => {
    await abrir();
    const sel = screen.getByLabelText("Simular função") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["A minha (real)", "Assistente comercial", "Comercial"]);
    expect(sel.value).toBe("");
    expect(screen.queryByText(/A simular a função/)).toBeNull();
    expect(screen.getByRole("button", { name: "Operações" })).toBeTruthy();
  });

  it("a assistente (só até ao Contacto): faixa com texto e aviso, soAteAoContacto, sem Operações, passos seguintes desligados, papéis do «A ver como» pelas permissões", async () => {
    await abrir();
    expect(soAteAoContacto()).toBe(false);
    await simular("Assistente comercial");
    const faixa = await screen.findByText(/A simular a função Assistente comercial\./);
    expect(faixa.closest("[role=status]")).toBeTruthy();
    expect(faixa.textContent).toContain("Só muda o que vê");
    expect(faixa.textContent).toContain("seguem as suas permissões reais");
    expect(screen.getByRole("button", { name: "Voltar à minha" })).toBeTruthy();
    expect(soAteAoContacto()).toBe(true);
    expect(permEmFaltaDoPasso({ role: "comercial" }, "marcarVisita")).toBe("visita.gerir");
    expect(permEmFaltaDoPasso({ role: "comercial" }, "contactar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Operações" })).toBeNull();
    expect(screen.getByRole("button", { name: "Negócios" })).toBeTruthy();
    await waitFor(() => expect(papeisDoAVerComo()).toEqual(["Comercial"]));
    expect((screen.getByLabelText("Simular função") as HTMLSelectElement).value).toBe("r1");
  });

  it("outra função muda os passos; repor volta ao real (papéis, vistas e passos)", async () => {
    await abrir();
    const papeisReais = papeisDoAVerComo();
    expect(papeisReais.length).toBeGreaterThan(1);
    await simular("Assistente comercial");
    await waitFor(() => expect(soAteAoContacto()).toBe(true));
    await simular("Comercial");
    await waitFor(() => expect(soAteAoContacto()).toBe(false));
    expect(screen.getByText(/A simular a função Comercial\./)).toBeTruthy();
    expect(permEmFaltaDoPasso({ role: "comercial" }, "marcarVisita")).toBeNull();
    expect(permEmFaltaDoPasso({ role: "comercial" }, "enviarContrato")).toBe("contrato.editar");

    fireEvent.click(screen.getByRole("button", { name: "Voltar à minha" }));
    await waitFor(() => expect(screen.queryByText(/A simular a função/)).toBeNull());
    expect(permEmFaltaDoPasso({ role: "comercial" }, "enviarContrato")).toBeNull();
    expect(screen.getByRole("button", { name: "Operações" })).toBeTruthy();
    expect(papeisDoAVerComo()).toEqual(papeisReais);
    expect((screen.getByLabelText("Simular função") as HTMLSelectElement).value).toBe("");
  });

  it("escolher «A minha (real)» no seletor também repõe", async () => {
    await abrir();
    await simular("Assistente comercial");
    await screen.findByText(/A simular a função/);
    await simular("A minha (real)");
    await waitFor(() => expect(screen.queryByText(/A simular a função/)).toBeNull());
    expect(soAteAoContacto()).toBe(false);
  });

  it("se a vista atual deixa de ser permitida, volta ao Hoje", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Operações" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Operações" }).getAttribute("aria-current")).toBe("page"));
    await simular("Assistente comercial");
    await waitFor(() => expect(screen.getByRole("button", { name: "Hoje" }).getAttribute("aria-current")).toBe("page"));
  });

  it("uma função sem nenhuma permissão não vale por «a minha»: nada de separadores de negócios e a faixa diz qual", async () => {
    funcoesBase.codigos = { r1: [], r2: COMERCIAL };
    await abrir();
    await simular("Assistente comercial");
    await screen.findByText(/A simular a função Assistente comercial\./);
    expect(screen.queryByRole("button", { name: "Negócios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Operações" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hoje" })).toBeTruthy();
  });

  it("uma função de técnico (negocios.obra.tecnico) abre como Técnico de obra", async () => {
    funcoesBase.roles = { data: [{ id: "r9", code: "tec", name: "Técnico" }], error: null };
    funcoesBase.codigos = { r9: ["negocios.obra.tecnico", "negocios.obra.executar"] };
    await abrir();
    await simular("Técnico");
    await waitFor(() => expect(papeisDoAVerComo()).toEqual(["Técnico de obra"]));
    expect((screen.getByLabelText("A ver como") as HTMLSelectElement).value).toBe("tecnico");
  });

  it("não grava nada nem lê mais nada na base ao simular e repor (só a lista de funções e os seus códigos)", async () => {
    await abrir();
    const antes = rpc.mock.calls.length;
    await simular("Comercial");
    await screen.findByText(/A simular a função Comercial\./);
    fireEvent.click(screen.getByRole("button", { name: "Voltar à minha" }));
    await waitFor(() => expect(screen.queryByText(/A simular a função/)).toBeNull());
    await new Promise((r) => setTimeout(r, 200));
    expect(rpc.mock.calls.slice(antes).filter(([fn]) => fn === "neg_guardar_negocio" || fn === "obra_guardar_negocio")).toEqual([]);
    expect(rpc.mock.calls.length).toBe(antes);
  });

  it("quando a organização muda, a simulação repõe-se", async () => {
    const { rerender } = render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await screen.findByLabelText("Simular função", undefined, { timeout: 8000 });
    await simular("Assistente comercial");
    await screen.findByText(/A simular a função/);
    empresa.id = ORG2;
    rerender(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await waitFor(() => expect(screen.queryByText(/A simular a função/)).toBeNull());
    expect(soAteAoContacto()).toBe(false);
  });

  it("ao sair da página tira as permissões postas no motor", async () => {
    const { unmount } = render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await screen.findByLabelText("Simular função", undefined, { timeout: 8000 });
    await simular("Assistente comercial");
    await screen.findByText(/A simular a função/);
    unmount();
    expect(comPermissoesReais()).toBe(false);
    expect(soAteAoContacto()).toBe(false);
  });

  it("se a lista de funções falhar: erro curto junto ao seletor e a página continua igual", async () => {
    funcoesBase.roles = { data: null, error: { message: "sem rede" } };
    render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await waitFor(() => expect(screen.queryAllByText("Marta Lima").length).toBeGreaterThan(0), { timeout: 8000 });
    const erro = await screen.findByText(/Não foi possível ler as funções/);
    expect(erro.textContent).toContain("sem rede");
    expect(screen.queryByLabelText("Simular função")).toBeNull();
    expect(screen.getByLabelText("A ver como")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Operações" })).toBeTruthy();
  });

  // ---- a conta real manda no que se lê e se grava; a simulação só desenha ----
  const lerEncomendas = () => rpc.mock.calls.filter(([fn]) => fn === "rpc_get_client_order_document").length;
  /** Faz a página reler os negócios e as encomendas (o caminho de carregarEncomendas depois de gravar): a perda vai à base (aqui recusada) e relê-se. */
  const reler = async () => {
    const antes = rpc.mock.calls.filter(([fn]) => fn === "neg_ler_negocios").length;
    await act(async () => { perda.atual!.perder({ id: 1101 }, "contacto", "teste"); });
    await waitFor(() => expect(rpc.mock.calls.filter(([fn]) => fn === "neg_ler_negocios").length).toBeGreaterThan(antes), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
  };

  it("admin a simular uma função sem client_orders.view: as encomendas continuam a ler-se pela conta real", async () => {
    real.negocios = [NEGOCIO_COM_EC];
    funcoesBase.roles = { data: [{ id: "r9", code: "tec", name: "Técnico" }], error: null };
    funcoesBase.codigos = { r9: ["negocios.obra.tecnico", "negocios.obra.executar"] };
    await abrir();
    await waitFor(() => expect(lerEncomendas()).toBeGreaterThan(0), { timeout: 8000 });
    await simular("Técnico");
    await waitFor(() => expect(papeisDoAVerComo()).toEqual(["Técnico de obra"]));
    const antes = lerEncomendas();
    await reler();
    expect(lerEncomendas()).toBeGreaterThan(antes);
  });

  it("conta real inferior (técnico, sem client_orders.view) a simular o Comercial: nunca lê encomendas que a conta não vê", async () => {
    real.perfil = ["negocios.obra.executar", "negocios.obra.materiais"];
    real.papeis = { papeis: ["tecnico"], pessoa: { id: "p3", nome: "Hugo Neves" }, todos: false };
    real.negocios = [NEGOCIO_COM_EC];
    funcoesBase.roles = { data: [{ id: "r2", code: "comercial", name: "Comercial" }], error: null };
    funcoesBase.codigos = { r2: [...COMERCIAL, "client_orders.view"] };
    render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await screen.findByLabelText("Simular função", undefined, { timeout: 8000 });
    expect(lerEncomendas()).toBe(0);
    await simular("Comercial");
    await screen.findByText(/A simular a função Comercial\./);
    await reler();
    expect(lerEncomendas()).toBe(0);
  });

  it("conta real só de execução a simular o Comercial: o ecrã continua com a leitura reduzida (os dados não vieram da base)", async () => {
    real.perfil = ["negocios.obra.executar", "negocios.obra.materiais"];
    real.papeis = { papeis: ["tecnico"], pessoa: { id: "p3", nome: "Hugo Neves" }, todos: false };
    funcoesBase.roles = { data: [{ id: "r2", code: "comercial", name: "Comercial" }], error: null };
    funcoesBase.codigos = { r2: COMERCIAL };
    render(comQuery(<MemoryRouter><NegociosEmylia /></MemoryRouter>));
    await screen.findByLabelText("Simular função", undefined, { timeout: 8000 });
    await waitFor(() => expect(hoje.tecnico?.leituraReduzida).toBe(true));
    await simular("Comercial");
    await waitFor(() => expect(hoje.simples).not.toBeNull());
    expect(hoje.simples!.leituraReduzida).toBe(true);
  });

  it("«Voltar à minha» repõe a escolha manual do «A ver como» (o valor selecionado) e o foco vai para o seletor", async () => {
    await abrir();
    const verComo = screen.getByLabelText("A ver como") as HTMLSelectElement;
    fireEvent.change(verComo, { target: { value: "financeiro" } });
    await waitFor(() => expect(verComo.value).toBe("financeiro"));
    await simular("Assistente comercial");
    await waitFor(() => expect(papeisDoAVerComo()).toEqual(["Comercial"]));
    // trocar de função não perde a escolha guardada
    await simular("Comercial");
    await waitFor(() => expect(screen.getByText(/A simular a função Comercial\./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Voltar à minha" }));
    await waitFor(() => expect(screen.queryByText(/A simular a função/)).toBeNull());
    expect((screen.getByLabelText("A ver como") as HTMLSelectElement).value).toBe("financeiro");
    expect(document.activeElement).toBe(screen.getByLabelText("Simular função"));
  });

  it("a faixa diz o que segue a conta real; o contentor role=status existe sempre e só se preenche ao simular", async () => {
    await abrir();
    const regiao = screen.getByRole("status", { name: "Simulação de função" });
    expect(regiao.textContent).toBe("");
    await simular("Comercial");
    await waitFor(() => expect(regiao.textContent).toContain("A simular a função Comercial."));
    expect(regiao.textContent).toContain("custos, retribuições e atribuição de comercial seguem a sua conta real");
    expect(screen.getByRole("status", { name: "Simulação de função" })).toBe(regiao);
  });

  it("enquanto lê a função o seletor não fica desativado (aria-busy) e ignora outra escolha", async () => {
    let soltar!: () => void;
    funcoesBase.espera = new Promise<void>((r) => { soltar = r; });
    await abrir();
    const sel = screen.getByLabelText("Simular função") as HTMLSelectElement;
    await waitFor(() => expect(sel.disabled).toBe(false), { timeout: 8000 });
    fireEvent.change(sel, { target: { value: "r1" } });
    await waitFor(() => expect(sel.getAttribute("aria-busy")).toBe("true"));
    expect(sel.disabled).toBe(false);
    fireEvent.change(sel, { target: { value: "r2" } });
    soltar();
    await screen.findByText(/A simular a função Assistente comercial\./);
    expect(sel.getAttribute("aria-busy")).not.toBe("true");
  });
});
