// 25/11: o ASPETO (metal e superfície) de cada zona do 3D, a partir das opções dos atributos. Puro: sem React nem three.
// A superfície de uma zona vem, por esta ordem, 1) da opção escolhida no atributo «Brilho» ou «Tonalidade» (reconhecido pelo nome ou pelo código, e com «Tem aspeto» ligado: é a decisão
// desta fase; uma ligação explícita do atributo a zonas manda sobre o nome e limita-o a essas zonas), 2) da superfície por omissão da opção que pinta a zona, 3) a do modelo (nada a fazer).
// O metal vem da opção que pinta a zona. Sem nenhum «Tem aspeto» ligado nada disto actua: o 3D fica como hoje.
import type { AtributoDef, AtributoProduto, Superficie } from "../v2/catalogoModelo";
import { sem } from "./catalogo3d";
import type { LigacoesDeZonas, ZonaGlb } from "./zonasGlb";

/** A rugosidade de cada superfície (0 = espelho, 1 = baço): constantes fáceis de afinar. */
export const ROUGHNESS: Readonly<Record<Superficie, number>> = { polida: 0.15, acetinada: 0.4, mate: 0.8 };
/** A rugosidade de um metal sem superfície escolhida, e o `metalness` de um metal. */
export const ROUGHNESS_METAL = 0.3;
export const METALNESS_METAL = 1;

/** O que se aplica ao material de uma zona. `metalness` ausente: não se mexe (um não metal só muda a rugosidade). */
export interface MaterialZona { roughness: number; metalness?: number }
/** O metal e a superfície de uma opção (ou de uma zona). */
export interface AspetoDaZona { metal: boolean; superficie: Superficie | null }

/** O material que a superfície e o metal dão, ou null se não há nada a aplicar (o material fica o do modelo). */
export function materialDaSuperficie(superficie: Superficie | null, metal: boolean): MaterialZona | null {
  if (metal) return { roughness: superficie ? ROUGHNESS[superficie] : ROUGHNESS_METAL, metalness: METALNESS_METAL };
  return superficie ? { roughness: ROUGHNESS[superficie] } : null;
}

const NOMES_SUPERFICIE = new Set(["brilho", "tonalidade"]);
/** O atributo que dá a superfície às zonas: «Brilho» ou «Tonalidade» (nome ou código) com «Tem aspeto» ligado. */
export function ehAtributoDeSuperficie(d: AtributoDef): boolean {
  return d.temAspeto === true && (NOMES_SUPERFICIE.has(sem(d.nome).trim()) || NOMES_SUPERFICIE.has(d.codigo.toLowerCase()));
}

/** A chave de uma exclusão («este atributo não pinta esta zona»): atributo e zona. */
export const chaveDeExclusao = (atributo: string, zona: ZonaGlb): string => `${atributo}|${zona}`;

export interface EntradaSuperficie {
  zona: ZonaGlb;
  attrs: readonly AtributoProduto[] | undefined;
  defs: readonly AtributoDef[] | undefined;
  /** As ligações explícitas (atributo → zonas que pinta) e os pares excluídos (`chaveDeExclusao`). */
  ligacoes?: LigacoesDeZonas;
  excluidos?: ReadonlySet<string>;
  /** O metal e a superfície por omissão da opção que pinta a zona (null: nenhuma opção a pinta, ou o atributo dela não tem aspeto). */
  daOpcaoDaCor: AspetoDaZona | null;
}

/** O aspeto que a `zona` leva. `atributo` (o nome do Brilho que decidiu a superfície) só vem quando foi um destes atributos. */
export function superficieDaZona({ zona, attrs, defs, ligacoes, excluidos, daOpcaoDaCor }: EntradaSuperficie): AspetoDaZona & { atributo?: string } {
  const metal = daOpcaoDaCor?.metal === true;
  for (const d of defs ?? []) {
    if (!ehAtributoDeSuperficie(d) || excluidos?.has(chaveDeExclusao(d.id, zona))) continue;
    const ligadas = ligacoes?.[d.id];
    if (ligadas?.length && !ligadas.includes(zona)) continue; // ligado a outras zonas: só actua nelas
    const escolhida = attrs?.find((a) => a.atributoId === d.id && a.opcaoId);
    const superficie = escolhida ? d.opcoes.find((o) => o.id === escolhida.opcaoId)?.superficie ?? null : null;
    if (superficie) return { metal, superficie, atributo: d.nome };
  }
  return { metal, superficie: daOpcaoDaCor?.superficie ?? null };
}
