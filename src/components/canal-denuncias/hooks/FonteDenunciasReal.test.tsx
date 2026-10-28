// Os ecrãs do canal ligados à fonte REAL, com a base e a Edge simuladas: a gestão, «As minhas», a página pública, o
// acompanhamento e o contador do menu. O que importa: com a base a falhar (hoje as RPCs e a Edge não existem) o ecrã di-lo e
// NUNCA mostra dados de exemplo; com a base a responder, mostra o que ela devolve; e as ações vão às RPCs certas.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { esquecerTodasAsSessoes } from "@/lib/denuncias/edgePublica";

const mocks = vi.hoisted(() => ({ hrRpc: vi.fn(), getSession: vi.fn(), captureFlowError: vi.fn() }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: mocks.hrRpc }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: mocks.captureFlowError }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike", name: "Nike" } }) }));
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike", name: "Nike" }, companies: [], isLoading: false, semOrganizacao: false }),
}));

import { FornecedorFonteDenunciasReal } from "./FonteDenunciasReal";
import { ContadorDenuncias } from "@/components/sidebar/ContadorDenuncias";
import { PaginaGestao } from "../gestao/PaginaGestao";
import { PaginaDenuncias } from "../minhaArea/PaginaDenuncias";
import AcompanharDenuncia from "@/pages/canal-denuncias/AcompanharDenuncia";
import NovaDenuncia from "@/pages/canal-denuncias/NovaDenuncia";

const ORG = "org-nike";
const fetchFalso = vi.fn();
let qc: QueryClient;

type Resposta = unknown | ((args: Record<string, unknown>) => unknown);
const erroRpc = (code: string) => ({ __erro: { code, message: "Texto interno da base", details: "dados do caso" } });

function base(respostas: Record<string, Resposta>): void {
  mocks.hrRpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (!(fn in respostas)) return Promise.resolve({ data: null, error: { code: "42883", message: "function does not exist" } });
    const r = respostas[fn];
    const v = typeof r === "function" ? (r as (a: Record<string, unknown>) => unknown)(args) : r;
    if (v && typeof v === "object" && "__erro" in (v as object)) return Promise.resolve({ data: null, error: (v as { __erro: unknown }).__erro });
    return Promise.resolve({ data: v, error: null });
  });
}

/** A Edge simulada: responde por `action` (o contrato da Edge); sem resposta definida, falha como indisponível. */
function edge(rotas: Record<string, { estado: number; corpo: unknown }>): void {
  fetchFalso.mockImplementation((_url: string, init: { body: string }) => {
    const r = rotas[(JSON.parse(init.body) as { action: string }).action] ?? { estado: 500, corpo: { error: "indisponivel" } };
    return Promise.resolve({ ok: r.estado < 300, status: r.estado, json: () => Promise.resolve(r.corpo) });
  });
}

const pedidosEdge = (accao: string) =>
  fetchFalso.mock.calls.filter((c) => (JSON.parse(c[1].body) as { action: string }).action === accao);

const montar = (ui: JSX.Element, endereco = "/") =>
  render(
    <LanguageProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[endereco]}>
          <FornecedorFonteDenunciasReal>{ui}</FornecedorFonteDenunciasReal>
        </MemoryRouter>
      </QueryClientProvider>
    </LanguageProvider>,
  );

const clicar = async (nome: RegExp | string) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: nome })); });
};
const escrever = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, codigo: `DEN-2026-00${id}`, tipo: "fraude", resumo: `Resumo do caso ${id}`, estado: "recebida", gravidade: "media", anonima: true,
  responsavel_id: null, recebida_em: "2026-10-15T09:30:00Z", confirmada_em: null, ...extra,
});
const aberta = (id: string, extra: Record<string, unknown> = {}) => ({
  ...linha(id), descricao: `Descrição completa do caso ${id}, com mais de trinta caracteres.`, quando: "Em Setembro", ainda_acontece: "sim",
  onde: null, envolvidos: null, testemunhas: "nao_sei", ja_reportado: null, avaliacao_inicial: null, resultado: null, medidas: null,
  fundamentacao: null, decidida_em: null, motivo_arquivo: null, mensagens: [], notas: [], eventos: [], anexos: [], impedidos: [], ...extra,
});
const RESPONSAVEIS = { eu: "u1", responsaveis: [{ id: "u1", nome: "Helena Matos" }, { id: "u2", nome: "Rui Barbosa" }] };

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.hrRpc.mockReset();
  mocks.getSession.mockReset();
  mocks.captureFlowError.mockReset();
  fetchFalso.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
  vi.stubGlobal("fetch", fetchFalso);
  esquecerTodasAsSessoes();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("gestão com a base a falhar (as RPCs ainda não existem)", () => {
  it("di-lo com «Tentar de novo» e NÃO mostra nenhuma denúncia de exemplo nem «sem denúncias»", async () => {
    base({});
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar as denúncias. Isto não quer dizer que não haja nenhuma.");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/DEN-2026-00(3|4)\d/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhuma denúncia corresponde a estes filtros.")).not.toBeInTheDocument();
  });

  it("«Tentar de novo» volta a ler e, se a base já responde, mostra a lista", async () => {
    base({});
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    await screen.findByRole("alert");
    base({ rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17") });
    await clicar("Tentar de novo");
    expect(await screen.findByText("DEN-2026-001")).toBeInTheDocument();
  });
});

describe("gestão com a base a responder", () => {
  const mostrarGestao = async () => {
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    await screen.findByText("DEN-2026-001");
  };

  it("mostra só o que a base devolve, com o nome do responsável, e os totais", async () => {
    base({
      rpc_denuncias_listar: [linha("1"), linha("2", { estado: "em_analise", confirmada_em: "2026-10-16T09:00:00Z", responsavel_id: "u2", anonima: false })],
      rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
    });
    await mostrarGestao();
    const linhas = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);
    expect(within(linhas.find((l) => within(l).queryByText("DEN-2026-002"))!).getByText("Rui Barbosa")).toBeInTheDocument();
    expect(screen.queryByText("DEN-2026-0041")).not.toBeInTheDocument();
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_listar", { p_organization_id: ORG });
  });

  it("quem não pode configurar não vê o ecrã de configuração; quem pode vê-o, com o aviso de casos sem quem os trate", async () => {
    base({ rpc_denuncias_listar: [], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17") });
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    await screen.findByText("Nenhuma denúncia corresponde a estes filtros.");
    expect(screen.queryByText("Configurar o canal")).not.toBeInTheDocument();
    cleanup();
    base({
      rpc_denuncias_listar: [], rpc_denuncias_responsaveis: RESPONSAVEIS,
      rpc_denuncias_canal_ler: { ativo: true, slug_publico: "nike-canal", responsaveis: [{ id: "u1", nome: "Helena Matos" }], candidatos: [{ id: "u9", nome: "Ana Dias" }], sem_quem_trate: 2 },
      rpc_denuncias_responsavel_designar: null,
    });
    qc.clear();
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    expect(await screen.findByText("Configurar o canal")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("2 caso(s) sem ninguém que os possa tratar");
    fireEvent.change(screen.getByLabelText("Escolher pessoa a designar"), { target: { value: "u9" } });
    await clicar("Designar");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_responsavel_designar", { p_organization_id: ORG, p_user: "u9" });
  });

  it("abrir um caso mostra a descrição que só a RPC de abrir traz e confirmar a receção chama a RPC", async () => {
    base({
      rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: aberta("1"), rpc_denuncia_confirmar_rececao: aberta("1", { estado: "em_analise" }),
    });
    await mostrarGestao();
    await clicar("Abrir denúncia DEN-2026-001");
    const painel = await screen.findByRole("dialog");
    expect(await within(painel).findByText(/Descrição completa do caso 1/)).toBeInTheDocument();
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_abrir", { p_organization_id: ORG, p_denuncia_id: "1" });
    base({
      rpc_denuncias_listar: [linha("1", { estado: "em_analise", confirmada_em: "2026-10-16T09:00:00Z" })], rpc_denuncias_responsaveis: RESPONSAVEIS,
      rpc_denuncia_abrir: aberta("1", { estado: "em_analise" }), rpc_denuncia_confirmar_rececao: aberta("1", { estado: "em_analise" }),
      rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
    });
    await clicar("Confirmar receção");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_confirmar_rececao", { p_organization_id: ORG, p_denuncia_id: "1" });
    await waitFor(() => expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Confirmar receção" })).not.toBeInTheDocument());
  });

  it("uma recusa da base (HRD01) aparece como mensagem visível no painel", async () => {
    base({
      rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: aberta("1"), rpc_denuncia_confirmar_rececao: () => erroRpc("HRD01"),
    });
    await mostrarGestao();
    await clicar("Abrir denúncia DEN-2026-001");
    await screen.findByText(/Descrição completa do caso 1/);
    await clicar("Confirmar receção");
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Esta ação não é possível no estado atual da denúncia.");
    expect(mocks.captureFlowError).not.toHaveBeenCalled();
  });

  it("se o caso já não está disponível (HRD09) o painel di-lo, sem mostrar mais nada", async () => {
    base({
      rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: () => erroRpc("HRD09"),
    });
    await mostrarGestao();
    await clicar("Abrir denúncia DEN-2026-001");
    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toBeInTheDocument();
  });

  it("«Ver identidade» pede o motivo, envia-o à RPC e só então mostra o nome; sem motivo a base recusa e nada aparece", async () => {
    base({
      rpc_denuncias_listar: [linha("5", { anonima: false })], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: aberta("5", { anonima: false }),
      rpc_denuncia_identidade_ver: (a: Record<string, unknown>) =>
        String(a.p_motivo).trim().length < 3
          ? erroRpc("HRD12")
          : { nome: "Inês Cardoso", email: "ines@exemplo.pt", telefone: null, pode_contactar: true, so_responsavel: true },
    });
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    await screen.findByText("DEN-2026-005");
    await clicar("Abrir denúncia DEN-2026-005");
    await screen.findByText(/Descrição completa do caso 5/);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Inês Cardoso");
    await clicar("Ver identidade");
    const dialogo = screen.getByRole("dialog", { name: "Ver a identidade" });
    await clicar("Ver e registar");
    expect(within(dialogo).getByText("Indica o motivo (pelo menos 3 caracteres) para ver a identidade.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Inês Cardoso");
    fireEvent.change(within(dialogo).getByLabelText(/^Motivo/), { target: { value: "Preciso de a contactar" } });
    await clicar("Ver e registar");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_identidade_ver", { p_organization_id: ORG, p_denuncia_id: "5", p_motivo: "Preciso de a contactar" });
    expect(await screen.findByText("Inês Cardoso")).toBeInTheDocument();
  });

  it("uma denúncia anónima não tem botão de ver identidade", async () => {
    base({
      rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: aberta("1"),
    });
    await mostrarGestao();
    await clicar("Abrir denúncia DEN-2026-001");
    await screen.findByText(/Descrição completa do caso 1/);
    expect(screen.queryByRole("button", { name: "Ver identidade" })).not.toBeInTheDocument();
  });

  it("só se pode declarar o próprio conflito; «Marcar como visado» regista outra pessoa; «Enviar» fica desativado em «recebida» com a razão escrita", async () => {
    base({
      rpc_denuncias_listar: [linha("1")], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: () => erroRpc("HRD17"),
      rpc_denuncia_abrir: aberta("1"), rpc_denuncia_impedir: aberta("1"),
    });
    await mostrarGestao();
    await clicar("Abrir denúncia DEN-2026-001");
    await screen.findByText(/Descrição completa do caso 1/);
    const conflito = screen.getByLabelText("Pessoa em conflito");
    const opcoes = within(conflito).getAllByRole("option") as HTMLOptionElement[];
    expect(opcoes.filter((o) => o.value !== "").map((o) => o.textContent)).toEqual(["Helena Matos"]);
    fireEvent.change(conflito, { target: { value: "u1" } });
    await clicar("Declarar conflito");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_impedir", { p_organization_id: ORG, p_denuncia_id: "1", p_user: "u1", p_motivo: "conflito" });
    fireEvent.change(screen.getByLabelText("Responsável visado"), { target: { value: "u2" } });
    await clicar("Marcar como visado");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_impedir", { p_organization_id: ORG, p_denuncia_id: "1", p_user: "u2", p_motivo: "visado" });
    fireEvent.mouseDown(within(screen.getByRole("dialog")).getByRole("tab", { name: /Conversa/ }));
    expect(screen.getByRole("button", { name: "Enviar mensagem" })).toBeDisabled();
    expect(screen.getByText(/Confirma a receção/)).toBeInTheDocument();
  });
});

describe("configurar o canal", () => {
  const config = { ativo: false, slug_publico: "", responsaveis: [], candidatos: [], sem_quem_trate: 0 };

  it("um endereço inválido não chega à base; um válido guarda; um já usado diz-se", async () => {
    base({ rpc_denuncias_listar: [], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: config, rpc_denuncias_canal_guardar: null });
    montar(<PaginaGestao organizacaoId={ORG} organizacaoNome="Nike" />);
    await screen.findByText("Configurar o canal");
    expect(screen.getByText("Ainda não há responsáveis: sem eles ninguém consegue tratar denúncias.")).toBeInTheDocument();
    escrever("Endereço público do canal", "AB");
    await clicar("Guardar canal");
    expect(screen.getByText("Usa entre 4 e 40 letras minúsculas, números ou hífenes.")).toBeInTheDocument();
    expect(mocks.hrRpc).not.toHaveBeenCalledWith("rpc_denuncias_canal_guardar", expect.anything());
    escrever("Endereço público do canal", "Nike-Canal");
    fireEvent.click(screen.getByRole("checkbox", { name: "Canal ligado (aceita denúncias)" }));
    await clicar("Guardar canal");
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_canal_guardar", { p_organization_id: ORG, p_ativo: true, p_slug: "nike-canal" });
    expect(await screen.findByText("Canal guardado.")).toBeInTheDocument();
    base({ rpc_denuncias_listar: [], rpc_denuncias_responsaveis: RESPONSAVEIS, rpc_denuncias_canal_ler: config, rpc_denuncias_canal_guardar: () => erroRpc("HRD18") });
    await clicar("Guardar canal");
    expect(await screen.findByText("Esse endereço já está em uso por outra organização. Escolhe outro.")).toBeInTheDocument();
  });
});

describe("contador do menu", () => {
  it("mostra «n por confirmar» a partir da RPC", async () => {
    base({ rpc_denuncias_por_confirmar: 3 });
    montar(<ContadorDenuncias />);
    expect(await screen.findByText("3 por confirmar")).toBeInTheDocument();
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncias_por_confirmar", { p_organization_id: ORG });
  });

  it("se a RPC falha, não inventa «0»: não desenha nada e reporta só a operação e o código", async () => {
    base({});
    const { container } = montar(<ContadorDenuncias />);
    await waitFor(() => expect(mocks.captureFlowError).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect((mocks.captureFlowError.mock.calls[0][0] as Error).message).toBe("denuncias:por_confirmar:42883");
  });
});

describe("A minha área: as identificadas", () => {
  const pessoa = { id: "p1", nome: "Sofia Rebelo", email: "sofia@exemplo.pt" };
  const minhas = [{ id: "m1", codigo: "DEN-2026-0031", resumo: "O meu caso", estado: "em_analise", anonima: false, recebida_em: "2026-10-01T10:00:00Z", confirmada_em: "2026-10-02T10:00:00Z", resultado: null, medidas: null, motivo_arquivo: null, mensagens: [{ id: "x1", autor: "canal", texto: "Recebemos a tua denúncia.", criada_em: "2026-10-02T10:00:00Z" }] }];

  it("com a base a falhar di-lo e não mostra «ainda não tens denúncias»", async () => {
    base({});
    montar(<PaginaDenuncias organizacaoId={ORG} organizacaoNome="Nike" pessoa={pessoa} />);
    expect(await screen.findByText("Não foi possível carregar as denúncias. Isto não quer dizer que não haja nenhuma.")).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não fizeste/i)).not.toBeInTheDocument();
  });

  it("lista as da base, abre o painel com a conversa e responde pela RPC", async () => {
    base({ rpc_denuncias_minhas: minhas, rpc_denuncia_minha_responder: null });
    montar(<PaginaDenuncias organizacaoId={ORG} organizacaoNome="Nike" pessoa={pessoa} />);
    await screen.findByRole("button", { name: "Abrir denúncia DEN-2026-0031" });
    await clicar("Abrir denúncia DEN-2026-0031");
    const painel = await screen.findByRole("dialog");
    expect(await within(painel).findByText("Recebemos a tua denúncia.")).toBeInTheDocument();
    fireEvent.change(within(painel).getByLabelText("A tua resposta"), { target: { value: "Obrigada." } });
    await act(async () => { fireEvent.click(within(painel).getByRole("button", { name: "Enviar resposta" })); });
    expect(mocks.hrRpc).toHaveBeenCalledWith("rpc_denuncia_minha_responder", { p_organization_id: ORG, p_denuncia_id: "m1", p_texto: "Obrigada." });
    expect(within(painel).queryByText(/Escolher ficheiros|Adicionar ficheiros/)).not.toBeInTheDocument();
  });
});

describe("página pública: denunciar", () => {
  const ABERTO = { canal: { estado: 200, corpo: { ativo: true, nome_org: "Casa Aurora" } } };

  it("sem ?org= diz «canal indisponível» e não cai na organização ativa nem pergunta nada à Edge", async () => {
    montar(<NovaDenuncia />, "/canal-denuncias/nova");
    expect(await screen.findByRole("status")).toHaveTextContent("Canal indisponível");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("um canal desligado ou desconhecido diz o mesmo", async () => {
    edge({ canal: { estado: 200, corpo: { ativo: false } } });
    montar(<NovaDenuncia />, "/canal-denuncias/nova?org=desligado");
    expect(await screen.findByText("Canal indisponível")).toBeInTheDocument();
    cleanup();
    qc.clear();
    edge({ canal: { estado: 404, corpo: { error: "canal_inativo" } } });
    montar(<NovaDenuncia />, "/canal-denuncias/nova?org=desconhecido");
    expect(await screen.findByText("Canal indisponível")).toBeInTheDocument();
  });

  it("com a Edge a falhar não diz «indisponível» (que pareceria definitivo): diz que houve um problema", async () => {
    edge({});
    montar(<NovaDenuncia />, "/canal-denuncias/nova?org=casa-aurora");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir o canal");
  });

  async function preencherEEnviarAnonima(): Promise<void> {
    await screen.findByLabelText("Denúncia", { exact: false }).catch(() => undefined);
    fireEvent.click(await screen.findByRole("radio", { name: /Quero denunciar de forma anónima/ }));
    await clicar("Continuar");
    escrever(/Tipo de denúncia/, "fraude");
    escrever(/Descreve o que aconteceu/, "Há despesas lançadas duas vezes com a mesma fatura no departamento comercial.");
    escrever(/Quando aconteceu/, "Em Setembro");
    await clicar("Continuar");
    await clicar("Continuar");
    await clicar("Continuar");
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");
  }

  it("anónima: o código e o PIN vêm da Edge, o pedido não leva JWT nem identidade e as provas dizem que não se anexa nesta fase", async () => {
    edge({ ...ABERTO, criar: { estado: 200, corpo: { codigo: "DEN-2026-0050", pin: "482913" } } });
    montar(<NovaDenuncia />, "/canal-denuncias/nova?org=casa-aurora");
    await screen.findByText("Casa Aurora");
    fireEvent.click(await screen.findByRole("radio", { name: /Quero denunciar de forma anónima/ }));
    await clicar("Continuar");
    escrever(/Tipo de denúncia/, "fraude");
    escrever(/Descreve o que aconteceu/, "Há despesas lançadas duas vezes com a mesma fatura no departamento comercial.");
    escrever(/Quando aconteceu/, "Em Setembro");
    await clicar("Continuar");
    await clicar("Continuar");
    expect(screen.getByText(/Nesta fase não é possível anexar ficheiros/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await clicar("Continuar");
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");
    expect(await screen.findByText("DEN-2026-0050")).toBeInTheDocument();
    expect(screen.getByText("482913")).toBeInTheDocument();
    const [pedido] = pedidosEdge("criar");
    expect(pedido[1].headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(pedido[1].body)).toMatchObject({ slug: "casa-aurora", modo: "anonima", tipo: "fraude" });
    expect(JSON.parse(pedido[1].body)).not.toHaveProperty("identidade");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("se a Edge falha ao criar, diz porquê, não mostra código nem PIN e o formulário fica como estava", async () => {
    edge({ ...ABERTO, criar: { estado: 500, corpo: { error: "indisponivel" } } });
    montar(<NovaDenuncia />, "/canal-denuncias/nova?org=casa-aurora");
    await screen.findByText("Casa Aurora");
    await preencherEEnviarAnonima();
    expect(await screen.findByText(/A denúncia não foi enviada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar denúncia" })).toBeEnabled();
    expect(screen.queryByText(/Código de acompanhamento/)).not.toBeInTheDocument();
  });
});

describe("página pública: acompanhar", () => {
  const vista = { codigo: "DEN-2026-0039", estado: "em_analise", anonima: true, recebida_em: "2026-09-21T10:00:00Z", confirmada_em: "2026-09-23T10:00:00Z", resultado: null, medidas: null, motivo_arquivo: null, mensagens: [{ id: "m1", autor: "canal", texto: "Podemos falar sobre o caso?", criada_em: "2026-09-24T10:00:00Z" }] };

  async function entrar(codigo: string, pin: string): Promise<void> {
    escrever(/Código de acompanhamento/, codigo);
    escrever("PIN", pin);
    await clicar("Ver o estado");
  }

  it("código e PIN certos: abre a vista; errados: a mesma mensagem genérica; Edge em baixo: diz que não conseguiu verificar", async () => {
    edge({ canal: { estado: 200, corpo: { ativo: true, nome_org: "Casa Aurora" } }, entrar: { estado: 401, corpo: { error: "codigo_ou_pin_invalido" } } });
    montar(<AcompanharDenuncia />, "/canal-denuncias/acompanhar?org=casa-aurora");
    await screen.findByText("Casa Aurora");
    await entrar("DEN-2026-0039", "000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não encontrámos nenhuma denúncia com estes dados");
    edge({ canal: { estado: 200, corpo: { ativo: true, nome_org: "Casa Aurora" } }, entrar: { estado: 500, corpo: { error: "indisponivel" } } });
    await clicar("Ver o estado");
    expect(await screen.findByText(/Não foi possível verificar agora/)).toBeInTheDocument();
    edge({ canal: { estado: 200, corpo: { ativo: true, nome_org: "Casa Aurora" } }, entrar: { estado: 200, corpo: { sessao: "sessao-1" } }, ler: { estado: 200, corpo: { ok: true, denuncia: vista } } });
    escrever("PIN", "205861");
    await clicar("Ver o estado");
    expect(await screen.findByRole("heading", { name: "Denúncia DEN-2026-0039" })).toBeInTheDocument();
    expect(screen.getByText("Podemos falar sobre o caso?")).toBeInTheDocument();
    expect(screen.queryByText(/Gravidade/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("responder usa a sessão da Edge e mostra a mensagem; «Sair» volta ao formulário", async () => {
    edge({
      canal: { estado: 200, corpo: { ativo: true, nome_org: "Casa Aurora" } }, entrar: { estado: 200, corpo: { sessao: "sessao-1" } },
      ler: { estado: 200, corpo: { ok: true, denuncia: vista } },
      responder: { estado: 200, corpo: { ok: true, denuncia: { ...vista, mensagens: [...vista.mensagens, { id: "m2", autor: "denunciante", texto: "Sim, quando quiserem.", criada_em: "2026-09-25T10:00:00Z" }] } } },
    });
    montar(<AcompanharDenuncia />, "/canal-denuncias/acompanhar?org=casa-aurora");
    await screen.findByText("Casa Aurora");
    await entrar("DEN-2026-0039", "205861");
    await screen.findByRole("heading", { name: "Denúncia DEN-2026-0039" });
    escrever(/A tua resposta/, "Sim, quando quiserem.");
    await clicar("Enviar resposta");
    expect(await screen.findByText("Sim, quando quiserem.")).toBeInTheDocument();
    const [pedido] = pedidosEdge("responder");
    expect(pedido[1].headers["x-denuncia-sessao"]).toBe("sessao-1");
    await clicar("Sair");
    expect(screen.getByRole("form", { name: /Acompanhar/ })).toBeInTheDocument();
  });

  it("sem ?org= é «canal indisponível»", async () => {
    montar(<AcompanharDenuncia />, "/canal-denuncias/acompanhar");
    expect(await screen.findByText("Canal indisponível")).toBeInTheDocument();
  });
});
