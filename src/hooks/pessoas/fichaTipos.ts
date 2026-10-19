// Tipos da ficha real da pessoa: o que a função neg_ficha_pessoa devolve (contrato M2 de contratos-funcoes-fase5.md).
// Os numeric podem vir como texto; qualquer campo pode faltar numa leitura parcial (p_partes), por isso as secções são anuláveis.

export type NumeroDb = number | string | null;

export interface MoradaFichaDb {
  rua: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  andar: string | null;
  distrito?: string | null;
}

export interface PessoaFichaDb {
  id: string;
  nome: string | null;
  papel: string;
  lead_id: string | null;
  client_id: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  etapa: string;
  desde: string | null;
  contacto: { telefone: string | null; email: string | null } | null;
  morada: MoradaFichaDb | null;
  /**
   * As RESPOSTAS da aba Qualificação (um objeto jsonb), nunca «MQL» ou «SQL». Vem como `unknown`: a ficha não pode contar com a forma.
   * (A fábrica de testes e uma leitura antiga podem dar texto; o adaptador lê só o que reconhece.)
   */
  qualificacao: unknown;
  /** O tipo de qualificação («MQL» ou «SQL»), numa migration futura; opcional enquanto a função não o devolve. */
  qualificacao_tipo?: unknown;
  origem: { origin: string | null; source: string | null; campanha: string | null; formulario: string | null } | null;
  nif: string | null;
  empresa: string | null;
}

export interface EncerramentoDb {
  resultado: string | null;
  motivo: string | null;
  motivo_outro: string | null;
  em: string | null;
}

export interface LeadFichaDb {
  id: string;
  estado: string | null;
  aberta: boolean;
  encerramento: EncerramentoDb | null;
}

export interface AgregadosDb {
  ultimo_contacto_em: string | null;
  ultimo_resultado: string | null;
  proximo_contacto_em: string | null;
  ultima_visita_feita_em: string | null;
  proxima_visita_em: string | null;
  por_ligar: { contactos: number; visitas: number; levantamentos: number } | null;
  negocios: { abertos: number; ganhos: number; perdidos: number } | null;
  total_contactos: number;
  total_visitas: number;
  total_levantamentos: number;
  total_atividade: number;
}

export interface OrcamentoDb {
  id: string;
  numero: string | null;
  estado: string | null;
  total: NumeroDb;
  criado_em: string | null;
}

export interface PropostaDb {
  id: string;
  numero: string | null;
  titulo: string | null;
  status: string | null;
  valor: NumeroDb;
  valid_until: string | null;
  terms: string | null;
  enviada_em: string | null;
  aceite_em: string | null;
  criado_em: string | null;
}

export interface ContratoDb {
  id: string;
  numero: string | null;
  status: string | null;
  valor: NumeroDb;
  assinado_em: string | null;
  criado_em: string | null;
  tem_base: boolean;
}

export interface EventoNegocioDb {
  id: string;
  tipo: string;
  fase: string | null;
  motivo: string | null;
  motivo_reabertura: string | null;
  criado_em: string | null;
  criado_por_nome: string | null;
}

export type EstadoNegocioDb = "aberto" | "ganho" | "perdido";

export interface NegocioFichaDb {
  id: string;
  titulo: string | null;
  notas: string | null;
  estado: string;
  criado_em: string | null;
  ganho_em: string | null;
  perdido_em: string | null;
  fase_perda: string | null;
  motivo_perda: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  valor: NumeroDb;
  pronto_a_ganhar: boolean;
  parado_desde: string | null;
  levantamento_id: string | null;
  orcamentos: OrcamentoDb[];
  propostas: PropostaDb[];
  contratos: ContratoDb[];
  eventos: EventoNegocioDb[];
}

/** O cursor de uma secção paginada: o instante e o id do último item já recebido. */
export interface CursorSeccao {
  em: string;
  id: string;
}

export interface SeccaoDb<T> {
  total: number;
  tem_mais: boolean;
  proximo: CursorSeccao | null;
  itens: T[];
}

export interface ContactoFichaDb {
  id: string;
  resultado: string | null;
  notas: string | null;
  em: string;
  proxima_acao_em: string | null;
  negocio_id: string | null;
  criado_por_nome: string | null;
}

export interface RecursoVisitaDb {
  id: string;
  nome: string | null;
  user_id: string | null;
  ativo: boolean;
}

export interface DetalhesVisitaDb {
  morada?: { rua?: string | null; codigo_postal?: string | null; localidade?: string | null; andar?: string | null } | null;
  igual_a_lead?: boolean | null;
  presentes?: string | null;
}

export interface VisitaFichaDb {
  id: string;
  inicio: string;
  fim: string | null;
  status: string;
  resultado: string | null;
  tipo: string | null;
  titulo: string | null;
  notas: string | null;
  local: string | null;
  negocio_id: string | null;
  feito_por_nome: string | null;
  board_id: string | null;
  board_nome: string | null;
  recursos: RecursoVisitaDb[];
  detalhes: DetalhesVisitaDb | null;
}

export interface LinhaLevantamentoDb {
  divisao: string | null;
  trabalho: string | null;
  trabalho_outro: string | null;
  medida: NumeroDb;
  unidade: string | null;
  observacoes: string | null;
  ordem: number | null;
}

export interface LevantamentoFichaDb {
  id: string;
  visita_id: string | null;
  negocio_id: string | null;
  data: string;
  estado: string | null;
  notas: string | null;
  feito_por_id: string | null;
  feito_por_nome: string | null;
  morada: MoradaFichaDb | null;
  n_linhas: number;
  n_respostas: number;
  linhas: LinhaLevantamentoDb[];
  respostas: { seccao: string; pergunta: string; resposta: string }[];
}

export interface AtividadeFichaDb {
  id: string;
  tipo: string;
  assunto: string | null;
  resultado: string | null;
  notas: string | null;
  em: string;
  negocio_id: string | null;
  criado_por_nome: string | null;
}

export interface FichaDb {
  pessoa: PessoaFichaDb;
  lead: LeadFichaDb | null;
  leads_abertas: { id: string; status: string | null; created_at: string | null; closure_result: string | null }[];
  agregados: AgregadosDb;
  permissoes: { editar: boolean; criar: boolean };
  negocios: { total: number; itens: NegocioFichaDb[] } | null;
  documentos_por_ligar: { orcamentos: unknown[]; propostas: unknown[]; contratos: unknown[] } | null;
  contactos: SeccaoDb<ContactoFichaDb> | null;
  visitas: SeccaoDb<VisitaFichaDb> | null;
  levantamentos: SeccaoDb<LevantamentoFichaDb> | null;
  atividade: SeccaoDb<AtividadeFichaDb> | null;
}

/** As secções que se podem pedir à parte e acrescentar a seguir (carregar mais). */
export type TipoSeccao = "contactos" | "visitas" | "levantamentos" | "atividade";
export const TIPOS_SECCAO: readonly TipoSeccao[] = ["contactos", "visitas", "levantamentos", "atividade"];
