// Protótipo (visualizador 3D): o CONFIGURADOR DE FAMÍLIAS, só em memória (estado React; recarregar perde tudo; nada vai para a base nem para o armazenamento).
// Uma família configurada = acabamentos × medidas + uma MATRIZ de células (activa, preço e SKU próprios) + o GLB do fabricante por célula. `paraFamilia`
// converte-a numa `Familia` do catálogo (familias.ts), para o resto do ecrã a tratar como as outras. Funções puras: sem React, sem three.
import { CATEGORIAS_FAMILIA, FAMILIAS, PREFIXO_CFG, type AcabFam, type CategoriaFam, type Familia, type MedidaFam } from "./familias";
import type { TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";
import { FICHEIROS_3D, chaveFicheiro, type Ficheiro3D } from "./modelosHtml/ficheiros";

export interface AcabCfg { id: string; nome: string; cor: string; metalness: number; roughness: number; codigo: string }
export interface MedidaCfg { id: string; rotulo: string; ref: string; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; /** preço base (€) */ preco: number }
/** Uma célula da matriz: o acabamento existe nesta medida? `preco`/`sku` próprios sobrepõem o da medida / o automático. */
export interface CelulaCfg { ativo: boolean; sku?: string; preco?: number }
export interface RegraSku { modo: "auto" | "manual"; sep: string }
export interface FamiliaCfg {
  id: string; marca: string; nome: string; categoria: CategoriaFam; tipo: TipoMockup; espacos: TipoEspaco[];
  acabamentos: AcabCfg[]; medidas: MedidaCfg[];
  /** chave `medidaId|acabId` (celulaKey) */
  celulas: Record<string, CelulaCfg>;
  regraSku: RegraSku;
  /** chave da célula → chave do ficheiro GLB («familia|modelo|acab», modelosHtml/ficheiros.ts); sem entrada, modelo genérico */
  glb?: Record<string, string>;
}
/** Um problema da família e o passo do assistente onde se corrige (1 Família, 2 Acabamentos, 3 Medidas, 4 Combinações). */
export interface Problema { passo: 1 | 2 | 3 | 4; msg: string }

export const celulaKey = (medidaId: string, acabId: string): string => `${medidaId}|${acabId}`;

/** Os tipos de produto que cada categoria aceita (o primeiro é o de omissão). */
export const TIPOS_DA_CATEGORIA: Record<CategoriaFam, TipoMockup[]> = {
  torneiras: ["torneira_cozinha"], lavaloicas: ["lava_loica"], placas: ["placa"], tampos: ["tampo"], cozinha: ["movel", "sifao"],
  banho: ["base_duche", "resguardo", "torneira", "coluna_duche", "movel", "lavatorio_pousar", "espelho"],
};

export function slug(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const idDoNome = (nome: string): string => `${PREFIXO_CFG}${slug(nome)}`;

/** Os GLB do fabricante que servem um tipo (só há de torneira de cozinha e de lava-loiça). */
export function ficheirosCompativeis(tipo: TipoMockup): Ficheiro3D[] {
  const familia = tipo === "torneira_cozinha" ? "torneira" : tipo === "lava_loica" ? "lava_loica" : null;
  return familia ? FICHEIROS_3D.filter((x) => x.familia === familia) : [];
}

/* ------------------------------------------------------------------ SKU e preço por célula */
const medidaDe = (f: FamiliaCfg, id: string) => f.medidas.find((m) => m.id === id);
const acabDe = (f: FamiliaCfg, id: string) => f.acabamentos.find((a) => a.id === id);
/** O SKU de uma célula: automático = ref + separador + código; manual = o escrito à mão, ou o automático se estiver vazio. */
export function skuDaCelula(f: FamiliaCfg, medidaId: string, acabId: string): string {
  const m = medidaDe(f, medidaId), a = acabDe(f, acabId);
  if (!m || !a) return "";
  const auto = `${m.ref}${f.regraSku.sep}${a.codigo}`;
  return f.regraSku.modo === "manual" ? (f.celulas[celulaKey(medidaId, acabId)]?.sku?.trim() || auto) : auto;
}
const precoProprio = (c?: CelulaCfg): number | undefined => (typeof c?.preco === "number" && Number.isFinite(c.preco) && c.preco > 0 ? c.preco : undefined);
/** O preço de uma célula: o dela, senão o da medida. */
export const precoDaCelula = (f: FamiliaCfg, medidaId: string, acabId: string): number => precoProprio(f.celulas[celulaKey(medidaId, acabId)]) ?? medidaDe(f, medidaId)?.preco ?? 0;

const celulasAtivas = (f: FamiliaCfg): { m: MedidaCfg; a: AcabCfg }[] =>
  f.medidas.flatMap((m) => f.acabamentos.filter((a) => f.celulas[celulaKey(m.id, a.id)]?.ativo === true).map((a) => ({ m, a })));
const nomeMedida = (m: MedidaCfg): string => m.rotulo.trim() || m.ref.trim() || m.id;

/* ------------------------------------------------------------------ validação */
export function problemas(f: FamiliaCfg, outrosIds: readonly string[] = []): Problema[] {
  const p: Problema[] = [], add = (passo: Problema["passo"], msg: string) => p.push({ passo, msg });
  if (!f.nome.trim()) add(1, "Escreva o nome da família.");
  else if (!slug(f.nome)) add(1, "O nome precisa de letras ou números.");
  if (f.id === PREFIXO_CFG || outrosIds.includes(f.id) || FAMILIAS.some((d) => d.id === f.id)) add(1, `Já existe uma família com o identificador «${f.id}»: mude o nome.`);
  if (f.espacos.length === 0) add(1, "Escolha pelo menos um espaço (onde a família aparece).");
  if (f.acabamentos.length === 0) add(2, "Junte pelo menos um acabamento.");
  for (const a of f.acabamentos) {
    if (!a.nome.trim()) add(2, "Há um acabamento sem nome.");
    if (!a.codigo.trim()) add(2, `O acabamento «${a.nome.trim() || a.id}» não tem código (serve para o SKU).`);
  }
  if (f.medidas.length === 0) add(3, "Junte pelo menos uma medida.");
  for (const m of f.medidas) {
    if (!(m.preco > 0)) add(3, `A medida «${nomeMedida(m)}» não tem preço base.`);
    if (!m.ref.trim()) add(3, `A medida «${nomeMedida(m)}» não tem referência.`);
    if (m.dim.some((x) => !(x > 0))) add(3, `A medida «${nomeMedida(m)}» tem dimensões por preencher.`);
  }
  if (f.acabamentos.length > 0 && f.medidas.length > 0) {
    const ativas = celulasAtivas(f);
    if (ativas.length === 0) add(4, "Nenhuma combinação está ativa: ative pelo menos uma cor numa medida.");
    const porSku = new Map<string, string[]>();
    for (const { m, a } of ativas) { const s = skuDaCelula(f, m.id, a.id); porSku.set(s, [...(porSku.get(s) ?? []), `${nomeMedida(m)} × ${a.nome}`]); }
    for (const [sku, onde] of porSku) if (onde.length > 1) add(4, `O SKU «${sku}» repete-se (${onde.join("; ")}).`);
  }
  return p;
}
/** Só as mensagens (português legível), por ordem de passo. */
export const validar = (f: FamiliaCfg, outrosIds: readonly string[] = []): string[] => problemas(f, outrosIds).map((x) => x.msg);

/* ------------------------------------------------------------------ da configuração à Familia do catálogo */
/** A `Familia` do catálogo: a matriz substitui `spec.acabamentos` (os acabamentos de cada medida vêm das células activas); preço e SKU por célula vão em `spec.precos/skus`. */
export function paraFamilia(f: FamiliaCfg): Familia {
  const ativas = celulasAtivas(f);
  const medidas: MedidaFam[] = f.medidas.filter((m) => ativas.some((x) => x.m.id === m.id)).map((m) => {
    const dela = ativas.filter((x) => x.m.id === m.id).map((x) => x.a);
    const precos: Record<string, number> = {}, skus: Record<string, string> = {};
    for (const a of dela) {
      const proprio = precoProprio(f.celulas[celulaKey(m.id, a.id)]);
      if (proprio !== undefined) precos[a.id] = proprio;
      skus[a.id] = skuDaCelula(f, m.id, a.id);
    }
    const [w, d, h] = m.dim;
    const forma = f.tipo === "torneira_cozinha" ? { torneira: { estilo: "monocomando" as const, altura: h * 10, saida: d * 10, alcance: d * 10, base: w * 10 } }
      : f.tipo === "lava_loica" ? { cubas: [{ w: Math.max(w * 10 - 40, 100), d: Math.max(d * 10 - 40, 100), prof: h * 10, left: 20, top: 20 }] } : {};
    return { id: m.id, rotulo: m.rotulo, ref: m.ref, preco: m.preco, dim: m.dim, spec: { ...forma, acabamentos: dela.map((a) => a.id), precos, skus } };
  });
  const acabamentos: AcabFam[] = f.acabamentos.filter((a) => ativas.some((x) => x.a.id === a.id)).map((a) => ({ ...a, delta: 0 }));
  const glbCelulas: Record<string, string> = {};
  for (const { m, a } of ativas) { const g = f.glb?.[celulaKey(m.id, a.id)]; if (g) glbCelulas[celulaKey(m.id, a.id)] = g; }
  return {
    id: f.id, nome: f.nome.trim(), marca: f.marca.trim(), categoria: f.categoria, tipo: f.tipo, espacos: f.espacos, acabamentos, medidas,
    nota: "Família configurada no protótipo (só nesta sessão).", origem: "configurada", ...(Object.keys(glbCelulas).length ? { glbCelulas } : {}),
  };
}

/* ------------------------------------------------------------------ edição (funções puras: devolvem uma cópia) */
/** Garante uma célula por medida × acabamento (as novas nascem activas) e tira as de medidas/acabamentos que já não existem. */
export function sincronizar(f: FamiliaCfg): FamiliaCfg {
  const celulas: Record<string, CelulaCfg> = {}, glb: Record<string, string> = {};
  for (const m of f.medidas) for (const a of f.acabamentos) {
    const k = celulaKey(m.id, a.id);
    celulas[k] = f.celulas[k] ?? { ativo: true };
    if (f.glb?.[k]) glb[k] = f.glb[k];
  }
  return { ...f, celulas, glb };
}
export const comNome = (f: FamiliaCfg, nome: string): FamiliaCfg => ({ ...f, nome, id: idDoNome(nome) });
const proximoId = (prefixo: string, ids: readonly string[]): string => { let n = ids.length + 1; while (ids.includes(`${prefixo}${n}`)) n++; return `${prefixo}${n}`; };
export function juntarAcabamento(f: FamiliaCfg): FamiliaCfg {
  const id = proximoId("a", f.acabamentos.map((a) => a.id)), n = f.acabamentos.length + 1;
  return sincronizar({ ...f, acabamentos: [...f.acabamentos, { id, nome: `Acabamento ${n}`, cor: "#b7b9ba", metalness: 0.5, roughness: 0.4, codigo: `A${n}` }] });
}
export const tirarAcabamento = (f: FamiliaCfg, id: string): FamiliaCfg => sincronizar({ ...f, acabamentos: f.acabamentos.filter((a) => a.id !== id) });
export function juntarMedida(f: FamiliaCfg): FamiliaCfg {
  const id = proximoId("m", f.medidas.map((m) => m.id)), n = f.medidas.length + 1;
  return sincronizar({ ...f, medidas: [...f.medidas, { id, rotulo: `Medida ${n}`, ref: `REF-${n}`, dim: [60, 50, 20], preco: 0 }] });
}
export const tirarMedida = (f: FamiliaCfg, id: string): FamiliaCfg => sincronizar({ ...f, medidas: f.medidas.filter((m) => m.id !== id) });

export function criarFamiliaVazia(): FamiliaCfg {
  return juntarMedida(juntarAcabamento({
    id: PREFIXO_CFG, marca: "", nome: "", categoria: "lavaloicas", tipo: "lava_loica", espacos: CATEGORIAS_FAMILIA.find((c) => c.id === "lavaloicas")?.espacos ?? ["cozinha", "outro"],
    acabamentos: [], medidas: [], celulas: {}, regraSku: { modo: "auto", sep: "-" },
  }));
}

/** O exemplo para ver logo algo: Lava-loiça Keran (RODI HOME), 2 acabamentos × 2 medidas, uma combinação inactiva e um preço próprio. */
export function exemploKeran(): FamiliaCfg {
  return {
    id: "cfg:lava-loica-keran", marca: "RODI HOME", nome: "Lava-loiça Keran", categoria: "lavaloicas", tipo: "lava_loica", espacos: ["cozinha", "outro"],
    acabamentos: [
      { id: "inox", nome: "Inox escovado", cor: "#c3c7ca", metalness: 1, roughness: 0.3, codigo: "IX" },
      { id: "gunmetal", nome: "Gun Metal", cor: "#62605e", metalness: 1, roughness: 0.29, codigo: "GM" },
    ],
    medidas: [
      { id: "m80", rotulo: "80 cm", ref: "KER-80", dim: [80, 50, 16], preco: 149 },
      { id: "m100", rotulo: "100 cm (1 cuba e meia)", ref: "KER-100", dim: [100, 50, 16], preco: 189 },
    ],
    celulas: { "m80|inox": { ativo: true }, "m80|gunmetal": { ativo: false }, "m100|inox": { ativo: true }, "m100|gunmetal": { ativo: true, preco: 199 } },
    regraSku: { modo: "auto", sep: "-" },
    glb: { "m80|inox": chaveFicheiro("lava_loica", "keran80", "inox"), "m100|inox": chaveFicheiro("lava_loica", "keran100", "inox") },
  };
}
