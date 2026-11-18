// Famílias (configurador): o NÚCLEO PURO. Sem React, sem base, sem rede, sem 3D. A família vive só em memória (nada se persiste).
// Uma família é SEMPRE um agrupamento de produtos que já existem no catálogo: nada se escreve à mão. Os atributos de cada produto vêm estruturados
// (`atributosDoItem`, atributosFamilia.ts) e o utilizador só ESCOLHE os eixos: qual atributo é a cor (bolinhas, com o hex da opção) e quais compõem a medida.
// Cada produto que entra é UMA variante (SKU e preço dele, só leitura). Um produto que não pode ser variante fica em `excluidos` e é um problema.
import type { AtributoDef, Produto } from "../v2/catalogoModelo";
import { precoUnitario } from "../produtosVisita";
import { atributosDoItem, compararMedidas, tipoDaMedida } from "./atributosFamilia";

/* ------------------------------------------------------------------ tipos */
/** Os eixos escolhidos: `cor` = o atributo das bolinhas (um só, ou nenhum); `medida` = os atributos que compõem o seletor de medida, pela ordem escolhida. */
export interface EixosCfg { cor: string | null; medida: string[] }
/** Um produto do catálogo como o configurador o vê: o preço de venda já resolvido (o PVP real, senão custo ÷ (1 − margem-alvo), como o catálogo). */
export interface ProdutoRef {
  id: string; n: string; marca?: string; sku?: string; sub?: string;
  /** o nome da categoria, resolvido por quem chama (a árvore do catálogo não entra aqui) */ categoria?: string;
  /** preço de venda por unidade (€, s/IVA); 0 = sem preço */ preco: number;
  /** o catálogo não tem PVP: o preço foi calculado pelo custo */ semPvp: boolean;
}
/** O mínimo que se lê de um `Produto` do catálogo (v2/catalogoModelo.ts). */
export interface ProdutoDoCatalogo { id: string; n: string; marca?: string; sku?: string; sub?: string; categoria?: string; custo: number; pvp?: number }
/** Um produto escolhido: o preço/SKU (`ref`), os atributos em texto, o hex de cada atributo que o tenha e os atributos cuja medida é um intervalo. */
export interface ItemEixos {
  ref: ProdutoRef;
  atributos: Readonly<Record<string, string>>;
  hex?: Readonly<Record<string, readonly string[]>>;
  intervalos?: readonly string[];
}
/** Uma cor (bolinha): `hex` vem do produto (a cor dupla tem dois); sem hex `semHex` (só quando há atributo de cor). `hexAlternativos`: outros hex do mesmo nome noutros produtos. */
export interface CorCfg { id: string; nome: string; hex: string[]; semHex: boolean; hexAlternativos: string[][] }
/** Uma medida do seletor: o rótulo junta os valores dos atributos de `eixos.medida` («Largura 50 cm · 2 cubas»). */
export interface MedidaCfg { id: string; rotulo: string; valores: Record<string, string> }
/** Uma variante = um produto do catálogo: o SKU e o preço são os dele (só leitura). */
export interface VarianteCfg { produtoId: string; produtoNome: string; sku: string; preco: number; medidaId: string; corId: string }
export type MotivoExclusao = "produto_duplicado" | "sem_valor" | "intervalo" | "repetido";
/** Um produto que ficou de fora das variantes (um produto pode aparecer mais de uma vez, uma por atributo em falta). */
export interface Excluido { produtoId: string; nome: string; motivo: MotivoExclusao; msg: string }
export interface FamiliaCfg {
  id: string; nome: string;
  /** derivada dos produtos: a marca comum, ou «Várias marcas» */ marca: string; marcasVarias: boolean;
  /** derivada dos produtos: a categoria comum, ou «Várias categorias» */ categoria: string;
  eixos: EixosCfg; cores: CorCfg[]; medidas: MedidaCfg[]; variantes: VarianteCfg[]; excluidos: Excluido[];
  /** há medidas 1D e 2D/3D no atributo «Medida» (aviso) */ misturaMedidas: boolean;
}
export type TipoProblema = "nome" | "id" | "sem_variantes" | MotivoExclusao | "sku" | "preco" | "marcas" | "medida_mista" | "cor_sem_hex" | "cor_hex_diferente";
/** `erro` bloqueia (Seguinte/Guardar); `aviso` só informa. */
export interface Problema { tipo: TipoProblema; gravidade: "erro" | "aviso"; msg: string; produtoId?: string }

/* ------------------------------------------------------------------ pequenas ajudas */
export const PREFIXO_FAMILIA = "fam:";
/** O nome do atributo da medida (como o catálogo o chama). */
export const NOME_MEDIDA = "Medida";
const NOME_COR_OMISSAO = "Padrão";
const SEP = "\u0001";
const norm = (s: string): string => s.trim().toLowerCase();
const plano = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const vazio = (v: string | undefined): boolean => !v || !v.trim();
export function slug(texto: string): string {
  return plano(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** A margem-alvo (%) com que o protótipo calcula o preço de um produto sem PVP (o valor de omissão do motor). */
export const ALVO_PROTO = 35;
export function refDoProduto(p: ProdutoDoCatalogo, alvo: number = ALVO_PROTO): ProdutoRef {
  const sku = p.sku?.trim() || p.id, preco = precoUnitario({ custo: p.custo, ...(p.pvp != null ? { pvp: p.pvp } : {}) }, alvo);
  return {
    id: p.id, n: p.n, ...(p.marca ? { marca: p.marca } : {}), sku, ...(p.sub ? { sub: p.sub } : {}), ...(p.categoria ? { categoria: p.categoria } : {}),
    preco: Number.isFinite(preco) && preco > 0 ? preco : 0, semPvp: !(p.pvp != null && p.pvp > 0),
  };
}

/** Um produto do catálogo (estruturado) como item do configurador. `categoria` já resolvida por quem chama. Os avisos do adaptador (hex inválido) não entram aqui: ver `atributosDoItem`. */
export function itemDoCatalogo(
  produto: Pick<Produto, "id" | "n" | "marca" | "sku" | "sub" | "custo" | "pvp" | "attrs">, defs: readonly AtributoDef[] | undefined, opcoes: { alvo?: number; categoria?: string } = {},
): ItemEixos {
  const { atributos, hex, intervalos } = atributosDoItem(produto, defs);
  const ref = refDoProduto({ ...produto, ...(opcoes.categoria ? { categoria: opcoes.categoria } : {}) }, opcoes.alvo);
  return { ref, atributos, hex, intervalos };
}

/* ------------------------------------------------------------------ eixos */
type AtributosLista = readonly Readonly<Record<string, string>>[];
const ORDEM_ATRIBUTOS: readonly string[] = [NOME_MEDIDA, "Cor"];
/** Os nomes dos atributos que os produtos têm (a união): Medida e Cor primeiro, os outros pela ordem em que aparecem. */
export function nomesDosAtributos(lista: AtributosLista): string[] {
  const vistos = new Set<string>();
  for (const a of lista) for (const k of Object.keys(a)) vistos.add(k);
  return [...ORDEM_ATRIBUTOS.filter((k) => vistos.has(k)), ...[...vistos].filter((k) => !ORDEM_ATRIBUTOS.includes(k))];
}
/** A cor das bolinhas («Cor», ou «Acabamento», ou o primeiro atributo cujo nome o diz) e a medida: Medida e os restantes atributos QUE VARIAM entre os produtos. */
export function eixosPorOmissao(lista: AtributosLista): EixosCfg {
  const nomes = nomesDosAtributos(lista);
  const cor = nomes.find((x) => norm(x) === "cor") ?? nomes.find((x) => norm(x) === "acabamento") ?? nomes.find((x) => /cor|acabamento/i.test(x)) ?? null;
  const varia = (x: string) => new Set(lista.map((a) => a[x]?.trim() ?? "")).size > 1;
  return { cor, medida: nomes.filter((x) => x !== cor && (x === NOME_MEDIDA || varia(x))) };
}
/** Os eixos que valem para estes produtos: sem escolha, a omissão; senão a escolha sem os atributos que já não existem, sem repetidos e sem a cor repetida na medida. */
export function eixosValidos(escolha: EixosCfg | null | undefined, lista: AtributosLista): EixosCfg {
  if (!escolha) return eixosPorOmissao(lista);
  const nomes = new Set(nomesDosAtributos(lista)), cor = escolha.cor && nomes.has(escolha.cor) ? escolha.cor : null;
  return { cor, medida: [...new Set(escolha.medida)].filter((x) => nomes.has(x) && x !== cor) };
}

/* ------------------------------------------------------------------ produtos que não podem ser variante */
/** O aviso de um produto sem valor num atributo escolhido. */
export const textoSemValor = (atributo: string): string => `Este produto não tem ${atributo}: corrija no produto do catálogo.`;
const usadosPor = (eixos: EixosCfg): string[] => [...eixos.medida, ...(eixos.cor ? [eixos.cor] : [])];
/** Os produtos sem valor nos atributos escolhidos como eixos (bloqueiam até se corrigir no catálogo ou se excluir o produto). */
export function produtosSemValor(itens: readonly Pick<ItemEixos, "ref" | "atributos">[], eixos: EixosCfg): { produtoId: string; nome: string; atributo: string; msg: string }[] {
  const usados = usadosPor(eixos);
  return itens.flatMap((i) => usados.filter((x) => vazio(i.atributos[x])).map((atributo) => ({ produtoId: i.ref.id, nome: i.ref.n, atributo, msg: `«${i.ref.n}»: ${textoSemValor(atributo)}` })));
}
/** Os produtos cuja medida, num atributo escolhido como eixo, é um intervalo: um intervalo não é um valor único de variante. */
export function produtosEmIntervalo(itens: readonly Pick<ItemEixos, "ref" | "atributos" | "intervalos">[], eixos: EixosCfg): { produtoId: string; nome: string; atributo: string; valor: string; msg: string }[] {
  const usados = usadosPor(eixos);
  return itens.flatMap((i) => usados.filter((x) => i.intervalos?.includes(x)).map((atributo) => {
    const valor = i.atributos[atributo] ?? "";
    return { produtoId: i.ref.id, nome: i.ref.n, atributo, valor, msg: `«${i.ref.n}»: medida em intervalo (${valor}) não é um valor único de variante: corrija no produto do catálogo ou exclua-o da família.` };
  }));
}

/* ------------------------------------------------------------------ marca, categoria e nome derivados */
const comum = (valores: (string | undefined)[], varias: string): { valor: string; varias: boolean } => {
  const todos = [...new Set(valores.map((v) => v?.trim() ?? "").filter(Boolean))];
  return todos.length > 1 ? { valor: varias, varias: true } : { valor: todos[0] ?? "", varias: false };
};
/** A marca da família: a marca comum dos produtos, «Várias marcas» (`varias`) se diferem, ou vazio. */
export function marcaDaFamilia(refs: readonly Pick<ProdutoRef, "marca">[]): { marca: string; varias: boolean } {
  const { valor, varias } = comum(refs.map((r) => r.marca), "Várias marcas");
  return { marca: valor, varias };
}
/** A categoria da família: a comum, «Várias categorias» (`varias`) se diferem, ou vazio. */
export function categoriaDaFamilia(refs: readonly Pick<ProdutoRef, "categoria">[]): { categoria: string; varias: boolean } {
  const { valor, varias } = comum(refs.map((r) => r.categoria), "Várias categorias");
  return { categoria: valor, varias };
}

/** O pedaço depois do último « - » do nome, se parece um acabamento (sem números, até 3 palavras, sem «cuba»). */
function fimDoNome(nome: string): string {
  const partes = nome.split(/\s+[-–—]\s+/), fim = partes.length > 1 ? partes[partes.length - 1].trim() : "";
  return fim && !/\d/.test(fim) && !/cuba/i.test(fim) && fim.split(/\s+/).length <= 3 ? fim : "";
}
/** O nome e a marca sugeridos para a família: o começo comum dos nomes (sem números nem «CUBA» no fim) e a marca mais frequente. */
export function sugerirFamilia(refs: readonly ProdutoRef[]): { nome: string; marca: string } {
  if (refs.length === 0) return { nome: "", marca: "" };
  const marcas = new Map<string, number>();
  for (const r of refs) if (r.marca?.trim()) marcas.set(r.marca.trim(), (marcas.get(r.marca.trim()) ?? 0) + 1);
  const marca = [...marcas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const palavras = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const numerica = /^\d+([.,]\d+)?(cm)?$/i, solta = /^\d+([.,]\d+)?(cm)?$|^cubas?$|^[-–—]$/i;
  const limpar = (p: string[]) => { const q = [...p]; while (q.length && solta.test(q[q.length - 1])) q.pop(); return q; };
  const um = (s: string) => {
    const fim = fimDoNome(s), base = fim ? s.slice(0, s.lastIndexOf(fim)).replace(/\s+[-–—]\s*$/, "") : s;
    return palavras(base).filter((w) => !numerica.test(w)).join(" ");
  };
  if (refs.length === 1) return { nome: um(refs[0].n), marca };
  const todas = refs.map((r) => palavras(r.n)), primeira = todas[0], inicio: string[] = [];
  for (let i = 0; i < primeira.length && todas.every((p) => p[i] !== undefined && plano(p[i]) === plano(primeira[i])); i++) inicio.push(primeira[i]);
  return { nome: limpar(inicio).join(" ") || um(refs[0].n), marca };
}

/* ------------------------------------------------------------------ a família a partir dos produtos e dos eixos */
interface Valido { item: ItemEixos; valores: string[]; cor: string; hex: string[] }
interface Separados { validos: Valido[]; excluidos: Excluido[] }

/** Separa os produtos que podem ser variante dos que ficam de fora (repetido por id, sem valor, em intervalo). */
function separar(itens: readonly ItemEixos[], eixos: EixosCfg): Separados {
  const excluidos: Excluido[] = [], vistos = new Set<string>(), unicos: ItemEixos[] = [];
  for (const i of itens) {
    if (vistos.has(i.ref.id)) { excluidos.push({ produtoId: i.ref.id, nome: i.ref.n, motivo: "produto_duplicado", msg: `O produto «${i.ref.n}» foi escolhido mais de uma vez: conta uma só.` }); continue; }
    vistos.add(i.ref.id);
    unicos.push(i);
  }
  const fora = new Set<string>();
  for (const x of produtosSemValor(unicos, eixos)) { fora.add(x.produtoId); excluidos.push({ produtoId: x.produtoId, nome: x.nome, motivo: "sem_valor", msg: x.msg }); }
  for (const x of produtosEmIntervalo(unicos, eixos)) { fora.add(x.produtoId); excluidos.push({ produtoId: x.produtoId, nome: x.nome, motivo: "intervalo", msg: x.msg }); }
  const validos = unicos.filter((i) => !fora.has(i.ref.id)).map((item): Valido => ({
    item, valores: eixos.medida.map((x) => item.atributos[x].trim()),
    cor: eixos.cor ? item.atributos[eixos.cor].trim() : NOME_COR_OMISSAO, hex: eixos.cor ? [...(item.hex?.[eixos.cor] ?? [])] : [],
  }));
  return { validos, excluidos };
}

const cmpValores = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < a.length; i++) { const c = compararMedidas(a[i], b[i]); if (c !== 0) return c; }
  return 0;
};
const misturaDeMedidas = (validos: readonly Valido[], eixos: EixosCfg): boolean => {
  const k = eixos.medida.indexOf(NOME_MEDIDA);
  if (k < 0) return false;
  const tipos = new Set(validos.map((v) => tipoDaMedida(v.valores[k])));
  return tipos.has("1D") && (tipos.has("2D") || tipos.has("3D"));
};

/** A família a partir dos produtos e dos eixos escolhidos. As medidas ordenam-se pelos valores (`compararMedidas`, por ordem dos eixos), por isso o resultado não depende da
 * ordem dos produtos; as cores ficam pela ordem em que aparecem. `conflitos`: as combinações repetidas (mensagens legíveis); todos os problemas saem de `problemas(familia)`. */
export function familiaPorEixos(nome: string, itens: readonly ItemEixos[], eixos: EixosCfg): { familia: FamiliaCfg; conflitos: string[] } {
  const eixosCopia: EixosCfg = { cor: eixos.cor, medida: [...eixos.medida] };
  const { validos, excluidos } = separar(itens, eixosCopia);
  const medidasPorChave = new Map<string, string[]>(), coresPorChave = new Map<string, CorCfg>(), ocupado = new Map<string, string>(), conflitos: string[] = [];
  const aceites: { v: Valido; mChave: string; cChave: string }[] = [];
  for (const v of validos) {
    const mChave = v.valores.map(norm).join(SEP), cChave = norm(v.cor);
    let cor = coresPorChave.get(cChave);
    if (!cor) { cor = { id: `a${coresPorChave.size + 1}`, nome: v.cor, hex: v.hex, semHex: eixosCopia.cor !== null && v.hex.length === 0, hexAlternativos: [] }; coresPorChave.set(cChave, cor); }
    else if (v.hex.length) {
      if (cor.hex.length === 0) { cor.hex = v.hex; cor.semHex = false; }
      else if (cor.hex.join() !== v.hex.join() && !cor.hexAlternativos.some((h) => h.join() === v.hex.join())) cor.hexAlternativos.push(v.hex);
    }
    const chave = `${mChave}\u0002${cChave}`, dono = ocupado.get(chave);
    if (dono !== undefined) {
      const todos = [...eixosCopia.medida.map((x, i) => `${x}: ${v.valores[i] || "—"}`), `${eixosCopia.cor ?? "Cor"}: ${cor.nome}`].join("; ");
      const msg = `Os produtos «${dono}» e «${v.item.ref.n}» têm os mesmos valores em todos os atributos (${todos}): corrija no produto do catálogo ou exclua um dos produtos.`;
      conflitos.push(msg);
      excluidos.push({ produtoId: v.item.ref.id, nome: v.item.ref.n, motivo: "repetido", msg });
      continue;
    }
    ocupado.set(chave, v.item.ref.n);
    if (!medidasPorChave.has(mChave)) medidasPorChave.set(mChave, v.valores);
    aceites.push({ v, mChave, cChave });
  }
  const ordenadas = [...medidasPorChave.entries()].sort((a, b) => cmpValores(a[1], b[1]));
  const medidas: MedidaCfg[] = ordenadas.map(([, valores], i) => ({ id: `m${i + 1}`, rotulo: valores.join(" · ") || "Única", valores: Object.fromEntries(eixosCopia.medida.map((x, k) => [x, valores[k]])) }));
  const idMedida = new Map(ordenadas.map(([chave], i) => [chave, i] as const)), idCor = new Map([...coresPorChave.keys()].map((c, i) => [c, i] as const));
  const variantes = aceites
    .map(({ v, mChave, cChave }) => ({ mi: idMedida.get(mChave) ?? 0, ci: idCor.get(cChave) ?? 0, v }))
    .sort((a, b) => a.mi - b.mi || a.ci - b.ci)
    .map(({ mi, ci, v }): VarianteCfg => ({ produtoId: v.item.ref.id, produtoNome: v.item.ref.n, sku: v.item.ref.sku?.trim() || v.item.ref.id, preco: v.item.ref.preco > 0 ? v.item.ref.preco : 0, medidaId: medidas[mi].id, corId: `a${ci + 1}` }));
  const refs = validos.map((v) => v.item.ref), marca = marcaDaFamilia(refs), categoria = categoriaDaFamilia(refs), nomeLimpo = nome.trim();
  return {
    familia: {
      id: `${PREFIXO_FAMILIA}${slug(nomeLimpo)}`, nome: nomeLimpo, marca: marca.marca, marcasVarias: marca.varias, categoria: categoria.categoria,
      eixos: eixosCopia, cores: [...coresPorChave.values()], medidas, variantes, excluidos, misturaMedidas: misturaDeMedidas(validos, eixosCopia),
    },
    conflitos,
  };
}

/** Os produtos da família, pela ordem das variantes (para a reabrir com os mesmos produtos). */
export const idsDaFamilia = (f: Pick<FamiliaCfg, "variantes">): string[] => f.variantes.map((v) => v.produtoId);

/* ------------------------------------------------------------------ validação */
const erro = (tipo: TipoProblema, msg: string, produtoId?: string): Problema => ({ tipo, gravidade: "erro", msg, ...(produtoId ? { produtoId } : {}) });
const aviso = (tipo: TipoProblema, msg: string): Problema => ({ tipo, gravidade: "aviso", msg });

function problemasDeVariantes(f: FamiliaCfg): Problema[] {
  const p: Problema[] = [], porSku = new Map<string, string[]>();
  for (const v of f.variantes) {
    porSku.set(v.sku, [...(porSku.get(v.sku) ?? []), v.produtoNome]);
    if (!(v.preco > 0)) p.push(erro("preco", `O produto «${v.produtoNome}» não tem preço de venda.`, v.produtoId));
  }
  for (const [sku, onde] of porSku) if (onde.length > 1) p.push(erro("sku", `O SKU «${sku}» repete-se (${onde.join("; ")}).`));
  return p;
}
function avisosDaFamilia(f: FamiliaCfg): Problema[] {
  const p: Problema[] = [];
  if (f.marcasVarias) p.push(aviso("marcas", "Os produtos são de várias marcas: a família fica com «Várias marcas»."));
  if (f.misturaMedidas) p.push(aviso("medida_mista", "A medida mistura valores de uma dimensão («Largura 70 cm») com valores de largura × comprimento («60×60 cm»): confirme que é isso que se quer."));
  for (const c of f.cores) {
    if (c.semHex) p.push(aviso("cor_sem_hex", `A cor «${c.nome}» não tem cor definida (hex) nos produtos: preencha-a no catálogo.`));
    if (c.hexAlternativos.length) p.push(aviso("cor_hex_diferente", `A cor «${c.nome}» tem hex diferentes em produtos diferentes (fica o do primeiro: ${c.hex.join(", ")}).`));
  }
  return p;
}
/** Os problemas da família: erros (bloqueiam) e avisos. `outrosIds`: os ids das outras famílias da sessão. */
export function problemas(f: FamiliaCfg, outrosIds: readonly string[] = []): Problema[] {
  const p: Problema[] = [];
  if (!f.nome.trim()) p.push(erro("nome", "Não foi possível derivar o nome da família a partir dos produtos escolhidos."));
  else if (!slug(f.nome)) p.push(erro("nome", "O nome da família (derivado dos produtos) precisa de letras ou números."));
  if (outrosIds.includes(f.id)) p.push(erro("id", `Já existe uma família com o identificador «${f.id}»: escolha outros produtos ou remova a família que já existe.`));
  if (f.variantes.length === 0) p.push(erro("sem_variantes", "Junte pelo menos um produto (com valor em todos os atributos escolhidos)."));
  for (const x of f.excluidos) p.push(erro(x.motivo, x.msg, x.produtoId));
  return [...p, ...problemasDeVariantes(f), ...avisosDaFamilia(f)];
}
