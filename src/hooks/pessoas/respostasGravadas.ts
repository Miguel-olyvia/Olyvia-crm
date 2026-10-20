// As respostas de um levantamento tal como a ficha as devolve (levantamentos[].respostas e pessoa.qualificacao_respostas), com o snapshot do que
// a pessoa viu e respondeu. A leitura é tolerante: o que não se reconhece fica de fora (ou sem snapshot), nunca rebenta a ficha.
import type { TipoPergunta } from "@/components/negocio-metas/perguntasTipos";
import type { RespostaGravada } from "@/components/negocio-metas/respostasQuestionario";

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const TIPOS: readonly TipoPergunta[] = ["escolha_unica", "escolha_multipla", "texto", "numero"];

function numero(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function listaDeTextos(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

/** Lê uma lista de respostas gravadas. Uma resposta antiga (só seccao, pergunta e resposta) lê-se com `tipo` nulo: sem snapshot. */
export function lerRespostasGravadas(cru: unknown): RespostaGravada[] {
  if (!Array.isArray(cru)) return [];
  return cru.flatMap((item): RespostaGravada[] => {
    if (!ehObjeto(item)) return [];
    const seccao = texto(item.seccao);
    const pergunta = texto(item.pergunta);
    if (!seccao || !pergunta) return [];
    const escolhas = listaDeTextos(item.escolhas);
    const textos = listaDeTextos(item.escolhas_texto);
    return [{
      seccao, pergunta, resposta: texto(item.resposta),
      tipo: TIPOS.find((t) => t === item.tipo) ?? null,
      perguntaTexto: texto(item.pergunta_texto), seccaoTitulo: texto(item.seccao_titulo), bloco: texto(item.bloco),
      ordem: numero(item.ordem),
      escolhas,
      // Os textos acompanham as chaves uma a uma: com tamanhos diferentes não se sabe qual é qual, e ficam sem textos.
      escolhasTexto: escolhas && textos && textos.length === escolhas.length ? textos : null,
      valorTexto: texto(item.valor_texto), valorNumero: numero(item.valor_numero),
    }];
  });
}
