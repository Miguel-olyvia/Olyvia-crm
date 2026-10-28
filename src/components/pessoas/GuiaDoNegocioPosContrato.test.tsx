// A ficha do Pipeline cobre o percurso todo com UMA só barra (Por contactar, Contactado, Visita, Orçamento, Proposta, Contrato, Financeiro, Obra): do Negócio
// em diante o conteúdo é o da Emylia, na mesma barra e com as mesmas «Fases feitas». O negócio da Emylia e o seu ecrã estão simulados (têm os seus testes): aqui
// prova-se a ligação ao guia.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase, pessoaBase } from "./fabricaTestes";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";

const m = vi.hoisted(() => ({
  estado: { faseEmylia: null as string | null, faseDoCrm: null as string | null, leituraBloqueia: false, semNegocioNaEmylia: false, aPassar: false },
  pedidos: [] as { faseDoItem: string | null; podeEditar: boolean; dados: Record<string, unknown> }[],
  reler: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({ useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }) }));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true, ficha: null }) }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({ useDocumentosDoNegocio: () => null }));
vi.mock("./negocioEmylia/useNegocioEmyliaDoGuia", () => ({
  useNegocioEmyliaDoGuia: (_n: unknown, opcoes: { faseDoItem: string | null; podeEditar: boolean; dados: Record<string, unknown> }) => {
    m.pedidos.push(opcoes);
    return { e: { reler: m.reler, leitura: { k: "pronto" } }, org: "org-1", repetirGravacao: vi.fn(), ...m.estado };
  },
}));
vi.mock("./negocioEmylia/NegocioEmyliaDoGuia", () => ({
  NegocioEmyliaDoGuia: (p: { fase: string; atual: string; faseVista: string | null; feitas: { id: string }[]; aoVerFase: (id: string) => void; aPassar?: boolean }) => (
    <div>
      <div data-testid="emylia">EMYLIA fase={p.fase} atual={p.atual} vista={String(p.faseVista)} passa={String(p.aPassar === true)}</div>
      <nav aria-label="Fases feitas">{p.feitas.map((f) => <button key={f.id} type="button" onClick={() => p.aoVerFase(f.id)}>{f.id}</button>)}</nav>
    </div>
  ),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => {
  cleanup(); repor(); reporRegistos(); vi.clearAllMocks();
  m.estado = { faseEmylia: null, faseDoCrm: null, leituraBloqueia: false, semNegocioNaEmylia: false, aPassar: false }; m.pedidos = [];
});

const HOJE = "2026-10-28";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const processo = (): ProcessoValor => ({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true });
const comLevantamento = { data: "2026-10-10", feitoPor: "Ana", estado: "feito" as const, linhas: [], observacoes: "" };
const itemDe = (fase: ItemProcesso["fase"]): ItemProcesso => ({
  id: "n1", pessoaId: "a", tipo: "negocio", fase, trabalho: "WC social", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false,
});
const aberto = { ...negocioBase("n1", { pessoa: "Pedro Lopes", servico: "WC social", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } }), notas: "", comercialId: "u1", levantamento: comLevantamento, pedidoCliente: "Trocar a banheira" };
const ganhoComContrato = { ...aberto, estadoReal: "ganho" as const, resultado: "ganho" as const, mes: "2026-10", contrato: { estado: "assinado" as const } };

function abrir(negocio: typeof aberto, item: ItemProcesso | undefined) {
  render(
    <ComClienteQuery><MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={processo()}>
          <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true })}>
            <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} item={item} pessoa={pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro@x.pt" } })} atividade={[]} comGuia />
          </ComCostura>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter></ComClienteQuery>,
  );
}
const barra = () => within(screen.getByRole("list", { name: "Fases" }));
const fase = (nome: string) => barra().getByText(nome).closest("li") as HTMLElement;
const nomes = () => screen.getByRole("list", { name: "Fases" }).querySelectorAll("li > span:first-of-type");

describe("a ficha do Pipeline, com uma só barra, do Por contactar à Obra", () => {
  it("há UMA só barra de fases, com as oito fases pela ordem do percurso", () => {
    abrir(aberto, itemDe("orcamento"));
    expect(screen.getAllByRole("list", { name: "Fases" })).toHaveLength(1);
    expect([...nomes()].map((n) => n.textContent)).toEqual(["Por contactar", "Contactado", "Visita", "Orçamento", "Proposta", "Contrato", "Financeiro", "Obra"]);
  });

  it("numa pessoa em Contactado a barra é a mesma, com Por contactar feito e o resto por fazer", () => {
    abrir({ ...aberto, levantamento: undefined } as unknown as typeof aberto, itemDe("contactado"));
    expect(fase("Contactado")).toHaveAttribute("aria-current", "step");
    expect(within(fase("Por contactar")).getByText(/conclu/i)).toBeInTheDocument();
    expect(within(fase("Financeiro")).getByText(/por fazer/i)).toBeInTheDocument();
  });

  it("o Levantamento é o fim da Visita: a barra marca Visita como atual", () => {
    abrir({ ...aberto, levantamento: undefined } as unknown as typeof aberto, itemDe("levantamento"));
    expect(fase("Visita")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByTestId("emylia")).toBeNull();
  });

  it("um negócio ganho com contrato assinado abre em Financeiro, dentro da mesma ficha, sem passar por /negocios", () => {
    m.estado.faseEmylia = "financeiro";
    abrir(ganhoComContrato, undefined);
    expect(fase("Financeiro")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("emylia").textContent).toBe("EMYLIA fase=financeiro atual=financeiro vista=null passa=false");
    expect(within(fase("Contrato")).getByText(/conclu/i)).toBeInTheDocument();
    expect(within(fase("Visita")).getByText(/conclu/i)).toBeInTheDocument();
    expect(barra().queryByText("Ganho")).toBeNull();
  });

  it("um negócio na Obra abre na Obra, com o Financeiro feito", () => {
    m.estado.faseEmylia = "obra";
    abrir(ganhoComContrato, undefined);
    expect(fase("Obra")).toHaveAttribute("aria-current", "step");
    expect(within(fase("Financeiro")).getByText(/conclu/i)).toBeInTheDocument();
  });

  it("um negócio que a Emylia tem em Proposta abre na Proposta, com o Orçamento feito", () => {
    m.estado.faseEmylia = "proposta";
    abrir(aberto, itemDe("proposta"));
    expect(fase("Proposta")).toHaveAttribute("aria-current", "step");
    expect(within(fase("Orçamento")).getByText(/conclu/i)).toBeInTheDocument();
  });

  it("a passagem Visita → Negócio: levantamento fechado, o seguinte é o Orçamento da Emylia (não o «Criar orçamento» do CRM)", () => {
    m.estado.faseEmylia = "orcamento"; m.estado.aPassar = true;
    abrir(aberto, itemDe("orcamento"));
    expect(screen.getByTestId("emylia").textContent).toBe("EMYLIA fase=orcamento atual=orcamento vista=null passa=true");
    expect(screen.queryByRole("heading", { name: "Criar o orçamento." })).toBeNull();
    expect(fase("Orçamento")).toHaveAttribute("aria-current", "step");
    expect(within(fase("Visita")).getByText(/conclu/i)).toBeInTheDocument();
  });

  it("passa ao hook a fase do CRM, se pode editar e o que a abordagem leva (pedido, email, contagens)", () => {
    abrir(aberto, itemDe("orcamento"));
    const o = m.pedidos.at(-1);
    expect(o?.faseDoItem).toBe("orcamento");
    expect(o?.podeEditar).toBe(true);
    expect(o?.dados).toMatchObject({ pedidoCliente: "Trocar a banheira", email: "pedro@x.pt", chamadas: 0, visitas: 0, levantamentos: 0 });
  });

  it("as fases feitas (da abordagem e do Negócio) vêem-se em leitura ao clicar em «Fases feitas»", () => {
    m.estado.faseEmylia = "financeiro";
    abrir(ganhoComContrato, undefined);
    const feitas = within(screen.getByRole("navigation", { name: "Fases feitas" }));
    for (const id of ["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato"]) expect(feitas.getByRole("button", { name: id })).toBeInTheDocument();
    fireEvent.click(feitas.getByRole("button", { name: "orcamento" }));
    expect(screen.getByTestId("emylia").textContent).toBe("EMYLIA fase=orcamento atual=financeiro vista=orcamento passa=false");
  });

  it("com documentos do CRM (sem fase da Emylia) fica o fluxo do CRM, como estava", () => {
    abrir(aberto, itemDe("orcamento"));
    expect(screen.queryByTestId("emylia")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Criar o orçamento." })).toBeInTheDocument();
  });

  it("enquanto a leitura da Emylia não acaba (ou falhou) mostra o ecrã da Emylia com «a ler» ou o erro, e não o do CRM", () => {
    m.estado.leituraBloqueia = true; m.estado.faseDoCrm = "orcamento";
    abrir(aberto, itemDe("orcamento"));
    expect(screen.getByTestId("emylia").textContent).toContain("fase=orcamento atual=orcamento");
    expect(screen.queryByRole("heading", { name: "Criar o orçamento." })).toBeNull();
  });

  it("se a leitura acabou sem o negócio fica o fluxo do CRM, mas diz-se e deixa tentar outra vez", () => {
    m.estado.semNegocioNaEmylia = true;
    abrir(aberto, itemDe("orcamento"));
    expect(screen.getByText("Negócio por ler")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    expect(m.reler).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: "Criar o orçamento." })).toBeInTheDocument();
  });

  it("um negócio perdido não mostra Financeiro nem Obra por fazer", () => {
    abrir({ ...aberto, estadoReal: "perdido" } as unknown as typeof aberto, undefined);
    expect(barra().queryByText("Financeiro")).toBeNull();
    expect(barra().queryByText("Obra")).toBeNull();
  });
});
