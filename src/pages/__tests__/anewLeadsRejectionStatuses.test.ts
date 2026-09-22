import { describe, expect, it } from "vitest";
import {
  DEFAULT_REJECTION_STATUS_NAMES,
  getRejectionStatusNames,
  shouldApplyRejectionUnion,
  sumRejectionStatusCounts,
} from "../leads/rejectionStatuses";

/**
 * O invariante que estas funções existem para garantir:
 *
 *   o número que um cartão mostra == o número de linhas que a lista devolve
 *   quando se clica nesse cartão.
 *
 * Antes disto o cartão somava `lost + rejected` mas o clique filtrava só pelo
 * `name` da etapa. Numa organização cuja etapa de rejeição se chama `rejected`
 * (caso real: BMGest) a união nunca acontecia — estava presa à string "lost" —
 * e uma lead em `lost` era contada pelo cartão mas nunca listada.
 */
describe("getRejectionStatusNames", () => {
  it("inclui o nome da etapa marcada is_rejection (caso BMGest: 'rejected')", () => {
    const nomes = getRejectionStatusNames([
      { name: "contacted", is_rejection: false },
      { name: "rejected", is_rejection: true },
    ]);
    expect(nomes).toContain("rejected");
    expect(nomes).toContain("lost");
  });

  it("aceita uma etapa com nome próprio marcada is_rejection", () => {
    const nomes = getRejectionStatusNames([{ name: "perdido_sem_resposta", is_rejection: true }]);
    expect(nomes).toContain("perdido_sem_resposta");
  });

  it("mantém os literais por omissão quando nenhuma etapa é de rejeição", () => {
    const nomes = getRejectionStatusNames([{ name: "contacted", is_rejection: false }]);
    expect(nomes).toEqual([...DEFAULT_REJECTION_STATUS_NAMES]);
  });

  it("aguenta lista vazia, nula e indefinida", () => {
    expect(getRejectionStatusNames([])).toEqual([...DEFAULT_REJECTION_STATUS_NAMES]);
    expect(getRejectionStatusNames(null)).toEqual([...DEFAULT_REJECTION_STATUS_NAMES]);
    expect(getRejectionStatusNames(undefined)).toEqual([...DEFAULT_REJECTION_STATUS_NAMES]);
  });

  it("não devolve duplicados quando a etapa repete um literal", () => {
    const nomes = getRejectionStatusNames([
      { name: "lost", is_rejection: true },
      { name: "rejected", is_rejection: true },
    ]);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("ignora nomes vazios ou só com espaços", () => {
    const nomes = getRejectionStatusNames([
      { name: "   ", is_rejection: true },
      { name: null, is_rejection: true },
    ]);
    expect(nomes).toEqual([...DEFAULT_REJECTION_STATUS_NAMES]);
  });
});

describe("shouldApplyRejectionUnion", () => {
  const nomes = getRejectionStatusNames([{ name: "rejected", is_rejection: true }]);

  it("une quando o filtro é o nome da etapa de rejeição", () => {
    expect(shouldApplyRejectionUnion("rejected", nomes)).toBe(true);
  });

  it("une quando o filtro é o 'lost' por omissão", () => {
    expect(shouldApplyRejectionUnion("lost", nomes)).toBe(true);
  });

  it("NÃO une para estados que não são de rejeição", () => {
    expect(shouldApplyRejectionUnion("qualified", nomes)).toBe(false);
    expect(shouldApplyRejectionUnion("contacted", nomes)).toBe(false);
    expect(shouldApplyRejectionUnion("visit_scheduled", nomes)).toBe(false);
  });

  it("NÃO une para 'all', vazio, nulo ou indefinido", () => {
    expect(shouldApplyRejectionUnion("all", nomes)).toBe(false);
    expect(shouldApplyRejectionUnion("", nomes)).toBe(false);
    expect(shouldApplyRejectionUnion(null, nomes)).toBe(false);
    expect(shouldApplyRejectionUnion(undefined, nomes)).toBe(false);
  });
});

describe("sumRejectionStatusCounts", () => {
  const nomes = getRejectionStatusNames([{ name: "rejected", is_rejection: true }]);

  it("soma todos os estados de rejeição", () => {
    expect(sumRejectionStatusCounts({ lost: 2, rejected: 9, contacted: 30 }, nomes)).toBe(11);
  });

  it("conta o literal legado 'Rejected' com maiúscula", () => {
    expect(sumRejectionStatusCounts({ Rejected: 4 }, nomes)).toBe(4);
  });

  it("devolve 0 sem contagens", () => {
    expect(sumRejectionStatusCounts({}, nomes)).toBe(0);
    expect(sumRejectionStatusCounts(null, nomes)).toBe(0);
    expect(sumRejectionStatusCounts(undefined, nomes)).toBe(0);
  });

  it("o que o cartão soma é exactamente o que o filtro abrange", () => {
    // O invariante, escrito como teste: os nomes usados na soma têm de ser os
    // mesmos que a união do filtro aplica.
    const contagens: Record<string, number> = { lost: 2, rejected: 9, qualified: 5 };
    const doCartao = sumRejectionStatusCounts(contagens, nomes);
    const daLista = nomes.reduce((t, n) => t + (contagens[n] || 0), 0);
    expect(doCartao).toBe(daLista);
    expect(doCartao).toBe(11);
  });
});
