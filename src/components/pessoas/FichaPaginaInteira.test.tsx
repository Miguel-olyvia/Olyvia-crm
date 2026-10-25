// A ficha real (com o guia) ocupa a PÁGINA TODA, como no protótipo: ecrã inteiro, conteúdo numa coluna de ~1120 px, ligação «← Pipeline» no topo
// que fecha a ficha. Sem o guia (o exemplo) continua o painel lateral de metade do ecrã.
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
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true, abrir: vi.fn() }) }));
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
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true,
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

const ficha = () => screen.getByRole("dialog", { name: /Pedro Lopes/ });

describe("a ficha real ocupa a página toda", () => {
  it("o painel é de ecrã inteiro: largura total, sem máximo, sem borda e sem a metade do exemplo", () => {
    montar();
    const c = ficha().className;
    expect(c).toMatch(/(^|\s)inset-0(\s|$)/);
    expect(c).toMatch(/(^|\s)w-screen(\s|$)/);
    expect(c).toMatch(/(^|\s)max-w-none(\s|$)/);
    expect(c).toMatch(/(^|\s)border-0(\s|$)/);
    expect(c).not.toMatch(/sm:w-1\/2/);
    expect(c).not.toMatch(/1120px/);
  });

  it("sem o guia (o exemplo) continua o painel lateral de metade do ecrã", () => {
    montar({ comGuia: false });
    const c = ficha().className;
    expect(c).toMatch(/sm:w-1\/2/);
    expect(c).not.toMatch(/w-screen/);
  });

  it("o conteúdo fica numa coluna centrada de largura máxima 1120 px, sobre o fundo suave", () => {
    montar();
    const coluna = screen.getByRole("region", { name: "Passo seguinte" }).closest("[data-ficha-coluna]") as HTMLElement;
    expect(coluna).not.toBeNull();
    expect(coluna.className).toMatch(/mx-auto/);
    expect(coluna.className).toMatch(/w-full/);
    expect(coluna.className).toMatch(/max-w-\[1120px\]/);
    expect(coluna.closest("[class*='bg-muted/30']")).not.toBeNull();
  });
});

describe("a ligação «← Pipeline» no topo", () => {
  it("vem antes do cabeçalho, tem 44 px de alvo e o nome traduzido, e fecha a ficha", async () => {
    const props = montar({ voltaPara: "pipeline" });
    const voltar = screen.getByRole("button", { name: "Voltar ao Pipeline" });
    expect(voltar).toHaveTextContent("Pipeline");
    expect(voltar.className).toMatch(/min-h-11/);
    expect(voltar.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);
    const nome = screen.getByRole("heading", { name: /Pedro Lopes/ });
    expect(voltar.compareDocumentPosition(nome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(voltar);
    await waitFor(() => expect(props.aoFechar).toHaveBeenCalledTimes(1));
  });

  it("vinda da lista de Pessoas diz «← Pessoas»", () => {
    montar({ voltaPara: "pessoas" });
    expect(screen.getByRole("button", { name: "Voltar às Pessoas" })).toHaveTextContent("Pessoas");
    expect(screen.queryByRole("button", { name: "Voltar ao Pipeline" })).toBeNull();
  });

  it("sem origem (o exemplo) não há ligação, e continua a haver «Fechar a ficha»", () => {
    montar({ comGuia: false });
    expect(screen.queryByRole("button", { name: /^Voltar (ao Pipeline|às Pessoas)/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar a ficha" })).toBeInTheDocument();
  });

  it("o paginador «2 de 3» e as setas continuam no cabeçalho", () => {
    montar({ voltaPara: "pipeline" });
    const guia = within(screen.getByRole("region", { name: "Passo seguinte" }));
    expect(guia.getByText("2 de 3")).toBeInTheDocument();
    expect(guia.getByRole("button", { name: "Pessoa anterior" })).toBeInTheDocument();
    expect(guia.getByRole("button", { name: "Pessoa seguinte" })).toBeInTheDocument();
  });

  it("o Esc fecha a ficha e a tecla ] passa à seguinte", async () => {
    const props = montar({ voltaPara: "pipeline" });
    fireEvent.keyDown(document.body, { key: "]" });
    expect(props.aoIrPara).toHaveBeenCalledWith("y");
    fireEvent.keyDown(ficha(), { key: "Escape" });
    await waitFor(() => expect(props.aoFechar).toHaveBeenCalledTimes(1));
  });

  it("o foco inicial continua no nome (a ligação não o rouba)", () => {
    montar({ voltaPara: "pipeline" });
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Pedro Lopes/ }));
  });
});
