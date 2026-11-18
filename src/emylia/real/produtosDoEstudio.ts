// 22/01: o Estúdio com o Catálogo LEVE. O par de cada peça (a sanita, a base de duche, o revestimento…) procura-se pelo nome entre os produtos da organização (ligarEstudio.produtoPara);
// com K.produtos só com os 145 produtos dos consumos, esse par tem de vir do servidor. Aqui:
//  · candidatosDoEstudio: por cada tipo de peça pesquisa a palavra do tipo em cat_pesquisar_produtos (a primeira página, de 50; em cada linha o serviço que o produto traz) e guarda o resultado;
//  · useProdutosDoEstudio: o Catálogo em memória MAIS esses candidatos, para o plano e o orçamento do Estúdio (só para mostrar, nada entra no Catálogo);
//  · trazerProdutosDoEstudio: antes de o Estúdio levar o projeto ao negócio, lê inteiro (cat_ler_produto) o par escolhido de cada peça e mete-o no Catálogo em memória (escolherProdutoDoServidor),
//    com o nó convertido (H1). Depois disso o levarEstudio de sempre encontra-o em K.produtos.
import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../v2/catalogoModelo";
import { lerCatalogo } from "../v2/catalogoStore";
import { ligarAoCatalogo, type LinhaLevada, type ServicoReal } from "../ligarEstudio";
import { SEM_FILTRO_SERVIDOR, lerPesquisaProdutos } from "./produtosPaginados";
import { escolherProdutoDoServidor, produtoDeLinha } from "./pesquisaProdutos";
import { limparAoMudarDeSessao } from "./sessaoCaches";
import { garantirProdutos } from "./garantirProdutos";

/** A palavra que se pesquisa no servidor por cada tipo de peça (as chaves de ligarEstudio.produtoPara; sem acentos, a pesquisa do servidor ignora-os). */
export const PALAVRA_DO_TIPO: Readonly<Record<string, string>> = {
  sanita: "sanita", bide: "bide", base: "base", banheira: "banheira", movel: "movel", coluna: "coluna", espelho: "espelho", toalheiro: "toalheiro",
  coluna_duche: "coluna duche", resguardo: "resguardo", torneira: "torneira", revestimento: "revestimento", pavimento: "pavimento", bancada: "bancada",
  lava: "lava", placa: "placa", forno: "forno", frigorifico: "frigorifico", maquina: "maquina", exaustor: "exaustor", armario: "armario", modulo_cozinha: "modulo",
};

/** A palavra de cada cor do estilo na pesquisa (o servidor também procura nos atributos). */
const PALAVRA_DA_COR: Readonly<Record<string, string>> = { branco: "branco", preto: "preto", cinza: "cinza", madeira: "madeira", bege: "bege" };

type Resultado = { produtos: Produto[] } | { erro: string };
const cache = new Map<string, Promise<Resultado>>();
/** Esquecer o que se pesquisou (a sessão mudou, ou nos testes). */
export const limparCandidatosDoEstudio = (): void => { cache.clear(); };
limparAoMudarDeSessao(limparCandidatosDoEstudio);

/** Os pedidos das linhas de produto que se sabe pesquisar, sem repetir: «tipo» (a pesquisa geral) e, se a linha pede uma cor, «tipo:cor». */
export function pedidosDoEstudio(linhas: readonly LinhaLevada[]): string[] {
  const out = new Set<string>();
  for (const l of linhas) {
    if (l.tipo !== "produto" || !PALAVRA_DO_TIPO[l.chave]) continue;
    out.add(l.chave);
    const cor = l.cores?.find((c) => PALAVRA_DA_COR[c]);
    if (cor) out.add(`${l.chave}:${cor}`);
  }
  return [...out];
}
/** Compatibilidade: os tipos (sem a cor) das linhas. */
export const tiposDeProduto = (linhas: readonly LinhaLevada[]): string[] => [...new Set(pedidosDoEstudio(linhas).map((x) => x.split(":")[0]))];

function candidatosDoPedido(org: string, pedido: string): Promise<Resultado> {
  const k = `${org}|${pedido}`;
  const ja = cache.get(k);
  if (ja) return ja;
  const [tipo, cor] = pedido.split(":");
  const q = cor ? `${PALAVRA_DO_TIPO[tipo]} ${PALAVRA_DA_COR[cor]}` : PALAVRA_DO_TIPO[tipo];
  const falha = (erro: string): Resultado => { cache.delete(k); return { erro: `${tipo}${cor ? ` (${cor})` : ""}: não foi possível pesquisar (${erro})` }; }; // uma falha não fica guardada
  const p: Promise<Resultado> = lerPesquisaProdutos(org, { ...SEM_FILTRO_SERVIDOR, q }, 1).then(
    (r) => (r.ok ? { produtos: r.v.produtos.map(produtoDeLinha) } : falha(r.erro)),
    (e: unknown) => falha(e instanceof Error ? e.message : "falhou a pesquisa"),
  );
  cache.set(k, p);
  return p;
}

async function candidatosDosPedidos(org: string, pedidos: readonly string[]): Promise<{ produtos: Produto[]; erros: string[] }> {
  const rs = await Promise.all(pedidos.map((t) => candidatosDoPedido(org, t)));
  const vistos = new Set<string>(), produtos: Produto[] = [], erros: string[] = [];
  for (const r of rs) {
    if ("erro" in r) { erros.push(r.erro); continue; }
    for (const p of r.produtos) if (!vistos.has(p.id)) { vistos.add(p.id); produtos.push(p); }
  }
  return { produtos, erros };
}

/** Os produtos que o servidor dá para cada tipo de peça das linhas, e os pedidos que falharam (H2: uma falha não é «sem par no Catálogo»). Sem repetidos. */
export const candidatosComErros = (org: string, linhas: readonly LinhaLevada[]): Promise<{ produtos: Produto[]; erros: string[] }> => candidatosDosPedidos(org, pedidosDoEstudio(linhas));
/** Só os produtos (um pedido que falha fica sem candidatos). */
export const candidatosDoEstudio = async (org: string, linhas: readonly LinhaLevada[]): Promise<Produto[]> => (await candidatosComErros(org, linhas)).produtos;

/** O Catálogo em memória e os candidatos do servidor para as linhas. Sem organização (protótipo, Catálogo inteiro) devolve `base` tal como está. */
export function useProdutosDoEstudio(org: string | null, linhas: readonly LinhaLevada[], base: readonly Produto[]): readonly Produto[] {
  const tipos = useMemo(() => pedidosDoEstudio(linhas).sort().join("|"), [linhas]);
  const [extras, setExtras] = useState<{ chave: string; lista: Produto[] }>({ chave: "", lista: [] });
  useEffect(() => {
    if (!org || !tipos) return undefined;
    let vivo = true;
    void candidatosDosPedidos(org, tipos.split("|")).then((r) => { if (vivo) setExtras({ chave: `${org}|${tipos}`, lista: r.produtos }); });
    return () => { vivo = false; };
  }, [org, tipos]);
  // 17/11: o produto exato de cada peça (id do Catálogo verdadeiro) entra no Catálogo em memória (e chega pela `base`)
  const exatos = useMemo(() => linhas.map((l) => l.produtoId ?? "").filter((x) => ID_DO_CATALOGO.test(x)).sort().join(","), [linhas]);
  useEffect(() => { if (org && exatos) void garantirProdutos(exatos.split(","), org).catch(() => []); }, [org, exatos]);
  return useMemo(() => {
    if (!org || !tipos || extras.chave !== `${org}|${tipos}` || !extras.lista.length) return base;
    const tem = new Set(base.map((p) => p.id));
    return [...base, ...extras.lista.filter((p) => !tem.has(p.id))];
  }, [org, tipos, extras, base]);
}

const ID_DO_CATALOGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Antes de levar o projeto do Estúdio ao negócio: lê inteiro o par que cada peça vai ter e mete-o no Catálogo em memória (o que já lá está não se lê outra vez). `erros`: o que não se leu. */
export async function trazerProdutosDoEstudio(org: string, linhas: readonly LinhaLevada[], servicos: Readonly<Record<string, ServicoReal>>): Promise<{ erros: string[] }> {
  // 17/11 (A-Z na Mudelar: os produtos escolhidos eram trocados ao fechar a visita): o produto EXATO de cada peça (LinhaLevada.produtoId, um id do Catálogo
  // verdadeiro) lê-se primeiro; ligarAoCatalogo usa-o tal e qual. Os candidatos da pesquisa ficam para as peças sem id (o catálogo de teste).
  const [{ produtos: candidatos, erros: errosPesquisa }, naoLidos] = await Promise.all([
    candidatosComErros(org, linhas.filter((l) => !ID_DO_CATALOGO.test(l.produtoId ?? ""))),
    garantirProdutos(linhas.map((l) => l.produtoId), org),
  ]);
  const errosExatos = naoLidos.map((id) => `${linhas.find((l) => l.produtoId === id)?.n ?? id}: não foi possível ler o produto escolhido`);
  const emMemoria = lerCatalogo().produtos ?? [];
  const tem = new Set(emMemoria.map((p) => p.id));
  const pares = ligarAoCatalogo(linhas, servicos, [...emMemoria, ...candidatos.filter((p) => !tem.has(p.id))]);
  const ids = [...new Set(pares.flatMap((g) => (g.alvo?.tipo === "produto" && !tem.has(g.alvo.id) ? [g.alvo.id] : [])))];
  const lidos = await Promise.all(ids.map((id) => escolherProdutoDoServidor(org, id)));
  return { erros: [...errosExatos, ...errosPesquisa, ...lidos.flatMap((r, i) => (r.ok ? [] : [`${candidatos.find((p) => p.id === ids[i])?.n ?? ids[i]}: ${r.erro}`]))] };
}
