/**
 * As formas das linhas de ASSIDUIDADE E PICAGENS.
 *
 * Espelham as migrations 20261121140000..20261121250000. Nada aqui e
 * inventado: cada campo existe numa coluna, e os campos que a base gera
 * (`minutos`, `justificada`) estao marcados como tal para ninguem os escrever.
 *
 * O QUE ESTE FICHEIRO NAO TEM
 * ---------------------------
 * Nao ha tipo nenhum para "o valor em vigor" de uma picagem, de um intervalo
 * ou de uma falta. Nao ha porque nao e um tipo: e a MESMA linha, escolhida por
 * anti-join nas vistas `v_hr_*_em_vigor`. Corrigir e inserir uma linha nova que
 * aponta a errada, e a cadeia mantem-se linear por indices unicos parciais.
 * Tres correccoes empilhadas dao tres linhas na tabela e UMA na vista.
 */

/** `pessoas_picagens` (20261121160000). Um evento -- um instante. Append-only. */
export interface Picagem {
  id: string;
  pessoa_id: string;
  organization_id: string;
  momento: string;
  /** Gravada pela RPC no fuso da organizacao, nao derivada no cliente. */
  data_local: string;
  hora_local: string;
  sentido: SentidoPicagem;
  local_id: string | null;
  vinculo_id: string | null;
  planeado_id: string | null;
  origem: OrigemPicagem;
  latitude: number | null;
  longitude: number | null;
  precisao_metros: number | null;
  estado: EstadoPicagem;
  realizado_id: string | null;
  /** A picagem que ESTA corrige. Nulo no lancamento original. */
  corrige_picagem_id: string | null;
  correccao_tipo: TipoCorreccaoPicagem | null;
  correccao_motivo: string | null;
  registado_por_pessoa_id: string | null;
  anulado_em: string | null;
  anulacao_motivo: string | null;
  created_at: string;
}

export type SentidoPicagem = "entrada" | "saida";
export type EstadoPicagem = "valida" | "corrigida" | "anulada";

export const ORIGENS_PICAGEM = [
  "app",
  "web",
  "importacao",
  "manual_rh",
] as const;
export type OrigemPicagem = (typeof ORIGENS_PICAGEM)[number];

export const TIPOS_CORRECCAO_PICAGEM = [
  "hora_errada",
  "sentido_errado",
  "local_errado",
  "duplicada",
  "esquecida",
  "outro",
] as const;
export type TipoCorreccaoPicagem = (typeof TIPOS_CORRECCAO_PICAGEM)[number];

/** `pessoas_faltas` (20261121200000). UM PERIODO, nunca "o dia todo". */
export interface Falta {
  id: string;
  pessoa_id: string;
  organization_id: string;
  data: string;
  planeado_id: string | null;
  vinculo_id: string | null;
  local_id: string | null;
  hora_inicio: string;
  hora_fim: string;
  /** Coluna GERADA. Nunca se escreve. */
  minutos: number;
  motivo_codigo: MotivoFalta;
  justificacao_estado: EstadoJustificacao;
  /** Coluna GERADA a partir do estado. */
  justificada: boolean;
  remunerada: boolean;
  desconta_saldo: boolean;
  justificacao_decidida_por: string | null;
  justificacao_decidida_em: string | null;
  justificacao_motivo: string | null;
  ausencia_dia_id: string | null;
  corrige_falta_id: string | null;
  correccao_motivo: string | null;
  estado: EstadoFalta;
  anulado_em: string | null;
  anulacao_motivo: string | null;
  created_at: string;
}

export const MOTIVOS_FALTA = [
  "doenca",
  "assuntos_pessoais",
  "atraso",
  "saida_antecipada",
  "ausencia_nao_comunicada",
  "greve",
  "formacao",
  "luto",
  "outro",
] as const;
export type MotivoFalta = (typeof MOTIVOS_FALTA)[number];

export type EstadoFalta = "activa" | "corrigida" | "anulada";

export const ESTADOS_JUSTIFICACAO = [
  "sem_justificacao",
  "pendente_documento",
  "justificada",
  "recusada",
] as const;
export type EstadoJustificacao = (typeof ESTADOS_JUSTIFICACAO)[number];

export const TIPOS_DOCUMENTO_FALTA = [
  "atestado_medico",
  "declaracao_medica",
  "convocatoria",
  "obito",
  "declaracao_entidade",
  "declaracao_propria",
  "outro",
] as const;
export type TipoDocumentoFalta = (typeof TIPOS_DOCUMENTO_FALTA)[number];

/**
 * O que `rpc_hr_falta_ver_justificacao` devolve, uma vez, sob registo em
 * `pessoas_acessos_sensiveis`. Devolve o NOME do ficheiro, nunca o caminho --
 * e por isso que nao ha campo de caminho aqui: nao se constroi URL nenhuma.
 */
export interface JustificacaoFaltaRevelada {
  id: string;
  tipo_documento: string | null;
  documento_ref: string | null;
  entidade_emissora: string | null;
  data_documento: string | null;
  dias_atestados: number | null;
  texto: string | null;
  ficheiro_nome: string | null;
  ficheiro_mime: string | null;
  ficheiro_bytes: number | null;
}

/**
 * Uma linha de `hr_assiduidade_desvios(org, de, ate)`.
 *
 * A funcao PROPOE, nao escreve, e nao filtra tolerancias: o filtro de minutos
 * e do ecra, e tem de estar escrito por cima da lista para ninguem confundir
 * "vazio" com "filtrado".
 */
export interface Desvio {
  organization_id: string;
  pessoa_id: string;
  data: string;
  tipo: TipoDesvio;
  hora_inicio: string | null;
  hora_fim: string | null;
  minutos: number | null;
  planeado_id: string | null;
  local_id: string | null;
  /** A linha que originou o desvio: um planeado, um realizado, ou uma falta. */
  referencia_id: string | null;
  detalhe: string | null;
}

export const TIPOS_DESVIO = [
  "planeado_sem_realizado",
  "realizado_sem_planeado",
  "pendente_par",
  "falta_coberta_por_ausencia",
] as const;
export type TipoDesvio = (typeof TIPOS_DESVIO)[number];

/**
 * As permissoes do modulo, resolvidas UMA vez pela pagina e passadas para
 * baixo -- nenhum componente chama `usePermissions` por sua conta.
 *
 * Sao doze codigos `hr.assiduidade.*` mais um de emprestimo: validar horas
 * e `hr.pessoas.horario_realizado.validar`, da ronda anterior.
 * `hr.assiduidade.validar` NAO existe e nao se cria.
 *
 * `hr.assiduidade.equipa.view` fica mesmo sem ecra dedicado ("o ponto da
 * equipa" saiu do menu): continua a decidir o ambito da leitura de
 * `pessoas_picagens` na RLS e a mostrar/esconder blocos na ficha da pessoa.
 *
 * AVISO PARA QUEM FOR TESTAR: nenhuma das doze esta atribuida a papel
 * nenhum -- a propria migration do catalogo falha se estiver. Enquanto isso
 * nao mudar, todos estes ecras aparecem vazios ou recusam tudo, inclusive ao
 * super admin. E configuracao, nao defeito da interface.
 */
export interface PermissoesAssiduidade {
  view: boolean;
  viewOwn: boolean;
  equipaView: boolean;
  picar: boolean;
  picarOutros: boolean;
  gerir: boolean;
  corrigir: boolean;
  faltasView: boolean;
  faltasEdit: boolean;
  justificacaoView: boolean;
  justificacaoEdit: boolean;
  /** `hr.pessoas.horario_realizado.validar`, da ronda 2. */
  validarRealizado: boolean;
}
