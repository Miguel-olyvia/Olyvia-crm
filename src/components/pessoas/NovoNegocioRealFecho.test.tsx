// «Como fecha este negócio?» no «Novo negócio» da ficha real: duas opções («No contrato», por omissão, e «Na proposta (venda directa)»), enviadas
// em `fecho` ao criar (a base recebe-as em p_fecho). Com «Na proposta» os contratos não se oferecem nem seguem no pedido. O exemplo (sem base) não
// leva este grupo.
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { NovoNegocioReal } from "./NovoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  let contador = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `id-${++contador}` });
});
afterEach(() => { cleanup(); repor(); vi.unstubAllGlobals(); });

function Harness() {
  const [aberto, setAberto] = useState(true);
  return <NovoNegocioReal pessoaId="a" pessoaNome="Ana" aberto={aberto} aoCriado={vi.fn()} aoMudarAberto={setAberto} />;
}

function montar(mutacoes: MutacoesNegocio = mutacoesFalsas(), dados: Partial<DadosNegocio> = {}) {
  render(
    <AnuncioFichaContext.Provider value={vi.fn()}>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos(dados)}><Harness /></ComCostura>
    </AnuncioFichaContext.Provider>,
  );
  return mutacoes;
}
const titulo = () => screen.getByRole("textbox", { name: /^Título do negócio/ });
const criar = () => screen.getByRole("button", { name: /^(Criar o negócio|A guardar…)$/ });
const grupo = () => screen.getByRole("radiogroup", { name: "Como fecha este negócio?" });
const opcao = (nome: string) => within(grupo()).getByRole("radio", { name: nome });
const aba = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${nome}`) }), { button: 0 });
const contratoSemProposta = { tipo: "contrato" as const, id: "k1", numero: "C-1", temBase: true };

describe("«Como fecha este negócio?»", () => {
  it("oferece «No contrato» (marcada por omissão) e «Na proposta (venda directa)»", () => {
    montar();
    expect(opcao("No contrato")).toBeChecked();
    expect(opcao("Na proposta (venda directa)")).not.toBeChecked();
    expect(within(grupo()).getAllByRole("radio")).toHaveLength(2);
  });

  it("sem tocar no grupo cria com fecho «contrato»", () => {
    const mutacoes = montar();
    fireEvent.change(titulo(), { target: { value: "Cozinha" } });
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ fecho: "contrato" }));
  });

  it("escolher «Na proposta (venda directa)» cria com fecho «proposta»", () => {
    const mutacoes = montar();
    fireEvent.change(titulo(), { target: { value: "Cozinha" } });
    fireEvent.click(opcao("Na proposta (venda directa)"));
    expect(opcao("Na proposta (venda directa)")).toBeChecked();
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ id: "id-1", titulo: "Cozinha", fecho: "proposta" }));
  });

  it("voltar a «No contrato» antes de criar manda «contrato»", () => {
    const mutacoes = montar();
    fireEvent.change(titulo(), { target: { value: "Cozinha" } });
    fireEvent.click(opcao("Na proposta (venda directa)"));
    fireEvent.click(opcao("No contrato"));
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ fecho: "contrato" }));
  });

  it("o grupo vê-se também sem permissão para ligar registos (a pergunta é do negócio, não dos registos)", () => {
    montar(mutacoesFalsas(), { podeEditar: false });
    expect(opcao("No contrato")).toBeChecked();
  });

});

describe("«Na proposta (venda directa)» não oferece contratos", () => {
  const dados = { documentosPorLigar: [contratoSemProposta, { tipo: "proposta" as const, id: "p1", numero: "P-1", temBase: true }] };
  const comDocumentos = () => mutacoesFalsas({ criarComDocumentos: true });

  it("com «No contrato» o contrato por ligar oferece-se na aba Registos", () => {
    montar(comDocumentos(), dados);
    aba("Registos");
    expect(screen.getByRole("checkbox", { name: "Contrato C-1" })).toBeInTheDocument();
  });

  it("com «Na proposta» o contrato por ligar deixa de se oferecer, e a proposta continua", () => {
    montar(comDocumentos(), dados);
    fireEvent.click(opcao("Na proposta (venda directa)"));
    aba("Registos");
    expect(screen.queryByRole("checkbox", { name: "Contrato C-1" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Proposta P-1" })).toBeInTheDocument();
  });

  it("um contrato marcado antes de mudar para «Na proposta» não segue no pedido", () => {
    const mutacoes = montar(comDocumentos(), dados);
    fireEvent.change(titulo(), { target: { value: "Cozinha" } });
    aba("Registos");
    fireEvent.click(screen.getByRole("checkbox", { name: "Contrato C-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Proposta P-1" }));
    aba("Geral");
    fireEvent.click(opcao("Na proposta (venda directa)"));
    fireEvent.click(criar());
    const pedido = (mutacoes.criar as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pedido.fecho).toBe("proposta");
    expect(pedido.registos).toEqual([{ tipo: "proposta", id: "p1" }]);
  });

  it("com «No contrato» o contrato marcado segue no pedido", () => {
    const mutacoes = montar(comDocumentos(), dados);
    fireEvent.change(titulo(), { target: { value: "Cozinha" } });
    aba("Registos");
    fireEvent.click(screen.getByRole("checkbox", { name: "Contrato C-1" }));
    fireEvent.click(criar());
    expect(mutacoes.criar).toHaveBeenCalledWith(expect.objectContaining({ fecho: "contrato", registos: [{ tipo: "contrato", id: "k1" }] }));
  });
});
