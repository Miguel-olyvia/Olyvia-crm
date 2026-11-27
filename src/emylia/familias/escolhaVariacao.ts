// 26/11: a lógica pura da vista da família com 3D (sem React): que produto real corresponde à escolha, que valores existem, a passagem ao produto existente mais
// próximo quando a combinação pedida não existe (com o aviso), o endereço (?cor=&textura=) e a apresentação dos nomes. Regra do dono: «se só existem 3, só metes 3»:
// as listas mostram só valores que ALGUM produto da família tem, e nunca se mostra uma combinação que não existe.

/** Um valor de um eixo num produto, com a opção resolvida pela base (cor, foto, nome, ordem). */
export interface ValorVista { valor: string; nome: string; hex: string | null; foto: string | null; sigla: string | null; ordem: number | null; isMetal: boolean }
export interface EixoVista { atributoId: string; code: string; rotulo: string; papel: string; posicao: number; isMeasurement: boolean }
export interface MedidaVista { atributoId: string; valor: unknown; unidade: string | null; texto: string | null }
export interface ProdutoVista {
  id: string; nome: string; sku: string; estado: string;
  /** Só com services.view; sem ele null (a linha do preço não aparece). */
  pvp: number | null;
  /** Só com inventory.view; sem ele null (a linha do stock não aparece). */
  stock: number | null;
  modeloId: string | null; modelo: string | null;
  subcategoriaId: string | null; subcategoria: string | null; categoriaId: string | null; categoria: string | null;
  medida: MedidaVista | null; aplicacao: { valor: string; nome: string } | null;
  valores: Readonly<Record<string, ValorVista>>;
}
export interface OutraMedida { id: string; nome: string; atual: boolean; medida: string | null; medidaValor: unknown; unidade: string | null }
export interface FamiliaVista {
  id: string; nome: string; veValores: boolean; veStock: boolean;
  eixos: readonly EixoVista[]; produtos: readonly ProdutoVista[]; outrasMedidas: readonly OutraMedida[];
}

/** A escolha: o valor (texto da base) escolhido em cada eixo, pelo id do atributo. */
export type Escolha = Readonly<Record<string, string>>;
export interface OpcaoEixo { valor: string; nome: string; hex: string | null; foto: string | null; ordem: number | null }
export interface MudancaAviso { rotulo: string; para: string }
/**
 * Um valor que não existe com o resto da escolha: o que se tocou (`escolhido`, null quando nada se manteve) e o que o ecrã mudou. Os nomes já vêm para mostrar.
 * `soExiste`: verdade só quando o valor tocado existe EXCLUSIVAMENTE com o valor para que se mudou (um único eixo mudou e todos os produtos com o valor tocado coincidem nele);
 * só então se pode dizer «só existe em».
 */
export interface AvisoTroca { escolhido: string | null; soExiste: boolean; mudancas: readonly MudancaAviso[] }
export interface ResultadoEscolha { escolha: Escolha; aviso: AvisoTroca | null }
export type TipoEixo = "medida" | "cor" | "botoes";

const valorDe = (p: ProdutoVista, atributo: string): string => p.valores[atributo]?.valor ?? "";
const porPosicao = (a: EixoVista, b: EixoVista) => a.posicao - b.posicao || a.atributoId.localeCompare(b.atributoId);

/** Os valores que ALGUM produto da família tem neste eixo (nunca a lista completa do grupo), sem repetir, pela ordem das opções e depois pelo nome. */
export function opcoesDoEixo(produtos: readonly ProdutoVista[], atributoId: string): OpcaoEixo[] {
  const vistos = new Map<string, OpcaoEixo>();
  for (const p of produtos) {
    const v = p.valores[atributoId];
    if (v && v.valor && !vistos.has(v.valor)) vistos.set(v.valor, { valor: v.valor, nome: v.nome || v.valor, hex: v.hex, foto: v.foto, ordem: v.ordem });
  }
  return [...vistos.values()].sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.nome.localeCompare(b.nome, "pt") || a.valor.localeCompare(b.valor));
}

/** Os eixos em que se escolhe, pela posição: a medida só entra se variar dentro da família (na base é constante: muda-se de medida mudando de família). */
export function eixosEscolhiveis(eixos: readonly EixoVista[], produtos: readonly ProdutoVista[]): EixoVista[] {
  return [...eixos].sort(porPosicao).filter((e) => !e.isMeasurement || opcoesDoEixo(produtos, e.atributoId).length > 1);
}

/** Medida: o atributo com is_measurement (e não o papel, que engana); bolinhas: um eixo cujas opções têm cor (hex); botões: os outros. */
export function tipoDoEixo(eixo: EixoVista, produtos: readonly ProdutoVista[]): TipoEixo {
  if (eixo.isMeasurement) return "medida";
  return opcoesDoEixo(produtos, eixo.atributoId).some((o) => !!o.hex) ? "cor" : "botoes";
}

/** O produto real da combinação (todos os eixos pedidos têm de coincidir); null quando não existe. */
export function produtoDaEscolha(produtos: readonly ProdutoVista[], escolha: Escolha): ProdutoVista | null {
  const chaves = Object.keys(escolha);
  return produtos.find((p) => chaves.every((k) => valorDe(p, k) === escolha[k])) ?? null;
}

export function escolhaDoProduto(p: ProdutoVista, eixos: readonly EixoVista[]): Escolha {
  return Object.fromEntries(eixos.map((e) => [e.atributoId, valorDe(p, e.atributoId)]));
}

/** A primeira letra maiúscula e o resto minúsculas (a base não muda). Nas cores sempre; nos outros eixos só no que vem todo em maiúsculas e com mais de 3 letras (siglas ficam). */
export function nomeParaMostrar(nome: string, eCor: boolean): string {
  const n = nome.trim();
  if (!n) return n;
  const todoMaiusculas = n === n.toUpperCase() && n !== n.toLowerCase();
  if (!eCor && !(todoMaiusculas && n.length > 3)) return n;
  // uma cor dupla («BRANCO/PRETO») leva a maiúscula em cada parte
  return n.toLowerCase().split("/").map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1)).join("/");
}

/**
 * O produto existente mais próximo da escolha desejada (`desejada` pode ter só alguns eixos). Entre os candidatos (com o eixo `fixo` no valor pedido, se há):
 * 1) mais valores iguais; 2) em empate muda primeiro o eixo de posição mais alta (o último da lista), ou seja, mantém-se o de posição mais baixa;
 * 3) escolhe-se o primeiro valor na ordem das opções; 4) o primeiro produto da lista.
 */
function maisProximo(produtos: readonly ProdutoVista[], eixos: readonly EixoVista[], desejada: Escolha, fixo?: string): ProdutoVista | null {
  const candidatos = fixo === undefined ? [...produtos] : produtos.filter((p) => valorDe(p, fixo) === desejada[fixo]);
  if (candidatos.length === 0) return null;
  const posicaoDe = new Map(eixos.map((e) => [e.atributoId, new Map(opcoesDoEixo(produtos, e.atributoId).map((o, i) => [o.valor, i] as const))]));
  const chave = (p: ProdutoVista): number[] => {
    const falha = eixos.map((e) => (desejada[e.atributoId] === undefined || valorDe(p, e.atributoId) === desejada[e.atributoId] ? 0 : 1));
    const ordem = eixos.map((e) => posicaoDe.get(e.atributoId)?.get(valorDe(p, e.atributoId)) ?? Number.MAX_SAFE_INTEGER);
    return [falha.reduce((s, x) => s + x, 0), ...falha, ...ordem];
  };
  let melhor = candidatos[0]!, chaveMelhor = chave(melhor);
  for (const p of candidatos.slice(1)) {
    const c = chave(p);
    const i = c.findIndex((x, k) => x !== chaveMelhor[k]);
    if (i >= 0 && c[i]! < chaveMelhor[i]!) { melhor = p; chaveMelhor = c; }
  }
  return melhor;
}

/** O nome (para mostrar) do valor de um eixo num produto. */
function nomeNoProduto(p: ProdutoVista, e: EixoVista, produtos: readonly ProdutoVista[]): string {
  const v = p.valores[e.atributoId];
  return nomeParaMostrar(v?.nome || v?.valor || "", tipoDoEixo(e, produtos) === "cor");
}

/**
 * Os eixos desejados em que o produto escolhido difere, e o aviso. `tocado` (se há) é o eixo que a pessoa acabou de tocar; senão o primeiro eixo desejado que ficou.
 * `semNome`: o pedido traz valores que a família não tem (vêm do endereço), por isso não há um valor «tocado» de que falar: a frase é só «esta escolha não existe aqui».
 */
function avisoDe(produto: ProdutoVista, eixos: readonly EixoVista[], produtos: readonly ProdutoVista[], desejada: Escolha, tocado?: string, semNome = false): AvisoTroca | null {
  const pedidos = eixos.filter((e) => desejada[e.atributoId] !== undefined);
  const mudados = pedidos.filter((e) => valorDe(produto, e.atributoId) !== desejada[e.atributoId]);
  if (mudados.length === 0) return null;
  const ficou = semNome ? undefined : tocado !== undefined ? eixos.find((e) => e.atributoId === tocado) : pedidos.find((e) => !mudados.includes(e));
  const unico = mudados.length === 1 ? mudados[0]! : null;
  const soExiste = !!ficou && !!unico && produtos.filter((p) => valorDe(p, ficou.atributoId) === desejada[ficou.atributoId]).every((p) => valorDe(p, unico.atributoId) === valorDe(produto, unico.atributoId));
  return {
    escolhido: ficou ? nomeNoProduto(produto, ficou, produtos) : null,
    soExiste,
    mudancas: mudados.map((e) => ({ rotulo: e.rotulo, para: nomeNoProduto(produto, e, produtos) })),
  };
}

/** A escolha por omissão: o primeiro valor de cada eixo (pela ordem das opções); se essa combinação não existe, o produto existente mais próximo. */
export function escolhaPorOmissao(produtos: readonly ProdutoVista[], eixos: readonly EixoVista[]): Escolha {
  const p = maisProximo(produtos, eixos, {});
  return p ? escolhaDoProduto(p, eixos) : {};
}

/**
 * Escolher `valor` no eixo `atributoId`: o eixo tocado fica; se a combinação com as outras escolhas existe, só ele muda; senão passa-se ao produto existente mais
 * próximo (regra em `maisProximo`) e devolve-se o aviso com tudo o que mudou. Nunca devolve uma combinação que não existe.
 */
export function escolherValor(produtos: readonly ProdutoVista[], eixos: readonly EixoVista[], escolha: Escolha, atributoId: string, valor: string): ResultadoEscolha {
  const desejada = { ...escolha, [atributoId]: valor };
  const p = maisProximo(produtos, eixos, desejada, atributoId);
  if (!p) return { escolha, aviso: null };
  return { escolha: escolhaDoProduto(p, eixos), aviso: avisoDe(p, eixos, produtos, desejada, atributoId) };
}

/**
 * A escolha ao abrir a página: o que o endereço pede e, onde nada se pede, a omissão. Ao mudar de medida a cor e a textura vêm no endereço: se a combinação não existe na
 * medida nova, ou se um valor pedido nem existe nela, aplica-se a mesma regra (o produto existente mais próximo) e avisa. Só se ignoram, sem aviso, os parâmetros de eixos
 * que a família não tem.
 */
export function escolhaInicial(produtos: readonly ProdutoVista[], eixos: readonly EixoVista[], pedido: Escolha): ResultadoEscolha {
  const pedidos = Object.fromEntries(eixos.flatMap((e) => (pedido[e.atributoId] !== undefined ? [[e.atributoId, pedido[e.atributoId]!] as const] : [])));
  const ausente = eixos.some((e) => pedidos[e.atributoId] !== undefined && !opcoesDoEixo(produtos, e.atributoId).some((o) => o.valor === pedidos[e.atributoId]));
  const p = maisProximo(produtos, eixos, pedidos);
  if (!p) return { escolha: {}, aviso: null };
  return { escolha: escolhaDoProduto(p, eixos), aviso: avisoDe(p, eixos, produtos, pedidos, undefined, ausente) };
}

/** O estado da navegação das ligações de medida: a página seguinte sabe que veio de uma mudança de medida e põe o foco no título (a ligação desapareceu com a página). */
export const ESTADO_MUDOU_DE_MEDIDA = { focarTitulo: true } as const;
export const veioDeMudancaDeMedida = (estado: unknown): boolean => typeof estado === "object" && estado !== null && (estado as { focarTitulo?: unknown }).focarTitulo === true;

/** O nome do parâmetro do endereço de um eixo: o código dele (cor, textura…). */
const parametroDe = (e: EixoVista): string => e.code.toLowerCase();

/** A escolha como parâmetros do endereço (?cor=…&textura=…): um por eixo de escolha. */
export function parametrosDaEscolha(escolha: Escolha, eixos: readonly EixoVista[]): URLSearchParams {
  const p = new URLSearchParams();
  for (const e of eixos) if (escolha[e.atributoId]) p.set(parametroDe(e), escolha[e.atributoId]!);
  return p;
}

/** Os parâmetros do endereço como escolha pedida: só os eixos da família; os parâmetros desconhecidos ignoram-se. */
export function pedidoDosParametros(params: URLSearchParams, eixos: readonly EixoVista[]): Escolha {
  return Object.fromEntries(eixos.flatMap((e) => { const v = params.get(parametroDe(e)); return v ? [[e.atributoId, v] as const] : []; }));
}

type Traduzir = (chave: string, vars?: Record<string, string | number>) => string;

/** A frase do aviso, nos textos da tradução: «Cinza só existe em Mate: mudamos para Mate.» */
export function fraseDoAviso(aviso: AvisoTroca, t: Traduzir): string {
  const { escolhido, soExiste, mudancas } = aviso;
  if (escolhido && soExiste && mudancas.length === 1) return t("catFamiliaVer.aviso.um", { nome: escolhido, novo: mudancas[0]!.para });
  const partes = mudancas.map((m) => t("catFamiliaVer.aviso.mudanca", { rotulo: m.rotulo, para: m.para }));
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")}${t("catFamiliaVer.aviso.e")}${partes[partes.length - 1]}` : partes.join("");
  return escolhido ? t("catFamiliaVer.aviso.varios", { nome: escolhido, mudancas: lista }) : t("catFamiliaVer.aviso.semNome", { mudancas: lista });
}
