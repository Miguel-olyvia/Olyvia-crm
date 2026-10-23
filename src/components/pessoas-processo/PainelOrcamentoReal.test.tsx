// «Criar orçamento» na ficha real: hospeda o editor de orçamentos que a app já tem (`QuoteBuilder`), já com a pessoa escolhida, e liga o orçamento
// ao negócio (neg_ligar_registo) logo a seguir a ele ser guardado. Se a ligação falhar, o orçamento fica criado e diz-se, sem o esconder.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FechoV4Context } from "@/components/negocio-metas/bandeiraFecho";
import { ComCostura, erroNegFalso, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { PainelOrcamentoReal, type NegocioDoOrcamento } from "./PainelOrcamentoReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { construtor, sucesso, erro } = vi.hoisted(() => ({ construtor: vi.fn(), sucesso: vi.fn(), erro: vi.fn() }));
vi.mock("@/components/QuoteBuilder", () => ({ QuoteBuilder: (p: unknown) => { construtor(p); return <div data-testid="construtor" />; } }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: sucesso, error: erro } }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); construtor.mockReset(); sucesso.mockReset(); erro.mockReset(); });

const negocio: NegocioDoOrcamento = {
  id: "n1", nome: "Ana Lopes", entityId: "e1", organizationId: "org-1", origem: { tipo: "lead", id: "lead-1" },
};
type PropsDoConstrutor = {
  quoteId: string | null; onClose: () => void; onSaved: (id: string) => Promise<void>;
  initialEntity: { kind: string; id: string; name: string; entity_id: string | null; organization_id: string | null };
};
const ultimo = (): PropsDoConstrutor => construtor.mock.calls[construtor.mock.calls.length - 1][0] as PropsDoConstrutor;

// Por omissao o fluxo novo (bandeira do fecho ligada); `ligada = false` monta o caminho antigo, que continua a existir com a bandeira desligada.
function montar(mutacoes: MutacoesNegocio = mutacoesFalsas(), n: NegocioDoOrcamento | null = negocio, ligada = true) {
  const aoFechar = vi.fn();
  render(<FechoV4Context.Provider value={ligada}><ComCostura mutacoes={mutacoes}><PainelOrcamentoReal negocio={n} mutacoes={mutacoes} aoFechar={aoFechar} /></ComCostura></FechoV4Context.Provider>);
  return { aoFechar, mutacoes };
}
const montarDesligada = (mutacoes: MutacoesNegocio = mutacoesFalsas()) => montar(mutacoes, negocio, false);

describe("PainelOrcamentoReal: abrir", () => {
  it("fechado (sem negócio) não monta o editor", () => {
    montar(mutacoesFalsas(), null);
    expect(construtor).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aberto monta o editor de orçamentos num diálogo com nome, para um orçamento novo e com a pessoa já escolhida", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Novo orçamento de Ana Lopes" })).toBeInTheDocument();
    expect(screen.getByTestId("construtor")).toBeInTheDocument();
    expect(ultimo().quoteId).toBeNull();
    expect(ultimo().initialEntity).toEqual({ kind: "lead", id: "lead-1", name: "Ana Lopes", entity_id: "e1", organization_id: "org-1" });
  });

  it("uma pessoa que já é cliente chega como cliente", () => {
    montar(mutacoesFalsas(), { ...negocio, origem: { tipo: "client", id: "cli-1" } });
    expect(ultimo().initialEntity).toMatchObject({ kind: "client", id: "cli-1" });
  });

  it("o editor fecha o painel pelo onClose", () => {
    const { aoFechar } = montar();
    ultimo().onClose();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("PainelOrcamentoReal: com a bandeira do fecho ligada o orçamento nasce ligado", () => {

  it("o editor recebe o negócio para criar por neg_criar_orcamento; desligada, não", () => {
    montar();
    expect((ultimo() as { criarNoNegocioId?: string }).criarNoNegocioId).toBe("n1");
    cleanup();
    montarDesligada();
    expect((ultimo() as { criarNoNegocioId?: string }).criarNoNegocioId).toBeUndefined();
  });

  it("depois de guardar não volta a ligar (já nasceu ligado): refaz a ficha e avisa", async () => {
    const { mutacoes } = montar();
    await ultimo().onSaved("q-9");
    expect(mutacoes.ligar).not.toHaveBeenCalled();
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(sucesso).toHaveBeenCalledWith("Orçamento criado e ligado ao negócio.");
  });
});

describe("PainelOrcamentoReal: com a bandeira desligada liga ao negócio depois de guardar", () => {
  it("liga o orçamento guardado ao negócio, avisa, e só devolve depois de ligar (o editor só fecha depois)", async () => {
    let ligou = false;
    const ligar = vi.fn(async () => { await Promise.resolve(); ligou = true; });
    const mutacoes = mutacoesFalsas({ ligar });
    montarDesligada(mutacoes);
    await ultimo().onSaved("q-9");
    expect(ligar).toHaveBeenCalledWith("n1", { tipo: "orcamento", id: "q-9" });
    expect(ligou).toBe(true);
    expect(sucesso).toHaveBeenCalledWith("Orçamento criado e ligado ao negócio.");
    expect(erro).not.toHaveBeenCalled();
  });

  it("se a ligação falha, o orçamento fica criado: diz-se com a causa traduzida, refaz-se a ficha, e o editor pode fechar", async () => {
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng004", "NG004"); }) });
    montarDesligada(mutacoes);
    await expect(ultimo().onSaved("q-9")).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalledTimes(1);
    expect(erro.mock.calls[0][0]).toContain("O orçamento foi criado, mas não ficou ligado ao negócio.");
    expect(erro.mock.calls[0][0]).toContain("Este registo não pode ser ligado a este negócio.");
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("um erro sem chave conhecida diz a mensagem genérica, nunca o texto cru", async () => {
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw new Error("relation \"quotes\" does not exist"); }) });
    montarDesligada(mutacoes);
    await ultimo().onSaved("q-9");
    expect(erro.mock.calls[0][0]).toContain("Não foi possível concluir a ação. Tente novamente.");
    expect(erro.mock.calls[0][0]).not.toContain("relation");
  });
});
