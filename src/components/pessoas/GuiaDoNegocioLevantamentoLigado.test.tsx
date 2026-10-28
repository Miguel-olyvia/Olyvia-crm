// Um negócio da base, aberto, sem orçamentos, com uma chamada e um levantamento ligado (por fazer) está na coluna «Levantamento» do Quadro (é a regra da base:
// contrato > proposta > orçamento > levantamento ligado > visita > chamada). A ficha tem de concordar: abre em Levantamento (e não em Orçamento, com o passo
// «Criar o orçamento» por fazer), e a fase feita «Contacto» abre a chamada, só para ler.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { REGISTOS_VAZIOS, type EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { contactoBase, levantamentoBase, negocioBase, pessoaBase, resumoBase } from "./fabricaTestes";
import { MarcarVisitaContext } from "./marcarVisitaContexto";
import { itensDaPessoa } from "./processo/itensProcesso";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// Estes testes cobrem o fluxo do CRM, que se mantém para negócios com documentos do CRM: a leitura da Emylia fica simulada.
vi.mock("./negocioEmylia/useNegocioEmyliaDoGuia", async () => (await import("./negocioEmylia/guiaCrmTeste")).moduloGuiaCrm());
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

const HOJE = "2026-10-28";
const pessoa = pessoaBase("a", { nome: "Miguel tester", contacto: { telefone: "927 118 300", email: "m@x.pt" } });
// Um negócio da base (`estadoReal`), sem decisão do levantamento e sem orçamentos.
const negocio = { ...negocioBase("n1", { pessoa: "Miguel tester", servico: "WC social", estadoReal: "aberto", contacto: { telefone: "927 118 300", email: "m@x.pt" } }), notas: "", comercialId: "u1" };
const registos: EstadoRegistos = {
  ...REGISTOS_VAZIOS,
  contactos: [contactoBase("rc-1", { negocioId: "n1" })],
  levantamentos: [levantamentoBase("rl-1", { negocioId: "n1", estado: "porFazer" })],
};
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["quotes.create"] };
const processo = (): ProcessoValor => ({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), podeExecutar: () => true });
const itemDaFicha = () => itensDaPessoa(resumoBase(pessoa, [negocio], HOJE, "lead", registos), HOJE).find((i) => i.id === "n1");

describe("negócio da base com chamada e levantamento ligado, sem orçamentos: a ficha concorda com o Quadro", () => {
  it("o item do processo está em Levantamento (a coluna que a base dá), e não em Orçamento", () => {
    expect(itemDaFicha()?.fase).toBe("levantamento");
  });

  function abrir() {
    render(
      <ComClienteQuery><MemoryRouter>
        <FontePessoasContext.Provider value={REAL}>
          <ProcessoContext.Provider value={processo()}>
            <MarcarVisitaContext.Provider value={{ pedir: vi.fn(), marcadas: new Set() }}>
              <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ podeEditar: true, registos })}>
                <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} item={itemDaFicha()} pessoa={pessoa} atividade={[]} comGuia aoRegistarChamada={vi.fn()} />
              </ComCostura>
            </MarcarVisitaContext.Provider>
          </ProcessoContext.Provider>
        </FontePessoasContext.Provider>
      </MemoryRouter></ComClienteQuery>,
    );
  }

  it("a fase atual da barra é Levantamento, e não Orçamento", () => {
    abrir();
    const passos = screen.getByRole("navigation", { name: "Passos da fase" }).textContent ?? "";
    expect(passos).toMatch(/Levantamento/);
    expect(passos).not.toMatch(/Orçamento/);
    expect(screen.queryByText(/Criar o orçamento/)).toBeNull();
  });

  it("a fase feita «Contactado» abre a chamada, só para ler, com o que ficou registado", () => {
    abrir();
    const feitas = screen.getByRole("navigation", { name: "Fases feitas" });
    // com a barra única a fase feita chama-se como a coluna do quadro (Contactado); abre o mesmo ecrã de sempre
    fireEvent.click(within(feitas).getByRole("button", { name: /^Contactado/ }));
    expect(screen.getByText(/fase feita/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("927 118 300")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voltar ao passo atual" })).toBeInTheDocument();
  });
});
