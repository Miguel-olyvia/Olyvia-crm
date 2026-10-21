// Passa uma linha de neg_resumo_quadro para o cartão do Quadro (puro, sem rede). Nunca rebenta com um valor que a base acrescente:
// uma coluna ou um tipo desconhecidos descartam o cartão, um estado de proposta desconhecido cai em «esperarCliente».
import { LIMITE_PARADOS } from "@/components/negocio-metas/saudeNegocio";
import type { IdPasso } from "@/components/pessoas/etapaPessoa";
import type { PapelPessoa } from "@/components/pessoas/pessoasTipos";
import { COLUNAS_QUADRO, idCartaoPessoa, type CartaoQuadro, type ColunaQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import { diasEntre } from "./adaptarResumoPessoa";
import type { CartaoComCursor, LinhaQuadroDb } from "./quadroPessoasTipos";
import { diaLisboa } from "./tempoLisboa";

const COLUNAS: readonly string[] = COLUNAS_QUADRO.map((c) => c.id);
const COM_PARADO: readonly ColunaQuadro[] = ["orcamento", "proposta"];

const positivo = (n: number | null): boolean => (n ?? 0) > 0;

/** O valor de uma coluna ou de um cartão: NULL (coluna só com cartões sem valor), texto ilegível e infinitos contam como 0. */
export function valorOuZero(valor: number | string | null): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function valorDoCartao(valor: number | string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function passoDaPessoa(l: LinhaQuadroDb): IdPasso {
  if (positivo(l.por_ligar_visitas_feitas)) return "criarNegocio";
  if (positivo(l.por_ligar_visitas)) return "fecharLevantamento";
  if (positivo(l.por_ligar_contactos)) return "marcarVisita";
  return "registarChamada";
}

/**
 * O passo de um negócio. Decide-se pela COLUNA (a base não diz se há levantamento): um negócio em «orcamento» sem orçamentos já tem o
 * levantamento feito, por isso não diz «fazerLevantamento»; o passo de criar o orçamento não existe no motor (decisão por tomar), logo «nenhum».
 */
function passoDoNegocio(l: LinhaQuadroDb, coluna: ColunaQuadro): IdPasso {
  if (l.pronto_a_ganhar === true) return "ganharNegocio";
  if (coluna === "contrato") return "recolherAssinatura";
  if (coluna === "proposta") {
    if (l.proposta_status === "accepted") return "criarContrato";
    return l.proposta_status === "draft" ? "enviarProposta" : "esperarCliente";
  }
  if (coluna === "orcamento") return positivo(l.n_orcamentos) ? "criarProposta" : "nenhum";
  return "fazerLevantamento";
}

const papelDe = (papel: string): PapelPessoa => (papel === "cliente" ? "cliente" : "lead");

function paradoDe(l: LinhaQuadroDb, coluna: ColunaQuadro, hoje: string): number | undefined {
  if (!COM_PARADO.includes(coluna)) return undefined;
  const dias = diasEntre(l.parado_desde, hoje);
  return dias !== null && dias > LIMITE_PARADOS ? dias : undefined;
}

/** `hoje` é o dia de Lisboa (AAAA-MM-DD). `null`: a linha não é um cartão que o ecrã conheça. */
export function adaptarLinhaQuadro(l: LinhaQuadroDb, hoje: string): CartaoComCursor | null {
  if (!COLUNAS.includes(l.coluna)) return null;
  if (l.tipo !== "pessoa" && l.tipo !== "negocio") return null;
  const coluna = l.coluna as ColunaQuadro;
  // O cursor leva o cartao_id CRU (o de uma pessoa não tem o prefixo `pessoa-`) e a chave tal como veio.
  const cursor = l.chave_ordem === null ? null : { chave: l.chave_ordem, id: l.cartao_id };
  const base = { pessoaId: l.entity_id, nome: l.nome ?? "", papel: papelDe(l.papel), coluna };
  if (l.tipo === "pessoa") {
    const prazo = diaLisboa(l.proximo_prazo_em);
    return {
      cartao: {
        ...base, id: idCartaoPessoa(l.entity_id), tipo: "pessoa", trabalho: null, valor: null, passo: passoDaPessoa(l),
        prazo, atrasado: prazo !== null && prazo < hoje,
      },
      cursor,
    };
  }
  const cartao: CartaoQuadro = {
    ...base, id: l.cartao_id, tipo: "negocio", trabalho: l.titulo, valor: coluna === "levantamento" ? null : valorDoCartao(l.valor),
    passo: passoDoNegocio(l, coluna), prazo: null, atrasado: false,
  };
  const paradoDias = paradoDe(l, coluna, hoje);
  if (paradoDias !== undefined) cartao.paradoDias = paradoDias;
  if (l.pronto_a_ganhar === true) cartao.prontoAGanhar = true;
  // Sem orçamentos o passo continua a ser «nenhum» (nenhum passo novo no motor); só o texto do cartão explica porque não há botão.
  if (coluna === "orcamento" && !positivo(l.n_orcamentos) && l.pronto_a_ganhar !== true) cartao.semOrcamentos = true;
  return { cartao, cursor };
}
