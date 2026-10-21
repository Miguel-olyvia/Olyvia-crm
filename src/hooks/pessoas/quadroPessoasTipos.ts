// Tipos do Quadro real das Pessoas (função neg_resumo_quadro, contrato M9).
import type { CartaoQuadro, ColunaQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import type { PapelPessoa } from "@/components/pessoas/pessoasTipos";
import type { OrdemLista } from "./listaPessoasTipos";

/** Cartões pedidos por coluna, na primeira chamada e em cada «Carregar mais» (a função aceita 1 a 100). */
export const PAGINA_COLUNA = 25;

/** O que decide o pedido: a etapa não conta (o Quadro ignora-a), por isso não faz parte. */
export interface FiltrosQuadro {
  papel: PapelPessoa | null;
  /** O texto já enviado (com atraso); aqui apara-se e só vale com 2 ou mais letras. */
  pesquisa: string;
  ordem: OrdemLista;
}

/** Uma linha tal como a função a devolve (os numeric e os bigint podem vir como texto). */
export interface LinhaQuadroDb {
  coluna: string;
  tipo: string;
  cartao_id: string;
  entity_id: string;
  nome: string | null;
  papel: string;
  lead_id: string | null;
  client_id: string | null;
  assigned_to: string | null;
  negocio_id: string | null;
  titulo: string | null;
  valor: number | string | null;
  pronto_a_ganhar: boolean | null;
  n_orcamentos: number | null;
  proposta_status: string | null;
  parado_desde: string | null;
  proximo_prazo_em: string | null;
  por_ligar_contactos: number | null;
  por_ligar_visitas: number | null;
  por_ligar_visitas_feitas: number | null;
  por_ligar_levantamentos: number | null;
  chave_ordem: string | null;
  ha_mais: boolean | null;
  total_coluna: number | string | null;
  valor_coluna: number | string | null;
}

/** De onde arranca a página seguinte de UMA coluna: a chave tal como veio e o `cartao_id` CRU (o de uma pessoa não leva o prefixo `pessoa-`). */
export interface CursorQuadro {
  chave: string;
  id: string;
}

export interface CartaoComCursor {
  cartao: CartaoQuadro;
  cursor: CursorQuadro | null;
}

/** O que se sabe de uma coluna: os cartões carregados e os totais da coluna INTEIRA (não dependem do cursor). */
export interface EstadoColuna {
  cartoes: CartaoQuadro[];
  /** O cursor da última linha carregada; `null` sem cartões ou sem chave (a base daria NG009). */
  cursor: CursorQuadro | null;
  haMais: boolean;
  total: number;
  /** Soma dos valores da coluna; uma coluna sem valores (a base devolve NULL) conta como 0. */
  valor: number;
}

export type ColunasQuadro = Record<ColunaQuadro, EstadoColuna>;
