/**
 * `camposDoConvite`: so os campos da pessoa na posicao `convite` entram na
 * lista que trava a submissao do convite. `ficha` e `opcional` ficam de fora.
 */
import { describe, expect, it } from "vitest";
import {
  CAMPOS_OBRIGATORIOS_ADMISSAO,
  campoEhObrigatorio,
  camposDoConvite,
  type ConfiguracaoCampo,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";
import { CAMPOS_RH_OBRIGATORIOS } from "@/lib/hr/admissaoCamposRh";

function linha(codigo: string, posicao: ConfiguracaoCampo["posicao"]): ConfiguracaoCampo {
  return {
    codigo,
    origem: posicao === "rh" ? "rh" : "pessoa",
    condicional: false,
    posicao,
    configuravel: posicao !== "rh",
  };
}

const VAZIO = Object.fromEntries(
  CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => [c.codigo, ""]),
) as unknown as RascunhoConviteObrigatorios;

describe("camposDoConvite", () => {
  it("sem configuracao devolve a lista completa (o comportamento de sempre)", () => {
    expect(camposDoConvite(null)).toBe(CAMPOS_OBRIGATORIOS_ADMISSAO);
    expect(camposDoConvite(undefined)).toBe(CAMPOS_OBRIGATORIOS_ADMISSAO);
  });

  it("so mantem os campos na posicao convite, pela ordem da lista fixa", () => {
    const config = [
      linha("genero", "convite"),
      linha("data_nascimento", "convite"),
      linha("telefone_pessoal", "ficha"),
      linha("nacionalidade", "opcional"),
    ];

    const codigos = camposDoConvite(config).map((c) => c.codigo);

    expect(codigos).toEqual(["data_nascimento", "genero"]);
  });

  it("um campo na ficha ou opcional deixa de ser obrigatorio no convite", () => {
    const config = [linha("telefone_pessoal", "ficha"), linha("genero", "convite")];
    const campos = camposDoConvite(config);

    expect(campoEhObrigatorio(VAZIO, "telefone_pessoal", campos)).toBe(false);
    expect(campoEhObrigatorio(VAZIO, "genero", campos)).toBe(true);
  });

  it("mantem as condicoes (NIF so quando falta o NISS)", () => {
    const campos = camposDoConvite([linha("nif", "convite"), linha("niss", "convite")]);

    expect(campoEhObrigatorio(VAZIO, "nif", campos)).toBe(true);
    expect(campoEhObrigatorio({ ...VAZIO, niss: "12345678902" }, "nif", campos)).toBe(false);
  });

  it("ignora linhas de origem rh", () => {
    const campos = camposDoConvite([linha("data_admissao", "rh"), linha("genero", "convite")]);

    expect(campos.map((c) => c.codigo)).toEqual(["genero"]);
  });
});

describe("CAMPOS_RH_OBRIGATORIOS", () => {
  it("o tipo de horario fica indisponivel ate haver o lote dos horarios", () => {
    const horario = CAMPOS_RH_OBRIGATORIOS.find((c) => c.codigo === "tipo_horario");
    expect(horario?.disponivel).toBe(false);
  });

  it("os obrigatorios do RH disponiveis sao os cinco da base", () => {
    const codigos = CAMPOS_RH_OBRIGATORIOS.filter((c) => c.disponivel !== false).map(
      (c) => c.codigo,
    );
    expect(codigos).toEqual([
      "data_admissao",
      "cargo",
      "tipo_contrato",
      "subsidio_alimentacao",
      "duodecimos",
    ]);
  });
});
