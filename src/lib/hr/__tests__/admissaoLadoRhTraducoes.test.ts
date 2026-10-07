/**
 * As chaves de traducao do lado do RH da admissao (convite na ficha, pendencias
 * em tres posicoes, credenciais, formulario interno, edicao de NIF/NISS) tem de
 * existir nas cinco linguas.
 *
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem: quem
 * esquecesse uma lingua veria "hr.convite.estado.pendente" no ecra. Este teste
 * falha antes disso.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;

/** Todas as chaves que o codigo do lado do RH pede e que sao novas neste fluxo. */
const CHAVES_LADO_RH: readonly string[] = [
  // Dialogo de envio e cartao do estado do convite
  "hr.convite.emailNaoEnviado",
  "hr.convite.copiarLink",
  "hr.convite.linkCopiado",
  "hr.convite.linkUmaVez",
  "hr.convite.linkDoConvite",
  "hr.convite.reenviar",
  "hr.convite.tituloReenviar",
  "hr.convite.emailNaoEnviadoBadge",
  "hr.convite.estado.titulo",
  "hr.convite.estado.pendente",
  "hr.convite.estado.pendenteSemEmail",
  "hr.convite.estado.usado",
  "hr.convite.estado.expirado",
  "hr.convite.estado.bloqueado",
  "hr.convite.estado.desconhecido",
  "hr.convite.estado.recusaDuplicado",
  "hr.convite.estado.ultimaRecusa",
  "hr.convite.estado.abrirFicha",
  // Erros de NIF/NISS (formulario, edicao na ficha, friendlyError)
  "hr.convite.erro.nifInvalido",
  "hr.convite.erro.nissInvalido",
  "hr.duplicados.nifNaFicha",
  "hr.duplicados.nissNaFicha",
  "hr.duplicados.nifJaExisteRh",
  "hr.duplicados.nissJaExisteRh",
  // Pendencias em tres posicoes
  "hr.pendencias.noConvite",
  "hr.pendencias.naFicha",
  "hr.pendencias.campo.cargo",
  "hr.pendencias.campo.tipo_contrato",
  "hr.pendencias.campo.subsidio_alimentacao",
  "hr.pendencias.campo.duodecimos",
  "hr.pendencias.campo.tipo_horario",
  "hr.pendencias.campo.local_trabalho",
  "hr.pendencias.campo.reporta_a",
  // Credenciais
  "hr.acesso.bloqueadoPendencias",
  "hr.acesso.erroFichaIncompleta",
  "hr.acesso.erroContaSemEmail",
  "hr.acesso.erroInesperado",
  "hr.convite.erro.pessoaNaoEncontrada",
  "hr.convite.erro.validadeInvalida",
  "hr.convite.erro.inesperado",
  // Formulario interno
  "hr.form.camposFicamPendencia",
  "hr.form.avisoCampoRhPendente",
];

describe("traducoes do lado do RH da admissao", () => {
  it("nao ha chaves repetidas na lista", () => {
    expect(new Set(CHAVES_LADO_RH).size).toBe(CHAVES_LADO_RH.length);
  });

  it.each(LINGUAS)("%s tem todas as chaves, nenhuma vazia nem igual a chave", (lingua) => {
    const tabela = translations[lingua] as Record<string, string>;
    const emFalta = CHAVES_LADO_RH.filter((chave) => !tabela[chave] || tabela[chave] === chave);
    expect(emFalta, `${lingua}: chaves por traduzir`).toEqual([]);
  });

  it.each(LINGUAS)("%s: os textos com {{nome}} e companhia mantem os parametros", (lingua) => {
    const tabela = translations[lingua] as Record<string, string>;
    const esperados: Record<string, string[]> = {
      "hr.convite.estado.pendente": ["email", "data"],
      "hr.convite.estado.pendenteSemEmail": ["data"],
      "hr.convite.estado.usado": ["data"],
      "hr.convite.estado.expirado": ["data"],
      "hr.convite.estado.recusaDuplicado": ["campo", "nome"],
      "hr.convite.estado.ultimaRecusa": ["mensagem"],
      "hr.duplicados.nifNaFicha": ["nome"],
      "hr.duplicados.nissNaFicha": ["nome"],
      "hr.acesso.bloqueadoPendencias": ["n"],
    };
    for (const [chave, parametros] of Object.entries(esperados)) {
      for (const parametro of parametros) {
        expect(tabela[chave], `${lingua}/${chave}`).toContain(`{{${parametro}}}`);
      }
    }
  });
});
