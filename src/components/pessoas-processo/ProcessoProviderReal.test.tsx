// O processo (orçamento, proposta e contrato) na ficha REAL: o botão do «A fazer» de um negócio abre o ecrã real da app que faz esse passo e
// liga o resultado ao negócio. Criar o orçamento e a proposta abre o editor e o diálogo que a app já tem; enviar e responder à proposta,
// criar o contrato e assiná-lo vão por ligação ao ecrã da app, com `?voltar=` para regressar à ficha; ganhar já não tem diálogo (o ganho é o fecho do negócio).
// Um passo que a ficha real ainda não sabe fazer (o levantamento de um negócio é do P3) não oferece botão.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FechoV4Context } from "@/components/negocio-metas/bandeiraFecho";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, LEAD_ID, negocioDb, PESSOA_ID, pessoaDb, visitaDb } from "@/hooks/pessoas/fichaFabrica";
import type { ContratoDb, FichaDb, NegocioFichaDb, OrcamentoDb, PropostaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useMarcarVisita } from "@/components/pessoas/marcarVisitaContexto";
import { useProcesso } from "@/components/pessoas/processo/processoContexto";
import type { ItemProcesso } from "@/components/pessoas/processo/tiposProcesso";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ProcessoProviderReal } from "./ProcessoProviderReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { navegar, construtor, dialogoProposta } = vi.hoisted(() => ({ navegar: vi.fn(), construtor: vi.fn(), dialogoProposta: vi.fn() }));
// O diálogo de marcar visita importa o cliente da base (que exige variáveis de ambiente que os testes não têm): nunca se chama.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
// A agenda da visita (quadros e recursos) é da base: aqui simula-se, só para o diálogo de marcar abrir.
const estadoAgenda = vi.hoisted(() => ({ argumentos: [] as unknown[][] }));
vi.mock("@/hooks/pessoas/useAgendaVisita", () => ({
  useAgendaVisita: (...a: unknown[]) => {
    estadoAgenda.argumentos.push(a);
    return { quadros: [], recursos: [], isLoading: false, isError: false, refetch: vi.fn(), omissao: { boardId: null, recursoId: null } };
  },
}));
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

// `bandeira` null segue a constante (ligada); false monta o caminho antigo.
function montar(ficha: FichaDb | null = FICHA, casos: Record<string, ItemProcesso> = CASOS, fonte: FontePessoas = REAL, bandeira: boolean | null = null) {
  const mutacoes = mutacoesFalsas();
  const cliente = new QueryClient();
  render(
    <FechoV4Context.Provider value={bandeira}>
      <QueryClientProvider client={cliente}>
        <FontePessoasContext.Provider value={fonte}>
          <ComCostura mutacoes={mutacoes} dados={dadosFalsos()}>
            <ProcessoProviderReal ficha={ficha}><Consumidor casos={casos} /></ProcessoProviderReal>
          </ComCostura>
        </FontePessoasContext.Provider>
      </QueryClientProvider>
    </FechoV4Context.Provider>,
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

  it("criar o contrato abre a criação com a proposta aceite, o negócio (nasce ligado) e ?voltar=", () => {
    montar();
    clicar("criarContrato");
    expect(navegar).toHaveBeenCalledWith(`/client-contracts?newContract=true&proposalId=pr-ok&negocio=n-aceite&voltar=${REGRESSO("n-aceite")}`);
  });

  it("com a bandeira desligada o endereço é o de antes, sem o negócio", () => {
    montar(FICHA, CASOS, REAL, false);
    clicar("criarContrato");
    expect(navegar).toHaveBeenCalledWith(`/client-contracts?newContract=true&proposalId=pr-ok&voltar=${REGRESSO("n-aceite")}`);
  });

  it("num negócio que fecha na proposta o contrato não se oferece", () => {
    const venda = fichaDb({ ...FICHA, negocios: { total: 1, itens: [neg("n-venda", { fecho: "proposta", orcamentos: [orc("o3")], propostas: [prop("pr-ok", "accepted")] })] } });
    montar(venda, { criarContrato: item("n-venda", { fase: "proposta", orcamentos: 1, propostaAceite: true }) });
    expect(screen.getByRole("button", { name: "criarContrato" }).getAttribute("data-pode")).toBe("false");
    clicar("criarContrato");
    expect(navegar).not.toHaveBeenCalled();
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
  it("já não abre diálogo nem navega: o ganho faz-se no fecho do negócio", () => {
    montar();
    expect(screen.getByRole("button", { name: "ganharNegocio" }).getAttribute("data-pode")).toBe("false");
    clicar("ganharNegocio");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe("ProcessoProviderReal: criar um documento pede também a permissão do documento", () => {
  const pode = (nome: string) => screen.getByRole("button", { name: nome }).getAttribute("data-pode");
  const comPermissoes = (permissoesFecho: readonly string[]): FontePessoas => ({ ...REAL, permissoesFecho });

  it("sem a lista (a página ainda não a leu) nada se restringe: a base decide", () => {
    montar();
    for (const nome of ["criarOrcamento", "criarProposta", "criarContrato"]) expect(pode(nome), nome).toBe("true");
  });

  it("com uma lista vazia não se cria nenhum documento, mas enviar e assinar continuam", () => {
    montar(FICHA, CASOS, comPermissoes([]));
    for (const nome of ["criarOrcamento", "criarProposta", "criarContrato"]) expect(pode(nome), nome).toBe("false");
    for (const nome of ["enviarProposta", "registarRespostaCliente", "registarAssinatura"]) expect(pode(nome), nome).toBe("true");
  });

  it("cada criar pede a sua permissão: quotes.create, proposals.create e client_contracts.create", () => {
    montar(FICHA, CASOS, comPermissoes(["proposals.create"]));
    expect(pode("criarProposta")).toBe("true");
    expect(pode("criarOrcamento")).toBe("false");
    expect(pode("criarContrato")).toBe("false");
    cleanup();
    montar(FICHA, CASOS, comPermissoes(["quotes.create", "proposals.create", "client_contracts.create"]));
    for (const nome of ["criarOrcamento", "criarProposta", "criarContrato"]) expect(pode(nome), nome).toBe("true");
  });

  it("as permissões de editar o documento não chegam para criar", () => {
    montar(FICHA, CASOS, comPermissoes(["quotes.edit", "proposals.edit", "client_contracts.edit"]));
    for (const nome of ["criarOrcamento", "criarProposta", "criarContrato"]) expect(pode(nome), nome).toBe("false");
  });

  it("sem permissão o clique não faz nada", () => {
    montar(FICHA, CASOS, comPermissoes([]));
    clicar("criarProposta");
    expect(dialogoProposta).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe("ProcessoProviderReal: o que a ficha real ainda não executa", () => {
  const pode = (nome: string) => screen.getByRole("button", { name: nome }).getAttribute("data-pode");

  it("os passos suportados dizem que executam", () => {
    montar();
    // «ganharNegocio» está nos CASOS mas já não é um passo desta ficha: o ganho é o fecho do negócio.
    for (const nome of Object.keys(CASOS).filter((n) => n !== "ganharNegocio")) expect(pode(nome), nome).toBe("true");
  });

  it.each<[string, Partial<ItemProcesso>]>([
    ["o passo «Fazer o levantamento» de um negócio (P3)", { fase: "levantamento" }],
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

  it("sem permissão para editar só se abrem os ecrãs (enviar, responder e assinar); criar não executam", () => {
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

describe("ProcessoProviderReal: marcar visita pela ficha real", () => {
  const FICHA_COM_MORADA = fichaDb({
    ...FICHA,
    pessoa: pessoaDb({ morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa", andar: null }, responsavel_id: "u9" }),
    visitas: { total: 1, tem_mais: false, proximo: null, itens: [visitaDb({ id: "v1", status: "scheduled" })] },
  });

  function Sonda() {
    const marcar = useMarcarVisita();
    const processo = useProcesso();
    return (
      <>
        <span data-testid="painel">{String(processo?.comPainelVisita)}</span>
        <span data-testid="marcadas">{String(marcar?.marcadas.has(PESSOA_ID))}</span>
        <button type="button" onClick={() => marcar?.pedir({ pessoaId: PESSOA_ID, nome: "Ana", moradaLead: null, negocioId: "n-orc" })}>marcar</button>
      </>
    );
  }
  function montarSonda(ficha: FichaDb) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FontePessoasContext.Provider value={REAL}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos()}>
            <ProcessoProviderReal ficha={ficha}><Sonda /></ProcessoProviderReal>
          </ComCostura>
        </FontePessoasContext.Provider>
      </QueryClientProvider>,
    );
  }

  it("diz que o painel «Visita e levantamento» abre na ficha real a quem pode editar (grava na base), e não a quem não pode", () => {
    montarSonda(FICHA);
    expect(screen.getByTestId("painel")).toHaveTextContent("true");
    cleanup();
    montarSonda(fichaDb({ ...FICHA, permissoes: { editar: false, criar: true } }));
    expect(screen.getByTestId("painel")).toHaveTextContent("false");
  });

  it("monta o diálogo de marcar ligado à base: abre com a morada da lead da ficha e o responsável (recurso por omissão)", async () => {
    montarSonda(FICHA_COM_MORADA);
    fireEvent.click(screen.getByRole("button", { name: "marcar" }));
    expect(await screen.findByRole("dialog", { name: "Marcar visita" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Duração", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(estadoAgenda.argumentos.at(-1)).toEqual(["u9"]);
    expect(screen.getByRole("radio", { name: /Na morada da lead/ })).toBeChecked();
  });

  it("a pessoa que já tem uma visita não cancelada conta como «já com visita»; uma ficha sem visitas não", () => {
    montarSonda(FICHA_COM_MORADA);
    expect(screen.getByTestId("marcadas")).toHaveTextContent("true");
    cleanup();
    montarSonda(FICHA);
    expect(screen.getByTestId("marcadas")).toHaveTextContent("false");
  });
});
