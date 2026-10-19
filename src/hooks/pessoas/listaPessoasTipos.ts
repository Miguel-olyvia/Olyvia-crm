// Tipos da Lista real das Pessoas (função neg_resumo_pessoas).
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { EtapaPessoa, PapelPessoa, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";

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
}

/** De onde arranca a página seguinte: a chave e o id da última linha. */
export interface CursorLista {
  chave: string;
  id: string;
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
}
