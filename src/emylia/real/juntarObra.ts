// 19/11/2026 (Rúben: «preciso mesmo que garantas que o técnico, ao completar uma task, que esteja ligado o input de término no Estúdio
// da obra»). O Hoje do técnico e o Estúdio da obra mexem no mesmo dado (d.obra.plano.tasks[i].exec), mas a obra grava-se inteira
// (obra_guardar_negocio substitui o estado_emylia). Um ecrã aberto há mais tempo (o Estúdio do gestor) apagava o «feita» que o técnico
// gravou entretanto; e o técnico com o ecrã antigo levava um erro ao gravar, porque a validação feita pelo gestor voltava atrás.
// Aqui, a junção a três: o que este ecrã leu (antes), o que tem agora (local) e o que está na base (base). Ganha o que cada lado mudou;
// quando os dois mudaram o mesmo valor, ganha este ecrã (como antes). As listas que só crescem (diário, registos, histórico) juntam-se.
import { acertarDiaDasObras, type Negocio } from "../motor";
import { obraDaBase } from "./obraReal";

type Obj = Record<string, unknown>;
const eObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

/** O JSON com as chaves por ordem (a base, jsonb, devolve as chaves noutra ordem: o mesmo objeto tem de dar o mesmo texto). */
export function canonico(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) => (eObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v)) ?? "";
}
const igual = (a: unknown, b: unknown) => canonico(a) === canonico(b);
/** O mesmo elemento de uma lista nas duas versões: as tarefas pelo nome (uma tarefa apagada no meio não junta a seguinte com a anterior). */
const mesmo = (a: unknown, b: unknown) => !(eObj(a) && eObj(b) && typeof a.nome === "string" && typeof b.nome === "string") || a.nome === b.nome;

/** A junção a três de dois valores JSON. */
export function juntar3(antes: unknown, local: unknown, base: unknown): unknown {
  if (igual(local, base) || igual(base, antes)) return local;
  if (igual(local, antes)) return base;
  if (Array.isArray(local) && Array.isArray(base)) {
    const A = Array.isArray(antes) ? antes : [];
    const out = local.map((l, i) => (i < A.length && i < base.length && mesmo(A[i], l) && mesmo(A[i], base[i]) ? juntar3(A[i], l, base[i]) : l));
    // o que a base juntou no fim (um registo do técnico, uma linha do diário) e este ecrã ainda não tem
    for (let i = A.length; i < base.length; i++) if (!out.some((x) => igual(x, base[i]))) out.push(base[i]);
    return out;
  }
  if (eObj(local) && eObj(base)) {
    const A = eObj(antes) ? antes : {};
    const out: Obj = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(base)])) {
      const v = juntar3(A[k], local[k], base[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return local;
}

/**
 * A obra lida da base, posta como o ecrã a põe ao ler (negocioDoLido e aplicarLidos): a encomenda de cliente vem do negócio (não da cópia
 * gravada na obra) e o «hoje» de uma obra em curso é o do calendário. Sem isto, a junção trazia de volta a cópia antiga e o dia gravado.
 */
export function obraDaBaseComoNoEcra(lida: unknown, antes: Negocio["obra"], hoje = new Date()): Negocio["obra"] {
  const o = structuredClone(obraDaBase(lida)) as Negocio["obra"] & Obj;
  for (const k of ["ec", "ecsAjuste"] as const) {
    if (k in antes) (o as Obj)[k] = structuredClone((antes as Obj)[k]); else delete (o as Obj)[k];
  }
  acertarDiaDasObras([{ obra: o } as unknown as Negocio], hoje);
  return o;
}

/** A obra junta: o que este ecrã mudou desde que leu (`antes`) por cima do que está agora na base (`lida`, de obra_ler_negocios). */
export function obraJunta(antes: Negocio["obra"], local: Negocio["obra"], lida: unknown, hoje = new Date()): { obra: Negocio["obra"]; base: Negocio["obra"] } {
  const base = obraDaBaseComoNoEcra(lida, antes, hoje);
  return { obra: juntar3(antes, local, base) as Negocio["obra"], base };
}

/** Põe `novo` no lugar de `alvo` (o mesmo objeto: quem o tem na mão vê a mudança). */
export function porNoSitio(alvo: Negocio["obra"], novo: Negocio["obra"]): void {
  const a = alvo as unknown as Obj;
  for (const k of Object.keys(a)) if (!(k in novo)) delete a[k];
  Object.assign(a, novo);
}

/** O que mudou nas tarefas de uma obra de `antes` para `depois`, numa frase para o aviso (o técnico terminou, o gestor validou…). */
export function novidadesDaObra(antes: Negocio["obra"], depois: Negocio["obra"]): string[] {
  const A = antes.plano?.tasks ?? [], D = depois.plano?.tasks ?? [];
  const out: string[] = [];
  D.forEach((t, i) => {
    const a = A[i]?.nome === t.nome ? A[i].exec?.estado : undefined, e = t.exec?.estado;
    if (!e || e === a) return;
    if (e === "feita") out.push(`${t.nome}: terminada, por validar`);
    else if (e === "validada") out.push(`${t.nome}: validada`);
    else if (e === "corrigir") out.push(`${t.nome}: pedida uma correção`);
    else if (e === "em curso" && !a) out.push(`${t.nome}: começada`);
  });
  return out;
}
