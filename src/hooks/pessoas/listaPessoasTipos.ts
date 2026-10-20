// Tipos da Lista real das Pessoas (função neg_resumo_pessoas).
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { IdPasso } from "@/components/pessoas/etapaPessoa";
import type {
  EtapaPessoa, PapelPessoa, QualificacaoPessoa, ResultadoContacto, ResultadoEncerramento, ResultadoOuNenhum,
} from "@/components/pessoas/pessoasTipos";

/** Linhas por página (o máximo que a função aceita). */
export const PAGINA_LISTA = 100;
/** A função recusa pesquisas com menos de 2 caracteres (NG009). */
export const MIN_PESQUISA = 2;

export type OrdemLista = "recentes" | "nome";

export interface FiltrosLista {
  papel: PapelPessoa | null;
  etapa: EtapaPessoa | null;
  pesquisa: string;
  ordem: OrdemLista;
  /** `anew_users.id` do comercial («Só as minhas» é o utilizador da sessão); `null`: todos. */
  atribuidoA: string | null;
  /** O formulário da campanha da lead (`forms.id`); `null`: todos. */
  formularioId: string | null;
  /** Os cinco resultados de uma chamada, ou «semContacto» (nenhuma das duas fontes); `null`: todos. */
  ultimoResultado: ResultadoOuNenhum | null;
  /** Ligado: só quem voltou a contactar. Desligado não filtra (não quer dizer «quem NÃO voltou»). */
  voltou: boolean;
  /** Ligado: só as atrasadas (leads com o próximo contacto anterior a hoje). */
  atrasada: boolean;
}

/** Uma linha tal como a função a devolve (os numeric podem vir como texto). */
export interface LinhaResumoDb {
  entity_id: string;
  nome: string | null;
  papel: string;
  lead_id: string | null;
  client_id: string | null;
  assigned_to: string | null;
  lead_status: string | null;
  closure_result: string | null;
  etapa: string;
  negocios_abertos: number;
  negocios_ganhos: number;
  negocios_perdidos: number;
  fase_mais_avancada: string | null;
  pronto_a_ganhar: boolean;
  valor_em_jogo: number | string | null;
  ultimo_contacto_em: string | null;
  proxima_visita_em: string | null;
  ultima_visita_feita_em: string | null;
  ultimo_negocio_em: string | null;
  por_ligar_contactos: number;
  por_ligar_visitas: number;
  por_ligar_levantamentos: number;
  /** Null se a lead não tiver list_sort_at: não serve de cursor. */
  chave_ordem: string | null;
  ha_mais: boolean;
  // Colunas de 20261225150000_neg_pessoas_campos_lista_ficha (13 parâmetros, 37 colunas). Todos os campos da lead vêm
  // da MESMA lead que a linha mostra (`lead_id`). Opcionais no tipo: uma resposta de uma função mais antiga não os traz.
  criado_em?: string | null;
  qualificacao_tipo?: string | null;
  ultima_atividade_em?: string | null;
  /** `anew_leads.last_contact_at`: a segunda fonte do último contacto (a primeira é `ultimo_contacto_em`, as chamadas registadas). */
  ultimo_contacto_lead_em?: string | null;
  voltou_a_contactar?: boolean | null;
  /** `anew_leads.source` (web, api, import, ...). */
  origem?: string | null;
  origem_detalhe?: string | null;
  campanha_id?: string | null;
  campanha?: string | null;
  formulario_id?: string | null;
  formulario?: string | null;
  /** Os cinco de neg_registar_contacto, ou o que a lead guarda (id de resultado, texto livre). */
  ultimo_resultado?: string | null;
  atrasada?: boolean | null;
}

/** De onde arranca a página seguinte: a chave e o id da última linha. */
export interface CursorLista {
  chave: string;
  id: string;
}

/** O telefone e o email principais de uma pessoa; null quando se leu e não há. */
export interface ContactoDaLista {
  telefone: string | null;
  email: string | null;
}

export interface PessoaDaLista {
  id: string;
  /** Vazio quando a base não dá o nome: a UI mostra «Sem nome». */
  nome: string;
  papel: PapelPessoa;
  leadId: string | null;
  clienteId: string | null;
  responsavelId: string | null;
  etapa: EtapaPessoa;
  faseEtapa: FaseNegocio | null;
  encerrada: ResultadoEncerramento | null;
  abertos: number;
  ganhos: number;
  perdidos: number;
  prontoAGanhar: boolean;
  valorEmJogo: number;
  ultimoContactoEm: string | null;
  /** Dias de calendário de Lisboa desde o último contacto; null se nunca houve. */
  diasSemContacto: number | null;
  proximaVisitaEm: string | null;
  /** O estado da lead de referência, tal como a base o devolve (texto livre; a UI não o interpreta). */
  leadStatus: string | null;
  ultimaVisitaFeitaEm: string | null;
  ultimoNegocioEm: string | null;
  porLigarContactos: number;
  porLigarVisitas: number;
  porLigarLevantamentos: number;
  /** O próximo passo reconstruído com os campos acima; `null` quando a lista não o sabe (ver `passoDaLista`). */
  passo: IdPasso | null;
  /** Instante ISO: o mais antigo entre as leads vivas e o cliente. */
  criadoEm: string | null;
  /** MQL/SQL só com a lead qualificada (como a página de Leads); senão `null`. */
  qualificacao: QualificacaoPessoa | null;
  /** `null`: a base não deu o dado. */
  voltou: boolean | null;
  atrasada: boolean | null;
  /** `anew_leads.source` da lead mostrada. */
  origem: string | null;
  campanhaId: string | null;
  campanha: string | null;
  formulario: string | null;
  /** O resultado do contacto mais recente; «outro» é um resultado das Leads que não é dos cinco da chamada. */
  ultimoResultado: ResultadoContacto | "outro" | null;
}
