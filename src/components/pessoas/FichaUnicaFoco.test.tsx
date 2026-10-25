// A ficha real é um só ecrã e a ficha antiga abre a pedido num diálogo por cima. Aqui: para onde vai o foco quando um negócio aberto no topo fecha
// (a linha da lista só existia dentro do diálogo, já fechado), quem manda no foco ao abrir um negócio a partir do diálogo, e o fundo escurecido do diálogo.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import { MarcarVisitaContext } from "./marcarVisitaContexto";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
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

function montar(resumo: ResumoPessoa, sobre: Partial<FichaPessoaProps> = {}) {
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
            <ComCostura
              mutacoes={mutacoesFalsas({ enviarParaLixo: vi.fn(async () => undefined) })} dados={dadosFalsos({ podeEditar: true, podeApagar: true })}
            >
              <FichaPessoa {...props} />
            </ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter>,
  );
  return props;
}

const negocio = (id: string, servico: string) =>
  negocioBase(id, { pessoaId: "a", pessoa: "Pedro Lopes", servico, comercial: "Ana Ribeiro", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } });
const pessoa = () => pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" }, campanha: "Verão" });
const comDois = () => resumoBase(pessoa(), [negocio("n1", "WC social"), negocio("n2", "Cozinha nova")], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
const comUm = () => resumoBase(pessoa(), [negocio("n1", "WC social")], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
const guia = () => screen.getByRole("region", { name: "Passo seguinte" });
const abrirMais = () => fireEvent.keyDown(within(guia()).getByRole("button", { name: "Mais" }), { key: "Enter" });
const abrirItem = (item: RegExp) => { abrirMais(); fireEvent.click(screen.getByRole("menuitem", { name: item })); };
const nomeDaPessoa = () => screen.getByRole("heading", { level: 2, name: /Pedro Lopes/ });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("o foco ao voltar de um negócio aberto no topo", () => {
  it("«← Negócios» leva o foco para o nome da pessoa (a linha da lista só existe no diálogo, já fechado)", async () => {
    montar(comUm(), { negocioInicial: "n1" });
    fireEvent.click(screen.getByRole("button", { name: /Voltar aos negócios/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "WC social" })).toBeNull());
    await waitFor(() => expect(nomeDaPessoa()).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it("mandar o negócio aberto para o lixo, nos «Detalhes do negócio», também deixa o foco no nome da pessoa", async () => {
    montar(comUm(), { negocioInicial: "n1" });
    abrirItem(/^Detalhes do negócio/);
    const detalhes = screen.getByRole("dialog", { name: "Detalhes do negócio" });
    fireEvent.click(within(detalhes).getByRole("button", { name: "Enviar para o lixo" }));
    const confirmar = screen.getByRole("dialog", { name: "Enviar o negócio para o lixo" });
    fireEvent.click(within(confirmar).getByRole("button", { name: "Enviar para o lixo" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "WC social" })).toBeNull());
    await waitFor(() => expect(nomeDaPessoa()).toHaveFocus());
    await esperar(50);
    expect(nomeDaPessoa()).toHaveFocus();
  });
});

describe("abrir um negócio a partir da aba Negócios do diálogo", () => {
  it("o foco fica no título do negócio aberto (e o diálogo, ao fechar, não o leva para outro lado)", async () => {
    montar(comDois(), { negocioInicial: "n1" });
    abrirItem(/^Negócios/);
    const apoio = screen.getByRole("dialog", { name: "Mais sobre a pessoa" });
    fireEvent.click(within(within(apoio).getByRole("tabpanel")).getByRole("button", { name: /Cozinha nova/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mais sobre a pessoa" })).toBeNull());
    const titulo = screen.getByRole("heading", { level: 3, name: "Cozinha nova" });
    await waitFor(() => expect(titulo).toHaveFocus());
    await esperar(50);
    expect(titulo).toHaveFocus();
  });

  it("fechar o diálogo de outra maneira (Esc) continua a devolver o foco ao botão que o abriu", async () => {
    montar(comDois(), { negocioInicial: "n1" });
    abrirItem(/^Negócios/);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Mais sobre a pessoa" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mais sobre a pessoa" })).toBeNull());
    await waitFor(() => expect(within(guia()).getByRole("button", { name: "Mais" })).toHaveFocus());
  });
});

describe("o fundo do diálogo de apoio", () => {
  it("escurece a ficha: o fundo fica por cima do painel da ficha e por baixo do diálogo", () => {
    montar(comUm());
    abrirItem(/^Registos e dados/);
    const apoio = screen.getByRole("dialog", { name: "Mais sobre a pessoa" });
    const fundo = document.querySelector<HTMLElement>("[data-ficha-apoio-fundo]");
    expect(fundo).not.toBeNull();
    const painel = screen.getByRole("heading", { level: 2, name: /Pedro Lopes/, hidden: true }).closest<HTMLElement>("[role='dialog']") as HTMLElement;
    expect(painel).not.toBe(apoio);
    // No mesmo z-index vale a ordem no documento: o painel da ficha, depois o fundo, depois o diálogo.
    expect(painel.compareDocumentPosition(fundo as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((fundo as HTMLElement).compareDocumentPosition(apoio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const z = (el: HTMLElement) => /z-\[(\d+)\]/.exec(el.className)?.[1];
    expect(Number(z(fundo as HTMLElement))).toBeGreaterThanOrEqual(Number(z(painel)));
    expect(Number(z(apoio))).toBeGreaterThanOrEqual(Number(z(fundo as HTMLElement)));
  });

  it("o foco fica preso no diálogo: o painel da ficha fica inerte para o leitor de ecrã", () => {
    montar(comUm());
    abrirItem(/^Registos e dados/);
    expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "Mais sobre a pessoa" })).getByRole("heading", { name: "Mais sobre a pessoa" }));
    expect(screen.queryByRole("region", { name: "Passo seguinte" })).toBeNull();
  });
});
