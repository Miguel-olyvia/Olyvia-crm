// CRM (4/11): a resposta de um campo do formulário online, traduzida para a pergunta da fase a que o campo está ligado
// (form_fields.phase_field_mapping). A base (neg_sugestoes_formulario) entrega o valor bruto e a tabela de correspondência;
// a tradução faz-se aqui porque as opções dos campos de sistema só existem em campos.ts. Função pura: sem rede, sem estado.
// Ordem para cada valor do formulário: tabela explícita, texto igual (sem maiúsculas nem acentos), «Outro» (se a pergunta o tem), nada.
import { camposAjustados, type CfgCampos, type Def } from "./campos";
import { GRUPOS_AJUSTAVEIS } from "./real/camposConfig";

/** Uma linha de neg_sugestoes_formulario / neg_sugestoes_submissoes. */
export interface SugestaoBase {
  negocio_id: string | null;
  submissao_id?: string | null;
  grupo: string;
  chave: string;
  tipo_campo?: string | null;
  /** O valor bruto do formulário: texto ou lista. */
  valor: unknown;
  /** Rótulo do formulário → rótulo da pergunta (null = sem correspondência). */
  valores?: Record<string, string | null> | null;
}

/** Sem maiúsculas nem acentos, espaços normalizados. */
export const normalizarTexto = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** A pergunta (já com os ajustes da organização) ou null se não existe ou está escondida. */
function perguntaDe(grupo: string, chave: string, cfg: CfgCampos | undefined): Def | null {
  const g = GRUPOS_AJUSTAVEIS.find((x) => x.titulo === grupo);
  if (!g) return null;
  const c = camposAjustados(cfg, g).find((x) => x.k === chave);
  return !c || c.escondido ? null : c;
}

/** Os itens do valor bruto, como texto (uma lista dá vários; o resto, um). */
function itens(valor: unknown): string[] {
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista
    .filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")
    .map((x) => String(x).trim())
    .filter(Boolean);
}

const SIM = new Set(["sim", "true", "yes", "s", "1"]);
const NAO = new Set(["nao", "false", "no", "n", "0"]);

/** Um valor do formulário → uma opção da pergunta (a escrita da pergunta), ou null. */
function paraOpcao(item: string, op: readonly string[], valores: Record<string, string | null> | null | undefined): string | null {
  const alvo = normalizarTexto(item);
  const daPergunta = (rotulo: string): string | null => op.find((o) => normalizarTexto(o) === normalizarTexto(rotulo)) ?? null;
  // 1. a tabela explícita; um null é «sem correspondência» de propósito (nem texto igual, nem «Outro»)
  for (const [k, v] of Object.entries(valores ?? {})) {
    if (normalizarTexto(k) !== alvo) continue;
    return v === null || typeof v !== "string" ? null : daPergunta(v);
  }
  // 2. texto igual, 3. «Outro»
  return daPergunta(item) ?? daPergunta("Outro");
}

/** O valor da pergunta a partir da sugestão, ou null se não há nada a sugerir. */
export function traduzirSugestao(s: SugestaoBase, cfg: CfgCampos | undefined): string | null {
  const c = perguntaDe(s.grupo, s.chave, cfg);
  if (!c) return null;
  const vs = itens(s.valor);
  if (!vs.length) return null;
  const op = c.op ?? [];
  switch (c.t) {
    case "escolha": {
      // só preenche com exactamente UM valor mapeado distinto
      const mapeados = new Set(vs.map((v) => paraOpcao(v, op, s.valores)).filter((x): x is string => !!x));
      return mapeados.size === 1 ? [...mapeados][0] : null;
    }
    case "varios": {
      const mapeados = new Set(vs.map((v) => paraOpcao(v, op, s.valores)).filter((x): x is string => !!x));
      // o valor guarda-se como «A, B»: uma opção com vírgula partiria a lista
      if (!mapeados.size || [...mapeados].some((x) => x.includes(","))) return null;
      const r = op.filter((o) => mapeados.has(o)).join(", ");
      return r || null;
    }
    case "sim_nao": {
      const n = normalizarTexto(vs[0]);
      return SIM.has(n) ? "Sim" : NAO.has(n) ? "Não" : null;
    }
    case "numero": {
      const t = vs[0].replace(",", ".");
      return Number.isFinite(Number(t)) ? t : null;
    }
    case "texto":
    case "texto_longo":
    case "data":
      return vs.join(", ");
    default:
      return null; // o contador fica de fora
  }
}

/** As sugestões de um negócio como linhas de resposta (sugerido: true), uma por chave, sem repetir as chaves de `jaTem`. */
export function linhasSugeridas(
  sugestoes: readonly SugestaoBase[], cfg: CfgCampos | undefined, jaTem: ReadonlySet<string>,
): { campo_chave: string; valor: string; sugerido: true }[] {
  const feitas = new Set(jaTem);
  const r: { campo_chave: string; valor: string; sugerido: true }[] = [];
  for (const s of sugestoes) {
    if (feitas.has(s.chave)) continue;
    const valor = traduzirSugestao(s, cfg);
    if (valor === null) continue;
    feitas.add(s.chave);
    r.push({ campo_chave: s.chave, valor, sugerido: true });
  }
  return r;
}
