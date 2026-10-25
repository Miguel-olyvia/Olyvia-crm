// Os tipos do apoio da ficha real: a ficha antiga (registos, dados da pessoa, visitas, negócios, submissões, atividade) já não está à vista; abre a pedido,
// num diálogo por cima, a partir do menu «Mais» ou dos atalhos do cabeçalho. Isto diz que abas há e quantas coisas cada uma tem.

/** As abas do diálogo de apoio, pela ordem em que aparecem. */
export type AbaApoio = "registos" | "visitas" | "negocios" | "submissoes" | "atividade";

/** Quantas coisas há em cada aba: os atalhos do cabeçalho e os números do menu «Mais». */
export interface ContagensApoio {
  visitas: number;
  negocios: number;
  /** O total de submissões; `undefined` sem permissão para as ver (não há item nem atalho); `null` com permissão mas ainda sem saber o total. */
  submissoes?: number | null;
  /** As submissões por rever: o atalho «N submissões novas» só existe se for maior que zero. */
  submissoesNovas: number;
}

/** Abre o diálogo de apoio na aba `aba`; `origem` é o botão a que o foco regressa ao fechar. */
export type AbrirApoio = (aba: AbaApoio, origem: HTMLElement | null) => void;
