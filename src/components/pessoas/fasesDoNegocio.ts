// As fases de um negócio como a ficha as mostra: feita (✓), atual (•), por fazer (○) e onde se perdeu (✗). As da abordagem (contacto, visita,
// levantamento) são opcionais: só aparecem quando existem (ligadas ao negócio) ou, no levantamento, quando é a fase atual. Orçamento,
// Proposta e Contrato aparecem sempre; Ganho só num negócio ganho. Tudo DERIVA do negócio e dos registos ligados: nada se guarda. Funções puras.
import { registosDoNegocio } from "@/components/negocio-metas/acoesRegistos";
import { visitasDerivadas } from "@/components/negocio-metas/derivadosDoNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { faseDoPercurso, type FaseNaPerda, type PerdaDoPercurso } from "@/components/negocio-metas/percursoNegocio";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";

export type IdFase = "contacto" | "visita" | "levantamento" | "orcamento" | "proposta" | "contrato" | "ganho";
export type EstadoFase = "feita" | "atual" | "porFazer" | "perdida";

export interface FaseDoNegocio {
  id: IdFase;
  estado: EstadoFase;
}

type FaseDaCadeia = "levantamento" | "orcamento" | "proposta" | "contrato";

/** A posição de cada fase do percurso: as anteriores à atual estão feitas, as seguintes por fazer. */
const LUGAR: Record<FaseNaPerda, number> = { levantamento: 0, orcamento: 1, proposta: 2, contrato: 3, ganho: 4 };

const fase = (id: IdFase, estado: EstadoFase): FaseDoNegocio => ({ id, estado });

/**
 * As fases do negócio, pela ordem. `perda` é a perda guardada (a fase em que se perdeu); `perdidoAntigo` marca um negócio perdido
 * de meses anteriores, que não tem perda guardada: fica perdido na fase em que o que tem o deixa.
 */
export function fasesDoNegocio(negocio: NegocioMes, registos: EstadoRegistos, perda?: PerdaDoPercurso, perdidoAntigo = false): FaseDoNegocio[] {
  const ligados = registosDoNegocio(registos, negocio.id);
  const atual = faseDoPercurso(negocio, { registos, perda });
  const perdido = atual === "perdido" || perdidoAntigo;
  const lugar: FaseNaPerda = atual === "perdido" ? (perda?.fase ?? "orcamento") : atual;
  const estadoNa = (id: FaseDaCadeia): EstadoFase => {
    if (LUGAR[id] < LUGAR[lugar]) return "feita";
    if (LUGAR[id] > LUGAR[lugar]) return "porFazer";
    return perdido ? "perdida" : "atual";
  };
  const visitas = visitasDerivadas(negocio, ligados);
  const temLevantamento = ligados.levantamentos.length > 0 || Boolean(negocio.levantamento);
  const abordagem: FaseDoNegocio[] = [
    ...(ligados.contactos.length > 0 ? [fase("contacto", "feita")] : []),
    ...(visitas.length > 0 ? [fase("visita", visitas.some((v) => v.estado === "feita") ? "feita" : "porFazer")] : []),
    ...(temLevantamento ? [fase("levantamento", "feita")] : lugar === "levantamento" ? [fase("levantamento", estadoNa("levantamento"))] : []),
  ];
  return [
    ...abordagem,
    fase("orcamento", estadoNa("orcamento")),
    fase("proposta", estadoNa("proposta")),
    fase("contrato", estadoNa("contrato")),
    ...(lugar === "ganho" ? [fase("ganho", "feita")] : []),
  ];
}
