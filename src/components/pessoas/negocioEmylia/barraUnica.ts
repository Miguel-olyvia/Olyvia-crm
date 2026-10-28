// UMA só barra de fases na ficha do Pipeline, a mesma de /negocios (FASES da Emylia): Por contactar, Contactado, Visita, NEGÓCIO, Financeiro, Obra. Só há uma
// fase «Negócio»: Orçamento, Proposta, Contrato e Fim são os PASSOS da lista à esquerda dentro dela (como na Emylia), não fases da barra. A fase atual vem da MESMA
// função que o quadro usa (faseDoPipeline.ts): a mais avançada entre a da Emylia, a da coluna do quadro, a derivada do que o negócio tem e a gravada em `negocios.fase`.
// Junta as duas barras que havia só à vista: o conteúdo e a lógica dos passos da abordagem não mudam. Função pura.
import type { FaseDoNegocio } from "../fasesDoNegocio";
import type { FaseGuia } from "../processo/passoGuiado";
import { FASES_PIPELINE, faseDaColunaDoQuadro, fasePipelineDaGravada, fasePipelineDerivada, numeroDaFase, type FasePipeline, type TemDoNegocio } from "./faseDoPipeline";
import type { FaseEmylia } from "./faseEmylia";

export const IDS_BARRA = FASES_PIPELINE;
export type IdBarra = FasePipeline;

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
  /** O que o negócio tem (chamadas, visitas, levantamento guardado…): a fase derivada, para a barra avançar assim que uma fase se conclui. */
  tem?: TemDoNegocio;
  /** `negocios.fase` (0 a 5); `null` nos negócios que o CRM criou. */
  faseGravada?: number | null;
}

/** As fases do negócio e as colunas do quadro usam outros nomes para as mesmas fases; Orçamento, Proposta e Contrato são todas a fase Negócio. */
function paraBarra(id: string): IdBarra | null {
  if (id === "contacto") return "contactado";
  if (id === "ganho") return null;
  const conhecida = id === "levantamento" || id === "orcamento" || id === "proposta" || id === "contrato" || (IDS_BARRA as readonly string[]).includes(id);
  return conhecida ? faseDaColunaDoQuadro(id as Parameters<typeof faseDaColunaDoQuadro>[0]) : null;
}

function rotulo(id: IdBarra): string {
  if (id === "negocio") return "pessoasPagina.guia.fase.negocio";
  return DA_ABORDAGEM.has(id) ? `pessoasPagina.board.col.${id}` : `pessoasPagina.phases.${id}`;
}

const maisAvancada = (fases: readonly (IdBarra | null)[]): IdBarra | null =>
  fases.reduce<IdBarra | null>((a, f) => (f !== null && (a === null || numeroDaFase(f) > numeroDaFase(a)) ? f : a), null);

export function barraUnica({ faseDoItem, fasesDoNegocio, faseEmylia, perdido, tem, faseGravada }: EntradaBarra): FaseGuia[] {
  const perdida = fasesDoNegocio.find((x) => x.estado === "perdida");
  const doNegocio = fasesDoNegocio.find((x) => x.estado === "atual");
  const atual: IdBarra | null = perdida ? paraBarra(perdida.id) : maisAvancada([
    faseEmylia,
    faseDoItem !== null ? paraBarra(faseDoItem) : null,
    tem ? fasePipelineDerivada(tem) : null,
    fasePipelineDaGravada(faseGravada),
  ]) ?? (doNegocio ? paraBarra(doNegocio.id) : null);
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
