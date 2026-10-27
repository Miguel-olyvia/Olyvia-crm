// Abrir uma fase JÁ FEITA no guia de um negócio mostra o MESMO ecrã do passo (as mesmas perguntas, campos e opções) com o que ficou escolhido e escrito, só para
// ler, e não uma lista de rótulo e valor. Por contactar (Quem pede, Contacto, Origem) e Contactado e Visita abrem os seus ecrãs; nada se grava.
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
const item: ItemProcesso = {
  id: "n1", pessoaId: "a", tipo: "negocio", fase: "orcamento", trabalho: "WC social", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false,
};
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const processo = (): ProcessoValor => ({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true });

function abrir(registos: Partial<EstadoRegistos>, pessoa = pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro@x.pt" } })) {
  render(
    <ComClienteQuery><MemoryRouter>
      <FontePessoasContext.Provider value={REAL}>
        <ProcessoContext.Provider value={processo()}>
          <MarcarVisitaContext.Provider value={{ pedir: vi.fn(), marcadas: new Set() }}>
            <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true, registos: { ...REGISTOS_VAZIOS, ...registos } })}>
              <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} item={item} pessoa={pessoa} atividade={[]} comGuia aoRegistarChamada={vi.fn()} />
            </ComCostura>
          </MarcarVisitaContext.Provider>
        </ProcessoContext.Provider>
      </FontePessoasContext.Provider>
    </MemoryRouter></ComClienteQuery>,
  );
}

const COM_CHAMADA: Partial<EstadoRegistos> = { contactos: [contactoBase("rc-1", { negocioId: "n1" })] };
const COM_VISITA: Partial<EstadoRegistos> = { ...COM_CHAMADA, visitas: [visitaPessoaBase("rv-1", { negocioId: "n1" })] };
const fasesFeitas = () => screen.getByRole("navigation", { name: "Fases feitas" });
const passos = () => screen.getByRole("navigation", { name: "Passos da fase" });
const abrirFase = (nome: RegExp) => fireEvent.click(within(fasesFeitas()).getByRole("button", { name: nome }));

describe("Por contactar, vista a partir de uma fase mais à frente: o mesmo ecrã de cada passo, preenchido", () => {
  it("Quem pede abre o grupo de campos (tipo de cliente e NIF), desativado, com a frase da fase feita e o caminho de volta", () => {
    abrir(COM_VISITA);
    abrirFase(/^Por contactar/);
    expect(screen.getByRole("heading", { name: "Quem pede" })).toBeInTheDocument();
    expect(screen.getByLabelText("NIF")).toBeDisabled();
    expect(screen.getAllByRole("radio").length).toBeGreaterThan(0);
    expect(screen.getByRole("note")).toHaveTextContent("Esta fase já está feita");
    expect(screen.getByRole("button", { name: "Voltar ao passo atual" })).toBeInTheDocument();
  });

  it("Contacto mostra o telefone e o email que a ficha tem, nos mesmos campos da Chamada", () => {
    abrir(COM_VISITA);
    abrirFase(/^Por contactar/);
    fireEvent.click(within(passos()).getByRole("button", { name: /^Contacto/ }));
    expect(screen.getByDisplayValue("927 118 300")).toBeDisabled();
    expect(screen.getByDisplayValue("pedro@x.pt")).toBeDisabled();
  });

  it("Origem sem campanha nem formulário diz «Por preencher» nos dois campos, sem inventar valores", () => {
    abrir(COM_VISITA);
    abrirFase(/^Por contactar/);
    fireEvent.click(within(passos()).getByRole("button", { name: /^Origem/ }));
    expect(screen.getAllByPlaceholderText("Por preencher")).toHaveLength(2);
  });

  it("Origem com campanha e formulário mostra-os preenchidos", () => {
    abrir(COM_VISITA, pessoaBase("a", { nome: "Pedro Lopes", campanha: "Verão 26", formulario: "Orçamento WC" }));
    abrirFase(/^Por contactar/);
    fireEvent.click(within(passos()).getByRole("button", { name: /^Origem/ }));
    expect(screen.getByDisplayValue("Verão 26")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Orçamento WC")).toBeInTheDocument();
  });
});

describe("Contactado, vista a partir da Visita: o assistente da chamada, só para ler", () => {
  it("abre a Chamada com os campos preenchidos e desativados, diz que a fase está feita e não deixa continuar nem registar", () => {
    abrir(COM_VISITA);
    abrirFase(/^Contactado/);
    expect(screen.getByText(/Passo 1 de 5 · fase feita/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("927 118 300")).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Esta fase já está feita");
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Registar chamada/ })).toBeNull();
  });

  it("os outros passos da fase abrem o mesmo ecrã: a Morada da obra sem campos editáveis", () => {
    abrir(COM_VISITA);
    abrirFase(/^Contactado/);
    fireEvent.click(within(passos()).getByRole("button", { name: /^Morada da obra/ }));
    expect(screen.getByLabelText("Rua e número")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Criar o negócio" })).toBeNull();
  });

  it("«Voltar ao passo atual» regressa ao assistente da fase atual, onde se pode agir", () => {
    abrir(COM_VISITA);
    abrirFase(/^Contactado/);
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao passo atual" }));
    expect(screen.queryByText(/fase feita/)).toBeNull();
    expect(within(passos()).getByRole("button", { name: /^Visitas/ })).toBeInTheDocument();
  });
});
