// O próximo passo de uma pessoa na Lista real, reconstruído SÓ com os campos que neg_resumo_pessoas já devolve (puro, sem rede).
// Espelha `proximoPassoRegistos` e `passoDoNegocio` (components/pessoas/etapaPessoa.ts) até onde a lista tem dados.
// `null` quer dizer «não se sabe» (a UI mostra «—» e remete para a ficha): nunca se inventa um passo.
import type { FaseNegocio } from "@/components/negocio-metas/negocioMetas";
import type { IdPasso } from "@/components/pessoas/etapaPessoa";
import type { ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";

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
}

function instante(valor: string | null): number | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  return Number.isNaN(t) ? null : t;
}

/**
 * Há uma visita feita por ligar a um negócio. Sem negócios terminados é exato (qualquer visita feita conta). Com negócios
 * terminados é uma aproximação: conta se a visita é posterior ao último negócio (a função não diz a que negócio está ligada).
 */
function visitaFeitaPorLigar(p: EntradaPasso): boolean {
  const visita = instante(p.ultimaVisitaFeitaEm);
  if (visita === null) return false;
  if (p.ganhos + p.perdidos === 0) return true;
  const negocio = instante(p.ultimoNegocioEm);
  return negocio === null || visita > negocio;
}

/** Com negócio aberto: manda o mais avançado. Uma proposta por fechar depende do estado da proposta, que a lista não tem. */
function passoComNegocioAberto(p: EntradaPasso): IdPasso | null {
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
  if (!semNegocios && !registoPorLigar && !visitaFeita) return "nenhum";
  if (visitaFeita) return "criarNegocio";
  if (p.porLigarVisitas > 0) return "fecharLevantamento";
  return p.porLigarContactos > 0 ? "marcarVisita" : "registarChamada";
}
