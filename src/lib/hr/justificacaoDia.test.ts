/**
 * O contrato entre o ecrã e as RPCs `rpc_hr_justificacao_dia_*`: o que a decisão devolve, como se traduzem os erros que a
 * base levanta e como se reconhece que a migration ainda não está aplicada. Funções puras; nada toca em base nenhuma.
 */
import { describe, expect, it } from "vitest";
import {
  CHAVE_ERRO_MES_FECHADO,
  chaveDoErroDeJustificacaoDia,
  horaSemSegundos,
  resultadoDaDecisao,
  rpcIndisponivel,
} from "@/lib/hr/justificacaoDia";
import { CHAVE_ERRO_MES_FECHADO as CHAVE_ERRO_MES_FECHADO_DO_ECRA } from "@/components/rh-exemplo/lib/justificacaoDia";
import { rhExemploJustificacoesTranslations } from "@/translations/rhExemploJustificacoes";

describe("resultadoDaDecisao", () => {
  it("lê a primeira linha de uma lista (TABLE devolvida pelo PostgREST)", () => {
    expect(resultadoDaDecisao([{ falta_id: "f-1", mes_fechado: true }])).toEqual({ faltaId: "f-1", mesFechado: true });
  });

  it("aceita o objecto solto", () => {
    expect(resultadoDaDecisao({ falta_id: "f-2", mes_fechado: false })).toEqual({ faltaId: "f-2", mesFechado: false });
  });

  it("recusar não cria falta: falta_id nulo e mês aberto", () => {
    expect(resultadoDaDecisao([{ falta_id: null, mes_fechado: false }])).toEqual({ faltaId: null, mesFechado: false });
  });

  it.each([null, undefined, [], "texto", 3, [null]])("qualquer outra coisa (%j) é «sem falta, mês aberto»", (entrada) => {
    expect(resultadoDaDecisao(entrada)).toEqual({ faltaId: null, mesFechado: false });
  });

  it("só um boolean verdadeiro conta como mês fechado, e só uma cadeia como id", () => {
    expect(resultadoDaDecisao([{ falta_id: 7, mes_fechado: "true" }])).toEqual({ faltaId: null, mesFechado: false });
  });
});

describe("horaSemSegundos", () => {
  it("corta «HH:MM:SS» para «HH:MM»", () => {
    expect(horaSemSegundos("09:15:00")).toBe("09:15");
    expect(horaSemSegundos("09:15")).toBe("09:15");
  });

  it("vazio, nulo e indefinido dão cadeia vazia", () => {
    expect(horaSemSegundos("")).toBe("");
    expect(horaSemSegundos(null)).toBe("");
    expect(horaSemSegundos(undefined)).toBe("");
  });
});

describe("chaveDoErroDeJustificacaoDia", () => {
  it.each([
    ["justificacao_dia_fora_do_prazo", "rhJust.erro.foraDoPrazo"],
    ["justificacao_dia_ja_ha_falta", "rhJust.erro.jaHaFalta"],
    ["justificacao_dia_ja_enviada", "rhJust.erro.jaEnviada"],
    ["justificacao_dia_ja_decidida", "rhJust.erro.jaDecidida"],
    ["justificacao_dia_falta_divergente", "rhJust.erro.faltaDivergente"],
    ["justificacao_dia_data_futura", "rhJust.erro.dataFutura"],
    ["justificacao_dia_motivo_curto", "rhJust.erro.motivoCurto"],
    ["justificacao_dia_inexistente", "rhJust.erro.inexistente"],
    ["justificacao_dia_pessoa_invalida", "rhJust.erro.pessoaInvalida"],
    ["justificacao_dia_sem_permissao", "rhJust.erro.semPermissao"],
    ["justificacao_dia_sem_sessao", "rhJust.erro.semPermissao"],
    // Os restantes RAISE do rascunho NOVO-20261231800000 (revisão de 27/10).
    ["justificacao_dia_falta_ja_decidida", "rhJust.erro.faltaJaDecidida"],
    ["justificacao_dia_falta_sobreposta", "rhJust.erro.faltaSobreposta"],
    ["justificacao_dia_mes_fechado", CHAVE_ERRO_MES_FECHADO],
    ["justificacao_dia_propria_decisao", "rhJust.erro.propriaDecisao"],
    ["justificacao_dia_recusa_sem_motivo", "rhJust.erro.recusaSemMotivo"],
    ["justificacao_dia_decisao_invalida", "rhJust.erro.decisaoInvalida"],
    ["justificacao_dia_motivo_invalido", "rhJust.erro.motivoInvalido"],
    ["justificacao_dia_tipo_invalido", "rhJust.erro.tipoInvalido"],
    ["justificacao_dia_periodo_invalido", "rhJust.erro.periodoInvalido"],
    ["justificacao_dia_anexos_invalidos", "rhJust.erro.anexosInvalidos"],
    ["justificacao_dia_dados_em_falta", "rhJust.erro.dadosEmFalta"],
    ["justificacao_dia_intervalo_invalido", "rhJust.erro.intervaloInvalido"],
    ["justificacao_dia_intervalo_obrigatorio", "rhJust.erro.intervaloInvalido"],
    ["justificacao_dia_sem_utilizador", "rhJust.erro.semPermissao"],
  ])("traduz %s", (prefixo, chave) => {
    expect(chaveDoErroDeJustificacaoDia({ message: `${prefixo}: texto da base` })).toBe(chave);
    // Toda a chave a que um erro da base chega tem texto em pt e em en.
    expect(rhExemploJustificacoesTranslations.pt[chave]).toEqual(expect.any(String));
    expect(rhExemploJustificacoesTranslations.en[chave]).toEqual(expect.any(String));
  });

  it("a chave do mês fechado é a mesma que o ecrã de /rh-exemplo espera para abrir a confirmação", () => {
    expect(CHAVE_ERRO_MES_FECHADO).toBe(CHAVE_ERRO_MES_FECHADO_DO_ECRA);
  });

  it("a falta já decidida não se confunde com a justificação já decidida", () => {
    expect(chaveDoErroDeJustificacaoDia({ message: "justificacao_dia_falta_ja_decidida: a falta ja tem" })).toBe("rhJust.erro.faltaJaDecidida");
    expect(chaveDoErroDeJustificacaoDia({ message: "justificacao_dia_ja_decidida: ja esta" })).toBe("rhJust.erro.jaDecidida");
  });

  it("reconhece o prefixo mesmo no meio de uma mensagem maior, e numa cadeia solta", () => {
    expect(chaveDoErroDeJustificacaoDia({ message: "ERROR: justificacao_dia_ja_enviada (23505)" })).toBe("rhJust.erro.jaEnviada");
    expect(chaveDoErroDeJustificacaoDia("justificacao_dia_fora_do_prazo")).toBe("rhJust.erro.foraDoPrazo");
  });

  it.each([null, undefined, {}, { message: "" }, 42])("sem mensagem (%j) não há chave", (entrada) => {
    expect(chaveDoErroDeJustificacaoDia(entrada)).toBeNull();
  });
});

describe("rpcIndisponivel", () => {
  it("reconhece os códigos de função inexistente do Postgres e do PostgREST", () => {
    expect(rpcIndisponivel({ code: "42883", message: "x" })).toBe(true);
    expect(rpcIndisponivel({ code: "PGRST202", message: "x" })).toBe(true);
  });

  it("reconhece a mensagem quando o código não vem", () => {
    expect(rpcIndisponivel({ message: "Could not find the function public.rpc_hr_justificacao_dia_listar in the schema cache" })).toBe(true);
    expect(rpcIndisponivel({ message: 'function rpc_hr_justificacao_dia_listar(uuid) does not exist' })).toBe(true);
  });

  it("uma recusa de permissão ou um timeout não são «por aplicar»", () => {
    expect(rpcIndisponivel({ code: "42501", message: "permission denied" })).toBe(false);
    expect(rpcIndisponivel({ code: "57014", message: "statement timeout" })).toBe(false);
  });

  it.each([null, undefined, "função inexistente", 7])("%j não é um erro reconhecível", (entrada) => {
    expect(rpcIndisponivel(entrada)).toBe(false);
  });
});
