// 25/11 (Rúben, 1048: «abrir portas a ter duas plantas com necessidades separadas no mesmo negócio/contrato… é um negócio de
// remodelação de casa de banho e cozinha»). Um negócio com várias divisões, cada uma com a sua planta e o seu 3D.
//
// O modelo segue o das divisões da área (campos.ts, 13/10): as divisões são as escolhidas na visita (f.diag_tipo_area, «Casa de banho,
// Cozinha»). A principal usa as chaves de sempre (f.planta, f.retif_planta, f.estudio): os negócios de antes ficam iguais, sem migração
// nem SQL. As outras usam o prefixo da divisão (f.div_coz_planta, f.div_coz_estudio, …), como os campos da área (f.div_coz_diag_gas).
//
// `fDaDivisao` dá os valores do negócio vistos de uma divisão (a planta, o projeto e as respostas da área dela nas chaves de base):
// o que hoje lê f.planta e f.estudio passa a servir qualquer divisão sem mudar.
import { DIVISOES, CHAVE_PRINCIPAL, divisaoPrincipal, divisoesEscolhidas, listaVarios, prefixoDivisao } from "./campos";

// ------------------------------------------------------------------ 28/11: a casa toda
// (Rúben, Schroeder: «é a casa toda, tem sala, cozinha, casa de banho etc. precisamos de ter tudo»). As áreas que se juntam com um
// toque (além das da lista da visita); qualquer outro nome escreve-se à mão («Casa de banho suite»), e a mesma área pode repetir-se
// com outro nome.
export const AREAS_DA_CASA = ["Casa de banho", "Cozinha", "Sala", "Quarto", "Corredor", "Hall de entrada", "Lavandaria", "Varanda", "Escritório", "Despensa"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** O tipo de espaço de uma área pelo nome («Casa de banho suite» é casa de banho; «Copa» é cozinha). O mesmo de tipoEspacoDeDivisao
 *  (planta3d/catalogo3d.ts), sem carregar o catálogo 3D. */
export function tipoDaArea(nome: string | null | undefined): "casa_banho" | "cozinha" | "quarto" | "sala" | "outro" {
  const s = semAcento(nome ?? "");
  if (/banho|wc|sanitario|lavabo/.test(s)) return "casa_banho";
  if (/cozinha|copa/.test(s)) return "cozinha";
  if (/quarto|suite/.test(s)) return "quarto";
  if (/sala|estar|jantar/.test(s)) return "sala";
  return "outro";
}
/** As peças e o catálogo que o Estúdio mostra para a área: os da cozinha numa cozinha, os da casa de banho nas outras. */
export const estudioDaArea = (nome: string): "Casa de banho" | "Cozinha" => (tipoDaArea(nome) === "cozinha" ? "Cozinha" : "Casa de banho");

/** Os campos do negócio que cada divisão tem à parte. */
export const CAMPOS_DA_DIVISAO = ["planta", "retif_planta", "estudio"] as const;
export type CampoDaDivisao = (typeof CAMPOS_DA_DIVISAO)[number];

export interface DivisaoNegocio {
  /** «Casa de banho», «Cozinha», … */
  nome: string;
  /** A principal usa as chaves sem prefixo. */
  principal: boolean;
  /** "" na principal; «div_coz_» nas outras. */
  prefixo: string;
}

/** A divisão do projeto do Estúdio (sem o ler todo: o JSON pode ser grande), ou null. */
const divisaoDoEstudio = (json: string | undefined): string | null => (json ? /"divisao"\s*:\s*"([^"]+)"/.exec(json)?.[1] ?? null : null);

/** O nome da divisão de um negócio que ainda não escolheu nenhuma: a do projeto do Estúdio, senão a da linha. */
export function divisaoSemEscolha(f: Record<string, string | undefined>, linha?: string): string {
  return divisaoDoEstudio(f.estudio) ?? (linha === "coz" ? "Cozinha" : linha === "wc" ? "Casa de banho" : "A divisão");
}

/** As divisões do negócio, a principal primeiro. Sem nenhuma escolhida, uma só (a de sempre, nas chaves sem prefixo). */
export function divisoesDoNegocio(f: Record<string, string>, linha?: string): DivisaoNegocio[] {
  const ds = divisoesEscolhidas(f), princ = divisaoPrincipal(f);
  if (!ds.length || !princ) return [{ nome: divisaoSemEscolha(f, linha), principal: true, prefixo: "" }];
  return [princ, ...ds.filter((x) => x !== princ)].map((nome) => ({ nome, principal: nome === princ, prefixo: nome === princ ? "" : prefixoDivisao(nome) }));
}

/** A chave de um campo da divisão no negócio («planta» na principal, «div_coz_planta» na cozinha que não é a principal). */
export const chaveDaDivisao = (div: Pick<DivisaoNegocio, "prefixo">, campo: CampoDaDivisao): string => div.prefixo + campo;

/** A divisão com este nome (sem olhar a maiúsculas), senão a principal. */
export function divisaoPeloNome(divs: readonly DivisaoNegocio[], nome: string | null | undefined): DivisaoNegocio {
  const n = (nome ?? "").toLocaleLowerCase("pt-PT");
  return divs.find((x) => x.nome.toLocaleLowerCase("pt-PT") === n) ?? divs[0];
}

/** Os valores do negócio vistos de uma divisão: a planta, a planta corrigida, o projeto do Estúdio e as respostas da área dela nas
 *  chaves de base; a divisão escolhida passa a ser só ela. A principal fica como está (o mesmo objeto). */
export function fDaDivisao<T extends Record<string, string>>(f: T, div: DivisaoNegocio): T {
  if (div.principal || !div.prefixo) return f;
  const r: Record<string, string> = { ...f };
  for (const c of CAMPOS_DA_DIVISAO) { if (f[div.prefixo + c]) r[c] = f[div.prefixo + c]; else delete r[c]; }
  for (const k in f) if (k.startsWith(div.prefixo)) r[k.slice(div.prefixo.length)] = f[k];
  r.diag_tipo_area = div.nome;
  r[CHAVE_PRINCIPAL] = div.nome;
  return r as T;
}

/** As divisões que ainda se podem juntar ao negócio (as da lista da visita que ele não tem). */
export function divisoesPorJuntar(f: Record<string, string>, linha?: string): string[] {
  const tem = new Set(divisoesDoNegocio(f, linha).map((x) => x.nome));
  return DIVISOES.filter((x) => !tem.has(x));
}

/** 28/11: as áreas da casa que se juntam com um toque (as que o negócio ainda não tem; a casa de banho e o quarto repetem-se sempre,
 *  com o nome a pedir outro: «Casa de banho 2»). */
export function areasPorJuntar(f: Record<string, string>, linha?: string): string[] {
  const tem = new Set(divisoesDoNegocio(f, linha).map((x) => semAcento(x.nome)));
  return AREAS_DA_CASA.map((x) => {
    if (!tem.has(semAcento(x))) return x;
    if (tipoDaArea(x) !== "casa_banho" && tipoDaArea(x) !== "quarto") return "";
    let i = 2; while (tem.has(semAcento(`${x} ${i}`))) i++;
    return `${x} ${i}`;
  }).filter(Boolean);
}

/** 28/11: o nome limpo de uma área escrita à mão (sem vírgulas, que separam as áreas em f.diag_tipo_area; até 40 letras). */
export const nomeDeArea = (s: string): string => s.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

/** O novo valor de f.diag_tipo_area com mais uma divisão, no fim. Sem nenhuma escolhida, a de sempre fica primeiro (a principal, que
 *  já tem a planta e o projeto nas chaves sem prefixo). No fim e não pela ordem da lista: num negócio sem a principal fixada, a 1.ª
 *  continua a ser a principal (reorganizarDivisoes fixa-a ao gravar). */
export function comDivisao(f: Record<string, string>, nova: string, linha?: string): string {
  const atuais = listaVarios(f.diag_tipo_area || "");
  const base = atuais.length ? atuais : [divisaoSemEscolha(f, linha)].filter((x) => x !== "A divisão");
  const n = nomeDeArea(nova);
  if (!n) return base.join(", ");
  return (base.some((x) => semAcento(x) === semAcento(n)) ? base : [...base, n]).join(", ");
}

/** 28/11 (Rúben: «permitir apagar divisões, criei uma sem querer e não consigo apagar»): o novo valor de f.diag_tipo_area sem esta
 *  divisão. A última não sai (o negócio fica sempre com uma). O que a divisão tinha (a planta, o projeto, as respostas) fica no negócio
 *  com o prefixo dela e volta se ela voltar a entrar; se sai a principal, reorganizarDivisoes passa a seguinte para as chaves sem prefixo. */
export function semDivisao(f: Record<string, string>, nome: string, linha?: string): string | null {
  const ds = divisoesDoNegocio(f, linha).map((x) => x.nome);
  const n = semAcento(nome), fica = ds.filter((x) => semAcento(x) !== n);
  if (fica.length === ds.length || !fica.length) return null;
  return fica.join(", ");
}

// ------------------------------------------------------------------ as tarefas do plano por divisão
// As tarefas dos modelos de obra dizem a divisão no nome («MO Modelo Remodelação Completa - Cozinha · eletricidade»; planoVivo.ts).
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** A divisão de uma tarefa dos modelos de obra («… - Casa de Banho Comum · …» → «Casa de Banho Comum»), ou null. A mesma regra de
 *  divisaoDaTarefa (planoVivo.ts), aqui sem as dependências do plano vivo. */
export function divisaoNoNome(nome: string): string | null {
  const m = /\s-\s([^·]+?)\s·\s/.exec(nome.replace(/\s+/g, " "));
  return m ? m[1].trim() : null;
}
/** Se uma divisão da tarefa («Casa de Banho Comum») é a divisão do negócio («Casa de banho»). */
export const eDaDivisao = (daTarefa: string, divisao: string): boolean => norm(daTarefa).includes(norm(divisao)) || norm(divisao).includes(norm(daTarefa));

/** Um filtro das tarefas de uma divisão: as que dizem essa divisão e as que não dizem nenhuma (as comuns). Quando nenhuma tarefa do
 *  plano diz esta divisão (os planos de antes, ou um nome que não casa), não filtra nada: o 3D fica como era. */
export function filtroDaDivisao(tasks: readonly { nome: string }[], divisao: string | null | undefined): (t: { nome: string }) => boolean {
  if (!divisao) return () => true;
  if (!tasks.some((t) => { const x = divisaoNoNome(t.nome); return !!x && eDaDivisao(x, divisao); })) return () => true;
  return (t) => { const x = divisaoNoNome(t.nome); return !x || eDaDivisao(x, divisao); };
}
