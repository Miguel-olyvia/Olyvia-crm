// O que o cliente fornece, por serviço (14/10/2026, versão Atual): os consumíveis e os equipamentos da receita de cada serviço
// que o cliente traz (ex.: o andaime, a betoneira, a tinta). Sem React e sem importar as stores nem o modelo de custos:
// a store dos custos (v2/custosStore.ts) liga aqui a leitura dos itens da receita, como o Catálogo em produtosVisita.ts.
// O estado guarda-se na visita (`visita.fornece[sid]` = as chaves "c:<consumível>" e "e:<equipamento>") e só conta
// com "o cliente fornece materiais = Sim". A mão de obra e a estrutura ficam sempre; as receitas do Catálogo não mudam.
import type { LinhaOrc, Servico, SvcId } from "./motor";

/** Um consumível ou um equipamento da receita de um serviço, por unidade do serviço. */
export interface ItemReceita {
  /** "c:<nome do consumível>" ou "e:<id do equipamento>". */
  k: string;
  tipo: "cons" | "equip";
  n: string;
  /** Quantidade por unidade do serviço (no equipamento, as horas). */
  q: number;
  un: string;
  /** O custo por unidade do serviço (€). */
  cu: number;
}
type LerItens = (sid: SvcId, s?: Servico | null) => ItemReceita[];

let lerItens: LerItens | null = null;
/** A store dos custos liga aqui a leitura (null desliga; os testes ligam e desligam). */
export function ligarReceitas(f: LerItens | null) { lerItens = f; }
/** Os consumíveis (sem os opcionais, que não entram no custo) e os equipamentos da receita; [] sem a store ligada. */
export const itensReceita = (sid: SvcId, s?: Servico | null): ItemReceita[] => (lerItens ? lerItens(sid, s) : []);

export const PREFIXO_FORNECE = "Fornecido pelo cliente · ";
const r2 = (x: number) => Math.round(x * 100) / 100;

/** O que sai do custo por unidade de uma linha de serviço (equipamentos e consumíveis marcados). */
export function menosDaLinha(fornece: Record<SvcId, string[]> | undefined, sid: SvcId, s?: Servico | null): { eq: number; cons: number } {
  const ks = fornece?.[sid];
  if (!ks?.length) return { eq: 0, cons: 0 };
  let eq = 0, cons = 0;
  for (const it of itensReceita(sid, s)) if (ks.includes(it.k)) { if (it.tipo === "equip") eq += it.cu; else cons += it.cu; }
  return { eq: r2(eq), cons: r2(cons) };
}

/** As linhas "Fornecido pelo cliente · …" dos consumíveis e equipamentos marcados (a zero, para se ver no orçamento). */
export function linhasFornecidas(fornece: Record<SvcId, string[]> | undefined, sids: SvcId[], nomeSvc: (sid: SvcId) => string, svc: (sid: SvcId) => Servico | null | undefined): LinhaOrc[] {
  const out: LinhaOrc[] = [];
  for (const sid of sids) {
    const ks = fornece?.[sid];
    if (!ks?.length) continue;
    for (const it of itensReceita(sid, svc(sid))) if (ks.includes(it.k)) out.push({ t: "mat", d: `${PREFIXO_FORNECE}${it.n} (${nomeSvc(sid)})`, custo: 0, preco: 0 });
  }
  return out;
}

/** Liga ou desliga um item no estado da visita (muda o objeto no sítio). */
export function marcarItem(v: { fornece?: Record<SvcId, string[]> }, sid: SvcId, k: string, on: boolean) {
  const atual = v.fornece?.[sid] ?? [];
  const novo = on ? (atual.includes(k) ? atual : [...atual, k]) : atual.filter((x) => x !== k);
  v.fornece ??= {};
  if (novo.length) v.fornece[sid] = novo; else delete v.fornece[sid];
  if (!Object.keys(v.fornece).length) delete v.fornece;
}
