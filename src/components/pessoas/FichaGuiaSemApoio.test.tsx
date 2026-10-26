// A ficha real do Pipeline (modo com o guia) já não tem a ficha antiga por cima: nem o diálogo «Mais sobre a pessoa», nem as entradas do menu «Mais» que o
// abriam (Registos e dados, Visitas, Negócios, Submissões, Atividade), nem «Visita e levantamento», nem «Criar negócio» / «Novo negócio», nem os atalhos do
// cabeçalho, nem «Ver toda a atividade». Tudo isso faz-se agora dentro do assistente de passos. Fica o que não é do assistente: Nota, Adiar, Registar
// chamada (quando o passo não é o da chamada), «Detalhes do negócio» e Encerrar/Reativar.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
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
vi.mock("@/components/pessoas-processo/LevantamentoDoNegocioReal", () => ({ useLevantamentoDoNegocio: () => ({ pode: true }) }));
vi.mock("@/components/pessoas-processo/DocumentosDoNegocioReal", () => ({ useDocumentosDoNegocio: () => null }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-13";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const acoesBase = (): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(), registarResultadoVisita: vi.fn(),
});

function montar(resumo: ResumoPessoa, sobre: Partial<FichaPessoaProps> = {}) {
  const abrirVisitaLevantamento = vi.fn();
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: ["x", "a", "y"], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: true, acoes: acoesBase(), comNotas: false,
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true,
    separadorSubmissoes: { total: 2, pendentes: 2, conteudo: <p>sem submissões</p> }, identidade: <p>Identidade da pessoa</p>, ...sobre,
  };
  render(
    <MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento, podeExecutar: () => true }}>
          <MarcarVisitaContext.Provider value={{ pedir: vi.fn(), marcadas: new Set<string>() }}>
            <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true })}><FichaPessoa {...props} /></ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter>,
  );
  return { props, abrirVisitaLevantamento };
}

const pessoa = () => pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" }, campanha: "Verão", ultimoContactoDias: 1 });
const aberto = () => negocioBase("n1", { pessoaId: "a", pessoa: "Pedro Lopes", servico: "WC social", comercial: "Ana Ribeiro", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: null } });
const comVisitas = () => resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1"), visitaPessoaBase("rv-2", { data: "2026-10-27" })] }));
const comNegocio = () => resumoBase(pessoa(), [aberto()], HOJE, "lead", registosBase({ contactos: [contactoBase()] }));
const guia = () => screen.getByRole("region", { name: "Passo seguinte" });
const abrirMais = () => fireEvent.keyDown(within(guia()).getByRole("button", { name: "Mais" }), { key: "Enter" });
const nomesDoMenu = () => within(screen.getByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent?.trim());

const REMOVIDOS = [/^Registos e dados/, /^Visitas/, /^Negócios/, /^Submissões/, /^Atividade/, /Visita e levantamento/, /Criar negócio/, /Novo negócio/];

describe("Pipeline: o menu «Mais» sem a ficha antiga", () => {
  it("uma lead com visitas e submissões pendentes: o menu só tem Registar chamada, Nota, Adiar e Encerrar abordagem", () => {
    montar(comVisitas());
    abrirMais();
    for (const nome of REMOVIDOS) expect(screen.queryByRole("menuitem", { name: nome }), String(nome)).toBeNull();
    expect(nomesDoMenu()).toEqual(["Registar chamada", "Nota", "Adiar", "Encerrar abordagem"]);
  });

  it("com um negócio aberto o menu tem «Detalhes do negócio» e nada da ficha antiga", () => {
    montar(comNegocio(), { negocioInicial: "n1" });
    abrirMais();
    for (const nome of REMOVIDOS) expect(screen.queryByRole("menuitem", { name: nome }), String(nome)).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Detalhes do negócio" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Registar chamada" })).toBeInTheDocument();
  });

  it("um cliente (sem aoCriarNegocio) não ganha «Novo negócio» no menu", () => {
    montar(resumoBase(pessoa(), [], HOJE, "cliente", registosBase({ contactos: [contactoBase()] })));
    abrirMais();
    expect(screen.queryByRole("menuitem", { name: /negócio/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Registar chamada" })).toBeInTheDocument();
  });
});

describe("Pipeline: sem o diálogo «Mais sobre a pessoa» nem as suas ligações", () => {
  it("não há atalhos «N visitas», «N negócios» nem «N submissões novas» no cabeçalho", () => {
    montar(comVisitas());
    expect(within(guia()).queryByRole("button", { name: /\d+ visita/ })).toBeNull();
    expect(within(guia()).queryByRole("button", { name: /\d+ negócio/ })).toBeNull();
    expect(within(guia()).queryByRole("button", { name: /submiss.* nova/ })).toBeNull();
  });

  it("o cartão do cliente não tem «Ver toda a atividade»", () => {
    montar(comVisitas());
    expect(screen.queryByRole("button", { name: "Ver toda a atividade" })).toBeNull();
  });

  it("nenhum botão abre o diálogo de apoio e ele nunca existe", () => {
    montar(comVisitas());
    expect(screen.queryByRole("dialog", { name: "Mais sobre a pessoa" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("a faixa de alertas continua a dizer «visita por fechar» e «voltou a contactar», mas sem os botões que abriam o apoio", () => {
    const porFechar = resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1", { data: "2026-10-10" })] }));
    montar(porFechar, { voltou: true });
    const faixa = screen.getByRole("region", { name: "Alertas da ficha" });
    expect(within(faixa).getByText(/1 visita por fechar/)).toBeInTheDocument();
    expect(within(faixa).getByText(/Voltou a contactar/)).toBeInTheDocument();
    expect(within(faixa).queryByRole("button", { name: "Ver visitas" })).toBeNull();
    expect(within(faixa).queryByRole("button", { name: /^Ver submissões/ })).toBeNull();
  });

  it("«Detalhes do negócio» continua a abrir o seu próprio diálogo", () => {
    montar(comNegocio(), { negocioInicial: "n1" });
    abrirMais();
    fireEvent.click(screen.getByRole("menuitem", { name: "Detalhes do negócio" }));
    expect(screen.getByRole("dialog", { name: "Detalhes do negócio" })).toBeInTheDocument();
  });
});
