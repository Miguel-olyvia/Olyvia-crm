// Os efeitos configurados chegam ao orçamento da Emylia: refaz as linhas «Levantamento · …» que a organização configurou e tira as nativas que
// a configuração desligou. O motor (src/emylia) não se altera: o armazém corre a ação, e logo a seguir, ANTES de gravar, corre-se isto (correrComEfeitos).
// Sempre a partir de d.f + a configuração, por isso é idempotente e não depende do que estava antes. Só antes de a proposta ser enviada (depois disso
// o orçamento está fechado). As linhas nossas ficam registadas em d.f.cfg_linhas (gravado com o negócio), para se poderem tirar quando a resposta muda.
import { aplicarPrecosMan, type Negocio } from "@/emylia/motor";
import { PREFIXO_LEV, efeitosDoLevantamento } from "@/emylia/efeitosLevantamento";
import { chaveBase } from "@/emylia/campos";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import { camposNativosDesligados, efeitosConfigurados } from "./efeitosConfigurados";

export const CHAVE_LINHAS_CFG = "cfg_linhas";
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** As descrições das linhas que este módulo pôs, como ficaram gravadas. Um valor que não se lê conta como «nenhuma»: as linhas voltam a refazer-se de d.f, nada se perde. */
function linhasAnteriores(d: Negocio): string[] {
  const cru = d.f[CHAVE_LINHAS_CFG];
  if (!cru) return [];
  try {
    const v: unknown = JSON.parse(cru);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface LinhaCfg { d: string; custo: number; preco: number }

/** Aplica ao orçamento do negócio os efeitos configurados. Devolve `true` se mudou alguma linha. */
export function aplicarEfeitosConfigurados(d: Negocio, q: QuestionarioForm | null): boolean {
  const o = d.orc;
  if (!q || !o || o.vendaDireta || o.enviada) return false;
  const anteriores = linhasAnteriores(d);
  const fora = camposNativosDesligados(q);
  const nativasFora = new Set(efeitosDoLevantamento(d.f).filter((e) => fora.has(chaveBase(e.k))).map((e) => PREFIXO_LEV + e.d));
  // a base das percentagens: os serviços do orçamento (como o motor faz com as nativas)
  let bc = 0, bp = 0;
  for (const l of o.linhas) if (l.t === "svc") { bc += l.cu * l.q; bp += l.pu * l.q; }
  const desejadas: LinhaCfg[] = efeitosConfigurados(q, d.f).flatMap((e): LinhaCfg[] => {
    if (e.t === "linha") return [{ d: PREFIXO_LEV + e.d, custo: e.custo, preco: e.preco }];
    if (e.t === "percent" && e.pct !== undefined) return [{ d: PREFIXO_LEV + e.d, custo: r2(bc * e.pct), preco: r2(bp * e.pct) }];
    return [];
  });
  const atuais = o.linhas.filter((l): l is Extract<typeof l, { t: "mat" }> => l.t === "mat" && anteriores.includes(l.d));
  const igual = atuais.length === desejadas.length && atuais.every((l, i) => l.d === desejadas[i].d && l.custo === desejadas[i].custo && l.preco === desejadas[i].preco);
  const temNativaForaDeLugar = o.linhas.some((l) => l.t === "mat" && nativasFora.has(l.d) && !desejadas.some((x) => x.d === l.d));
  if (igual && !temNativaForaDeLugar) return false;
  o.linhas = o.linhas.filter((l) => !(l.t === "mat" && (anteriores.includes(l.d) || nativasFora.has(l.d))));
  for (const l of desejadas) o.linhas.push({ t: "mat", d: l.d, custo: l.custo, preco: l.preco });
  aplicarPrecosMan(o);
  if (desejadas.length > 0) d.f[CHAVE_LINHAS_CFG] = JSON.stringify(desejadas.map((l) => l.d)); else delete d.f[CHAVE_LINHAS_CFG];
  return true;
}
