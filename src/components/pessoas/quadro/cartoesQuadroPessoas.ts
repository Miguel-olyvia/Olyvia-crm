// O Quadro de Pessoas: 6 fases, um cartão por pedido (lead sem negócio aberto) ou por negócio em curso. Funções puras:
// o dia de hoje chega por parâmetro. Perdidos e ganhos não têm cartão; pessoa perdida não tem nenhum. Pessoa com negócio aberto não mostra o pedido ao lado.
import { faseDoNegocio, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { passoDoNegocio, proximoPasso, type IdPasso } from "../etapaPessoa";
import type { EtapaPessoa, PapelPessoa, ResumoPessoa } from "../pessoasTipos";

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
  /** O id do negócio, ou `pedido-<pessoa>` num pedido. */
  id: string;
  pessoaId: string;
  nome: string;
  papel: PapelPessoa;
  coluna: ColunaQuadro;
  /** O serviço do negócio, ou o da visita num pedido; `null` quando não há. */
  trabalho: string | null;
  /** O valor do orçamento escolhido; `null` num pedido. */
  valor: number | null;
  passo: IdPasso;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
  /** O prazo é anterior a hoje. */
  atrasado: boolean;
}

const COLUNA_DA_ETAPA: Partial<Record<EtapaPessoa, ColunaQuadro>> = {
  nova: "porContactar", emContacto: "contactado", visitaMarcada: "visita",
};

const COLUNA_DA_FASE: Partial<Record<ReturnType<typeof faseDoNegocio>, ColunaQuadro>> = {
  orcamento: "orcamento", proposta: "proposta", contrato: "contrato",
};

const passou = (prazo: string | null, hoje: string): boolean => prazo !== null && prazo < hoje;

function cartaoDoNegocio(r: ResumoPessoa, n: NegocioMes, hoje: string): CartaoQuadro | null {
  const coluna = COLUNA_DA_FASE[faseDoNegocio(n)];
  if (!coluna) return null;
  return {
    id: n.id, pessoaId: r.pessoa.id, nome: r.pessoa.nome, papel: r.papel, coluna, trabalho: n.servico,
    valor: valorDoNegocio(n), passo: passoDoNegocio(n), prazo: n.proximoPrazo, atrasado: passou(n.proximoPrazo, hoje),
  };
}

function cartaoDoPedido(r: ResumoPessoa, hoje: string): CartaoQuadro | null {
  const coluna = COLUNA_DA_ETAPA[r.etapa];
  if (!coluna) return null;
  const { id, prazo } = proximoPasso(r);
  return {
    id: `pedido-${r.pessoa.id}`, pessoaId: r.pessoa.id, nome: r.pessoa.nome, papel: r.papel, coluna,
    trabalho: r.pessoa.visita?.servico ?? null, valor: null, passo: id, prazo, atrasado: passou(prazo, hoje),
  };
}

/** Os cartões do quadro, pela ordem das pessoas recebidas (a da lista). */
export function cartoesDoQuadro(resumos: readonly ResumoPessoa[], hoje: string): CartaoQuadro[] {
  return resumos.flatMap((r) => {
    // Quem está perdida não tem cartões, mesmo com negócios abertos: fica na ficha e na lista.
    if (r.pessoa.perdida) return [];
    if (r.abertos.length > 0) return r.abertos.flatMap((n) => cartaoDoNegocio(r, n, hoje) ?? []);
    return cartaoDoPedido(r, hoje) ?? [];
  });
}
