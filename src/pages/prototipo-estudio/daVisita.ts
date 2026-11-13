// 5/11 (Rúben: «linkar as necessidades do cliente… isto são as medidas atuais, que é nas medidas da área»). O Estúdio abre a partir da
// Visita de um negócio: a planta desenhada (f.planta) é o antes, o pé-direito e o teto falso vêm das respostas da visita, e o estilo sai das
// cores ditas nas «Peças da casa de banho» (o revestimento, a base, as torneiras, o perfil; o móvel à parte).
import { respostasDoEstudio } from "./respostasDoEstudio";
import { PLANTA_VAZIA, areaChaoM2, areaParedesM2, lerPlanta, type Planta } from "@/emylia/planta";
import type { LinhaLevada } from "@/emylia/ligarEstudio";
import { linhasParaLevar } from "./levarParaNegocio";
import type { Cor, Estilo } from "./catalogoFake";
import { copiaPlanta } from "./exemploEstudio";
import { alturaFinalCm, type Projeto } from "./necessidadesEstudio";
import { prefixoDoEstudio, respostasDoNegocio, type GrupoVisita } from "./perguntasDaVisita";
import { falasDoTexto, lerInsights } from "@/emylia/chamadaMotor";
import { PECAS } from "@/emylia/planta";
import { catsDeTexto, corDoTexto, ditosDaConversa, type DitoEstilo } from "./estiloDaConversa";
import { pedidosDaConversa, servicoDeTexto, tipoPecaDeTexto, type AcaoPeca, type DitoPeca, type DitoServico, type Pedidos } from "./pedidosDaConversa";

export const CHAVE_ESTUDIO = "olyvia.estudio.v1";
/** 5/11: o que o Estúdio devolve ao negócio quando se carrega em «Voltar ao negócio» (a Visita lê-o e grava a planta). */
export const CHAVE_VOLTA = "olyvia.estudio.volta";
export interface Volta {
  negocio: number; antes: Planta; em: number;
  /** As necessidades do Estúdio, para juntar às do negócio. */
  linhas?: LinhaLevada[];
  /** 6/11: as respostas das «Peças da casa de banho» que saem das escolhas do Estúdio (campo → valor). */
  respostas?: Record<string, string>;
  /** 9/11: «Fechar a visita» no Estúdio: a Visita leva tudo ao negócio e fecha-a (o orçamento e o plano nascem logo). */
  fechar?: boolean;
}

const PALAVRAS: [RegExp, Cor][] = [
  [/cinz|antracite|gris|cromad|inox/i, "cinza"], [/pret|black|negr/i, "preto"], [/branc|white/i, "branco"],
  [/madeira|oak|carvalho|nogueira|wood/i, "madeira"], [/bege|creme|areia|marfim|dourad/i, "bege"],
];
/** As cores ditas num texto, pela ordem em que aparecem («Cinza 120 x 60» dá cinza; «Axis Oak» dá madeira). */
export function coresDoTexto(t: string | undefined): Cor[] {
  if (!t) return [];
  const achadas = PALAVRAS.map(([rx, c]) => ({ c, i: t.search(rx) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  return [...new Set(achadas.map((x) => x.c))];
}

export function estiloDasRespostas(f: Record<string, string>): Estilo {
  const gerais = ["pc_rev_modelo", "pc_pav_modelo", "pc_base_cor", "pc_base_cor_detalhe", "pc_torn_cor", "pc_resg_perfil", "pc_coluna_cor"]
    .flatMap((k) => coresDoTexto(f[k]));
  const movel = coresDoTexto(f.pc_movel_frentes);
  return { cores: [...new Set(gerais)], porCategoria: movel.length ? { movel, coluna: movel } : {} };
}

/** O pé-direito da visita («2,6 m») em cm; sem resposta, 250. */
const peDireitoCm = (v: string | undefined) => { const m = (v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/); return m ? Math.round(Number(m[1]) * 100) : 250; };

/** O projeto do Estúdio de um negócio na Visita. Sem planta desenhada, o Estúdio abre com a planta vazia (desenha-se lá). */
export function projetoDaVisita(nome: string, f: Record<string, string>, negocio?: number, origem?: string, divisao?: Projeto["divisao"]): Projeto {
  const antes: Planta = lerPlanta(f.planta) ?? copiaPlanta(PLANTA_VAZIA);
  const pe = peDireitoCm(f.diag_pe_direito_m);
  return {
    nome, negocio, origem, antes, depois: copiaPlanta(antes), escolhas: {}, acompanha: {}, ajustes: {},
    alturas: { peDireito: pe, tetoFalso: f.pc_teto === "Teto falso" ? (pe >= 250 ? 240 : pe - 10) : null },
    estilo: estiloDasRespostas(f),
    divisao: divisao ?? (/cozinha/i.test(f.diag_tipo_area ?? "") && !/casa de banho/i.test(f.diag_tipo_area ?? "") ? "Cozinha" : "Casa de banho"),
  };
}

/** Guarda o projeto para o Estúdio o abrir (o Estúdio lê-o deste browser). */
export function guardarParaEstudio(p: Projeto): boolean {
  try { localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p)); return true; } catch { return false; }
}

/** Abrir o Estúdio de um negócio: se o projeto guardado é deste negócio, continua-se (não se perde o depois); senão começa um novo. */
export function abrirEstudio(nome: string, f: Record<string, string>, negocio: number, origem: string, divisao?: Projeto["divisao"], camposVisita?: GrupoVisita[]): boolean {
  // 6/11: o projeto vive no negócio (f.estudio); o deste browser só ganha se for do mesmo negócio e mais recente
  const doNegocio = projetoDoNegocio(f);
  let local: Projeto | null = null;
  try { const t = localStorage.getItem(CHAVE_ESTUDIO); local = t ? (JSON.parse(t) as Projeto) : null; } catch { local = null; }
  if (local?.negocio !== negocio) local = null;
  const melhor = local && (!doNegocio || (local.gravadoEm ?? 0) >= (doNegocio.gravadoEm ?? 0)) ? local : doNegocio;
  // 11/11: as perguntas da visita que o Estúdio faz no passo «Fechar»: com as respostas que o negócio já tem
  const base = melhor ? { ...melhor, nome, origem, negocio } : projetoDaVisita(nome, f, negocio, origem, divisao);
  const prefixo = prefixoDoEstudio(f, base.divisao ?? divisao);
  const campos = camposVisita?.length ? camposVisita : base.camposVisita;
  return guardarParaEstudio({ ...base, camposVisita: campos, prefixoPerguntas: prefixo, perguntas: { ...(base.perguntas ?? {}), ...respostasDoNegocio(f, prefixo, { camposVisita: campos }) }, ditosAntes: ditosDoNegocio(f), pedidosAntes: pedidosDoNegocio(f) });
}

/** 13/11 (Rúben, «o modelo é a verdade»): as escolhas de cor que o modelo extraiu, já separadas peça a peça. A cor vem do campo
 *  estruturado 'cor' (o modelo decide-a pela intenção, seja qual for a frase); se faltar, lê-se do texto da escolha. Uma peça a
 *  remover não leva cor. */
export function ditosDoModelo(f: Record<string, string | undefined>): DitoEstilo[] {
  const out: DitoEstilo[] = [];
  for (const [campo, origem] of [["insights_chamada", "chamada"], ["insights_visita", "visita"]] as const) {
    const g = lerInsights(f[campo]);
    for (const e of g?.insights.escolhas ?? []) {
      if (e.acao === "remover") continue;
      const cor = e.cor ?? corDoTexto(e.escolha), cats = catsDeTexto(e.peca);
      if (!cor || !cats.length) continue;
      const inicio = e.linha != null && g!.tempos[e.linha] != null ? g!.tempos[e.linha] : 0;
      out.push({ cor, cats, evitar: false, tudo: false, frase: `${e.peca}: ${e.escolha}`, inicio, origem });
    }
  }
  return out;
}

/** 13/11 (Rúben, «trocar ou retirar algo de MUITAS formas»): as ações sobre as peças que o modelo extraiu (acao: trocar, remover,
 *  acrescentar), decididas pela intenção e não pela frase exata. É a verdade sobre as peças; as regras só valem sem análise do modelo. */
const ACAO_MODELO: Record<string, AcaoPeca> = { manter: "fica", trocar: "troca", remover: "tira", acrescentar: "junta" };
export function pedidosPecasDoModelo(f: Record<string, string | undefined>): DitoPeca[] {
  const out: DitoPeca[] = [];
  for (const [campo, origem] of [["insights_chamada", "chamada"], ["insights_visita", "visita"]] as const) {
    const g = lerInsights(f[campo]);
    for (const e of g?.insights.escolhas ?? []) {
      const acao = e.acao && e.acao !== "manter" ? ACAO_MODELO[e.acao] : null;
      const tipo = tipoPecaDeTexto(e.peca);
      if (!acao || !tipo || PECAS[tipo]?.abertura) continue;
      const inicio = e.linha != null && g!.tempos[e.linha] != null ? g!.tempos[e.linha] : 0;
      out.push({ tipo, acao, frase: `${e.peca}: ${e.escolha}`, inicio, origem });
    }
  }
  return out;
}

/** 12/11→13/11: o que se disse sobre as cores no negócio. Quando o modelo já analisou a conversa, as escolhas de cor por peça vêm dele (a
 *  verdade). Das regras ficam o que o modelo não põe nas escolhas: as cores globais («tudo branco») e as evitações («sem branco»). Sem
 *  análise do modelo, usam-se as regras como até aqui. */
export function ditosDoNegocio(f: Record<string, string | undefined>): DitoEstilo[] {
  const regras = [...ditosDaConversa(falasDoTexto(f.transcricao_chamada), "chamada"), ...ditosDaConversa(falasDoTexto(f.transcricao_visita), "visita")];
  const modelo = ditosDoModelo(f);
  if (!modelo.length) return regras;
  return [...modelo, ...regras.filter((d) => d.evitar || d.tudo)];
}

/** 6/11: o projeto do Estúdio gravado no negócio (f.estudio, JSON), ou null. */
export function projetoDoNegocio(f: Record<string, string | undefined>): Projeto | null {
  if (!f.estudio) return null;
  try {
    const p = JSON.parse(f.estudio) as Projeto;
    return p && p.antes && p.depois && p.escolhas ? p : null;
  } catch { return null; }
}

/** 6/11: o projeto deste negócio que o Estúdio tem neste browser (para a Visita o gravar no negócio), ou null. */
export function projetoDoEstudioPara(negocio: number): Projeto | null {
  try {
    const t = localStorage.getItem(CHAVE_ESTUDIO);
    const p = t ? (JSON.parse(t) as Projeto) : null;
    return p?.negocio === negocio ? p : null;
  } catch { return null; }
}

/** 6/11: as medidas da área que saem do Estúdio: o chão e as paredes da planta do depois (até ao teto falso), os pontos de água e
 *  os vasos sanitários pelas peças que ficam. Só o que a planta sabe (sem paredes, sem m²). */
export function medidasDoEstudio(p: Projeto): Partial<Record<"pav" | "par" | "ptf" | "ptq" | "pcs" | "modulos", number>> {
  const out: Partial<Record<"pav" | "par" | "ptf" | "ptq" | "pcs" | "modulos", number>> = {};
  const chao = areaChaoM2(p.depois.paredes);
  if (chao !== null) out.pav = chao;
  const paredes = areaParedesM2(p.depois, alturaFinalCm(p.alturas) / 100);
  if (paredes !== null) out.par = paredes;
  const tipos = p.depois.pecas.map((x) => x.tipo);
  if (tipos.length) {
    const conta = (ts: string[]) => tipos.filter((t) => ts.includes(t)).length;
    out.ptf = conta(["sanita", "bide", "base", "banheira", "movel", "lava", "maquina"]);
    out.ptq = conta(["bide", "base", "banheira", "movel", "lava"]);
    out.pcs = conta(["sanita", "bide"]);
    // 6/11: na cozinha, os módulos (a bancada conta um por cada 60 cm; o armário alto, um)
    const mod = p.depois.pecas.reduce((n, x) => n + (x.tipo === "bancada" ? Math.max(1, Math.round(Math.max(x.w, x.h) / 60)) : x.tipo === "armario" ? 1 : 0), 0);
    if (mod) out.modulos = mod;
  }
  return out;
}

/** O Estúdio devolve a planta do antes ao negócio de onde veio. */
export function devolverAoNegocio(p: Projeto, fechar = false): boolean {
  if (p.negocio === undefined) return false;
  try { localStorage.setItem(CHAVE_VOLTA, JSON.stringify({ negocio: p.negocio, antes: p.antes, em: Date.now(), linhas: linhasParaLevar(p), respostas: respostasDoEstudio(p), ...(fechar ? { fechar } : {}) } satisfies Volta)); return true; } catch { return false; }
}

/** A volta pendente para este negócio (recente: menos de 30 min), ou null. Ler apaga-a. */
export function lerVolta(negocio: number): Volta | null {
  try {
    const t = localStorage.getItem(CHAVE_VOLTA);
    if (!t) return null;
    const v = JSON.parse(t) as Volta;
    if (v.negocio !== negocio || Date.now() - v.em > 30 * 60_000) return null;
    localStorage.removeItem(CHAVE_VOLTA);
    return v;
  } catch { return null; }
}

/** 13/11 (Rúben, «os serviços também, tem dificuldade na linguagem fluida»): os serviços pedidos ou recusados que o modelo extraiu
 *  (insights.servicos), decididos pela intenção; o nome casa-se com o id do catálogo. É a verdade; sem análise, das regras. */
export function servicosDoModelo(f: Record<string, string | undefined>): DitoServico[] {
  const out: DitoServico[] = [];
  for (const [campo, origem] of [["insights_chamada", "chamada"], ["insights_visita", "visita"]] as const) {
    const g = lerInsights(f[campo]);
    for (const s of g?.insights.servicos ?? []) {
      const id = servicoDeTexto(s.servico);
      if (!id) continue;
      const inicio = s.linha != null && g!.tempos[s.linha] != null ? g!.tempos[s.linha] : 0;
      out.push({ id, quer: s.quer !== false, frase: s.servico, inicio, origem });
    }
  }
  return out;
}

/** 12/11→13/11: as decisões sobre as peças e os serviços. Quando o modelo já analisou, ele é a verdade (peças por acao, serviços por
 *  intenção, robustos a qualquer frase); sem análise de um lado, esse lado vem das regras. */
export function pedidosDoNegocio(f: Record<string, string | undefined>): Pedidos {
  const a = pedidosDaConversa(falasDoTexto(f.transcricao_chamada), "chamada"), b = pedidosDaConversa(falasDoTexto(f.transcricao_visita), "visita");
  const mPecas = pedidosPecasDoModelo(f), mServicos = servicosDoModelo(f);
  return {
    pecas: mPecas.length ? mPecas : [...a.pecas, ...b.pecas],
    servicos: mServicos.length ? mServicos : [...a.servicos, ...b.servicos],
  };
}
