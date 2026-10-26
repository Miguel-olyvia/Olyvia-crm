// A abordagem DO NEGÓCIO (o Pipeline só tem negócios): um negócio ainda sem orçamento, proposta, contrato nem levantamento guardado está em Por contactar,
// Contactado ou Visita, conforme o que tem ligado (a mesma regra que a base usa para a coluna do quadro). O passo de cada fase é o do quadro.
import { describe, expect, it } from "vitest";
import { faseDaAbordagem, itemComFaseDaAbordagem, ehFaseDeAbordagem } from "./abordagemDoNegocio";
import { passoDoItem } from "./passosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "n1", pessoaId: "a", tipo: "negocio", fase: "orcamento", trabalho: "WC", valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});
const SEM = { contactos: 0, visitasMarcadas: 0, levantamentos: 0, comLevantamentoEscrito: false };

describe("os passos de um negócio na abordagem (os mesmos do quadro)", () => {
  it.each([["porContactar", "registarChamada"], ["contactado", "marcarVisita"], ["visita", "fazerLevantamento"], ["levantamento", "fazerLevantamento"]] as const)(
    "fase %s -> %s", (fase, passo) => {
      expect(passoDoItem(item({ fase })).id).toBe(passo);
    },
  );

  it("as fases do negócio mais à frente não mudam (orçamento sem orçamentos continua a pedir o orçamento)", () => {
    expect(passoDoItem(item({ fase: "orcamento" })).id).toBe("criarOrcamento");
    expect(passoDoItem(item({ fase: "proposta" })).id).toBe("registarRespostaCliente");
    expect(passoDoItem(item({ fase: "contrato" })).id).toBe("registarAssinatura");
  });
});

describe("faseDaAbordagem: a coluna de um negócio que ainda não tem orçamento", () => {
  it("sem nada ligado: Por contactar", () => {
    expect(faseDaAbordagem(item(), SEM)).toBe("porContactar");
  });

  it("com uma chamada ligada: Contactado", () => {
    expect(faseDaAbordagem(item(), { ...SEM, contactos: 1 })).toBe("contactado");
  });

  it("com uma visita marcada (não cancelada): Visita, mesmo sem chamadas", () => {
    expect(faseDaAbordagem(item(), { ...SEM, visitasMarcadas: 1 })).toBe("visita");
    expect(faseDaAbordagem(item(), { ...SEM, contactos: 2, visitasMarcadas: 1 })).toBe("visita");
  });

  it("as visitas canceladas não contam (só chegam como visitasMarcadas as que não estão canceladas)", () => {
    expect(faseDaAbordagem(item(), { ...SEM, contactos: 1, visitasMarcadas: 0 })).toBe("contactado");
  });

  it("com o levantamento já guardado deixa a fase como está (o orçamento é o passo seguinte)", () => {
    expect(faseDaAbordagem(item(), { ...SEM, levantamentos: 1 })).toBe("orcamento");
    expect(faseDaAbordagem(item(), { ...SEM, comLevantamentoEscrito: true })).toBe("orcamento");
  });

  it("um negócio com orçamento, proposta ou contrato nunca volta à abordagem", () => {
    expect(faseDaAbordagem(item({ orcamentos: 1 }), SEM)).toBe("orcamento");
    expect(faseDaAbordagem(item({ fase: "proposta" }), SEM)).toBe("proposta");
    expect(faseDaAbordagem(item({ fase: "contrato" }), SEM)).toBe("contrato");
  });

  it("Levantamento (a decisão escrita no negócio) fica Levantamento: é a fase Visita do assistente", () => {
    expect(faseDaAbordagem(item({ fase: "levantamento" }), SEM)).toBe("levantamento");
  });

  it("um item de pessoa não se mexe", () => {
    expect(faseDaAbordagem(item({ tipo: "pessoa", fase: "contactado" }), SEM)).toBe("contactado");
  });
});

describe("itemComFaseDaAbordagem", () => {
  it("devolve um item novo com a fase certa, sem tocar no original", () => {
    const original = item();
    const novo = itemComFaseDaAbordagem(original, { ...SEM, contactos: 1 });
    expect(novo.fase).toBe("contactado");
    expect(original.fase).toBe("orcamento");
    expect(novo).not.toBe(original);
  });

  it("se a fase não muda devolve o mesmo item (sem renders a mais)", () => {
    const original = item({ fase: "proposta" });
    expect(itemComFaseDaAbordagem(original, SEM)).toBe(original);
  });

  it("o passo do item novo é o da fase", () => {
    expect(passoDoItem(itemComFaseDaAbordagem(item(), { ...SEM, visitasMarcadas: 1 })).id).toBe("fazerLevantamento");
  });
});

describe("ehFaseDeAbordagem", () => {
  it.each(["porContactar", "contactado", "visita", "levantamento"] as const)("%s é abordagem", (f) => expect(ehFaseDeAbordagem(f)).toBe(true));
  it.each(["orcamento", "proposta", "contrato"] as const)("%s não é", (f) => expect(ehFaseDeAbordagem(f)).toBe(false));
});
