// O Quadro de Pessoas: 6 fases, um cartão por pedido e um por negócio em curso (uma pessoa pode ter vários de cada, em paralelo).
// Funções puras: o dia de hoje chega por parâmetro. Perdidos e ganhos não têm cartão; pessoa perdida não tem nenhum.
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { passoDoNegocio, passoDoPedidoNaColuna, type IdPasso } from "../etapaPessoa";
import { faseDoPedido, prazoDoPedido, rotuloDoPedido, type RotuloPedido } from "../pedidoNegocio";
import type { FasePedido, PapelPessoa, PedidoNegocio, ResumoPessoa } from "../pessoasTipos";

export type ColunaQuadro = "porContactar" | "contactado" | "visita" | "orcamento" | "proposta" | "contrato";

export interface DefColuna {
  id: ColunaQuadro;
  /** Colunas de negócio mostram a soma do valor; as de pedido não. */
  negocio: boolean;
}

export const COLUNAS_QUADRO: readonly DefColuna[] = [
  { id: "porContactar", negocio: false },
  { id: "contactado", negocio: false },
  { id: "visita", negocio: false },
  { id: "orcamento", negocio: true },
  { id: "proposta", negocio: true },
  { id: "contrato", negocio: true },
];

export interface CartaoQuadro {
  /** O id do negócio, ou `pedido-<id do pedido>` num pedido. */
  id: string;
  pessoaId: string;
  /** O id do pedido (`pd-<n>`); `null` num negócio. */
  pedidoId: string | null;
  nome: string;
  papel: PapelPessoa;
  coluna: ColunaQuadro;
  /** O serviço do negócio ou do pedido; `null` quando não há. */
  trabalho: string | null;
  /** O que identifica o pedido ao utilizador (serviço ou dia de criação, e a posição entre repetidos); `null` num negócio. */
  rotuloPedido: RotuloPedido | null;
  /** O valor do orçamento escolhido; `null` num pedido. */
  valor: number | null;
  passo: IdPasso;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  /** O prazo é anterior a hoje. */
  atrasado: boolean;
}

const COLUNA_DA_FASE_PEDIDO: Record<FasePedido, ColunaQuadro> = { porContactar: "porContactar", contactado: "contactado", visita: "visita" };

const COLUNA_DA_FASE: Partial<Record<ReturnType<typeof faseDoNegocio>, ColunaQuadro>> = {
  orcamento: "orcamento", proposta: "proposta", contrato: "contrato",
};

const passou = (prazo: string | null, hoje: string): boolean => prazo !== null && prazo < hoje;

function cartaoDoNegocio(r: ResumoPessoa, n: NegocioMes, hoje: string): CartaoQuadro | null {
  const coluna = COLUNA_DA_FASE[faseDoNegocio(n)];
  if (!coluna) return null;
  return {
    id: n.id, pessoaId: r.pessoa.id, pedidoId: null, nome: r.pessoa.nome, papel: r.papel, coluna, trabalho: n.servico,
    rotuloPedido: null, valor: valorDoNegocio(n), passo: passoDoNegocio(n), prazo: n.proximoPrazo, atrasado: passou(n.proximoPrazo, hoje),
  };
}

/**
 * O cartão de um pedido: a coluna é a sua fase. O prazo é o da sua próxima visita por fazer (um pedido em Visita) ou a chamada
 * agendada da pessoa (um pedido antes da visita).
 */
function cartaoDoPedido(r: ResumoPessoa, p: PedidoNegocio, hoje: string): CartaoQuadro {
  const fase = faseDoPedido(p);
  const prazo = fase === "visita" ? prazoDoPedido(p) : r.pessoa.proximoContacto ?? null;
  return {
    id: `pedido-${p.id}`, pessoaId: r.pessoa.id, pedidoId: p.id, nome: r.pessoa.nome, papel: r.papel, coluna: COLUNA_DA_FASE_PEDIDO[fase],
    trabalho: p.servico || null, rotuloPedido: rotuloDoPedido(p, r.pedidos), valor: null, passo: passoDoPedidoNaColuna(p), prazo, atrasado: passou(prazo, hoje),
  };
}

/** Os cartões do quadro, pela ordem das pessoas recebidas (a da lista). */
export function cartoesDoQuadro(resumos: readonly ResumoPessoa[], hoje: string): CartaoQuadro[] {
  return resumos.flatMap((r) => {
    // Quem está perdida não tem cartões, mesmo com negócios abertos: fica na ficha e na lista.
    if (r.pessoa.perdida) return [];
    return [...r.pedidos.map((p) => cartaoDoPedido(r, p, hoje)), ...r.abertos.flatMap((n) => cartaoDoNegocio(r, n, hoje) ?? [])];
  });
}
