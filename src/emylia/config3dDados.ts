// 25/11: a CONFIGURAÇÃO 3D de um produto, de uma subcategoria ou de uma categoria: os eixos da Medida (que campo é a largura, a altura e a profundidade) e as ligações
// atributo → zona («Cor da frente» pinta a frente; «aplicar: não» tira o atributo dessa zona). O que corre na base é o CONTRATO com a migration B (por aplicar enquanto isto se escreve):
//   cat_ler_config_3d(p_org, p_alvo, p_id) → { proprio, subcategoria, categoria, efectiva: { eixos, eixos_origem, ligacoes, ligacoes_origem } }
//        origem: produto | subcategoria | categoria | automatico; produto > subcategoria > categoria > automático, eixos e ligações cada um por si; `[]` pára a herança das ligações.
//   cat_definir_config_3d(p_org, p_alvo, p_id, p_eixos, p_ligacoes) → { alvo, id, eixos, ligacoes, anterior }   null e null = voltar a herdar tudo
// Cliente TOLERANTE: a função não existir (migration por aplicar) volta como `indisponivel` e o ecrã fica como hoje; o que a base mandar de inválido larga-se (e conta-se em `ignoradas`).
// Mesmo padrão de modelo3dDados: CT00x com a mensagem em português da base, tal como vem; o resto vira uma frase de reserva (nunca inglês em bruto).
import { AINDA_NAO, erroAmigavel, eUuid, rpcLivre } from "./fichaProdutoDados";
import { chaveDeExclusao } from "./planta3d/aspetoZonas";
import { validarEixos, type Eixos } from "./planta3d/eixosMedida";
import { ZONAS, type LigacoesDeZonas, type ZonaGlb } from "./planta3d/zonasGlb";

export type AlvoConfig3d = "produto" | "categoria";
export type OrigemConfig = "produto" | "subcategoria" | "categoria" | "automatico";
/** Uma zona de uma ligação: uma das do modelo ou `tudo` (todas). */
export type ZonaLigacao = ZonaGlb | "tudo";
export interface Ligacao { atributo: string; zona: ZonaLigacao; aplicar: boolean }
/** Como se diz de onde vem o que vale («guardadas neste produto», «herdadas da categoria»); automático: null (não há nada guardado). */
export function rotuloDaOrigemConfig(o: OrigemConfig): string | null {
  return o === "produto" ? "guardadas neste produto" : o === "subcategoria" ? "herdadas da subcategoria" : o === "categoria" ? "herdadas da categoria" : null;
}
/** Quantas ligações cabem numa configuração (o mesmo limite da base). */
export const MAX_LIGACOES = 60;

/** `orfas`: ligações da base a atributos que já não existem (a base filtra-as e conta). `ignoradas`: as que este ecrã largou por inválidas. */
export interface NivelConfig {
  eixos: Eixos | null; ligacoes: Ligacao[] | null; orfas: number; ignoradas: number;
  /** As ligações como a base as tem (inclui zonas que este ecrã não desenha): servem para as REENVIAR ao gravar só os eixos, sem as perder. Mostra-se e aplica-se `ligacoes`. */
  ligacoesBase: LigacaoBase[] | null;
}
/** Uma ligação como a base a aceita: a zona é qualquer `^[a-z_]{1,20}$` (o ecrã só conhece as de ZONAS). */
export interface LigacaoBase { atributo: string; zona: string; aplicar: boolean }
export interface NivelComNome extends NivelConfig { id: string; nome: string }
export interface Config3d {
  /** A configuração gravada neste alvo (null: nenhuma, herda tudo). */
  proprio: NivelConfig | null;
  subcategoria: NivelComNome | null;
  categoria: NivelComNome | null;
  /** O que vale: cada parte vem do nível mais próximo que a tem. */
  efectiva: { eixos: Eixos | null; eixosOrigem: OrigemConfig; ligacoes: Ligacao[] | null; ligacoesOrigem: OrigemConfig };
}
export type ResConfig<T> = { ok: true; v: T } | { ok: false; erro: string; codigo?: string; /** a função ainda não existe nesta base */ indisponivel?: true };

const FRASE_LER = "Não foi possível ler a configuração 3D.";
const FRASE_GRAVAR = "Não foi possível gravar a configuração 3D.";
const FRASE_AINDA_NAO = "A configuração 3D ainda não está disponível nesta base (falta a migração da configuração 3D).";

const ehZona = (z: unknown): z is ZonaLigacao => z === "tudo" || (ZONAS as readonly unknown[]).includes(z);
const objeto = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const numero = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const origemDe = (x: unknown): OrigemConfig => (x === "produto" || x === "subcategoria" || x === "categoria" ? x : "automatico");

/** Uma ligação da base se estiver no formato (atributo uuid, zona conhecida, aplicar booleano); senão null. */
const ligacaoDe = (x: unknown): Ligacao | null => {
  const o = objeto(x);
  return o && typeof o.atributo === "string" && eUuid(o.atributo) && ehZona(o.zona) && typeof o.aplicar === "boolean" ? { atributo: o.atributo, zona: o.zona, aplicar: o.aplicar } : null;
};
/** A lista de ligações: null (não é lista, herda) ou as válidas e quantas se largaram. */
function ligacoesDe(x: unknown): { lista: Ligacao[] | null; ignoradas: number } {
  if (!Array.isArray(x)) return { lista: null, ignoradas: 0 };
  const lista = x.map(ligacaoDe).filter((l): l is Ligacao => l !== null);
  return { lista, ignoradas: x.length - lista.length };
}
/** Uma ligação no formato que a base guarda (atributo uuid, zona `^[a-z_]{1,20}$`, aplicar booleano), mesmo que o ecrã não conheça a zona; senão null. */
const ligacaoBaseDe = (x: unknown): LigacaoBase | null => {
  const o = objeto(x);
  return o && typeof o.atributo === "string" && eUuid(o.atributo) && typeof o.zona === "string" && /^[a-z_]{1,20}$/.test(o.zona) && typeof o.aplicar === "boolean" ? { atributo: o.atributo, zona: o.zona, aplicar: o.aplicar } : null;
};
function nivelDe(x: unknown): NivelConfig | null {
  const o = objeto(x);
  if (!o) return null;
  const { lista, ignoradas } = ligacoesDe(o.ligacoes);
  const base = Array.isArray(o.ligacoes) ? o.ligacoes.map(ligacaoBaseDe).filter((l): l is LigacaoBase => l !== null) : null;
  return { eixos: validarEixos(o.eixos), ligacoes: lista, orfas: numero(o.orfas), ignoradas, ligacoesBase: base };
}
function nivelComNomeDe(x: unknown): NivelComNome | null {
  const n = nivelDe(x), o = objeto(x);
  return n && o && typeof o.id === "string" ? { ...n, id: o.id, nome: typeof o.nome === "string" ? o.nome : "" } : null;
}

/** Uma falha da base como resposta: função em falta → `indisponivel`; CT00x → a mensagem da base; o resto → a frase de reserva. */
function falhaDe(error: { code?: string; message?: string }, frase: string): { ok: false; erro: string; codigo?: string; indisponivel?: true } {
  if (erroAmigavel(error, frase) === AINDA_NAO) return { ok: false, erro: FRASE_AINDA_NAO, indisponivel: true, ...(error.code ? { codigo: error.code } : {}) };
  if (/^CT00\d$/.test(error.code ?? "") && error.message) return { ok: false, erro: error.message, codigo: error.code };
  return { ok: false, erro: frase, ...(error.code ? { codigo: error.code } : {}) };
}

/** Lê a configuração 3D de um produto (ou de uma categoria): o próprio, os níveis de cima e o que vale. */
export async function lerConfig3d(org: string, alvo: AlvoConfig3d, id: string): Promise<ResConfig<Config3d>> {
  try {
    const { data, error } = await rpcLivre("cat_ler_config_3d", { p_org: org, p_alvo: alvo, p_id: id });
    if (error) return falhaDe(error, FRASE_LER);
    const r = objeto(data);
    if (!r) return { ok: false, erro: FRASE_LER };
    const e = objeto(r.efectiva) ?? {};
    return {
      ok: true,
      v: {
        proprio: nivelDe(r.proprio), subcategoria: nivelComNomeDe(r.subcategoria), categoria: nivelComNomeDe(r.categoria),
        efectiva: { eixos: validarEixos(e.eixos), eixosOrigem: origemDe(e.eixos_origem), ligacoes: ligacoesDe(e.ligacoes).lista, ligacoesOrigem: origemDe(e.ligacoes_origem) },
      },
    };
  } catch {
    return { ok: false, erro: FRASE_LER };
  }
}

export interface ResultadoConfig3d { eixos: Eixos | null; ligacoes: Ligacao[] | null }

/** O motivo por que uma lista de ligações não se grava (o que a base também recusaria), ou null se está bem. */
export function erroDasLigacoes(lista: readonly Ligacao[]): string | null {
  if (lista.length > MAX_LIGACOES) return `Há ligações a mais: no máximo ${MAX_LIGACOES}.`;
  const vistos = new Set<string>();
  for (const l of lista) {
    if (!ligacaoDe(l)) return "Há uma ligação inválida: escolha o atributo e a zona.";
    const chave = `${l.atributo}|${l.zona}`;
    if (vistos.has(chave)) return "Há uma ligação repetida: cada atributo só pode estar uma vez em cada zona.";
    vistos.add(chave);
  }
  return null;
}

/** Duas listas de regras iguais, sem contar a ordem: uma regra é um par atributo e zona (com o seu «aplicar»); a ordem só muda o desenho da lista e não o que se grava. */
export function mesmasLigacoes(a: readonly Ligacao[], b: readonly Ligacao[]): boolean {
  if (a.length !== b.length) return false;
  const chaves = (l: readonly Ligacao[]): string[] => l.map((x) => `${x.atributo}|${x.zona}|${x.aplicar ? 1 : 0}`).sort();
  const ca = chaves(a), cb = chaves(b);
  return ca.every((c, k) => c === cb[k]);
}

/** Grava a configuração do alvo: os eixos e as ligações (os DOIS como estado final; null herda). null e null apaga a configuração. Valida o formato antes de ir à base. */
export async function definirConfig3d(org: string, alvo: AlvoConfig3d, id: string, o: { eixos: Eixos | null; ligacoes?: readonly Ligacao[] | null; reenviar?: readonly LigacaoBase[] | null }): Promise<ResConfig<ResultadoConfig3d>> {
  const eixos = o.eixos === null ? null : validarEixos(o.eixos);
  if (o.eixos !== null && !eixos) return { ok: false, erro: "Os eixos escolhidos não são válidos: cada campo da Medida só pode servir um eixo." };
  // sem `ligacoes` (só se gravam os eixos), reenvia-se `reenviar`: as ligações como a base as tem, com as zonas que este ecrã não conhece, que a base já validou
  const lista = o.ligacoes !== undefined ? o.ligacoes : o.reenviar ?? null;
  const aviso = o.ligacoes ? erroDasLigacoes(o.ligacoes) : null;
  if (aviso) return { ok: false, erro: aviso };
  try {
    const { data, error } = await rpcLivre("cat_definir_config_3d", { p_org: org, p_alvo: alvo, p_id: id, p_eixos: eixos, p_ligacoes: lista ? [...lista] : null });
    if (error) return falhaDe(error, FRASE_GRAVAR);
    const r = objeto(data);
    if (!r) return { ok: false, erro: FRASE_GRAVAR };
    return { ok: true, v: { eixos: validarEixos(r.eixos), ligacoes: ligacoesDe(r.ligacoes).lista } };
  } catch {
    return { ok: false, erro: FRASE_GRAVAR };
  }
}

/**
 * De uma lista de ligações ao que o 3D usa: `ligacoes` (atributo → zonas que pinta) e `excluidos` (pares «este atributo não pinta esta zona»). `tudo` expande a todas as zonas;
 * a zona explícita vence `tudo` (tudo menos a frente, ou só a frente). Um atributo só com «aplicar: não» não fica ligado (os nomes continuam a valer nas outras zonas): fica só excluído.
 */
export function ligacoesDaConfig(lista: readonly Ligacao[] | null | undefined): { ligacoes: LigacoesDeZonas; excluidos: Set<string> } {
  const ligacoes: Record<string, ZonaGlb[]> = {};
  const excluidos = new Set<string>();
  const porAtributo = new Map<string, Ligacao[]>();
  for (const l of lista ?? []) porAtributo.set(l.atributo, [...(porAtributo.get(l.atributo) ?? []), l]);
  for (const [atributo, ls] of porAtributo) {
    const explicitas = new Map<ZonaGlb, boolean>();
    for (const l of ls) if (l.zona !== "tudo") explicitas.set(l.zona, l.aplicar);
    const tudo = ls.find((l) => l.zona === "tudo");
    const pinta: ZonaGlb[] = [];
    for (const zona of ZONAS) {
      const aplicar = explicitas.get(zona) ?? tudo?.aplicar;
      if (aplicar === true) pinta.push(zona); else if (aplicar === false) excluidos.add(chaveDeExclusao(atributo, zona));
    }
    if (pinta.length) ligacoes[atributo] = pinta;
  }
  return { ligacoes, excluidos };
}
