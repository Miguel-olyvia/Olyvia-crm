// Contactado: outra chamada/tentativa regista-se SEMPRE; «Sem interesse» e «Número errado» avisam e bloqueiam só «Marcar a visita».
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComClienteQuery } from "@/test/clienteQueryTeste";
import { contactoBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import { FichaPessoa, type FichaPessoaProps } from "./FichaPessoa";
import { MarcarVisitaContext, type MarcarVisitaValor } from "./marcarVisitaContexto";
import type { AcoesFicha } from "./PainelBase";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);

const HOJE = "2026-10-13";
const acoesBase = (extra: Partial<AcoesFicha> = {}): AcoesFicha => ({
  registarChamada: vi.fn(), adiar: vi.fn(), encerrar: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
  registarResultadoVisita: vi.fn(), ...extra,
});

function montar(resumo: ResumoPessoa, acoes: AcoesFicha = acoesBase()) {
  const processo: ProcessoValor = { executar: vi.fn(), abrirVisitaLevantamento: vi.fn() };
  const marcar: MarcarVisitaValor = { pedir: vi.fn(), marcadas: new Set<string>() };
  const props: FichaPessoaProps = {
    resumo, aberto: true, aoFechar: vi.fn(), idsVisiveis: [], aoIrPara: vi.fn(), hoje: HOJE, submissoes: [], notas: [], atividade: [],
    pessoas: new Map([[resumo.pessoa.id, resumo.pessoa]]), voltou: false, podeVerSubmissoes: false, acoes,
    aoPedir: vi.fn(), aoVerTodasSubmissoes: vi.fn(), aoCriarNegocio: vi.fn(), comGuia: true,
  };
  render(
    <ComClienteQuery>
      <ProcessoContext.Provider value={processo}>
        <MarcarVisitaContext.Provider value={marcar}><FichaPessoa {...props} /></MarcarVisitaContext.Provider>
      </ProcessoContext.Provider>
    </ComClienteQuery>,
  );
  return { marcar };
}

/** Em Contactado o assistente abre no primeiro passo que falta; «Marcar a visita» é o 5.º passo. */
const irParaMarcar = (): void => fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /^Marcar a visita/ }));

const pessoa = (extra: Partial<Pessoa> = {}) => pessoaBase("a", { nome: "Pedro Lopes", contacto: { telefone: "927 118 300", email: "pedro.lopes@exemplo.pt" }, ...extra });
const comResultado = (resultado: "semInteresse" | "numeroErrado" | "atendeuInteressado") =>
  resumoBase(pessoa(), [], HOJE, "lead", registosBase({ contactos: [contactoBase("c1", { resultado })] }));

describe("contactado: outra chamada e o aviso de «Marcar a visita»", () => {
  it.each([["semInteresse", "Sem interesse"], ["numeroErrado", "Número errado"]] as const)("%s: avisa, bloqueia a visita e não a marca", (resultado, texto) => {
    const { marcar } = montar(comResultado(resultado));
    irParaMarcar();
    const botao = screen.getByRole("button", { name: "Marcar a visita" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText(new RegExp(texto)).length).toBeGreaterThan(0);
    fireEvent.click(botao);
    expect(marcar.pedir).not.toHaveBeenCalled();
  });

  it.each(["semInteresse", "numeroErrado", "atendeuInteressado"] as const)("%s: «Registar outra chamada» continua disponível e abre o formulário", (resultado) => {
    montar(comResultado(resultado));
    fireEvent.click(screen.getByRole("button", { name: "Registar outra chamada" }));
    expect(screen.getByRole("heading", { name: "Registar chamada" })).toBeInTheDocument();
  });

  it("com interesse a visita marca-se normalmente", () => {
    const { marcar } = montar(comResultado("atendeuInteressado"));
    irParaMarcar();
    const botao = screen.getByRole("button", { name: "Marcar a visita" });
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    expect(marcar.pedir).toHaveBeenCalledTimes(1);
  });

  it("por contactar não repete o botão: o passo já é registar a chamada", () => {
    montar(resumoBase(pessoa(), [], HOJE, "lead"));
    expect(screen.queryByRole("button", { name: "Registar outra chamada" })).toBeNull();
  });

  it("sem a capacidade de registar chamadas não se oferece", () => {
    montar(comResultado("semInteresse"), acoesBase({ capacidades: { chamada: false } as never }));
    expect(screen.queryByRole("button", { name: "Registar outra chamada" })).toBeNull();
  });
});
