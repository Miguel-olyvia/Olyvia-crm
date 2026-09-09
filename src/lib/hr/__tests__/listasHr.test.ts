/**
 * As listas que os ecras OFERECEM: numero e ordem exactos.
 *
 * Este e o teste que apanha a regressao silenciosa -- uma opcao que desaparece
 * de um select nao rebenta nada, nao da erro de tipos e ninguem repara ate
 * alguem nao conseguir escolher o seu tipo de contrato. Foi exactamente esse o
 * pedido que originou esta ronda: quatro listas com os valores errados.
 *
 * A ordem faz parte do pedido, nao e acidente, por isso compara-se o array
 * inteiro e nao um conjunto.
 */
import { describe, expect, it } from "vitest";
import {
  FORMATOS_CONTA,
  HORAS_FREQUENCIAS,
  PERIODICIDADES,
  REGIMES_TRABALHO,
  TIPOS_CONTRATO,
  TIPOS_TRABALHO,
} from "@/types/hr";

describe("as listas do modulo de RH", () => {
  it("periodicidade do vencimento: cinco, por hora primeiro", () => {
    expect([...PERIODICIDADES]).toEqual(["hora", "diaria", "semanal", "mensal", "anual"]);
  });

  it("tipo de contrato: os SEIS oferecidos, termo certo primeiro e tempo parcial ultimo", () => {
    expect([...TIPOS_CONTRATO]).toEqual([
      "termo_certo",
      "sem_termo",
      "termo_incerto",
      "duracao_muito_curta",
      "temporario",
      "tempo_parcial",
    ]);
    // Seis, e nao cinco: "Tempo parcial" foi pedido e confirmado pelo
    // utilizador como tipo de contrato, alem de existir como `regime`.
    expect(TIPOS_CONTRATO).toHaveLength(6);
    expect(TIPOS_CONTRATO).toContain("tempo_parcial");
    // `estagio` e `prestacao_servicos` continuam LEGAIS na base -- o que se
    // testa e que nao se propoem, nao que deixaram de existir.
    expect(TIPOS_CONTRATO).not.toContain("estagio");
    expect(TIPOS_CONTRATO).not.toContain("prestacao_servicos");
  });

  it("tipo de trabalho: tempo integral ou parcial, e e o `regime`", () => {
    expect([...REGIMES_TRABALHO]).toEqual(["tempo_inteiro", "tempo_parcial"]);
  });

  it("modalidade continua a ser outro campo, com os seus tres valores", () => {
    expect([...TIPOS_TRABALHO]).toEqual(["presencial", "remoto", "hibrido"]);
  });

  it("frequencia das horas: dia, semana, mes, ano", () => {
    expect([...HORAS_FREQUENCIAS]).toEqual(["diaria", "semanal", "mensal", "anual"]);
  });

  it("formato da conta bancaria: os seis pedidos, por esta ordem", () => {
    expect([...FORMATOS_CONTA]).toEqual([
      "iban",
      "conta_mais_sort_code",
      "conta_mais_routing",
      "clabe",
      "banco_mais_conta",
      "outro",
    ]);
  });
});
