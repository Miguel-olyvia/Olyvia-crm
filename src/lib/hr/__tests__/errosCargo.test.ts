/**
 * Os erros do cargo e do salario, do lado do ecra (fluxo 2).
 *
 * A base recusa com SQLSTATE proprio (HRC01 a HRC13) e mensagem
 * "token: frase". `errosCargo.ts` e o UNICO catalogo desses codigos no
 * cliente; este teste exige que todos tenham texto nas cinco linguas.
 */
import { describe, expect, it } from "vitest";
import {
  CHAVE_POR_CODIGO,
  chaveDeErroCargo,
  codigoDeErroCargo,
} from "@/lib/hr/errosCargo";
import { translations } from "@/translations/index";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;

const CODIGOS_HRC = [
  "HRC01",
  "HRC02",
  "HRC03",
  "HRC04",
  "HRC05",
  "HRC06",
  "HRC07",
  "HRC08",
  "HRC09",
  "HRC10",
  "HRC11",
  "HRC12",
  "HRC13",
  "HRC14",
];

describe("CHAVE_POR_CODIGO", () => {
  it.each([...CODIGOS_HRC, "igualdade_salarial"])("%s tem chave de traducao", (codigo) => {
    expect(CHAVE_POR_CODIGO[codigo]).toMatch(/^hr\.cargos\.erro\./);
  });

  it.each(LINGUAS)("%s: todas as chaves existem, nao vazias e diferentes da chave", (lingua) => {
    const tabela = translations[lingua] as Record<string, string>;
    const emFalta = Object.values(CHAVE_POR_CODIGO).filter(
      (chave) => !tabela[chave] || tabela[chave] === chave,
    );
    expect(emFalta, `${lingua}: chaves por traduzir`).toEqual([]);
  });
});

describe("codigoDeErroCargo", () => {
  it("le o code do erro do PostgREST", () => {
    expect(codigoDeErroCargo({ code: "HRC06", message: "qualquer coisa" })).toBe("HRC06");
  });

  it("sem code, le o token antes dos dois pontos e devolve o codigo HRC", () => {
    expect(
      codigoDeErroCargo({ message: "alteracao_posterior_existe: Ana, Bruno e mais 2" }),
    ).toBe("HRC06");
    expect(codigoDeErroCargo({ message: "cargo_obrigatorio: falta o cargo" })).toBe("HRC08");
  });

  it("23514 com mensagem igualdade_salarial: usa o token, nao o 23514", () => {
    expect(
      codigoDeErroCargo({ code: "23514", message: "igualdade_salarial: o cargo paga 1000" }),
    ).toBe("igualdade_salarial");
  });

  it("erro sem nada de nosso devolve null; entradas estranhas nao rebentam", () => {
    expect(codigoDeErroCargo({ code: "42P01", message: "relation does not exist" })).toBeNull();
    expect(codigoDeErroCargo(null)).toBeNull();
    expect(codigoDeErroCargo(undefined)).toBeNull();
    expect(codigoDeErroCargo("texto")).toBeNull();
    expect(codigoDeErroCargo({})).toBeNull();
  });
});

describe("chaveDeErroCargo", () => {
  it("devolve a chave do codigo conhecido", () => {
    expect(chaveDeErroCargo({ code: "HRC05" })).toBe(CHAVE_POR_CODIGO.HRC05);
    expect(chaveDeErroCargo({ message: "sem_alteracao: igual" })).toBe(CHAVE_POR_CODIGO.HRC07);
  });

  it("desconhecido devolve null (cai no getFriendlyErrorMessage)", () => {
    expect(chaveDeErroCargo({ code: "XX000", message: "boom" })).toBeNull();
    expect(chaveDeErroCargo(new Error("falhou"))).toBeNull();
  });
});

describe("chaves herdadas do prototipo nao sao codigos nossos", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "code e token '%s' devolvem null",
    (nome) => {
      expect(codigoDeErroCargo({ code: nome })).toBeNull();
      expect(codigoDeErroCargo({ message: `${nome}: qualquer coisa` })).toBeNull();
      expect(chaveDeErroCargo({ code: nome, message: `${nome}: x` })).toBeNull();
    },
  );
});

describe("nome de cargo duplicado (HRC14 e 23505)", () => {
  const CHAVE = "hr.cargos.erro.nomeDuplicado";

  it("HRC14 pelo code e pelo token cargo_nome_duplicado", () => {
    const message = 'cargo_nome_duplicado: ja existe o cargo "Administrativo(a)"';
    expect(codigoDeErroCargo({ code: "HRC14", message })).toBe("HRC14");
    expect(codigoDeErroCargo({ message })).toBe("HRC14");
    expect(chaveDeErroCargo({ code: "HRC14", message })).toBe(CHAVE);
    expect(chaveDeErroCargo({ message })).toBe(CHAVE);
  });

  it.each(["hr_cargos_nome_unico_por_org", "hr_cargos_nome_chave_unica_por_org"])(
    "um 23505 do indice %s tem a mesma chave",
    (indice) => {
      const erro = {
        code: "23505",
        message: `duplicate key value violates unique constraint "${indice}"`,
        details: "Key (organization_id, nome)=(o, x) already exists.",
      };
      expect(codigoDeErroCargo(erro)).toBe("HRC14");
      expect(chaveDeErroCargo(erro)).toBe(CHAVE);
    },
  );

  it("um 23505 de outra tabela nao e reclamado", () => {
    expect(
      chaveDeErroCargo({
        code: "23505",
        message: 'duplicate key value violates unique constraint "pessoas_nif_key"',
      }),
    ).toBeNull();
    expect(chaveDeErroCargo({ code: "23505" })).toBeNull();
  });

  it("um 23505 de hr_cargos_periodos (prefixo parecido, outra tabela) nao e reclamado", () => {
    expect(
      chaveDeErroCargo({
        code: "23505",
        message: 'duplicate key value violates unique constraint "hr_cargos_periodos_pkey"',
      }),
    ).toBeNull();
  });

  it("o texto existe nas cinco linguas e nao e a propria chave", () => {
    for (const lingua of LINGUAS) {
      const tabela = translations[lingua] as Record<string, string>;
      expect(tabela[CHAVE], lingua).toBeTruthy();
      expect(tabela[CHAVE], lingua).not.toBe(CHAVE);
    }
  });
});

describe("sobreposicao de periodos (23P01)", () => {
  it.each(["cargo_periodo_sobreposto", "pessoa_cargo_sobreposto"])(
    "%s e reconhecido pelo token e traduzido pela chave propria",
    (token) => {
      const erro = { code: "23P01", message: `${token}: o periodo de 2026-01-01 a 2026-02-01 cruza-se` };
      expect(codigoDeErroCargo(erro)).not.toBeNull();
      expect(chaveDeErroCargo(erro)).toBe("hr.cargos.erro.sobreposto");
      expect(codigoDeErroCargo({ message: erro.message })).toBe(codigoDeErroCargo(erro));
    },
  );

  it("um 23P01 sem token nosso (outra exclusao qualquer) nao e reclamado", () => {
    expect(
      chaveDeErroCargo({ code: "23P01", message: "conflicting key value violates exclusion constraint" }),
    ).toBeNull();
  });
});
