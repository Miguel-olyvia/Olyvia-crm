// O próximo passo de uma pessoa na Lista real, reconstruído SÓ com os campos que neg_resumo_pessoas já devolve (puro, sem rede).
// Espelha `proximoPassoRegistos` e `passoDoNegocio` (components/pessoas/etapaPessoa.ts) até onde a lista tem dados.
// `null` quer dizer «não se sabe» (a UI mostra «—» e remete para a ficha): nunca se inventa um passo.
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { IdPasso } from "@/components/pessoas/etapaPessoa";
import type { EtapaPessoa, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";
import { diaLisboa } from "./tempoLisboa";

export interface EntradaPasso {
  encerrada: ResultadoEncerramento | null;
  abertos: number;
  ganhos: number;
  perdidos: number;
  faseEtapa: FaseNegocio | null;
  prontoAGanhar: boolean;
  ultimaVisitaFeitaEm: string | null;
  ultimoNegocioEm: string | null;
  porLigarContactos: number;
  porLigarVisitas: number;
  porLigarLevantamentos: number;
  /** A etapa que a base devolve (nunca calculada aqui). Com um negócio aberto na abordagem, o passo sai dela. */
  etapa?: EtapaPessoa;
}

/** O passo de cada etapa da abordagem de um negócio aberto: nova, em contacto e com visita marcada. */
const PASSO_DA_ETAPA: Partial<Record<EtapaPessoa, IdPasso>> = { nova: "registarChamada", emContacto: "marcarVisita", visitaMarcada: "fecharLevantamento" };

/**
 * Há uma visita feita por ligar a um negócio. Sem negócios terminados é exato (qualquer visita feita conta). Com negócios
 * terminados é uma aproximação: conta se a visita é de um dia de Lisboa estritamente posterior ao do último negócio (a função não diz
 * a que negócio está ligada). Compara o DIA, como o protótipo (`registosParaAbordagem`: `r.data > limite`), não o instante.
 */
function visitaFeitaPorLigar(p: EntradaPasso): boolean {
  const visita = diaLisboa(p.ultimaVisitaFeitaEm);
  if (visita === null) return false;
  if (p.ganhos + p.perdidos === 0) return true;
  const negocio = diaLisboa(p.ultimoNegocioEm);
  return negocio === null || visita > negocio;
}

/**
 * Com negócio aberto: manda o mais avançado. Uma proposta por fechar depende do estado da proposta, que a lista não tem.
 * `faseEtapa === "orcamento"` quer dizer que um negócio aberto tem pelo menos um orçamento (neg_resumo_pessoas só dá «orcamento» com uma linha
 * em `quotes`; sem nenhum documento a fase é nula), por isso «criar a proposta» é exato, e não uma suposição.
 */
function passoComNegocioAberto(p: EntradaPasso): IdPasso | null {
  const daEtapa = p.etapa ? PASSO_DA_ETAPA[p.etapa] : undefined;
  if (daEtapa) return daEtapa;
  if (p.prontoAGanhar) return "ganharNegocio";
  if (p.faseEtapa === "contrato") return "recolherAssinatura";
  if (p.faseEtapa === "orcamento") return "criarProposta";
  if (p.faseEtapa === null) return "fazerLevantamento";
  return null;
}

export function passoDaLista(p: EntradaPasso): IdPasso | null {
  if (p.encerrada) return "nenhum";
  if (p.abertos > 0) return passoComNegocioAberto(p);
  const visitaFeita = visitaFeitaPorLigar(p);
  const semNegocios = p.ganhos + p.perdidos === 0;
  const registoPorLigar = p.porLigarContactos > 0 || p.porLigarVisitas > 0 || p.porLigarLevantamentos > 0;
  // Só negócios terminados e nada por ligar: a ficha ainda pode dar um passo (`voltouAAbordagem`: uma submissão resolvida depois do último
  // negócio) e a lista não tem essa fonte. Não se sabe, e não se afirma «nenhum».
  // TODO: devolver «nenhum» aqui quando a coluna voltou_a_contactar existir em neg_resumo_pessoas (Lote B).
  if (!semNegocios && !registoPorLigar && !visitaFeita) return null;
  if (visitaFeita) return "criarNegocio";
  if (p.porLigarVisitas > 0) return "fecharLevantamento";
  return p.porLigarContactos > 0 ? "marcarVisita" : "registarChamada";
}
