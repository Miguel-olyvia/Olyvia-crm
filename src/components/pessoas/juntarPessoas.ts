// Junta cada pessoa com os seus negócios. Funções puras: o dia de hoje (AAAA-MM-DD)
// chega sempre por parâmetro e nada lê o relógio. O papel não é guardado: é cliente quem
// tem um negócio ganho, e lead quem não tem.
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { ORDEM_SAUDE, saudeDoNegocio } from "@/components/negocio-metas/saudeNegocio";
import { estaAtrasada, etapaEfetiva, negocioEmFoco } from "./etapaPessoa";
import { ehHistorico, type NegocioPessoa, type PapelPessoa, type PedidoNegocio, type Pessoa, type ResumoPessoa } from "./pessoasTipos";

/** Ganho: contrato assinado no quadro do mês, ou resultado "ganho" num histórico. */
export const estaGanho = (n: NegocioPessoa): boolean => (ehHistorico(n) ? n.resultado === "ganho" : isNegocioGanho(n));

/** Aberto: no quadro do mês e ainda sem contrato assinado. Os históricos já terminaram. */
export const estaAberto = (n: NegocioPessoa): n is NegocioMes => !ehHistorico(n) && !isNegocioGanho(n);

/** O pior negócio aberto: o de saúde mais grave (a primeira de ORDEM_SAUDE); em empate, o primeiro. */
function piorAberto(abertos: NegocioMes[], hoje: string): NegocioMes | null {
  let pior: NegocioMes | null = null;
  let piorIndice = Infinity;
  for (const n of abertos) {
    const indice = ORDEM_SAUDE.indexOf(saudeDoNegocio(n, hoje));
    if (indice < piorIndice) {
      pior = n;
      piorIndice = indice;
    }
  }
  return pior;
}

/** O papel (cliente se tem um negócio ganho) e os negócios abertos de uma pessoa, a partir dos negócios dela. */
export function papelEAbertos(negocios: readonly NegocioPessoa[]): { papel: PapelPessoa; abertos: NegocioMes[] } {
  return { papel: negocios.some(estaGanho) ? "cliente" : "lead", abertos: negocios.filter(estaAberto) };
}

function resumir(pessoa: Pessoa, negocios: NegocioPessoa[], pedidos: PedidoNegocio[], hoje: string): ResumoPessoa {
  const { papel, abertos } = papelEAbertos(negocios);
  const pior = piorAberto(abertos, hoje);
  const entrada = { pessoa, papel, abertos, pedidos };
  const foco = negocioEmFoco(abertos);
  return {
    pessoa,
    papel,
    negocios,
    abertos,
    pedidos,
    emJogo: abertos.reduce((soma, n) => soma + valorDoNegocio(n), 0),
    atrasada: estaAtrasada(entrada, hoje),
    formulario: pessoa.formulario ?? null,
    etapa: etapaEfetiva(entrada),
    faseEtapa: foco ? faseDoNegocio(foco) : null,
    piorAberto: pior,
    saude: pior ? saudeDoNegocio(pior, hoje) : null,
    semNegocio: negocios.length === 0,
    soHistorico: negocios.length > 0 && negocios.every((n) => !estaAberto(n) && !estaGanho(n)),
  };
}

/**
 * Junta cada pessoa com os seus negócios e os seus pedidos (a etapa, o "atrasada" e o próximo passo dependem deles). Sem `pedidos`,
 * ninguém tem pedidos.
 */
export function juntarPessoas(
  pessoas: readonly Pessoa[], negocios: readonly NegocioPessoa[], hoje: string, pedidos: readonly PedidoNegocio[] = [],
): ResumoPessoa[] {
  return pessoas.map((p) => resumir(p, negocios.filter((n) => n.pessoaId === p.id), pedidos.filter((d) => d.pessoaId === p.id), hoje));
}
