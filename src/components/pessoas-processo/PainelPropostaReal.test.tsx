// «Criar proposta» na ficha real: hospeda o diálogo de propostas que a app já tem (`ProposalCreateDialog`), já com a pessoa e o orçamento do
// negócio, e liga a proposta ao negócio (neg_ligar_registo) assim que é guardada. Se a ligação falhar, a proposta fica criada e diz-se.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ComCostura, erroNegFalso, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { PainelPropostaReal, type NegocioDaProposta } from "./PainelPropostaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { dialogo, sucesso, erro } = vi.hoisted(() => ({ dialogo: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/components/proposals/ProposalCreateDialog", () => ({ ProposalCreateDialog: (p: unknown) => { dialogo(p); return null; } }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: sucesso, error: erro } }));

afterEach(() => { cleanup(); dialogo.mockReset(); sucesso.mockReset(); erro.mockReset(); });

const negocio: NegocioDaProposta = { id: "n1", entityId: "e1", orcamentoId: "q-1" };
type PropsDoDialogo = {
  open: boolean; onOpenChange: (a: boolean) => void; presetEntityId?: string; presetQuoteIds?: string[]; onSaved?: (id: string) => void;
};
const ultimo = (): PropsDoDialogo => dialogo.mock.calls[dialogo.mock.calls.length - 1][0] as PropsDoDialogo;

function montar(mutacoes: MutacoesNegocio = mutacoesFalsas(), n: NegocioDaProposta | null = negocio) {
  const aoFechar = vi.fn();
  render(<ComCostura mutacoes={mutacoes}><PainelPropostaReal negocio={n} mutacoes={mutacoes} aoFechar={aoFechar} /></ComCostura>);
  return { aoFechar, mutacoes };
}

describe("PainelPropostaReal: abrir", () => {
  it("fechado (sem negócio) o diálogo está fechado", () => {
    montar(mutacoesFalsas(), null);
    expect(ultimo().open).toBe(false);
  });

  it("aberto leva a pessoa e o orçamento do negócio (carregado por id, mesmo em rascunho)", () => {
    montar();
    expect(ultimo()).toMatchObject({ open: true, presetEntityId: "e1", presetQuoteIds: ["q-1"] });
  });

  it("sem orçamento no negócio não leva orçamentos", () => {
    montar(mutacoesFalsas(), { ...negocio, orcamentoId: null });
    expect(ultimo().presetQuoteIds).toBeUndefined();
  });

  it("fechar o diálogo pede ao painel que feche; abrir não faz nada", () => {
    const { aoFechar } = montar();
    ultimo().onOpenChange(true);
    expect(aoFechar).not.toHaveBeenCalled();
    ultimo().onOpenChange(false);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("PainelPropostaReal: ligar ao negócio depois de guardar", () => {
  it("liga a proposta guardada ao negócio e avisa", async () => {
    const mutacoes = mutacoesFalsas();
    montar(mutacoes);
    ultimo().onSaved?.("pr-7");
    await vi.waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "proposta", id: "pr-7" }));
    await vi.waitFor(() => expect(sucesso).toHaveBeenCalledWith("Proposta criada e ligada ao negócio."));
    expect(erro).not.toHaveBeenCalled();
  });

  it("se a ligação falha, a proposta fica criada: diz-se com a causa traduzida e refaz-se a ficha", async () => {
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng001", "NG001"); }) });
    montar(mutacoes);
    ultimo().onSaved?.("pr-7");
    await vi.waitFor(() => expect(erro).toHaveBeenCalledTimes(1));
    expect(erro.mock.calls[0][0]).toContain("A proposta foi criada, mas não ficou ligada ao negócio.");
    expect(erro.mock.calls[0][0]).toContain("Este negócio já não está disponível.");
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(sucesso).not.toHaveBeenCalled();
  });
});

describe("PainelPropostaReal: o diálogo chama onSaved depois de pedir para fechar", () => {
  it("liga ao negócio mesmo quando o painel já fechou (o negócio já não vem nas props)", async () => {
    const mutacoes = mutacoesFalsas();
    const { rerender } = render(<ComCostura mutacoes={mutacoes}><PainelPropostaReal negocio={negocio} mutacoes={mutacoes} aoFechar={vi.fn()} /></ComCostura>);
    // O diálogo fecha-se (o painel passa a `null`) e só depois chama o `onSaved` mais recente.
    rerender(<ComCostura mutacoes={mutacoes}><PainelPropostaReal negocio={null} mutacoes={mutacoes} aoFechar={vi.fn()} /></ComCostura>);
    ultimo().onSaved?.("pr-9");
    await vi.waitFor(() => expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "proposta", id: "pr-9" }));
  });
});
