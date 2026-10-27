/**
 * A «justificação do dia» na base: a pessoa justifica um atraso ou uma falta SUGERIDA antes de haver falta; o RH aceita
 * (paga ou não paga) ou recusa com motivo. Aceitar escreve uma falta real, tudo na mesma transacção da base.
 *
 * ESTE FICHEIRO É O CONTRATO ENTRE O ECRÃ E AS RPCs `rpc_hr_justificacao_dia_*`
 * (desenho em supabase/rascunhos/DESENHO-justificacao-dia.md, secção 10). Enquanto a migration não estiver aplicada, as
 * RPCs não existem: `rpcIndisponivel` deixa o ecrã dizê-lo em vez de partir.
 */
import { chaveDoErroDeAssiduidade } from "@/lib/hr/assiduidade";

export type TipoJustificacaoDiaDb = "consulta_medica" | "transporte" | "assunto_pessoal" | "outro";
/**
 * `sem_efeito`: estava aceite e a falta que a aceitação criou foi anulada ou corrigida. Fica no histórico, mas já não conta
 * para a situação do dia (o período fica livre para um novo envio).
 */
export type EstadoJustificacaoDiaDb = "pendente" | "aceite_paga" | "aceite_nao_paga" | "recusada" | "sem_efeito";
export type DecisaoJustificacaoDiaDb = "aceitar_paga" | "aceitar_nao_paga" | "recusar";

/**
 * Uma linha de `rpc_hr_justificacao_dia_listar`, coluna a coluna como o `RETURNS TABLE` da RPC (não traz `organization_id`
 * nem `created_at`: o momento do envio chega como `enviada_em`). As horas chegam como «HH:MM:SS».
 */
export interface JustificacaoDiaLinha {
  id: string;
  pessoa_id: string;
  pessoa_nome: string | null;
  data: string;
  tipo: TipoJustificacaoDiaDb;
  de_atraso: boolean;
  periodo_inicio: string;
  periodo_fim: string;
  minutos: number;
  hora_real: string | null;
  /** `null` quando é consulta médica e quem pede não é a própria pessoa: o texto lê-se com `verTexto`. */
  motivo: string | null;
  texto_sensivel: boolean;
  anexos_nomes: string[];
  estado: EstadoJustificacaoDiaDb;
  /** Quando a pessoa (ou o RH por ela) enviou. */
  enviada_em: string;
  decidida_por: string | null;
  decidida_por_nome: string | null;
  decidida_em: string | null;
  motivo_recusa: string | null;
  falta_id: string | null;
  mes_fechado_na_decisao: boolean;
  sem_efeito_em: string | null;
}

/** O erro com que `_decidir` recusa aceitar num mês fechado sem confirmação: o ecrã pede-a e volta a chamar. */
export const CHAVE_ERRO_MES_FECHADO = "rhJust.erro.mesFechado";

export interface ArgumentosDeRegisto {
  pessoaId: string;
  data: string;
  tipo: TipoJustificacaoDiaDb;
  deAtraso: boolean;
  periodoInicio: string;
  periodoFim: string;
  motivo: string;
  horaReal: string | null;
  anexosNomes: readonly string[];
}

export interface ResultadoDaDecisaoDb {
  faltaId: string | null;
  mesFechado: boolean;
}

export interface AcessoAoTextoDb {
  quem: string;
  quando: string;
}

/**
 * O que a RPC `_decidir` devolve (`TABLE(falta_id, mes_fechado)`): o PostgREST entrega uma lista de uma linha, ou o
 * objecto se a função for escalar. Qualquer outra coisa é «sem falta, mês aberto».
 */
export function resultadoDaDecisao(data: unknown): ResultadoDaDecisaoDb {
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha || typeof linha !== "object") return { faltaId: null, mesFechado: false };
  const { falta_id: faltaId, mes_fechado: mesFechado } = linha as { falta_id?: unknown; mes_fechado?: unknown };
  return { faltaId: typeof faltaId === "string" ? faltaId : null, mesFechado: mesFechado === true };
}

/** O nome (hora «HH:MM:SS» → «HH:MM»): a base devolve segundos, a justificação guarda horas e minutos. */
export const horaSemSegundos = (hora: string | null | undefined): string => (hora ? hora.slice(0, 5) : "");

/**
 * Os prefixos que as RPCs da justificação do dia levantam, traduzidos em chave: TODOS os `RAISE` do rascunho
 * supabase/rascunhos/NOVO-20261231800000_justificacao_do_dia.sql. Um prefixo que falte aqui cai na mensagem genérica e é
 * reportado como defeito, por isso a lista acompanha o rascunho. Os erros das faltas que a aceitação chama por dentro
 * (sobreposição, ausência aprovada...) chegam com o seu prefixo e traduzem-se pelo mapa da assiduidade.
 */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["justificacao_dia_fora_do_prazo", "rhJust.erro.foraDoPrazo"],
  ["justificacao_dia_ja_ha_falta", "rhJust.erro.jaHaFalta"],
  ["justificacao_dia_ja_enviada", "rhJust.erro.jaEnviada"],
  ["justificacao_dia_ja_decidida", "rhJust.erro.jaDecidida"],
  ["justificacao_dia_falta_divergente", "rhJust.erro.faltaDivergente"],
  ["justificacao_dia_falta_ja_decidida", "rhJust.erro.faltaJaDecidida"],
  ["justificacao_dia_falta_sobreposta", "rhJust.erro.faltaSobreposta"],
  ["justificacao_dia_mes_fechado", CHAVE_ERRO_MES_FECHADO],
  ["justificacao_dia_propria_decisao", "rhJust.erro.propriaDecisao"],
  ["justificacao_dia_recusa_sem_motivo", "rhJust.erro.recusaSemMotivo"],
  ["justificacao_dia_decisao_invalida", "rhJust.erro.decisaoInvalida"],
  ["justificacao_dia_data_futura", "rhJust.erro.dataFutura"],
  ["justificacao_dia_motivo_curto", "rhJust.erro.motivoCurto"],
  ["justificacao_dia_motivo_invalido", "rhJust.erro.motivoInvalido"],
  ["justificacao_dia_tipo_invalido", "rhJust.erro.tipoInvalido"],
  ["justificacao_dia_periodo_invalido", "rhJust.erro.periodoInvalido"],
  ["justificacao_dia_anexos_invalidos", "rhJust.erro.anexosInvalidos"],
  ["justificacao_dia_dados_em_falta", "rhJust.erro.dadosEmFalta"],
  ["justificacao_dia_intervalo_invalido", "rhJust.erro.intervaloInvalido"],
  ["justificacao_dia_intervalo_obrigatorio", "rhJust.erro.intervaloInvalido"],
  ["justificacao_dia_inexistente", "rhJust.erro.inexistente"],
  ["justificacao_dia_pessoa_invalida", "rhJust.erro.pessoaInvalida"],
  ["justificacao_dia_sem_permissao", "rhJust.erro.semPermissao"],
  ["justificacao_dia_sem_sessao", "rhJust.erro.semPermissao"],
  ["justificacao_dia_sem_utilizador", "rhJust.erro.semPermissao"],
];

const mensagemDe = (erro: unknown): string =>
  typeof erro === "string"
    ? erro
    : typeof (erro as { message?: unknown } | null)?.message === "string"
      ? (erro as { message: string }).message
      : "";

/** A chave de tradução do erro, ou `null` se não o reconhece (quem chama usa então a mensagem amigável). */
export function chaveDoErroDeJustificacaoDia(erro: unknown): string | null {
  const mensagem = mensagemDe(erro);
  if (!mensagem) return null;
  const encontrado = PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo));
  return encontrado ? encontrado[1] : chaveDoErroDeAssiduidade(erro);
}

/**
 * A RPC não existe nesta base (a migration ainda não foi aplicada): 42883 do Postgres, PGRST202 do PostgREST, ou a
 * mensagem «could not find the function». Não é um defeito a reportar nem «não há justificações».
 */
export function rpcIndisponivel(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const codigo = (erro as { code?: unknown }).code;
  if (codigo === "PGRST202" || codigo === "42883") return true;
  return /could not find the function|schema cache|function .* does not exist/i.test(mensagemDe(erro));
}
