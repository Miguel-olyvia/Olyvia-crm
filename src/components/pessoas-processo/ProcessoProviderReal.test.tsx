// O processo (orçamento, proposta e contrato) na ficha REAL: o botão do «A fazer» de um negócio abre o ecrã real da app que faz esse passo e
// liga o resultado ao negócio. Criar o orçamento e a proposta abre o editor e o diálogo que a app já tem; enviar e responder à proposta,
// criar o contrato e assiná-lo vão por ligação ao ecrã da app, com `?voltar=` para regressar à ficha; ganhar abre o diálogo de ganhar.
// Um passo que a ficha real ainda não sabe fazer (o levantamento é do P5) não oferece botão.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, LEAD_ID, negocioDb, PESSOA_ID, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { ContratoDb, FichaDb, NegocioFichaDb, OrcamentoDb, PropostaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useProcesso } from "@/components/pessoas/processo/processoContexto";
import type { ItemProcesso } from "@/components/pessoas/processo/tiposProcesso";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ProcessoProviderReal } from "./ProcessoProviderReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { navegar, construtor, dialogoProposta } = vi.hoisted(() => ({ navegar: vi.fn(), construtor: vi.fn(), dialogoProposta: vi.fn() }));
vi.mock("react-router-dom", async (importar) => ({ ...(await importar<typeof import("react-router-dom")>()), useNavigate: () => navegar }));
vi.mock("@/components/QuoteBuilder", () => ({ QuoteBuilder: (p: unknown) => { construtor(p); return <div data-testid="construtor" />; } }));
vi.mock("@/components/proposals/ProposalCreateDialog", () => ({ ProposalCreateDialog: (p: unknown) => { dialogoProposta(p); return null; } }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { navegar.mockReset(); construtor.mockReset(); dialogoProposta.mockReset(); });
afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };
const orc = (id: string, estado = "enviado"): OrcamentoDb => ({ id, numero: id, estado, total: 100, criado_em: "2026-10-11T09:00:00Z" });
const prop = (id: string, status: string): PropostaDb => ({
  id, numero: id, titulo: null, status, valor: 1, valid_until: null, terms: null, enviada_em: null, aceite_em: null, criado_em: "2026-10-12T09:00:00Z",
});
const con = (id: string, status: string): ContratoDb => ({ id, numero: id, status, valor: 1, assinado_em: null, criado_em: "2026-10-13T09:00:00Z", tem_base: true });
const neg = (id: string, extra: Partial<NegocioFichaDb>): NegocioFichaDb => negocioDb({ id, titulo: `Trabalho ${id}`, ...extra });

const FICHA: FichaDb = fichaDb({
  negocios: { total: 6, itens: [
    neg("n-vazio", {}),
    neg("n-orc", { orcamentos: [orc("o1", "aceite"), orc("o0")] }),
    neg("n-env", { orcamentos: [orc("o2")], propostas: [prop("pr-env", "sent")] }),
    neg("n-aceite", { orcamentos: [orc("o3")], propostas: [prop("pr-ok", "accepted")] }),
    neg("n-con", { orcamentos: [orc("o4")], propostas: [prop("pr-c", "accepted")], contratos: [con("k-pend", "draft")] }),
    neg("n-ass", { orcamentos: [orc("o5")], contratos: [con("k-ass", "signed")], pronto_a_ganhar: true }),
  ] },
});

const item = (id: string, passo: Partial<ItemProcesso>): ItemProcesso => ({
  id, pessoaId: PESSOA_ID, tipo: "negocio", fase: "orcamento", trabalho: `Trabalho ${id}`, valor: 100, prazo: null, atrasado: false,
  orcamentos: 0, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...passo,
});

const CASOS: Record<string, ItemProcesso> = {
  criarOrcamento: item("n-vazio", { orcamentos: 0 }),
  criarProposta: item("n-orc", { orcamentos: 2 }),
  enviarProposta: item("n-env", { fase: "proposta", orcamentos: 1, propostaRascunho: true }),
  registarRespostaCliente: item("n-env", { fase: "proposta", orcamentos: 1 }),
  criarContrato: item("n-aceite", { fase: "proposta", orcamentos: 1, propostaAceite: true }),
  registarAssinatura: item("n-con", { fase: "contrato", orcamentos: 1 }),
  ganharNegocio: item("n-ass", { fase: "contrato", orcamentos: 1, prontoAGanhar: true }),
};

function Consumidor({ casos }: { casos: Record<string, ItemProcesso> }) {
  const processo = useProcesso();
  return (
    <>
      {Object.entries(casos).map(([nome, i]) => (
        <button key={nome} type="button" data-pode={String(processo?.podeExecutar?.(i))} onClick={(e) => processo?.executar(i, e.currentTarget)}>{nome}</button>
      ))}
    </>
  );
}

function montar(ficha: FichaDb | null = FICHA, casos: Record<string, ItemProcesso> = CASOS) {
  const mutacoes = mutacoesFalsas();
  const cliente = new QueryClient();
  render(
    <QueryClientProvider client={cliente}>
      <FontePessoasContext.Provider value={REAL}>
        <ComCostura mutacoes={mutacoes} dados={dadosFalsos()}>
          <ProcessoProviderReal ficha={ficha}><Consumidor casos={casos} /></ProcessoProviderReal>
        </ComCostura>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
  return { mutacoes };
}
const clicar = (nome: string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const REGRESSO = (negocio: string) => encodeURIComponent(`/pessoas?open=${PESSOA_ID}&negocio=${negocio}`);

describe("ProcessoProviderReal: criar o orçamento", () => {
  it("abre o editor de orçamentos já com a pessoa e o negócio, sem sair da ficha", async () => {
    montar();
    clicar("criarOrcamento");
    expect(await screen.findByRole("dialog", { name: "Novo orçamento de Ana Lopes" })).toBeInTheDocument();
    expect(construtor.mock.calls[construtor.mock.calls.length - 1][0]).toMatchObject({
      quoteId: null, initialEntity: { kind: "lead", id: LEAD_ID, name: "Ana Lopes", entity_id: PESSOA_ID, organization_id: "org-1" },
    });
    expect(navegar).not.toHaveBeenCalled();
  });

  it("uma pessoa que já é cliente (com cliente na ficha) entra como cliente", async () => {
    const cliente = fichaDb({ ...FICHA, pessoa: pessoaDb({ papel: "cliente", lead_id: null, client_id: "cli-1" }) });
    montar(cliente);
    clicar("criarOrcamento");
    await screen.findByRole("dialog", { name: "Novo orçamento de Ana Lopes" });
    expect(construtor.mock.calls[construtor.mock.calls.length - 1][0]).toMatchObject({ initialEntity: { kind: "client", id: "cli-1" } });
  });
});

describe("ProcessoProviderReal: criar a proposta", () => {
  it("abre o diálogo de propostas com a pessoa e o orçamento aceite do negócio (o mais recente se não houver aceite)", async () => {
    montar();
    clicar("criarProposta");
    await waitFor(() => expect(dialogoProposta).toHaveBeenCalled());
    expect(dialogoProposta.mock.calls[dialogoProposta.mock.calls.length - 1][0]).toMatchObject({
      open: true, presetEntityId: PESSOA_ID, presetQuoteIds: ["o1"],
    });
  });
});

describe("ProcessoProviderReal: os passos que vão ao ecrã da app", () => {
  it.each([["enviarProposta", "pr-env", "n-env"], ["registarRespostaCliente", "pr-env", "n-env"]])("%s abre a proposta %s com ?voltar=", (passo, proposta, negocio) => {
    montar();
    clicar(passo);
    expect(navegar).toHaveBeenCalledWith(`/proposals?open=${proposta}&voltar=${REGRESSO(negocio)}`);
  });

  it("criar o contrato abre a criação de contrato com a proposta aceite e ?voltar=", () => {
    montar();
    clicar("criarContrato");
    expect(navegar).toHaveBeenCalledWith(`/client-contracts?newContract=true&proposalId=pr-ok&voltar=${REGRESSO("n-aceite")}`);
  });

  it("registar a assinatura abre o contrato com ?voltar=", () => {
    montar();
    clicar("registarAssinatura");
    expect(navegar).toHaveBeenCalledWith(`/client-contracts?open=k-pend&voltar=${REGRESSO("n-con")}`);
  });

  it("os identificadores vão codificados no endereço", () => {
    const f = fichaDb({ negocios: { total: 1, itens: [neg("n-env", { propostas: [prop("a b&c", "sent")] })] } });
    montar(f, { x: CASOS.enviarProposta });
    clicar("x");
    expect(navegar.mock.calls[0][0]).toMatch(/^\/proposals\?open=a%20b%26c&voltar=/);
  });
});

describe("ProcessoProviderReal: dar o negócio como ganho", () => {
  it("abre o diálogo de ganhar para o negócio", () => {
    montar();
    clicar("ganharNegocio");
    expect(screen.getByRole("dialog", { name: "Dar o negócio como ganho" })).toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe("ProcessoProviderReal: o que a ficha real ainda não executa", () => {
  const pode = (nome: string) => screen.getByRole("button", { name: nome }).getAttribute("data-pode");

  it("os passos suportados dizem que executam", () => {
    montar();
    for (const nome of Object.keys(CASOS)) expect(pode(nome), nome).toBe("true");
  });

  it.each<[string, Partial<ItemProcesso>]>([
    ["o levantamento (P5)", { fase: "levantamento" }],
    ["verificar o orçamento (a Direção simulada não existe em modo real)", { verificacao: "porVerificar", orcamentos: 1 }],
    ["aguardar a Direção", { verificacao: "aguardaDirecao", orcamentos: 1 }],
    ["um item de pessoa (a abordagem é da lista)", { tipo: "pessoa", id: "pessoa-x" }],
  ])("%s não executa e o clique não faz nada", (_nome, extra) => {
    montar(FICHA, { x: item("n-orc", extra) });
    expect(pode("x")).toBe("false");
    clicar("x");
    expect(navegar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("um negócio que não está na ficha (ou sem ficha) não executa", () => {
    montar(FICHA, { x: item("desconhecido", {}) });
    expect(pode("x")).toBe("false");
    cleanup();
    montar(null, { y: CASOS.enviarProposta });
    expect(pode("y")).toBe("false");
  });

  it("falta o documento do passo: não executa (proposta sem proposta, contrato sem proposta aceite, assinatura sem contrato)", () => {
    montar(FICHA, {
      a: item("n-vazio", { fase: "proposta", orcamentos: 1, propostaRascunho: true }),
      b: item("n-env", { fase: "proposta", orcamentos: 1, propostaAceite: true }),
      c: item("n-vazio", { fase: "contrato", orcamentos: 1 }),
      d: item("n-vazio", { orcamentos: 1 }),
    });
    for (const nome of ["a", "b", "c", "d"]) expect(pode(nome), nome).toBe("false");
  });

  it("sem permissão para editar só se abrem os ecrãs (enviar, responder e assinar); criar e ganhar não executam", () => {
    const semEditar = fichaDb({ ...FICHA, permissoes: { editar: false, criar: false } });
    montar(semEditar);
    const esperado: Record<string, string> = {
      criarOrcamento: "false", criarProposta: "false", enviarProposta: "true", registarRespostaCliente: "true",
      criarContrato: "false", registarAssinatura: "true", ganharNegocio: "false",
    };
    for (const [nome, valor] of Object.entries(esperado)) expect(pode(nome), nome).toBe(valor);
  });
});

describe("ProcessoProviderReal: trocar de pessoa com um painel aberto", () => {
  const OUTRA = "33333333-3333-4333-8333-333333333333";
  const fichaOutra = fichaDb({ ...FICHA, pessoa: pessoaDb({ id: OUTRA, nome: "Outra Pessoa" }) });
  const arvore = (ficha: FichaDb) => (
    <QueryClientProvider client={new QueryClient()}>
      <FontePessoasContext.Provider value={REAL}>
        <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
          <ProcessoProviderReal ficha={ficha}><Consumidor casos={CASOS} /></ProcessoProviderReal>
        </ComCostura>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );

  it("o painel aberto numa pessoa não reaparece quando se volta a ela (o estado do painel limpa-se ao trocar)", async () => {
    const r = render(arvore(FICHA));
    clicar("criarProposta");
    await waitFor(() => expect(dialogoProposta).toHaveBeenCalled());
    r.rerender(arvore(fichaOutra));
    dialogoProposta.mockClear();
    r.rerender(arvore(FICHA));
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(dialogoProposta).not.toHaveBeenCalled();
  });
});
