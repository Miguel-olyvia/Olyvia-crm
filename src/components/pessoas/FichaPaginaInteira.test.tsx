// A ficha real (com o guia e `naPagina`) é renderizada DENTRO da página, na área de conteúdo, sem Sheet nem diálogo por cima (a barra lateral e o topo
// ficam visíveis): coluna centrada de ~1120 px, ligação «← Pipeline» no topo que fecha a ficha. Sem `naPagina` (o exemplo) continua o painel lateral.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { pessoaBase, resumoBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import { MarcarVisitaContext } from "./marcarVisitaContexto";
import type { AcoesFicha } from "./PainelBase";
import { ProcessoContext } from "./processo/processoContexto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true }) }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({ useDocumentosDoNegocio: () => null }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-13";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const acoesBase = (): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
});
const lead = () => resumoBase(pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" } }), [], HOJE, "lead");

function montar(sobre: Partial<FichaPessoaProps> = {}) {
  const resumo = lead();
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: ["x", "a", "y"], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: true, acoes: acoesBase(), comNotas: false,
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true, naPagina: true,
    separadorSubmissoes: { total: 0, pendentes: 0, conteudo: <p>sem submissões</p> }, identidade: <p>Identidade da pessoa</p>, ...sobre,
  };
  render(
    <MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true }}>
          <MarcarVisitaContext.Provider value={{ pedir: vi.fn(), marcadas: new Set<string>() }}>
            <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true })}><FichaPessoa {...props} /></ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter>,
  );
  return props;
}

const raiz = () => document.querySelector<HTMLElement>("[data-ficha-raiz]") as HTMLElement;
const nome = () => screen.getByRole("heading", { name: /Pedro Lopes/ });
const guia = () => screen.getByRole("region", { name: "Passo seguinte" });
const abrirMais = () => fireEvent.keyDown(within(guia()).getByRole("button", { name: "Mais" }), { key: "Enter" });

describe("a ficha real ocupa a área de conteúdo da página", () => {
  it("não é um diálogo: existe a raiz da ficha, com o nome num título de nível 2 e o foco inicial nele", () => {
    montar();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(raiz()).not.toBeNull();
    expect(raiz().tagName).toBe("SECTION");
    expect(within(raiz()).getByRole("heading", { level: 2, name: /Pedro Lopes/ })).toBe(nome());
    expect(document.activeElement).toBe(nome());
  });

  it("a coluna é centrada, de largura máxima 1120 px, sobre o fundo suave, e não tem ecrã inteiro nem rolagem própria", () => {
    montar();
    const coluna = guia().closest("[data-ficha-coluna]") as HTMLElement;
    expect(coluna).not.toBeNull();
    expect(coluna.className).toMatch(/mx-auto/);
    expect(coluna.className).toMatch(/w-full/);
    expect(coluna.className).toMatch(/max-w-\[1120px\]/);
    const fundo = coluna.closest("[class*='bg-muted/30']") as HTMLElement;
    expect(fundo).not.toBeNull();
    expect(fundo.className).not.toMatch(/overflow-y-auto/);
    const todas = [...raiz().querySelectorAll("*")].map((e) => e.getAttribute("class") ?? "").join(" ");
    expect(todas).not.toMatch(/(^|\s)inset-0(\s|$)/);
    expect(todas).not.toMatch(/(^|\s)w-screen(\s|$)/);
  });

  it("sem aberto não mostra nada", () => {
    montar({ aberto: false });
    expect(document.querySelector("[data-ficha-raiz]")).toBeNull();
  });

  it("sem a ficha lida (a troca de pessoa) mostra um bloco de espera com a ligação de volta, e não os dados", () => {
    const props = montar({ resumo: null, voltaPara: "pipeline" });
    expect(raiz()).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("A abrir a ficha…");
    expect(screen.queryByRole("heading", { name: /Pedro Lopes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Pipeline" }));
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("a ligação «← Pipeline» no topo", () => {
  it("vem antes do cabeçalho, tem 44 px de alvo e o nome traduzido, e fecha a ficha", () => {
    const props = montar({ voltaPara: "pipeline" });
    const voltar = screen.getByRole("button", { name: "Voltar ao Pipeline" });
    expect(voltar).toHaveTextContent("Pipeline");
    expect(voltar.className).toMatch(/min-h-11/);
    expect(voltar.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
    expect(voltar.compareDocumentPosition(nome()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(voltar);
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });

  it("vinda da lista de Pessoas diz «← Pessoas»", () => {
    montar({ voltaPara: "pessoas" });
    expect(screen.getByRole("button", { name: "Voltar às Pessoas" })).toHaveTextContent("Pessoas");
    expect(screen.queryByRole("button", { name: "Voltar ao Pipeline" })).toBeNull();
  });

  it("sem naPagina (Sheet lateral, com guia) não há ligação e continua «Fechar a ficha»", () => {
    montar({ naPagina: false, voltaPara: "pipeline" });
    expect(screen.queryByRole("button", { name: /^Voltar (ao Pipeline|às Pessoas)/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar a ficha" })).toBeInTheDocument();
  });

  it("o paginador «2 de 3» e as setas continuam no cabeçalho, e «Fechar a ficha» também fecha", () => {
    const props = montar({ voltaPara: "pipeline" });
    const g = within(guia());
    expect(g.getByText("2 de 3")).toBeInTheDocument();
    expect(g.getByRole("button", { name: "Pessoa anterior" })).toBeInTheDocument();
    expect(g.getByRole("button", { name: "Pessoa seguinte" })).toBeInTheDocument();
    fireEvent.click(g.getByRole("button", { name: "Fechar a ficha" }));
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });

  it("a tecla ] passa à seguinte e [ à anterior", () => {
    const props = montar({ voltaPara: "pipeline" });
    fireEvent.keyDown(document.body, { key: "]" });
    expect(props.aoIrPara).toHaveBeenCalledWith("y");
    fireEvent.keyDown(document.body, { key: "[" });
    expect(props.aoIrPara).toHaveBeenCalledWith("x");
  });
});

describe("o Esc", () => {
  it("fecha a ficha, uma só vez", () => {
    const props = montar({ voltaPara: "pipeline" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });

  it("com o painel em linha «Nota» aberto fecha primeiro o painel, e só o seguinte Esc fecha a ficha", async () => {
    const props = montar({ acoes: { ...acoesBase(), capacidades: { chamada: true, encerrar: true, adiar: true, nota: true, visita: false, negocios: false } } });
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: "Nota" }));
    const campo = await screen.findByLabelText("Escreva a nota");
    fireEvent.keyDown(campo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Escreva a nota")).toBeNull());
    expect(props.aoFechar).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.aoFechar).toHaveBeenCalledTimes(1);
  });

  it("outras teclas não fecham a ficha", () => {
    const props = montar();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(props.aoFechar).not.toHaveBeenCalled();
  });
});

describe("sem naPagina a ficha continua num painel lateral (Sheet)", () => {
  it("com o guia: painel de metade do ecrã, sem ecrã inteiro, e o Esc fecha-o", async () => {
    const props = montar({ naPagina: false });
    const painel = screen.getByRole("dialog", { name: /Pedro Lopes/ });
    expect(painel.className).toMatch(/sm:w-1\/2/);
    expect(painel.className).not.toMatch(/w-screen/);
    expect(painel.className).not.toMatch(/(^|\s)inset-0(\s|$)/);
    expect(painel).toHaveAttribute("data-ficha-raiz");
    fireEvent.keyDown(painel, { key: "Escape" });
    await waitFor(() => expect(props.aoFechar).toHaveBeenCalledTimes(1));
  });

  it("sem o guia (o exemplo): painel lateral de metade do ecrã e o Esc fecha-o", async () => {
    const props = montar({ naPagina: false, comGuia: false });
    const painel = screen.getByRole("dialog", { name: /Pedro Lopes/ });
    expect(painel.className).toMatch(/sm:w-1\/2/);
    expect(painel.className).not.toMatch(/w-screen/);
    fireEvent.keyDown(painel, { key: "Escape" });
    await waitFor(() => expect(props.aoFechar).toHaveBeenCalledTimes(1));
  });
});
