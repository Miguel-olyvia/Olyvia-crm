/**
 * "Tempo parcial" existe em dois campos ao mesmo tempo -- e o sexto TIPO DE
 * CONTRATO e um dos dois valores de `regime` ("Tipo de trabalho"). A base
 * aceita a contradicao de proposito: `regime` e NOT NULL DEFAULT
 * 'tempo_inteiro' e nenhum CHECK consegue distinguir um regime ESCOLHIDO de um
 * que veio por omissao, pelo que recusaria justamente o caso mais comum.
 *
 * Quem faz essa distincao e o ecra, e e ela que estes testes fixam: o regime
 * segue o tipo enquanto ninguem lhe tocar, e uma escolha feita a mao nunca e
 * silenciada -- passa a ser avisada.
 */
import { describe, expect, it } from "vitest";
import { regimeAoMudarTipoContrato, regimeContradizTipoContrato } from "@/lib/hr/contrato";

describe("o regime quando o tipo de contrato passa a tempo parcial", () => {
  it("segue o tipo, quando ninguem escolheu o regime a mao", () => {
    expect(regimeAoMudarTipoContrato("tempo_parcial", "tempo_inteiro", false)).toBe(
      "tempo_parcial",
    );
  });

  it("nao silencia um regime escolhido a mao", () => {
    expect(regimeAoMudarTipoContrato("tempo_parcial", "tempo_inteiro", true)).toBe("tempo_inteiro");
  });

  it("nao mexe no regime quando o tipo e outro qualquer", () => {
    expect(regimeAoMudarTipoContrato("sem_termo", "tempo_inteiro", false)).toBe("tempo_inteiro");
    expect(regimeAoMudarTipoContrato("termo_certo", "tempo_inteiro", false)).toBe("tempo_inteiro");
    expect(regimeAoMudarTipoContrato("", "tempo_inteiro", false)).toBe("tempo_inteiro");
  });

  it("so segue para a frente: sair de tempo parcial NAO repoe tempo inteiro", () => {
    // Um contrato sem termo a tempo parcial e legal e nao se desfaz sozinho.
    expect(regimeAoMudarTipoContrato("sem_termo", "tempo_parcial", false)).toBe("tempo_parcial");
  });

  it("e idempotente: escolher tempo parcial duas vezes da o mesmo", () => {
    const primeira = regimeAoMudarTipoContrato("tempo_parcial", "tempo_inteiro", false);
    expect(regimeAoMudarTipoContrato("tempo_parcial", primeira, false)).toBe(primeira);
  });
});

describe("o aviso de contradicao junto ao regime", () => {
  it("aparece com tipo tempo parcial e regime tempo inteiro", () => {
    expect(regimeContradizTipoContrato("tempo_parcial", "tempo_inteiro")).toBe(true);
  });

  it("nao aparece quando os dois dizem tempo parcial", () => {
    expect(regimeContradizTipoContrato("tempo_parcial", "tempo_parcial")).toBe(false);
  });

  it("nao aparece quando o tipo de contrato e outro", () => {
    expect(regimeContradizTipoContrato("sem_termo", "tempo_inteiro")).toBe(false);
    expect(regimeContradizTipoContrato("temporario", "tempo_parcial")).toBe(false);
    expect(regimeContradizTipoContrato("", "tempo_inteiro")).toBe(false);
  });

  it("nunca aparece a seguir a um seguimento automatico", () => {
    const regime = regimeAoMudarTipoContrato("tempo_parcial", "tempo_inteiro", false);
    expect(regimeContradizTipoContrato("tempo_parcial", regime)).toBe(false);
  });
});
