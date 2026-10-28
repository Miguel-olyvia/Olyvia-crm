// O contrato do prazo para justificar faltas e justificacoes de dia, configuravel por organizacao
// (desenho em supabase/rascunhos/DESENHO-prazo-configuravel.md). Funcoes puras: nada toca em base nenhuma.
import { describe, expect, it } from "vitest";
import {
  PRAZO_JUSTIFICACAO_MAX,
  PRAZO_JUSTIFICACAO_MIN,
  PRAZO_JUSTIFICACAO_OMISSAO,
  chaveDoErroDeRegrasAssiduidade,
  janelaDeDesviosDias,
  lerRespostaDasRegras,
  prazoJustificacaoValido,
} from "./regrasAssiduidade";

describe("limites do prazo", () => {
  it("a omissao e 5 dias uteis, e os limites sao 1 e 30", () => {
    expect(PRAZO_JUSTIFICACAO_OMISSAO).toBe(5);
    expect(PRAZO_JUSTIFICACAO_MIN).toBe(1);
    expect(PRAZO_JUSTIFICACAO_MAX).toBe(30);
  });

  it.each([1, 5, 8, 30])("aceita %i", (n) => expect(prazoJustificacaoValido(n)).toBe(true));
  it.each([0, -1, 31, 2.5, Number.NaN, Number.POSITIVE_INFINITY, "5", null, undefined])("recusa %s", (n) =>
    expect(prazoJustificacaoValido(n)).toBe(false),
  );
});

describe("lerRespostaDasRegras", () => {
  it("le a linha que a RPC devolve (lista de uma linha)", () => {
    expect(
      lerRespostaDasRegras([{ prazo_justificacao_dias: 8, gravado: true, updated_at: "2026-10-27T10:00:00Z", pode_alterar: true }]),
    ).toEqual({ prazoJustificacaoDias: 8, gravado: true, podeAlterar: true });
  });

  it("aceita o objecto solto", () => {
    expect(lerRespostaDasRegras({ prazo_justificacao_dias: 3, gravado: true, pode_alterar: false })).toEqual({
      prazoJustificacaoDias: 3,
      gravado: true,
      podeAlterar: false,
    });
  });

  it("sem linha, sem resposta ou com lixo cai em 5, nao gravado e sem poder alterar", () => {
    const omissao = { prazoJustificacaoDias: 5, gravado: false, podeAlterar: false };
    expect(lerRespostaDasRegras(null)).toEqual(omissao);
    expect(lerRespostaDasRegras(undefined)).toEqual(omissao);
    expect(lerRespostaDasRegras([])).toEqual(omissao);
    expect(lerRespostaDasRegras("x")).toEqual(omissao);
  });

  it("um prazo fora dos limites nunca chega ao ecra: cai em 5", () => {
    expect(lerRespostaDasRegras([{ prazo_justificacao_dias: 99, gravado: true, pode_alterar: true }]).prazoJustificacaoDias).toBe(5);
    expect(lerRespostaDasRegras([{ prazo_justificacao_dias: null, gravado: true, pode_alterar: true }]).prazoJustificacaoDias).toBe(5);
  });

  it("so um `true` a sério conta como gravado e como pode alterar", () => {
    const r = lerRespostaDasRegras([{ prazo_justificacao_dias: 7, gravado: "true", pode_alterar: 1 }]);
    expect(r).toEqual({ prazoJustificacaoDias: 7, gravado: false, podeAlterar: false });
  });
});

describe("janelaDeDesviosDias", () => {
  it("nunca fica abaixo de 30 dias de calendario", () => {
    expect(janelaDeDesviosDias(1)).toBe(30);
    expect(janelaDeDesviosDias(5)).toBe(30);
    expect(janelaDeDesviosDias(15)).toBe(30);
  });

  it("cobre o prazo mais folga: 30 dias uteis pedem 49 de calendario", () => {
    expect(janelaDeDesviosDias(30)).toBe(49);
    expect(janelaDeDesviosDias(20)).toBe(35);
  });

  it("e sempre maior do que o prazo em dias de calendario (7/5 do prazo)", () => {
    for (let dias = PRAZO_JUSTIFICACAO_MIN; dias <= PRAZO_JUSTIFICACAO_MAX; dias++) {
      expect(janelaDeDesviosDias(dias)).toBeGreaterThanOrEqual(Math.ceil((dias * 7) / 5));
    }
  });

  it("um valor invalido usa a omissao", () => {
    expect(janelaDeDesviosDias(Number.NaN)).toBe(30);
  });
});

describe("chaveDoErroDeRegrasAssiduidade", () => {
  it("traduz os dois erros que a RPC de gravar levanta", () => {
    expect(chaveDoErroDeRegrasAssiduidade({ message: "regras_assiduidade_sem_permissao" })).toBe("rhRegrasAssid.erro.semPermissao");
    expect(chaveDoErroDeRegrasAssiduidade({ message: "regras_assiduidade_prazo_invalido: 31" })).toBe("rhRegrasAssid.erro.prazoInvalido");
  });

  it("aceita o erro como texto", () => {
    expect(chaveDoErroDeRegrasAssiduidade("regras_assiduidade_prazo_invalido")).toBe("rhRegrasAssid.erro.prazoInvalido");
  });

  it("um erro que nao conhece devolve null (quem chama usa a mensagem amigavel)", () => {
    expect(chaveDoErroDeRegrasAssiduidade({ message: "statement timeout" })).toBeNull();
    expect(chaveDoErroDeRegrasAssiduidade(null)).toBeNull();
    expect(chaveDoErroDeRegrasAssiduidade({})).toBeNull();
  });
});
