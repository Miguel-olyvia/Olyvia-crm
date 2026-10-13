// Junta cada pessoa com os seus negócios. Funções puras: o dia de hoje (AAAA-MM-DD)
// chega sempre por parâmetro e nada lê o relógio. O papel não é guardado: é cliente quem
// tem um negócio ganho, e lead quem não tem.
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, type FaseNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { ORDEM_SAUDE, saudeDoNegocio } from "@/components/negocio-metas/saudeNegocio";
import { ehHistorico, type NegocioPessoa, type Pessoa, type ResumoPessoa } from "./pessoasTipos";

const ORDEM_FASE: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "ganho"];

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

function faseMaisAvancada(contam: NegocioPessoa[]): FaseNegocio | null {
  return contam.reduce<FaseNegocio | null>((melhor, n) => {
    const fase = faseDoNegocio(n);
    return melhor === null || ORDEM_FASE.indexOf(fase) > ORDEM_FASE.indexOf(melhor) ? fase : melhor;
  }, null);
}

function resumir(pessoa: Pessoa, negocios: NegocioPessoa[], hoje: string): ResumoPessoa {
  const contam = negocios.filter((n) => estaAberto(n) || estaGanho(n));
  const pior = piorAberto(negocios.filter(estaAberto), hoje);
  return {
    pessoa,
    papel: negocios.some(estaGanho) ? "cliente" : "lead",
    negocios,
    numero: contam.length,
    valor: contam.reduce((soma, n) => soma + valorDoNegocio(n), 0),
    fase: faseMaisAvancada(contam),
    piorAberto: pior,
    saude: pior ? saudeDoNegocio(pior, hoje) : null,
    semNegocio: negocios.length === 0,
    soHistorico: negocios.length > 0 && contam.length === 0,
  };
}

export function juntarPessoas(
  pessoas: readonly Pessoa[], negocios: readonly NegocioPessoa[], hoje: string,
): ResumoPessoa[] {
  return pessoas.map((p) => resumir(p, negocios.filter((n) => n.pessoaId === p.id), hoje));
}
