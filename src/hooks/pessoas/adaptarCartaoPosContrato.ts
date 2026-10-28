// Os cartões das colunas Financeiro e Obra do Pipeline: vêm da MESMA leitura que a página de Negócios e a ficha usam (neg_ler_negocios, pelo armazém do Ben em
// negocioEmylia/armazemNegocioEmylia.ts), e não de uma função da base própria do quadro. `negocios.fase` 4 é Financeiro e 5 é Obra (as FASES da Emylia). O que o
// cartão diz do passo é o texto do motor da Emylia (o seu passo seguinte); o valor é o do orçamento (sem IVA), e sem orçamento fica vazio. Puro, sem rede.
import { tot, type Estado, type Negocio } from "@/emylia/motor";
import { fasePipelineDaGravada } from "@/components/pessoas/negocioEmylia/faseDoPipeline";
import { proximoSeguro } from "@/components/pessoas/negocioEmylia/protegerObra";
import type { PapelPessoa } from "@/components/pessoas/pessoasTipos";
import type { ColunaPosContrato } from "@/components/pessoas/quadro/colunasPosContrato";
import { MIN_PESQUISA } from "./listaPessoasTipos";
import type { FiltrosQuadro } from "./quadroPessoasTipos";


export interface CartaoPosContrato {
  /** O id do negócio na base (`negocios.id`). */
  id: string;
  /** A pessoa (`anew_entities.id`), para abrir a ficha já no negócio. */
  pessoaId: string;
  nome: string;
  /** Um negócio com contrato e pagamento já é de um cliente. */
  papel: PapelPessoa;
  coluna: ColunaPosContrato;
  trabalho: string | null;
  valor: number | null;
  /** O passo seguinte, como a Emylia o diz no seu cartão. */
  passo: string;
}

export interface NegocioLidoParaCartao {
  id: string;
  entityId: string;
  d: Negocio;
}

/** `null`: o negócio não pertence a estas colunas (outra fase, perdido ou anulado). */
export function cartaoPosContratoDe({ id, entityId, d }: NegocioLidoParaCartao, S: Estado): CartaoPosContrato | null {
  if (d.perdido || d.anulado) return null;
  // a fase gravada, pela mesma função que a ficha usa (faseDoPipeline): 4 é Financeiro e 5 é Obra
  const fase = fasePipelineDaGravada(d.fase);
  const coluna: ColunaPosContrato | null = fase === "financeiro" ? "financeiro" : fase === "obra" ? "obra" : null;
  if (coluna === null) return null;
  return {
    id, pessoaId: entityId, nome: d.nome, papel: "cliente", coluna, trabalho: d.servico || null,
    valor: d.orc ? Math.round(tot(d, S).pf * 100) / 100 : null,
    passo: proximoSeguro(d, S).t,
  };
}

const semAcentos = (texto: string): string => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O mesmo filtro do Pipeline: o papel, a pesquisa (nome ou serviço, a partir de 2 letras) e a ordem. A entrada já vem por mais recentes. */
export function filtrarCartoesPosContrato(cartoes: readonly CartaoPosContrato[], filtros: FiltrosQuadro): CartaoPosContrato[] {
  const termo = semAcentos(filtros.pesquisa.trim());
  const filtrados = cartoes.filter((c) => {
    if (filtros.papel !== null && c.papel !== filtros.papel) return false;
    return termo.length < MIN_PESQUISA || semAcentos(`${c.nome} ${c.trabalho ?? ""}`).includes(termo);
  });
  return filtros.ordem === "nome" ? [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, "pt")) : filtrados;
}
