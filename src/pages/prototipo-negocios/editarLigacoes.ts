// Editar as ligações a partir do mapa (14/10/2026): juntar e retirar técnicos, equipamentos, consumíveis e
// produtos sem abrir a ficha do serviço. Sem React: cada edição é um par de funções (custos e catálogo) que o
// separador aplica com mudarCustos/mudarCatalogo, e o que ela muda (o serviço e o produto) para o "Anular".
// A mesma ligação edita-se dos dois lados: no serviço (junta-se o técnico) ou no técnico (junta-se o serviço).
import { normal } from "./catalogo";
import { nfmt, type Estado } from "./motor";
import type { Catalogo } from "./v2/catalogoModelo";
import { HOJE, receitaDe, type Custos, type ReceitaV2 } from "./v2/custosModelo";
import { noDe, type CatalogoLig, type Ligacao, type NoMapa, type Ref } from "./ligacoes";

/** Uma mudança pronta a aplicar: nos custos (a receita do serviço) e/ou no catálogo (o serviço que o produto traz). */
export interface Edicao {
  sid: string;
  /** O produto mexido (para o "Anular"). */
  prod?: string;
  custos?: (C: Custos) => void;
  catalogo?: (K: Catalogo) => void;
  msg: string;
}

/** Os grupos onde se pode juntar, por tipo do centro. */
const JUNTAR: Record<Ref["t"], string[]> = {
  svc: ["produtos", "tecnicos", "equipamentos", "consumiveis"],
  equip: ["servicos"], tec: ["servicos"], cons: ["servicos"],
  prod: ["traz"],
};
export const podeJuntar = (centro: Ref, grupo: string) => JUNTAR[centro.t].includes(grupo);

/** O texto do botão de juntar em cada grupo. */
export function textoJuntar(centro: Ref, grupo: string): string {
  if (centro.t === "prod") return "Escolher o serviço";
  if (grupo === "servicos") return centro.t === "tec" ? "Juntar a um serviço" : "Usar num serviço";
  return { produtos: "Ligar um produto", tecnicos: "Juntar técnico", equipamentos: "Juntar equipamento", consumiveis: "Juntar consumível" }[grupo] ?? "Juntar";
}

/** O serviço e o outro lado da ligação, venha o centro de onde vier. */
function par(centro: Ref, alvo: Ref): { sid: string; outro: Ref } | null {
  if (centro.t === "svc") return { sid: centro.id, outro: alvo };
  if (alvo.t === "svc") return { sid: alvo.id, outro: centro };
  return null;
}

/** O que se pode juntar a um grupo: o que ainda não está ligado, por nome. */
export function candidatos(centro: Ref, grupo: string, K: CatalogoLig): NoMapa[] {
  if (!podeJuntar(centro, grupo)) return [];
  const nos = (refs: Ref[]) => refs.map((r) => noDe(r, K)).filter((x): x is NoMapa => !!x).sort((a, b) => a.n.localeCompare(b.n, "pt"));
  if (centro.t === "svc") {
    const s = K.servicos.find((x) => x.id === centro.id);
    if (!s) return [];
    if (grupo === "produtos") return nos(K.produtos.filter((p) => p.servico !== s.id).map((p) => ({ t: "prod", id: p.id })));
    if (grupo === "tecnicos") return nos(K.tecnicos.filter((t) => !s.mo.some((p) => p.perfil === t.id)).map((t) => ({ t: "tec", id: t.id })));
    if (grupo === "equipamentos") return nos(K.equip.filter((e) => !s.equip.some((u) => u.equip === e.id)).map((e) => ({ t: "equip", id: e.id })));
    return nos(K.consumiveis.filter((c) => !s.cons.some((x) => x.k === c.k)).map((c) => ({ t: "cons", id: c.k })));
  }
  if (centro.t === "prod") {
    const p = K.produtos.find((x) => x.id === centro.id);
    return nos(K.servicos.filter((s) => s.id !== p?.servico).map((s) => ({ t: "svc", id: s.id })));
  }
  const usa = (s: CatalogoLig["servicos"][number]) =>
    centro.t === "equip" ? s.equip.some((u) => u.equip === centro.id) : centro.t === "tec" ? s.mo.some((p) => p.perfil === centro.id) : s.cons.some((c) => c.k === centro.id);
  return nos(K.servicos.filter((s) => !usa(s)).map((s) => ({ t: "svc", id: s.id })));
}

/** Pode retirar-se este nó daqui? (os produtos que o serviço só "pede", as alternativas e quem instala não são ligações diretas) */
export function podeRetirar(centro: Ref, grupo: string, l: Ligacao, K: CatalogoLig): boolean {
  if (!podeJuntar(centro, grupo)) return false;
  if (centro.t === "svc" && l.ref.t === "prod") return K.produtos.find((p) => p.id === l.ref.id)?.servico === centro.id;
  return true;
}

const nid = (pref: string, L: { id: string }[]) => pref + (Math.max(0, ...L.map((x) => Number(x.id.replace(/\D/g, "")) || 0)) + 1);
/** Muda a receita do serviço (a guardada, ou a que o Catálogo dá) e marca-a como editada. */
const naReceita = (S: Estado, sid: string, fn: (r: ReceitaV2) => void) => (C: Custos) => {
  const base = receitaDe(C, sid, S.svc[sid] ?? null, S.cfg.alvo);
  if (!base) return;
  const r = structuredClone(base);
  fn(r);
  r.origem = "editada";
  C.receitas[sid] = r;
};

/** Juntar `alvo` ao grupo do centro. Null se a ligação não faz sentido ou os elementos já não existem. */
export function juntar(centro: Ref, grupo: string, alvo: Ref, K: CatalogoLig, S: Estado): Edicao | null {
  if (!podeJuntar(centro, grupo)) return null;
  const pr = par(centro, alvo);
  const s = pr && K.servicos.find((x) => x.id === pr.sid);
  if (!pr || !s) return null;
  const o = pr.outro;
  if (o.t === "prod") {
    const p = K.produtos.find((x) => x.id === o.id);
    if (!p) return null;
    const antes = p.servico && p.servico !== s.id ? K.servicos.find((x) => x.id === p.servico)?.n : null;
    return {
      sid: s.id, prod: p.id, msg: `${p.n} passa a trazer ${s.n}${antes ? ` (em vez de ${antes})` : ""}`,
      catalogo: (k) => { const y = k.produtos.find((z) => z.id === p.id); if (y) { y.servico = s.id; y.fatorServico = 1; } },
    };
  }
  if (o.t === "tec") {
    const t = K.tecnicos.find((x) => x.id === o.id);
    if (!t) return null;
    return { sid: s.id, msg: `${t.n} junta-se a ${s.n} (${nfmt(0.5)} h/${s.un}, mude na ficha)`, custos: naReceita(S, s.id, (r) => { r.mo.push({ id: nid("p", r.mo), n: t.n, perfil: t.id, h: 0.5 }); }) };
  }
  if (o.t === "equip") {
    const e = K.equip.find((x) => x.id === o.id);
    if (!e) return null;
    return { sid: s.id, msg: `${e.n} passa a ser usado em ${s.n} (${nfmt(0.5)} h/${s.un})`, custos: naReceita(S, s.id, (r) => { r.equip.push({ id: nid("e", r.equip), equip: e.id, h: 0.5 }); }) };
  }
  if (o.t === "cons") {
    const c = K.consumiveis.find((x) => x.k === o.id);
    if (!c) return null;
    return {
      sid: s.id, msg: `${c.n} passa a ser usado em ${s.n} (1 ${c.un}/${s.un})`,
      custos: naReceita(S, s.id, (r) => { r.cons.push({ id: nid("c", r.cons), n: c.n, q: 1, un: c.un, preco: c.preco, fornecedor: c.fornecedor || "Por escolher", data: HOJE }); }),
    };
  }
  return null;
}

/** Retirar a ligação entre o centro e `alvo`. */
export function retirar(centro: Ref, grupo: string, alvo: Ref, K: CatalogoLig, S: Estado): Edicao | null {
  if (!podeJuntar(centro, grupo)) return null;
  const pr = par(centro, alvo);
  const s = pr && K.servicos.find((x) => x.id === pr.sid);
  if (!pr || !s) return null;
  const o = pr.outro, n = noDe(o, K)?.n ?? o.id;
  if (o.t === "prod") {
    if (K.produtos.find((x) => x.id === o.id)?.servico !== s.id) return null;
    return { sid: s.id, prod: o.id, msg: `${n} já não traz ${s.n}`, catalogo: (k) => { const y = k.produtos.find((z) => z.id === o.id); if (y) { delete y.servico; delete y.fatorServico; } } };
  }
  const fora = o.t === "tec" ? `${n} sai de ${s.n}` : `${s.n} deixa de usar ${n}`;
  if (o.t === "tec") return { sid: s.id, msg: fora, custos: naReceita(S, s.id, (r) => { r.mo = r.mo.filter((p) => p.perfil !== o.id); }) };
  if (o.t === "equip") return { sid: s.id, msg: fora, custos: naReceita(S, s.id, (r) => { r.equip = r.equip.filter((u) => u.equip !== o.id); }) };
  if (o.t === "cons") return { sid: s.id, msg: fora, custos: naReceita(S, s.id, (r) => { r.cons = r.cons.filter((c) => normal(c.n) !== o.id); }) };
  return null;
}

