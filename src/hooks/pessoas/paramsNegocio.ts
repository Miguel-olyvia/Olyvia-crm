// A parte pura das mutações de um negócio: validar o que o utilizador escreveu (os mesmos limites da base, para não gastar uma ida à base
// com o que ela vai recusar com NG009) e ler as respostas sem nunca rebentar com uma forma inesperada.
import { fechoDe } from "@/components/negocio-metas/fechoNegocio";
import {
  TIPOS_REGISTO_BASE, type ConversaoGanho, type RefRegistoBase, type ResultadoCriar, type ResultadoGanho, type ResultadoMudarFecho, type TipoRegistoBase,
} from "@/components/negocio-metas/mutacoesNegocio";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "./errosNeg";

export const MAX_TEXTO_ESTADO = 1000;
export const MAX_TITULO = 200;
export const MAX_NOTAS = 5000;

/** Um erro que a UI traduz pelo código, sem ir à base. */
export const erroLocal = (codigo: "NG009" | "42501"): ErroNeg => new ErroNeg(null, codigo, CHAVES_ERRO_NEG[codigo]);
export const erroGenerico = (): ErroNeg => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);

/** O motivo da perda ou a razão da reabertura: de 1 a 1000 caracteres depois de limpo. Devolve o texto limpo. */
export function textoDeEstado(texto: string): string {
  const limpo = texto.trim();
  if (limpo === "" || limpo.length > MAX_TEXTO_ESTADO) throw erroLocal("NG009");
  return limpo;
}

/** Um tipo de registo que a base conhece; qualquer outro é um erro de valor. */
export function tipoDeRegisto(tipo: string): TipoRegistoBase {
  if (!(TIPOS_REGISTO_BASE as readonly string[]).includes(tipo)) throw erroLocal("NG009");
  return tipo as TipoRegistoBase;
}

/** O título (1 a 200) e as notas (até 5000), limpos; as notas vazias vão como nulo. */
export function tituloENotas(titulo: string, notas: string): { titulo: string; notas: string | null } {
  const t = titulo.trim();
  const n = notas.trim();
  if (t === "" || t.length > MAX_TITULO || n.length > MAX_NOTAS) throw erroLocal("NG009");
  return { titulo: t, notas: n === "" ? null : n };
}

const objeto = (dados: unknown): Record<string, unknown> => {
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) throw erroGenerico();
  return dados as Record<string, unknown>;
};

/** A base respondeu com um objeto: `mudou` só vale se for exatamente `true`. */
export function lerMudou(dados: unknown): { mudou: boolean } {
  return { mudou: objeto(dados).mudou === true };
}

/** A resposta de `neg_mudar_fecho`: `precisa_confirmar` e `mudou` só valem se forem exatamente `true`; um tipo desconhecido lê-se como nulo. */
export function lerMudarFecho(dados: unknown): ResultadoMudarFecho {
  const d = objeto(dados);
  return { mudou: d.mudou === true, fecho: fechoDe(d.fecho), precisaConfirmar: d.precisa_confirmar === true };
}

const CONVERSOES: readonly ConversaoGanho[] = ["feita", "ja_cliente", "ja_convertida"];

export function lerGanho(dados: unknown): ResultadoGanho {
  const d = objeto(dados);
  const outras = d.outras_leads_abertas;
  return {
    mudou: d.mudou === true,
    conversao: CONVERSOES.find((c) => c === d.conversao) ?? null,
    outrasLeadsAbertas: typeof outras === "number" && Number.isInteger(outras) && outras > 0 ? outras : 0,
  };
}

/** Os registos recusados: só os que têm tipo conhecido e um id em texto. */
function lerRecusados(valor: unknown): RefRegistoBase[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((r): RefRegistoBase[] => {
    const ref = typeof r === "object" && r !== null ? (r as { tipo?: unknown; id?: unknown }) : null;
    const tipo = TIPOS_REGISTO_BASE.find((t) => t === ref?.tipo);
    return tipo && typeof ref?.id === "string" ? [{ tipo, id: ref.id }] : [];
  });
}

export function lerCriado(dados: unknown): ResultadoCriar {
  const d = objeto(dados);
  if (typeof d.negocio_id !== "string") throw erroGenerico();
  return { negocioId: d.negocio_id, mudou: d.mudou === true, recusados: lerRecusados(d.recusados) };
}
