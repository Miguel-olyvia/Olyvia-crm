// 9/11 (Rúben: «o objetivo é o Estúdio ser o passo final da visita: quando fecha, a visita já tem toda a informação sobre os serviços etc.,
// e o plano de obra, orçamento etc. já está tudo gerado»). O que o Estúdio leva ao negócio, numa só regra: a planta, as medidas da área, as
// respostas das peças, os serviços do Catálogo (com a quantidade) e os produtos, e o dia de início da obra. Corre de duas maneiras:
//  · no negócio (a Visita, ao voltar do Estúdio): pelas ações do motor (ctx.A), que gravam;
//  · numa cópia do negócio (o Estúdio, para mostrar o plano e o orçamento): o mesmo, sem gravar nada (simularNoNegocio).
// Assim o plano que o Estúdio mostra é o mesmo que a visita gera ao fechar, e o mesmo que a obra vai ter.
// Os serviços e os produtos que o Estúdio levou da última vez ficam no negócio (f.estudio_levado): o que se tirou no Estúdio sai também.
import { LINHAS, camposMedida, garantirServico, medida, nfmt, porMedida, type Estado, type Negocio, type SvcId } from "./motor";
import { fotografia, juntarProduto, mudarQtd, tirarProduto } from "./produtosVisita";
import type { Produto } from "./v2/catalogoModelo";
import { gravarPlanta } from "./planta";
import { medidasDoEstudio } from "@/pages/prototipo-estudio/daVisita";
import { respostasDoEstudio } from "@/pages/prototipo-estudio/respostasDoEstudio";
import { projetoNoCatalogo, servicosParaPlano } from "@/pages/prototipo-estudio/servicosDoCatalogo";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

/** As mudanças no negócio (as ações do motor, ou as de uma cópia). */
export interface AcoesEstudio {
  campo(k: string, v: string): void;
  medida(k: Parameters<typeof porMedida>[1], n: number): void;
  extra(sid: SvcId, q: number): void;
  produto(p: Produto, q: number): void;
  produtoQtd(pid: string, q: number): void;
  tirarProduto(pid: string): void;
}

export interface Levado {
  avisos: string[];
  servicos: number;
  produtos: number;
  /** As linhas do Estúdio sem par no Catálogo (juntar à mão nas Necessidades). */
  semPar: string[];
}

type Levados = { s: string[]; p: string[]; m: Record<string, number> };
const ler = (t: string | undefined): Levados => {
  try {
    const x = JSON.parse(t ?? "");
    const m = x?.m && typeof x.m === "object" ? Object.fromEntries(Object.entries(x.m).filter(([, n]) => typeof n === "number")) as Record<string, number> : {};
    return { s: Array.isArray(x?.s) ? x.s : [], p: Array.isArray(x?.p) ? x.p : [], m };
  } catch { return { s: [], p: [], m: {} }; }
};
const NOME_MEDIDA: Record<string, string> = { pav: "pavimento", par: "paredes", ptf: "pontos de água fria", ptq: "pontos de água quente", pcs: "peças" };
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Leva o projeto do Estúdio ao negócio, pelas ações dadas. */
export function levarEstudio(d: Negocio, p: Projeto, S: Estado, produtos: readonly Produto[], A: AcoesEstudio): Levado {
  const avisos: string[] = [];
  if (p.antes.paredes.length) {
    const pl = gravarPlanta(p.antes);
    if (d.f.planta !== pl) { A.campo("planta", pl); avisos.push("A planta ficou no negócio."); }
  }
  // as medidas: só as que a linha pede (os «pcs» são os vasos sanitários numa casa de banho, os módulos numa cozinha)
  const pede = camposMedida(LINHAS[d.linha]);
  const m = medidasDoEstudio(p), rotuloPcs = pede.find(([c]) => c === "pcs")?.[1] ?? "";
  const pcs = /sanit/i.test(rotuloPcs) ? m.pcs : /m[oó]dulo/i.test(rotuloPcs) ? m.modulos : undefined;
  const med = Object.entries({ pav: m.pav, par: m.par, ptf: m.ptf, ptq: m.ptq, pcs }).filter(([k, n]) => n !== undefined && pede.some(([c]) => c === k)) as [Parameters<typeof porMedida>[1], number][];
  // 23/11 (testarh, negócio 1015: «Trazer do Estúdio» pôs 2,16 e 11,51 m² por cima dos 3 e 15 m² escritos no negócio): a medida da planta só entra
  // se a do negócio está vazia ou é a que o Estúdio lá pôs da última vez (f.estudio_levado.m); a escrita à mão fica, e diz-se qual é a da planta.
  const antes = ler(d.f.estudio_levado);
  const mantidas: string[] = [];
  let mudaram = 0;
  for (const [k, n] of med) {
    const atual = medida(d.visita.med, k);
    if (igual(atual, n)) continue;
    const doEstudio = antes.m[k] !== undefined && igual(atual, antes.m[k]);
    if (atual > 0 && !doEstudio) { mantidas.push(`${NOME_MEDIDA[k] ?? k} ${nfmt(atual)} (a planta dá ${nfmt(n)})`); continue; }
    A.medida(k, n);
    mudaram++;
  }
  if (mudaram) avisos.push("As medidas da área saíram da planta.");
  if (mantidas.length) avisos.push(`As medidas escritas no negócio ficaram: ${mantidas.join(", ")}.`);
  const novas = Object.entries(respostasDoEstudio(p)).filter(([k, v]) => v && d.f[k] !== v);
  for (const [k, v] of novas) A.campo(k, v);
  if (novas.length) avisos.push(`As peças ficaram com ${novas.length} ${novas.length === 1 ? "resposta" : "respostas"}.`);

  // os serviços e os produtos do Catálogo (o que o Estúdio levou antes e já não leva, sai)
  const L = projetoNoCatalogo(p, S, produtos);
  const serv = servicosParaPlano({ ...L, servicos: L.servicos.filter((s) => s.origem !== "produto") });
  for (const sid of antes.s) if (!serv.some((x) => x.sid === sid) && d.visita.extra[sid]) A.extra(sid, 0);
  for (const x of serv) if (d.visita.extra[x.sid] !== x.q) A.extra(x.sid, x.q);
  const tem = (pid: string) => (d.visita.prod ?? []).find((x) => x.id === pid);
  for (const pid of antes.p) if (!L.produtos.some((x) => x.id === pid) && tem(pid)) A.tirarProduto(pid);
  let nProd = 0;
  for (const x of L.produtos) {
    const pr = produtos.find((y) => y.id === x.id);
    if (!pr) continue;
    nProd++;
    const ja = tem(x.id);
    if (!ja) A.produto(pr, x.q); else if (ja.q !== x.q) A.produtoQtd(x.id, x.q);
  }
  // 23/11: e as medidas que a planta deu (para saber, da próxima vez, se a do negócio foi mudada à mão)
  const levado = JSON.stringify({ s: serv.map((x) => x.sid), p: L.produtos.map((x) => x.id), ...(med.length ? { m: Object.fromEntries(med) } : {}) });
  if (d.f.estudio_levado !== levado) A.campo("estudio_levado", levado);
  if (serv.length || nProd) avisos.push(`Nas necessidades: ${serv.length} ${serv.length === 1 ? "serviço" : "serviços"} e ${nProd} ${nProd === 1 ? "produto" : "produtos"} do Catálogo.`);
  const inicio = p.catalogo?.inicio;
  if (inicio && d.f.plano_inicio !== inicio) A.campo("plano_inicio", inicio);
  // 9/11: os técnicos e a equipa escolhidos no plano do Estúdio
  const tecs = p.catalogo?.tecnicos && Object.keys(p.catalogo.tecnicos).length ? JSON.stringify(p.catalogo.tecnicos) : "";
  const eq = p.catalogo?.equipa?.length ? JSON.stringify(p.catalogo.equipa) : "";
  if ((d.f.plano_tecnicos ?? "") !== tecs) A.campo("plano_tecnicos", tecs);
  if ((d.f.plano_equipa ?? "") !== eq) A.campo("plano_equipa", eq);
  const eqs = p.catalogo?.equipas?.length ? JSON.stringify(p.catalogo.equipas) : "";
  if ((d.f.plano_equipas ?? "") !== eqs) A.campo("plano_equipas", eqs);
  return { avisos, servicos: serv.length, produtos: nProd, semPar: L.semPar };
}

/** Uma cópia do negócio com o Estúdio levado (nada se grava): para o Estúdio mostrar o plano e o orçamento que a visita vai gerar. */
export function simularNoNegocio(d: Negocio, p: Projeto, S: Estado, produtos: readonly Produto[]): { d: Negocio; levado: Levado } {
  const dc = structuredClone(d) as Negocio;
  const v = dc.visita;
  const levado = levarEstudio(dc, p, S, produtos, {
    campo: (k, x) => { dc.f[k] = x; },
    medida: (k, n) => porMedida(v.med, k, n),
    extra: (sid, q) => { if (q > 0) { garantirServico(S, sid); v.extra[sid] = q; } else delete v.extra[sid]; },
    produto: (pr, q) => { if (pr.servico) garantirServico(S, pr.servico); v.prod = juntarProduto(v.prod ?? [], fotografia(pr, q, false, S.cfg.alvo)); },
    produtoQtd: (pid, q) => { v.prod = mudarQtd(v.prod ?? [], pid, q); },
    tirarProduto: (pid) => { v.prod = tirarProduto(v.prod ?? [], pid); },
  });
  return { d: dc, levado };
}
