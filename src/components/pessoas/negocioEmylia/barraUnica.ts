// UMA só barra de fases na ficha do Pipeline, a mesma de /negocios (FASES da Emylia): Por contactar, Contactado, Visita, NEGÓCIO, Financeiro, Obra. Só há uma
// fase «Negócio»: Orçamento, Proposta, Contrato e Fim são os PASSOS da lista à esquerda dentro dela (como na Emylia), não fases da barra. O Levantamento é o fim
// da fase Visita. Junta as duas barras que havia só à vista: o conteúdo e a lógica dos passos da abordagem não mudam. Função pura.
import type { FaseDoNegocio } from "../fasesDoNegocio";
import type { FaseGuia } from "../processo/passoGuiado";
import type { FaseEmylia } from "./faseEmylia";

export const IDS_BARRA = ["porContactar", "contactado", "visita", "negocio", "financeiro", "obra"] as const;
export type IdBarra = (typeof IDS_BARRA)[number];

const DA_ABORDAGEM: ReadonlySet<string> = new Set(["porContactar", "contactado", "visita"]);
const DEPOIS_DO_NEGOCIO: ReadonlySet<IdBarra> = new Set(["financeiro", "obra"]);

interface EntradaBarra {
  /** A coluna do item do guia (porContactar, contactado, visita, levantamento, orcamento, proposta, contrato); `null` sem item. */
  faseDoItem: string | null;
  /** As fases do negócio derivadas do que ele tem (com a perda, se houver). */
  fasesDoNegocio: readonly FaseDoNegocio[];
  faseEmylia: FaseEmylia | null;
  /** O negócio está perdido: Financeiro e Obra não se mostram por fazer. */
  perdido: boolean;
}

/** As fases do negócio e as colunas do quadro usam outros nomes para as mesmas fases; Orçamento, Proposta e Contrato são todas a fase Negócio. */
function paraBarra(id: string): IdBarra | null {
  if (id === "levantamento") return "visita";
  if (id === "contacto") return "contactado";
  if (id === "orcamento" || id === "proposta" || id === "contrato") return "negocio";
  return (IDS_BARRA as readonly string[]).includes(id) ? (id as IdBarra) : null;
}

function rotulo(id: IdBarra): string {
  if (id === "negocio") return "pessoasPagina.guia.fase.negocio";
  return DA_ABORDAGEM.has(id) ? `pessoasPagina.board.col.${id}` : `pessoasPagina.phases.${id}`;
}

export function barraUnica({ faseDoItem, fasesDoNegocio, faseEmylia, perdido }: EntradaBarra): FaseGuia[] {
  const perdida = fasesDoNegocio.find((x) => x.estado === "perdida");
  const doItem = faseDoItem !== null ? paraBarra(faseDoItem) : null;
  const doNegocio = fasesDoNegocio.find((x) => x.estado === "atual");
  const atual: IdBarra | null = perdida ? paraBarra(perdida.id)
    : faseEmylia ?? doItem ?? (doNegocio ? paraBarra(doNegocio.id) : null);
  const ganho = atual === null && fasesDoNegocio.some((x) => x.id === "ganho");
  // sem fase atual, um negócio ganho tem tudo feito até ao Negócio; um sem nada não tem nada feito
  const limite = atual !== null ? IDS_BARRA.indexOf(atual) : ganho ? IDS_BARRA.indexOf("negocio") + 1 : -1;
  const semPosNegocio = perdido || perdida !== undefined;
  return IDS_BARRA
    .filter((id) => !(semPosNegocio && DEPOIS_DO_NEGOCIO.has(id)))
    .map((id): FaseGuia => {
      const i = IDS_BARRA.indexOf(id);
      const estado = atual !== null
        ? (i < limite ? "feita" : i === limite ? (perdida ? "perdida" : "atual") : "porFazer")
        : (i < limite ? "feita" : "porFazer");
      return { id, rotuloChave: rotulo(id), estado };
    });
}
