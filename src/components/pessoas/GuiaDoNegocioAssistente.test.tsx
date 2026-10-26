// O guia de um NEGÓCIO aberto no Pipeline, com o assistente de passos nas fases Contacto e Visita (o Pipeline só tem negócios): um negócio ainda sem orçamento
// está em Por contactar (o guia de sempre), Contactado (o assistente de 5 passos) ou Visita (o assistente do levantamento), pelo que tem ligado. O assistente
// recebe o negócio, por isso os passos que gravam nele não pedem «Criar o negócio». Ao lado do assistente fica sempre a coluna «Cliente» (três colunas:
// passos | passo | cliente), sem «Ver toda a atividade».
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import { REGISTOS_VAZIOS } from "@/components/negocio-metas/registosTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { contactoBase, negocioBase, pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { MarcarVisitaContext } from "./marcarVisitaContexto";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true, ficha: null }) }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({ useDocumentosDoNegocio: () => null }));
vi.mock("@/hooks/pessoas/useGuardarQualificacao", async (original) => ({
  ...(await original<object>()),
  useGuardarQualificacao: () => ({ guardar: vi.fn(), aGuardar: false, pronto: true }),
}));
vi.mock("@/hooks/pessoas/useSubstituirContactoPessoa", () => ({ useSubstituirContactoPessoa: () => ({ guardar: vi.fn() }) }));
vi.mock("@/hooks/pessoas/useGuardarContactoPessoa", async (original) => ({
  ...(await original<object>()),
  useGuardarContactoPessoa: () => ({ guardar: vi.fn() }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); window.sessionStorage.clear(); });

const HOJE = "2026-10-19";
const negocio = { ...negocioBase("n1", { pessoa: "Pedro Lopes", servico: "WC social", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } }), notas: "", comercialId: "u1" };
const itemDe = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "n1", pessoaId: "a", tipo: "negocio", fase: "orcamento", trabalho: "WC social", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const processo = (): ProcessoValor => ({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true });

function abrir(opcoes: { item?: ItemProcesso; registos?: Partial<EstadoRegistos>; negocio?: typeof negocio; podeEditar?: boolean } = {}) {
  const pedir = vi.fn();
  const aoRegistarChamada = vi.fn();
  render(
    <ComClienteQuery><MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={processo()}>
          <MarcarVisitaContext.Provider value={{ pedir, marcadas: new Set() }}>
            <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: opcoes.podeEditar ?? true, registos: { ...REGISTOS_VAZIOS, ...opcoes.registos } })}>
              <DetalheNegocioFicha
                negocio={opcoes.negocio ?? negocio} hoje={HOJE} aoVoltar={vi.fn()} item={opcoes.item ?? itemDe()}
                pessoa={pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro@x.pt" } })} atividade={[]} comGuia
                aoRegistarChamada={aoRegistarChamada}
              />
            </ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter></ComClienteQuery>,
  );
  return { pedir, aoRegistarChamada };
}
const COM_CHAMADA: Partial<EstadoRegistos> = { contactos: [contactoBase("rc-1", { negocioId: "n1" })] };
const COM_VISITA: Partial<EstadoRegistos> = { ...COM_CHAMADA, visitas: [visitaPessoaBase("rv-1", { negocioId: "n1" })] };
const coluna = () => screen.getByRole("navigation", { name: "Passos da fase" });
const nomesDosPassos = () => within(coluna()).getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, "").replace(/, .*$/, ""));

describe("Por contactar: o guia de sempre, sem o assistente", () => {
  it("um negócio sem nada ligado pede «Registar a chamada» e o botão abre o registo da chamada", () => {
    const { aoRegistarChamada } = abrir();
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Registar a chamada/ }));
    expect(aoRegistarChamada).toHaveBeenCalledTimes(1);
  });
});

describe("Contactado: o assistente de 5 passos, com o negócio", () => {
  it("lista Chamada, Qualificação, Morada da obra, Preparar a visita e Marcar a visita", () => {
    abrir({ registos: COM_CHAMADA });
    expect(nomesDosPassos()).toEqual(["Chamada", "Qualificação", "Morada da obra", "Preparar a visita", "Marcar a visita"]);
  });

  it("recebe o negócio: os passos que gravam nele não pedem «Criar o negócio»", () => {
    abrir({ registos: COM_CHAMADA });
    fireEvent.click(within(coluna()).getByRole("button", { name: /^Morada da obra/ }));
    expect(screen.queryByRole("button", { name: "Criar o negócio" })).toBeNull();
    expect(screen.getByLabelText("Rua e número")).toBeInTheDocument();
  });

  it("a barra de fases é a da abordagem, com a fase atual marcada", () => {
    abrir({ registos: COM_CHAMADA });
    const fases = within(screen.getByRole("list", { name: "Fases" }));
    expect(fases.getByText("Por contactar")).toBeInTheDocument();
    expect(fases.getByText("Contactado")).toBeInTheDocument();
    expect(fases.getByText("Visita")).toBeInTheDocument();
  });

  it("«Marcar a visita» abre a agenda ligada ao negócio e com o que se preparou", () => {
    const { pedir } = abrir({ registos: COM_CHAMADA });
    fireEvent.click(within(coluna()).getByRole("button", { name: /^Preparar a visita/ }));
    fireEvent.click(screen.getByRole("button", { name: "2 h" }));
    fireEvent.click(within(coluna()).getByRole("button", { name: /^Marcar a visita/ }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar a visita" }));
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.calls[0][0]).toMatchObject({ pessoaId: "a", negocioId: "n1", preparar: { duracao: "h2" } });
  });

  it("sem permissão de editar o assistente continua lá, mas não deixa agir", () => {
    abrir({ registos: COM_CHAMADA, podeEditar: false });
    fireEvent.click(within(coluna()).getByRole("button", { name: /^Morada da obra/ }));
    expect(screen.queryByLabelText("Rua e número")).toBeNull();
    expect(screen.getByText("Não tem permissão para fazer este passo.")).toBeInTheDocument();
  });
});

describe("Visita: o assistente do levantamento, com o negócio", () => {
  it("com uma visita marcada ao negócio mostra Visitas, as secções e Fechar levantamento", () => {
    abrir({ registos: COM_VISITA });
    const nomes = nomesDosPassos();
    expect(nomes[0]).toBe("Visitas");
    expect(nomes.at(-1)).toBe("Fechar levantamento");
  });

  it("o negócio em Levantamento (a decisão escrita) também", () => {
    abrir({ item: itemDe({ fase: "levantamento" }) });
    expect(nomesDosPassos()[0]).toBe("Visitas");
  });

  it("uma visita cancelada não passa o negócio à fase Visita", () => {
    abrir({ registos: { ...COM_CHAMADA, visitas: [visitaPessoaBase("rv-1", { negocioId: "n1", estado: "cancelada" })] } });
    expect(nomesDosPassos()[0]).toBe("Chamada");
  });
});

describe("depois do levantamento o negócio segue para o orçamento", () => {
  it("com o levantamento escrito no negócio a fase continua a ser o orçamento (não volta à abordagem)", () => {
    abrir({ negocio: { ...negocio, levantamento: { data: "2026-10-10", feitoPor: "Ana", estado: "feito", linhas: [], observacoes: "" } } as typeof negocio });
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Criar o orçamento/ })).toBeInTheDocument();
  });

  it("um negócio com orçamento nunca volta à abordagem", () => {
    abrir({ item: itemDe({ orcamentos: 1 }) });
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
  });
});

describe("a coluna «Cliente» ao lado do assistente", () => {
  it("o cartão do cliente (telefone, email, linha e últimos acontecimentos) fica depois dos passos e do passo, nas três colunas da grelha", () => {
    abrir({ registos: COM_CHAMADA });
    const cartao = screen.getByRole("complementary");
    expect(within(cartao).getByRole("heading", { name: "Cliente" })).toBeInTheDocument();
    expect(within(cartao).getByText("pedro@x.pt")).toBeInTheDocument();
    expect(within(cartao).getByRole("heading", { name: "Últimos acontecimentos" })).toBeInTheDocument();
    // Depois dos passos na ordem do DOM (a ordem visual é a do DOM).
    expect(coluna().compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grelha = cartao.parentElement?.parentElement as HTMLElement;
    expect(grelha.className).toContain("lg:grid-cols-[210px_minmax(0,1fr)_270px]");
    expect(grelha.className).toContain("md:grid-cols-[200px_minmax(0,1fr)]");
    expect(cartao.parentElement?.className).toContain("lg:col-start-3");
  });

  it("no Pipeline o cartão não tem «Ver toda a atividade» (não abre nada de Pessoas)", () => {
    abrir({ registos: COM_VISITA });
    expect(screen.queryByRole("button", { name: /Ver toda a atividade/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Ver toda a atividade/ })).toBeNull();
  });
});
