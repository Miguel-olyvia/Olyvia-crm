// UMA só barra de fases na ficha do Pipeline: Por contactar, Contactado, Visita, Orçamento, Proposta, Contrato, Financeiro, Obra. Junta as duas que
// havia (a da pessoa, de quatro fases, e a do negócio, do Levantamento à Obra) só à vista: o conteúdo e a lógica dos passos da abordagem não mudam.
// O Levantamento é o fim da fase Visita. Função pura.
import type { FaseDoNegocio } from "../fasesDoNegocio";
import type { FaseGuia } from "../processo/passoGuiado";
import type { FaseEmylia } from "./faseEmylia";

export const IDS_BARRA = ["porContactar", "contactado", "visita", "orcamento", "proposta", "contrato", "financeiro", "obra"] as const;
export type IdBarra = (typeof IDS_BARRA)[number];

const DA_ABORDAGEM: ReadonlySet<string> = new Set(["porContactar", "contactado", "visita"]);
const DEPOIS_DO_CONTRATO: ReadonlySet<IdBarra> = new Set(["financeiro", "obra"]);

interface EntradaBarra {
  /** A coluna do item do guia (porContactar, contactado, visita, levantamento, orcamento, proposta, contrato); `null` sem item. */
  faseDoItem: string | null;
  /** As fases do negócio derivadas do que ele tem (com a perda, se houver). */
  fasesDoNegocio: readonly FaseDoNegocio[];
  faseEmylia: FaseEmylia | null;
  /** O negócio está perdido: Financeiro e Obra não se mostram por fazer. */
  perdido: boolean;
}

/** As fases do negócio e as colunas do quadro usam outros nomes para as mesmas fases. */
function paraBarra(id: string): IdBarra | null {
  if (id === "levantamento") return "visita";
  if (id === "contacto") return "contactado";
  return (IDS_BARRA as readonly string[]).includes(id) ? (id as IdBarra) : null;
}

function rotulo(id: IdBarra): string {
  return DA_ABORDAGEM.has(id) ? `pessoasPagina.board.col.${id}` : `pessoasPagina.phases.${id}`;
}

export function barraUnica({ faseDoItem, fasesDoNegocio, faseEmylia, perdido }: EntradaBarra): FaseGuia[] {
  const perdida = fasesDoNegocio.find((x) => x.estado === "perdida");
  const doItem = faseDoItem !== null ? paraBarra(faseDoItem) : null;
  const doNegocio = fasesDoNegocio.find((x) => x.estado === "atual");
  const atual: IdBarra | null = perdida ? paraBarra(perdida.id)
    : faseEmylia ?? doItem ?? (doNegocio ? paraBarra(doNegocio.id) : null);
  const ganho = atual === null && fasesDoNegocio.some((x) => x.id === "ganho");
  // sem fase atual, um negócio ganho tem tudo feito até ao Contrato; um sem nada não tem nada feito
  const limite = atual !== null ? IDS_BARRA.indexOf(atual) : ganho ? IDS_BARRA.indexOf("contrato") + 1 : -1;
  const semPosContrato = perdido || perdida !== undefined;
  return IDS_BARRA
    .filter((id) => !(semPosContrato && DEPOIS_DO_CONTRATO.has(id)))
    .map((id): FaseGuia => {
      const i = IDS_BARRA.indexOf(id);
      const estado = atual !== null
        ? (i < limite ? "feita" : i === limite ? (perdida ? "perdida" : "atual") : "porFazer")
        : (i < limite ? "feita" : "porFazer");
      return { id, rotuloChave: rotulo(id), estado };
    });
}
