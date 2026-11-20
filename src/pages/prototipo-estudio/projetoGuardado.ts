// 20/11 (auditoria de 19/11, lote 3): onde vive o projeto do Estúdio.
//  - Neste browser, uma chave por negócio (olyvia.estudio.v1.<negócio>). Antes havia uma só chave: abrir o Estúdio de outro negócio antes
//    de voltar ao primeiro apagava o primeiro. Sem negócio (o protótipo), fica a chave de sempre (olyvia.estudio.v1).
//  - No negócio (f.estudio), gravado pelo próprio Estúdio de poucos em poucos segundos e ao sair, pela ligação que a Visita deixa ao
//    abri-lo (o mesmo ctx.run que a Visita usa). Sem ligação (a página recarregada, outro aparelho), fica neste browser e a Visita grava-o
//    no negócio quando se volta a ela, como antes.
//  - Sem projeto, o Estúdio abre vazio (já não abre o exemplo «Casa de banho do Bruno» por engano).
import { PLANTA_VAZIA } from "@/emylia/planta";
import { copiaPlanta } from "./exemploEstudio";
import { acertarPosicoes } from "./posicoesDepois";
import type { Projeto } from "./necessidadesEstudio";

/** A chave de sempre: hoje só a do projeto sem negócio (o protótipo). Um projeto de negócio que ainda lá esteja muda-se para a sua. */
export const CHAVE_ESTUDIO = "olyvia.estudio.v1";
/** A chave do projeto de um negócio neste browser. */
export const chaveDoEstudio = (negocio?: number | null): string => (negocio == null ? CHAVE_ESTUDIO : `${CHAVE_ESTUDIO}.${negocio}`);
/** O negócio do Estúdio aberto neste separador (sessionStorage): a voz e o planeador da cozinha abrem «/prototipo/estudio» sem o dizer. */
export const CHAVE_ESTUDIO_ABERTO = "olyvia.estudio.aberto";

const valido = (p: unknown): p is Projeto => {
  const x = p as Projeto | null;
  return !!x && !!x.antes?.paredes && !!x.depois?.paredes && !!x.escolhas;
};
const ler = (chave: string): Projeto | null => {
  try { const t = localStorage.getItem(chave); const p = t ? JSON.parse(t) : null; return valido(p) ? p : null; } catch { return null; }
};

/** A chave antiga com o projeto de um negócio passa para a chave desse negócio (se lá não houver um mais recente) e sai da antiga.
 *  Um projeto sem negócio fica onde está. */
export function migrarChaveAntiga(): void {
  const antigo = ler(CHAVE_ESTUDIO);
  if (!antigo || antigo.negocio == null) return;
  try {
    const atual = ler(chaveDoEstudio(antigo.negocio));
    if (!atual || (atual.gravadoEm ?? 0) < (antigo.gravadoEm ?? 0)) localStorage.setItem(chaveDoEstudio(antigo.negocio), JSON.stringify(antigo));
    localStorage.removeItem(CHAVE_ESTUDIO);
  } catch { /* sem armazenamento: fica como está */ }
}

/** O projeto deste negócio (ou o sem negócio) neste browser, ou null. Aproveita a chave antiga se for deste negócio. */
export function lerProjetoLocal(negocio?: number | null): Projeto | null {
  migrarChaveAntiga();
  const p = ler(chaveDoEstudio(negocio));
  if (!p) return null;
  // só vale o projeto do próprio negócio (uma chave de negócio nunca tem outro; a sem negócio pode ter um antigo sem campo)
  return negocio == null ? (p.negocio == null ? p : null) : (p.negocio === negocio ? p : null);
}

/** Guarda o projeto neste browser, na chave do seu negócio. */
export function guardarProjetoLocal(p: Projeto): boolean {
  try { localStorage.setItem(chaveDoEstudio(p.negocio), JSON.stringify(p)); return true; } catch { return false; }
}

/** Um projeto vazio (sem paredes nem peças), para quando não há nenhum. */
export function projetoVazio(): Projeto {
  return {
    nome: "Novo projeto", antes: copiaPlanta(PLANTA_VAZIA), depois: copiaPlanta(PLANTA_VAZIA), escolhas: {}, acompanha: {}, ajustes: {},
    alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, divisao: "Casa de banho",
  };
}

/** O negócio do Estúdio: o do endereço (?negocio=), senão o último aberto neste separador; nenhum, o protótipo. */
export function negocioDoEndereco(search: string = typeof window !== "undefined" ? window.location.search : ""): number | null {
  const n = Number(new URLSearchParams(search).get("negocio"));
  if (Number.isInteger(n) && n > 0) return n;
  try { const s = Number(sessionStorage.getItem(CHAVE_ESTUDIO_ABERTO)); return Number.isInteger(s) && s > 0 ? s : null; } catch { return null; }
}
/** Lembra o negócio do Estúdio aberto neste separador (null esquece). */
export function lembrarNegocioAberto(negocio: number | null): void {
  try { if (negocio == null) sessionStorage.removeItem(CHAVE_ESTUDIO_ABERTO); else sessionStorage.setItem(CHAVE_ESTUDIO_ABERTO, String(negocio)); } catch { /* fica pelo endereço */ }
}

/** 20/11: o projeto com que o Estúdio abre: o deste browser para o negócio (ou o sem negócio) ou o que a Visita deixou na ligação, o mais
 *  recente. Sem nenhum: sem negócio, um projeto vazio (já não o exemplo); com negócio, null (abre-se a partir do negócio). */
export function projetoInicial(negocio: number | null): Projeto | null {
  const local = lerProjetoLocal(negocio);
  const daVisita = ligacaoDoEstudio(negocio)?.projeto ?? null;
  const melhor = local && (!daVisita || (local.gravadoEm ?? 0) >= (daVisita.gravadoEm ?? 0)) ? local : daVisita;
  if (melhor) return acertarPosicoes(melhor);
  return negocio == null ? projetoVazio() : null;
}

// ---------------------------------------------------------------- a ligação ao negócio (deixada pela Visita ao abrir o Estúdio)

export interface LigacaoEstudio {
  negocio: number;
  /** Grava o projeto (JSON) no negócio: na Visita, ctx.run(() => ctx.A.campo(id, "estudio", json)). */
  gravar: (json: string) => void;
  /** O que o negócio tem gravado agora (f.estudio), para não gravar o que já lá está. */
  noNegocio?: () => string | undefined;
  /** O projeto com que a Visita abriu o Estúdio (se o browser não o conseguiu guardar, abre-se na mesma). */
  projeto?: Projeto;
}
/** De quantos em quantos milissegundos o Estúdio grava no negócio o que mudou (pela ligação da Visita). */
export const GRAVAR_NO_NEGOCIO_MS = 5000;
let ligacao: LigacaoEstudio | null = null;
/** O que já se mandou ao negócio pela ligação (o projeto sem a hora), para não repetir. */
let enviado = "";

/** A Visita liga o Estúdio ao negócio ao abri-lo (substitui a ligação anterior). */
export function ligarEstudioAoNegocio(l: LigacaoEstudio): void {
  if (ligacao?.negocio !== l.negocio) enviado = "";
  ligacao = l;
}
/** Desliga (a página dos negócios abriu de novo, com outro estado: a ligação antiga já não vale). */
export function desligarEstudio(): void { ligacao = null; enviado = ""; }
/** A ligação deste negócio, ou null. */
export function ligacaoDoEstudio(negocio: number | null | undefined): LigacaoEstudio | null {
  return negocio != null && ligacao?.negocio === negocio ? ligacao : null;
}

const semHora = (p: Projeto) => JSON.stringify({ ...p, gravadoEm: undefined });

/** Grava o projeto no negócio pela ligação, se mudou desde o que o negócio tem. true: gravou; false: não havia o que gravar ou não há
 *  ligação (fica neste browser e a Visita grava-o quando se voltar a ela). */
export function gravarNoNegocio(p: Projeto): boolean {
  const l = ligacaoDoEstudio(p.negocio);
  if (!l) return false;
  const conteudo = semHora(p);
  if (conteudo === enviado) return false;
  const noNegocio = l.noNegocio?.();
  if (noNegocio) {
    // o do negócio passa pelo mesmo acerto com que o Estúdio abre (sem isto, abrir já contava como mudança)
    try { if (semHora(acertarPosicoes(JSON.parse(noNegocio) as Projeto)) === conteudo) { enviado = conteudo; return false; } } catch { /* grava-se */ }
  }
  try { l.gravar(JSON.stringify(p)); } catch { return false; }
  enviado = conteudo;
  return true;
}
