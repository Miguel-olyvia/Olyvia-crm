// «Apagar lead» / «Apagar cliente» no fim do menu «Mais»: só existe com o contexto da ficha real e a permissão (o contexto só se dá a quem a tem),
// é a vermelho e separado, abre a confirmação, e com negócios abertos fica desativado com a explicação em texto.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import { ApagarPessoaFichaContext, type ApagarPessoaFicha } from "./apagarPessoaContexto";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { ProcessoContext } from "./processo/processoContexto";
import type { PapelPessoa } from "./pessoasTipos";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

function montar(opcoes: { apagar?: ApagarPessoaFicha | null; papel?: PapelPessoa; comAberto?: boolean } = {}) {
  const abertos = opcoes.comAberto ? [negocioBase("n1")] : [];
  const resumo = resumoBase(pessoaBase("a"), abertos, "2026-10-13", opcoes.papel ?? "lead", registosBase({ contactos: [contactoBase()] }));
  render(
    <ProcessoContext.Provider value={{ executar: vi.fn(), abrirVisitaLevantamento: vi.fn() }}>
      <ApagarPessoaFichaContext.Provider value={opcoes.apagar ?? null}>
        <BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" aoAbrir={vi.fn()} aoReativar={vi.fn()} />
      </ApagarPessoaFichaContext.Provider>
    </ProcessoContext.Provider>,
  );
}
const abrirMais = () => fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
const item = (nome: RegExp) => screen.queryByRole("menuitem", { name: nome });

describe("menu «Mais»: apagar a pessoa", () => {
  it("sem o contexto (sem permissão, ou o exemplo) não há item de apagar", () => {
    montar({ apagar: null });
    abrirMais();
    expect(item(/Apagar/)).toBeNull();
  });

  it("com permissão numa lead: «Apagar lead», a vermelho, que abre a confirmação", () => {
    const abrir = vi.fn();
    montar({ apagar: { pode: true, abrir } });
    abrirMais();
    const apagar = item(/^Apagar lead$/);
    expect(apagar).toBeInTheDocument();
    expect(apagar).toHaveClass("text-destructive");
    expect(apagar).not.toHaveAttribute("aria-disabled");
    fireEvent.click(apagar as HTMLElement);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("num cliente diz «Apagar cliente»", () => {
    montar({ apagar: { pode: true, abrir: vi.fn() }, papel: "cliente" });
    abrirMais();
    expect(item(/^Apagar cliente$/)).toBeInTheDocument();
    expect(item(/^Apagar lead$/)).toBeNull();
  });

  it("com `pode` falso o item não aparece", () => {
    montar({ apagar: { pode: false, abrir: vi.fn() } });
    abrirMais();
    expect(item(/Apagar/)).toBeNull();
  });

  it("com negócios abertos fica desativado e a explicação é texto ligado ao item", () => {
    const abrir = vi.fn();
    montar({ apagar: { pode: true, abrir }, comAberto: true });
    abrirMais();
    const apagar = item(/^Apagar lead$/) as HTMLElement;
    expect(apagar).toHaveAttribute("aria-disabled", "true");
    const explicacao = document.getElementById(apagar.getAttribute("aria-describedby") ?? "");
    expect(explicacao).toHaveTextContent(/Tem negócios abertos/);
    fireEvent.click(apagar);
    expect(abrir).not.toHaveBeenCalled();
  });
});
