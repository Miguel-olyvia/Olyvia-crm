/**
 * `anexosRh`: permissoes de escrita por tipo (so para esconder/desactivar no
 * ecra) e a chave de traducao do erro de um anexo anexado pelo RH.
 */
import { describe, expect, it } from "vitest";
import {
  LIMITES_ANEXOS,
  PERMISSAO_ESCRITA_POR_TIPO,
  chaveDeErroAnexoRh,
  formatarTamanho,
  podeAnexarTipo,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
  type PermissoesEscritaAnexos,
} from "../anexosRh";

const NADA: PermissoesEscritaAnexos = {
  identificacaoEdit: false,
  bancariosEdit: false,
  pessoaisEdit: false,
};

describe("PERMISSAO_ESCRITA_POR_TIPO", () => {
  it("e a mesma de hr_anexo_rh_permissao_escrita", () => {
    expect(PERMISSAO_ESCRITA_POR_TIPO).toEqual({
      cartao_cidadao: "hr.pessoas.identificacao.edit",
      comprovativo_iban: "hr.pessoas.bancarios.edit",
      fotografia: "hr.pessoas.pessoais.edit",
    });
  });
});

describe("podeAnexarTipo", () => {
  it("sem nenhuma permissao nao pode nenhum tipo", () => {
    expect(podeAnexarTipo("cartao_cidadao", NADA)).toBe(false);
    expect(podeAnexarTipo("comprovativo_iban", NADA)).toBe(false);
    expect(podeAnexarTipo("fotografia", NADA)).toBe(false);
  });

  it("cada permissao abre so o seu tipo", () => {
    expect(podeAnexarTipo("cartao_cidadao", { ...NADA, identificacaoEdit: true })).toBe(true);
    expect(podeAnexarTipo("comprovativo_iban", { ...NADA, identificacaoEdit: true })).toBe(false);
    expect(podeAnexarTipo("comprovativo_iban", { ...NADA, bancariosEdit: true })).toBe(true);
    expect(podeAnexarTipo("fotografia", { ...NADA, bancariosEdit: true })).toBe(false);
    expect(podeAnexarTipo("fotografia", { ...NADA, pessoaisEdit: true })).toBe(true);
    expect(podeAnexarTipo("cartao_cidadao", { ...NADA, pessoaisEdit: true })).toBe(false);
  });

  it("um tipo desconhecido, ou permissoes em falta, nao pode", () => {
    expect(podeAnexarTipo("outro" as never, { ...NADA, pessoaisEdit: true })).toBe(false);
    expect(podeAnexarTipo("fotografia", undefined as never)).toBe(false);
    expect(podeAnexarTipo("fotografia", null as never)).toBe(false);
  });
});

describe("chaveDeErroAnexoRh", () => {
  it("os codigos proprios do RH tem chave propria", () => {
    expect(chaveDeErroAnexoRh("sem_permissao")).toBe("hr.anexos.erro.semPermissao");
    expect(chaveDeErroAnexoRh("pessoa_nao_encontrada")).toBe("hr.anexos.erro.pessoaNaoEncontrada");
    expect(chaveDeErroAnexoRh("anexo_substituto_invalido")).toBe("hr.anexos.erro.substitutoInvalido");
    expect(chaveDeErroAnexoRh("anexo_limite_pessoa")).toBe("hr.anexos.erro.limitePessoa");
    expect(chaveDeErroAnexoRh("demasiadas_tentativas")).toBe("hr.anexos.erro.demasiadasTentativas");
  });

  it("os anexo_* do convite delegam em chaveDeErroAnexo", () => {
    expect(chaveDeErroAnexoRh("anexo_formato_invalido")).toBe("hr.convite.erro.anexoFormato");
    expect(chaveDeErroAnexoRh("anexo_tipo_cheio")).toBe("hr.convite.erro.anexoTipoCheio");
    expect(chaveDeErroAnexoRh("anexo_vazio")).toBe("hr.convite.erro.anexoVazio");
    expect(chaveDeErroAnexoRh("anexo_falha_envio")).toBe("hr.convite.erro.anexoFalhaEnvio");
  });

  it("desconhecido, nulo ou inesperado cai em falhaEnvio e nunca devolve o codigo", () => {
    for (const c of ["erro_inesperado", "nao_sei", "anexo_inventado", "", null, undefined]) {
      expect(chaveDeErroAnexoRh(c as never)).toBe("hr.anexos.erro.falhaEnvio");
    }
  });
});

describe("reexportacoes do convite", () => {
  it("mantem os mesmos limites e validacoes", () => {
    expect(LIMITES_ANEXOS.maxActivos).toBe(4);
    expect(validarFicheiroLocal("fotografia", { type: "application/pdf", size: 10 })).toBe(
      "anexo_fotografia_formato",
    );
    expect(verificarLimitesDeContagem("fotografia", { fotografia: 1 })).toBe("anexo_tipo_cheio");
    expect(formatarTamanho(2048)).toBe("2 KB");
  });
});
