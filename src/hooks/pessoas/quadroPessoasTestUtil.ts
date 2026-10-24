// Só para testes: linhas de neg_resumo_quadro com valores por omissão (um cartão de pessoa em «porContactar»).
import type { LinhaQuadroDb } from "./quadroPessoasTipos";

export function linhaQuadro(id: string, sobre: Partial<LinhaQuadroDb> = {}): LinhaQuadroDb {
  return {
    coluna: "porContactar", tipo: "pessoa", cartao_id: id, entity_id: id, nome: `Pessoa ${id}`, papel: "lead",
    lead_id: null, client_id: null, assigned_to: null, negocio_id: null, titulo: null, valor: null,
    pronto_a_ganhar: false, n_orcamentos: 0, proposta_status: null, parado_desde: null, proximo_prazo_em: null,
    por_ligar_contactos: 0, por_ligar_visitas: 0, por_ligar_visitas_feitas: 0, por_ligar_levantamentos: 0,
    chave_ordem: `chave-${id}`, ha_mais: false, total_coluna: 1, valor_coluna: null,
    ...sobre,
  };
}

/** Uma linha de negócio: `cartao_id` é o do negócio e `entity_id` o da pessoa. */
export function linhaNegocio(id: string, coluna: string, sobre: Partial<LinhaQuadroDb> = {}): LinhaQuadroDb {
  return linhaQuadro(id, {
    coluna, tipo: "negocio", entity_id: `pessoa-de-${id}`, negocio_id: id, titulo: `Trabalho ${id}`, ...sobre,
  });
}
