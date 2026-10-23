// «Visita e levantamento» no menu «Mais» da ficha real: com a capacidade `visita` ligada (a chamada marca visitas na base), o item só aparece se o
// processo da ficha sabe abrir o painel. Na ficha real o painel (o levantamento é do P5) ainda não grava na base: o item não se mostra, em vez de
// ficar um botão que não faz nada. No exemplo (o processo abre o painel) o item continua lá.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { BarraAcoesFicha } from "./BarraAcoesFicha";
import { contactoBase, pessoaBase, registosBase, resumoBase } from "./fabricaTestes";
import type { CapacidadesFicha } from "./PainelBase";
import { ProcessoContext, type ProcessoValor } from "./processo/processoContexto";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);

const CAPACIDADES_REAIS: CapacidadesFicha = { chamada: true, encerrar: true, adiar: true, nota: true, visita: true, negocios: true, gerirVisitas: true };

function montar(processo: ProcessoValor | null) {
  const resumo = resumoBase(pessoaBase("a"), [], "2026-10-13", "lead", registosBase({ contactos: [contactoBase()] }));
  const barra = (
    <BarraAcoesFicha resumo={resumo} aberta={null} painelId="p" capacidades={CAPACIDADES_REAIS} aoAbrir={vi.fn()} aoReativar={vi.fn()} aoCriarNegocio={vi.fn()} />
  );
  render(processo ? <ProcessoContext.Provider value={processo}>{barra}</ProcessoContext.Provider> : barra);
  fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
}
const item = () => screen.queryByRole("menuitem", { name: /Visita e levantamento/ });

describe("«Visita e levantamento» com a capacidade visita ligada", () => {
  it("ficha real: o processo diz que não abre o painel (comPainelVisita false) e o item não se mostra", () => {
    montar({ executar: vi.fn(), abrirVisitaLevantamento: vi.fn(), comPainelVisita: false });
    expect(item()).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Nota/ })).toBeInTheDocument();
  });

  it("exemplo: o processo abre o painel (sem a marca) e o item mostra-se e abre-o", () => {
    const abrir = vi.fn();
    montar({ executar: vi.fn(), abrirVisitaLevantamento: abrir });
    fireEvent.click(item() as HTMLElement);
    expect(abrir).toHaveBeenCalledWith("a", expect.anything());
  });
});
