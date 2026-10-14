// As ligações do Catálogo (14/10/2026): o mapa das relações à volta de um elemento e os problemas
// de dados, sem React. Um elemento (serviço, produto, equipamento, consumível ou técnico) fica no
// centro e à volta ficam os grupos ligados, cada ligação com o seu "porquê":
//   · serviço   → produtos que o trazem ou que ele exige (com a pergunta), técnicos (h/un), equipamentos (€/h), consumíveis;
//   · produto   → o serviço que traz, os serviços que o pedem, as alternativas da mesma subcategoria e quem o instala;
//   · equipamento, consumível ou técnico → os serviços que os usam.
// `montarCatalogo(S, C, K)` junta o que o mapa precisa num objeto simples (CatalogoLig); `ligacoesDe` e
// `problemasCatalogo` só leem esse objeto, por isso os testes podem construí-lo à mão.
import { CATALOGO, normal } from "./catalogo";
import { eur, nfmt, type Estado, type SvcId } from "./motor";
import { RECEITAS } from "./receitas";
import { caminho, type Catalogo, type No, type Produto } from "./v2/catalogoModelo";
import { custoHoraPerfil, equipHora, receitaDe, type Custos } from "./v2/custosModelo";
import { iconeDoOficio, ilustracaoDe, ilustracaoDoProduto, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";
import { iconeDoServico, todosSids } from "./fichaServico";
import { nosAbaixo } from "./produtosVisita";

/* ------------------------------------------------------------------ o catálogo do mapa */
export type TipoNo = "svc" | "prod" | "equip" | "cons" | "tec";
export interface Ref { t: TipoNo; id: string }
export const chaveRef = (r: Ref) => `${r.t}:${r.id}`;
export const NOME_TIPO: Record<TipoNo, string> = { svc: "Serviço", prod: "Produto", equip: "Equipamento", cons: "Consumível", tec: "Técnico" };

export interface SvcLig {
  id: SvcId; n: string; un: string; oficio: string; icone: IconeServicoKey;
  /** Sem receita no Catálogo: o custo só conta a mão de obra. */
  semReceita: boolean;
  mo: { passo: string; perfil: string; h: number }[];
  equip: { equip: string; h: number }[];
  /** k = o nome sem acentos (a chave do consumível). */
  cons: { k: string; n: string; q: number; un: string; preco: number; opcional: boolean }[];
  /** O nó de onde a visita obriga a escolher um produto (null = não obriga). */
  exige: string | null;
  pergunta: string | null;
}
export interface EquipLig { id: string; n: string; eh: number }
export interface TecLig { id: string; n: string; eh: number | null }
export interface ConsLig { k: string; n: string; un: string; preco: number; fornecedor: string }
export interface CatalogoLig {
  servicos: SvcLig[];
  /** Os produtos que se escolhem (sem os consumíveis das receitas, que aparecem como consumíveis). */
  produtos: Produto[];
  arvore: No[];
  equip: EquipLig[];
  tecnicos: TecLig[];
  consumiveis: ConsLig[];
}

/** Junta o que o mapa precisa: os serviços com a receita, os produtos, os equipamentos com o €/h, os técnicos e os consumíveis. */
export function montarCatalogo(S: Estado, C: Custos, K: Catalogo): CatalogoLig {
  const cat = new Map(CATALOGO.map((c) => [c.id, c]));
  const servicos: SvcLig[] = [];
  const cons = new Map<string, ConsLig>(), datas = new Map<string, string>();
  for (const sid of todosSids(S)) {
    const s = S.svc[sid] ?? null, c = cat.get(sid);
    const rec = receitaDe(C, sid, s, S.cfg.alvo);
    if (!rec) continue;
    const n = s?.n ?? c?.n ?? sid, oficio = c?.cat ?? s?.perfil ?? "";
    // um consumível por nome, com o preço mais recente
    for (const x of rec.cons) {
      const k = normal(x.n);
      if (!cons.has(k) || x.data > (datas.get(k) ?? "")) { cons.set(k, { k, n: x.n, un: x.un, preco: x.preco, fornecedor: x.fornecedor }); datas.set(k, x.data); }
    }
    servicos.push({
      id: sid, n, un: s?.un ?? c?.un ?? "un", oficio, icone: iconeDoServico(K, sid, n, oficio), semReceita: rec.origem === "estimada",
      mo: rec.mo.map((p) => ({ passo: p.n, perfil: p.perfil, h: p.h })),
      equip: rec.equip.map((u) => ({ equip: u.equip, h: u.h })),
      cons: rec.cons.map((x) => ({ k: normal(x.n), n: x.n, q: x.q, un: x.un, preco: x.preco, opcional: !!x.opcional })),
      exige: K.exigeProduto?.[sid] ?? null, pergunta: K.perguntaManter?.[sid]?.trim() || null,
    });
  }
  // os consumíveis de origem (receitas.ts) que vivem na lista de produtos contam como consumíveis, mesmo sem uso
  const deOrigem = new Set(Object.values(RECEITAS).flatMap((r) => r.cons.map((c) => normal(c.n))));
  const produtos: Produto[] = [];
  for (const p of K.produtos) {
    const k = normal(p.n);
    if (cons.has(k) || deOrigem.has(k)) {
      if (!cons.has(k)) cons.set(k, { k, n: p.n, un: p.un, preco: p.custo, fornecedor: p.fornecedor });
    } else produtos.push(p);
  }
  return {
    servicos, produtos, arvore: K.arvore,
    equip: C.equip.map((e) => ({ id: e.id, n: e.n, eh: equipHora(e) })),
    tecnicos: C.perfis.map((p) => ({ id: p.id, n: p.n, eh: custoHoraPerfil(p, C.par) })),
    consumiveis: [...cons.values()].sort((a, b) => a.n.localeCompare(b.n, "pt")),
  };
}

/* ------------------------------------------------------------------ índices (uma vez por catálogo) */
interface Indice {
  svc: Map<string, SvcLig>; prod: Map<string, Produto>; equip: Map<string, EquipLig>; tec: Map<string, TecLig>; cons: Map<string, ConsLig>;
  /** O nó → os nós de baixo (inclui o próprio). */
  ramo: (no: string) => Set<string>;
}
const INDICES = new WeakMap<CatalogoLig, Indice>();
function indice(K: CatalogoLig): Indice {
  let I = INDICES.get(K);
  if (I) return I;
  const ramos = new Map<string, Set<string>>();
  I = {
    svc: new Map(K.servicos.map((s) => [s.id, s])), prod: new Map(K.produtos.map((p) => [p.id, p])),
    equip: new Map(K.equip.map((e) => [e.id, e])), tec: new Map(K.tecnicos.map((t) => [t.id, t])), cons: new Map(K.consumiveis.map((c) => [c.k, c])),
    ramo: (no) => { let r = ramos.get(no); if (!r) { r = nosAbaixo(K.arvore, no); ramos.set(no, r); } return r; },
  };
  INDICES.set(K, I);
  return I;
}

/* ------------------------------------------------------------------ os nós */
export type Visual = { k: "ilus"; v: IlustracaoKey } | { k: "icone"; v: IconeServicoKey };
export interface NoMapa {
  ref: Ref; n: string;
  /** Uma linha curta: ofício e unidade, marca e preço, €/h. */
  det: string;
  vis: Visual;
}
const ICONE_PERFIL: Record<string, IconeServicoKey> = {
  servente: "demolicao", canalizador: "canalizacao", ladrilhador: "revestimento", montador: "carpintaria", eletricista: "eletricidade", pintor: "pintura", gas: "gas",
};
const visCons = (n: string): Visual => { const v = ilustracaoDe(n); return { k: "ilus", v: v === "generico" ? "material" : v }; };
const precoTexto = (p: Produto) => (p.pvp != null ? `PVP ${eur(p.pvp)} €` : `custo ${eur(p.custo)} €`);

/** O nó de uma referência (null se já não existe). */
export function noDe(r: Ref, K: CatalogoLig): NoMapa | null {
  const I = indice(K);
  if (r.t === "svc") { const s = I.svc.get(r.id); return s ? { ref: r, n: s.n, det: `${s.oficio} · por ${s.un}`, vis: { k: "icone", v: s.icone } } : null; }
  if (r.t === "prod") {
    const p = I.prod.get(r.id);
    return p ? { ref: r, n: p.n, det: [p.marca, precoTexto(p)].filter(Boolean).join(" · "), vis: { k: "ilus", v: ilustracaoDoProduto(p, caminho(K.arvore, p.no)) } } : null;
  }
  if (r.t === "equip") { const e = I.equip.get(r.id); return e ? { ref: r, n: e.n, det: `${eur(e.eh)} €/h`, vis: { k: "ilus", v: "ferramenta" } } : null; }
  if (r.t === "tec") {
    const t = I.tec.get(r.id);
    return t ? { ref: r, n: t.n, det: t.eh == null ? "sem custo/hora" : `${eur(t.eh)} €/h`, vis: { k: "icone", v: ICONE_PERFIL[t.id] ?? iconeDoOficio(t.n) } } : null;
  }
  const c = I.cons.get(r.id);
  return c ? { ref: r, n: c.n, det: `${eur(c.preco)} €/${c.un} · ${c.fornecedor}`, vis: visCons(c.n) } : null;
}

/* ------------------------------------------------------------------ as ligações */
export interface Ligacao extends NoMapa {
  /** Porque estão ligados: "traz 1 × Instalação de sanita", "0,85 €/h · 2 h/un". */
  porque: string;
  opcional?: boolean;
}
export interface GrupoMapa { id: string; titulo: string; nota?: string; itens: Ligacao[] }
export interface Mapa { centro: NoMapa; grupos: GrupoMapa[] }

const liga = (n: NoMapa | null, porque: string, extra: Partial<Ligacao> = {}): Ligacao[] => (n ? [{ ...n, porque, ...extra }] : []);
const ordemNome = (a: { n: string }, b: { n: string }) => a.n.localeCompare(b.n, "pt");

/** "Pede um de Louças e torneiras · se o cliente não mantém". */
const pede = (s: SvcLig, K: CatalogoLig) => `Pede um de ${caminho(K.arvore, s.exige).split(" › ").pop()}${s.pergunta ? " · se o cliente não mantém" : ""}`;

/** Os técnicos de um serviço (os passos do mesmo técnico somados), com as horas por unidade. */
function tecnicosDe(s: SvcLig, K: CatalogoLig, pre = ""): Ligacao[] {
  const por = new Map<string, { h: number; passos: string[] }>();
  for (const p of s.mo) { const x = por.get(p.perfil) ?? { h: 0, passos: [] }; x.h += p.h; x.passos.push(p.passo); por.set(p.perfil, x); }
  return [...por].flatMap(([perfil, x]) => {
    const t = indice(K).tec.get(perfil);
    return liga(noDe({ t: "tec", id: perfil }, K), `${pre}${x.passos.length === 1 ? x.passos[0] : `${x.passos.length} passos`}: ${nfmt(x.h)} h/${s.un}${t?.eh != null ? ` · ${eur(t.eh)} €/h` : ""}`);
  });
}

/** O mapa das ligações à volta de um elemento (null se já não existe). Cada elemento aparece uma só vez. */
export function ligacoesDe(no: Ref, K: CatalogoLig): Mapa | null {
  const centro = noDe(no, K);
  if (!centro) return null;
  const I = indice(K);
  let grupos: GrupoMapa[] = [];

  if (no.t === "svc") {
    const s = I.svc.get(no.id)!;
    const ramo = s.exige && K.arvore.some((x) => x.id === s.exige) ? I.ramo(s.exige) : null, sitio = s.exige ? caminho(K.arvore, s.exige) : "";
    const traz = K.produtos.filter((p) => p.servico === s.id);
    const exigidos = ramo ? K.produtos.filter((p) => p.servico !== s.id && p.no && ramo.has(p.no)) : [];
    grupos = [
      {
        id: "produtos", titulo: "Produtos",
        nota: s.pergunta ? `${s.pergunta} Se «Não», escolhe-se um de ${sitio}.` : s.exige ? `Obriga a escolher um de ${sitio}.` : undefined,
        itens: [
          ...traz.flatMap((p) => liga(noDe({ t: "prod", id: p.id }, K), `1 ${p.un} traz ${nfmt(p.fatorServico ?? 1)} × ${s.n}`)),
          ...exigidos.flatMap((p) => liga(noDe({ t: "prod", id: p.id }, K), pede(s, K))),
        ],
      },
      { id: "tecnicos", titulo: "Técnicos", itens: tecnicosDe(s, K) },
      { id: "equipamentos", titulo: "Equipamentos", itens: s.equip.flatMap((u) => { const e = I.equip.get(u.equip); return liga(noDe({ t: "equip", id: u.equip }, K), `${e ? eur(e.eh) : "—"} €/h · ${nfmt(u.h)} h/${s.un}`); }) },
      {
        id: "consumiveis", titulo: "Consumíveis",
        itens: s.cons.flatMap((c) => liga(noDe({ t: "cons", id: c.k }, K), `${nfmt(c.q)} ${c.un}/${s.un} · ${eur(c.preco)} €/${c.un}${c.opcional ? " · opcional" : ""}`, c.opcional ? { opcional: true } : {})),
      },
    ];
  } else if (no.t === "prod") {
    const p = I.prod.get(no.id)!;
    const traz = p.servico ? I.svc.get(p.servico) : undefined;
    const pedem = K.servicos.filter((s) => s.id !== traz?.id && s.exige && p.no && I.ramo(s.exige).has(p.no));
    const mesmo = (x: Produto) => x.id !== p.id && (p.sub ? x.sub === p.sub : !!p.no && x.no === p.no);
    // as alternativas que trazem o mesmo serviço primeiro
    const alt = K.produtos.filter(mesmo).sort((a, b) => Number(b.servico === p.servico) - Number(a.servico === p.servico));
    grupos = [
      { id: "traz", titulo: "Serviço que traz", itens: traz ? liga(noDe({ t: "svc", id: traz.id }, K), `traz ${nfmt(p.fatorServico ?? 1)} × ${traz.n}`) : [] },
      { id: "pedem", titulo: "Serviços que o pedem", itens: pedem.flatMap((s) => liga(noDe({ t: "svc", id: s.id }, K), pede(s, K))) },
      { id: "alternativas", titulo: "Alternativas", nota: p.sub ? `Da mesma subcategoria: ${p.sub}.` : `Do mesmo ramo: ${caminho(K.arvore, p.no)}.`, itens: alt.flatMap((x) => liga(noDe({ t: "prod", id: x.id }, K), p.sub ? `Mesma subcategoria: ${p.sub}` : "Mesmo ramo do Catálogo")) },
      { id: "instala", titulo: "Quem instala", itens: traz ? tecnicosDe(traz, K, "Instala · ") : [] },
    ];
  } else {
    // equipamento, consumível ou técnico: os serviços que os usam
    const usos = K.servicos.flatMap((s): Ligacao[] => {
      if (no.t === "equip") { const u = s.equip.filter((x) => x.equip === no.id); if (!u.length) return []; const h = u.reduce((a, x) => a + x.h, 0); return liga(noDe({ t: "svc", id: s.id }, K), `${eur(I.equip.get(no.id)!.eh)} €/h · ${nfmt(h)} h/${s.un}`); }
      if (no.t === "tec") { const u = s.mo.filter((x) => x.perfil === no.id); if (!u.length) return []; const h = u.reduce((a, x) => a + x.h, 0); return liga(noDe({ t: "svc", id: s.id }, K), `${u.length === 1 ? u[0].passo : `${u.length} passos`}: ${nfmt(h)} h/${s.un}`); }
      const c = s.cons.find((x) => x.k === no.id);
      return c ? liga(noDe({ t: "svc", id: s.id }, K), `${nfmt(c.q)} ${c.un}/${s.un}${c.opcional ? " · opcional" : ""}`, c.opcional ? { opcional: true } : {}) : [];
    });
    grupos = [{ id: "servicos", titulo: no.t === "tec" ? "Serviços que faz" : "Serviços que o usam", itens: usos.sort(ordemNome) }];
  }
  // cada elemento uma só vez (o primeiro grupo ganha) e nunca o próprio centro
  const vistos = new Set([chaveRef(no)]);
  grupos = grupos.map((g) => ({ ...g, itens: g.itens.filter((l) => { const k = chaveRef(l.ref); if (vistos.has(k)) return false; vistos.add(k); return true; }) }));
  return { centro, grupos };
}

/* ------------------------------------------------------------------ os problemas */
export type TipoProblema = "svc-sem-receita" | "svc-exige-sem-produto" | "prod-sem-servico" | "cons-sem-uso" | "equip-sem-uso";
export interface Problema { tipo: TipoProblema; ref: Ref; n: string; t: string }
export const TIPOS_PROBLEMA: { tipo: TipoProblema; t: string; d: string }[] = [
  { tipo: "svc-sem-receita", t: "Serviços sem receita", d: "O custo só conta a mão de obra: faltam equipamentos e consumíveis." },
  { tipo: "svc-exige-sem-produto", t: "Serviços que exigem um produto que não existe", d: "A visita obriga a escolher um produto de um ramo sem nenhum." },
  { tipo: "prod-sem-servico", t: "Produtos sem serviço de instalação", d: "Escolhidos na visita, não trazem quem os instala." },
  { tipo: "cons-sem-uso", t: "Consumíveis sem uso", d: "Nenhum serviço os usa." },
  { tipo: "equip-sem-uso", t: "Equipamentos sem uso", d: "Nenhum serviço os usa." },
];
/** As peças que se instalam: um produto destes sem serviço (e fora de um ramo que um serviço exige) é um problema. */
const INSTALAVEIS = new Set<IlustracaoKey>([
  "sanita", "bide", "lavatorio", "base-duche", "banheira", "coluna-duche", "resguardo", "torneira", "movel-wc", "espelho", "toalheiro", "acessorio-wc",
  "armario-cozinha", "bancada", "lava-loica", "eletrodomestico", "exaustor", "janela", "porta", "roupeiro", "iluminacao", "avac", "esquentador",
]);

/** Os problemas de dados do Catálogo, pela ordem de TIPOS_PROBLEMA e, dentro de cada tipo, por nome. */
export function problemasCatalogo(K: CatalogoLig): Problema[] {
  const I = indice(K), P: Problema[] = [];
  for (const s of K.servicos) if (s.semReceita) P.push({ tipo: "svc-sem-receita", ref: { t: "svc", id: s.id }, n: s.n, t: "Sem receita: o custo só conta a mão de obra." });
  // os nós com produtos (contando os de baixo)
  const comProduto = new Set<string>();
  for (const p of K.produtos) if (p.no) for (let n: No | undefined = K.arvore.find((x) => x.id === p.no); n && !comProduto.has(n.id); n = n.pai ? K.arvore.find((x) => x.id === n!.pai) : undefined) comProduto.add(n.id);
  for (const s of K.servicos) {
    if (!s.exige || comProduto.has(s.exige)) continue;
    const existe = K.arvore.some((x) => x.id === s.exige);
    P.push({ tipo: "svc-exige-sem-produto", ref: { t: "svc", id: s.id }, n: s.n, t: existe ? `Exige um produto de ${caminho(K.arvore, s.exige)}, mas não há nenhum.` : "Exige um produto de um ramo que já não existe." });
  }
  // produtos: os ramos que algum serviço exige cobrem os produtos (o serviço do pacote instala-os); os irmãos com serviço dizem que devia ter
  const cobertos = new Set<string>();
  for (const s of K.servicos) if (s.exige) for (const n of I.ramo(s.exige)) cobertos.add(n);
  const grupoDe = (p: Produto) => (p.sub ? `s:${p.sub}` : p.no ? `n:${p.no}` : "");
  const irmaosComServico = new Set(K.produtos.filter((p) => p.servico && grupoDe(p)).map(grupoDe));
  for (const p of K.produtos) {
    if (p.servico || (p.no && cobertos.has(p.no))) continue;
    const devia = INSTALAVEIS.has(ilustracaoDoProduto(p, caminho(K.arvore, p.no))) || irmaosComServico.has(grupoDe(p));
    if (devia) P.push({ tipo: "prod-sem-servico", ref: { t: "prod", id: p.id }, n: p.n, t: "Sem serviço de instalação: escolhido na visita, ninguém o instala." });
  }
  const consUsados = new Set(K.servicos.flatMap((s) => s.cons.map((c) => c.k)));
  for (const c of K.consumiveis) if (!consUsados.has(c.k)) P.push({ tipo: "cons-sem-uso", ref: { t: "cons", id: c.k }, n: c.n, t: "Nenhum serviço usa este consumível." });
  const equipUsados = new Set(K.servicos.flatMap((s) => s.equip.map((u) => u.equip)));
  for (const e of K.equip) if (!equipUsados.has(e.id)) P.push({ tipo: "equip-sem-uso", ref: { t: "equip", id: e.id }, n: e.n, t: "Nenhum serviço usa este equipamento." });
  const ordem = TIPOS_PROBLEMA.map((x) => x.tipo);
  return P.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.n.localeCompare(b.n, "pt"));
}
/** Quantos problemas há de cada tipo. */
export function contarProblemas(P: Problema[]): Record<TipoProblema, number> {
  const r = Object.fromEntries(TIPOS_PROBLEMA.map((x) => [x.tipo, 0])) as Record<TipoProblema, number>;
  for (const p of P) r[p.tipo]++;
  return r;
}
/** Os problemas por elemento (chaveRef), para o aviso no mapa. */
export function problemasPorNo(P: Problema[]): Map<string, Problema[]> {
  const m = new Map<string, Problema[]>();
  for (const p of P) { const k = chaveRef(p.ref), L = m.get(k); if (L) L.push(p); else m.set(k, [p]); }
  return m;
}

/* ------------------------------------------------------------------ escolher o centro */
/** Procura em todos os elementos (sem acentos; nos produtos também marca, referência e subcategoria). Serviços primeiro. */
export function procurarNos(K: CatalogoLig, q: string, max = 8): NoMapa[] {
  const qq = normal(q.trim());
  if (!qq) return [];
  const bate = (t: string) => normal(t).includes(qq);
  const refs: Ref[] = [
    ...K.servicos.filter((s) => bate(`${s.n} ${s.oficio}`)).map((s) => ({ t: "svc" as const, id: s.id })),
    ...K.tecnicos.filter((t) => bate(t.n)).map((t) => ({ t: "tec" as const, id: t.id })),
    ...K.equip.filter((e) => bate(e.n)).map((e) => ({ t: "equip" as const, id: e.id })),
    ...K.consumiveis.filter((c) => bate(c.n)).map((c) => ({ t: "cons" as const, id: c.k })),
  ];
  const out = refs.slice(0, max).map((r) => noDe(r, K)!);
  for (const p of K.produtos) {
    if (out.length >= max) break;
    if (bate(`${p.n} ${p.marca} ${p.sku ?? ""} ${p.sub ?? ""}`)) out.push(noDe({ t: "prod", id: p.id }, K)!);
  }
  return out;
}

/** O centro por omissão: um produto que traz serviço (o caso mais rico), senão o primeiro serviço. */
export function centroInicial(K: CatalogoLig): Ref | null {
  const p = K.produtos.find((x) => x.servico && K.servicos.some((s) => s.id === x.servico));
  if (p) return { t: "prod", id: p.id };
  return K.servicos[0] ? { t: "svc", id: K.servicos[0].id } : null;
}
