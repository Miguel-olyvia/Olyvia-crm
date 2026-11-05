// 5/11 (Rúben: «os serviços já estão associados ao orçamento?» … «sim, liga-os»). O que o Estúdio decidiu (as necessidades que saem das
// plantas: peças, materiais, trabalhos e serviços) entra nas Necessidades do cliente do negócio, e daí no orçamento. O Estúdio usa um
// catálogo de teste: cada linha leva uma «chave» (o que é: uma sanita, um revestimento, retirar, canalização…) e aqui procura-se o par no
// Catálogo verdadeiro pelo nome (e pela cor, nos produtos). O comercial revê antes de juntar. Só regras; o ecrã está em PlantaDivisao.

/** Uma linha do Estúdio, como chega ao negócio. `par`: a peça da planta (junta o produto com a sua instalação). */
export interface LinhaLevada { id: string; n: string; q: number; un: string; tipo: "produto" | "servico"; chave: string; cores?: string[]; par?: string }
export interface ServicoReal { n: string }
export interface ProdutoReal { id: string; n: string; servico?: string }
export type Alvo = { tipo: "servico"; id: string; n: string } | { tipo: "produto"; id: string; n: string };
export interface Ligacao {
  /** As linhas do Estúdio que caem neste alvo (as quantidades somam-se). */
  linhas: LinhaLevada[];
  alvo: Alvo | null;
  q: number;
  /** A instalação vem com o produto real (o produto traz o serviço): não se junta à parte. */
  vemComProduto?: boolean;
}

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O que procurar no nome de um produto do Catálogo, por categoria do Estúdio. */
const PRODUTO: Record<string, RegExp> = {
  sanita: /sanita/, bide: /bide/, base: /base de duche|base duche|base/, banheira: /banheira/, movel: /movel|mobiliario/,
  coluna: /coluna (suspensa|de arrumacao)|movel coluna/, espelho: /espelho/, toalheiro: /toalheiro/,
  coluna_duche: /coluna de duche|coluna termostatica|coluna termo|chuveiro/, resguardo: /resguardo|divisoria|vidro/,
  torneira: /torneira|misturadora/, revestimento: /revestimento|azulejo|parede|ceramic/, pavimento: /pavimento|chao/,
};
/** O que procurar no nome de um serviço do Catálogo, pela chave do Estúdio. */
const SERVICO: Record<string, RegExp> = {
  retirar: /demoli|remoc|retirar|desmont|entulho/, demolicao: /demoli|entulho/, agua: /canaliza|ponto de agua|esgoto/, canalizacao: /canaliza/,
  eletrico: /eletric|tomada|ponto/, revestimento: /revestimento|azulejo/, pavimento: /pavimento/, teto: /teto falso|pladur/, protecoes: /protec/,
  "instalar:sanita": /sanita|louca/, "instalar:bide": /bide|louca/, "instalar:base": /base de duche|base/, "instalar:banheira": /banheira/,
  "instalar:movel": /movel|mobiliario/, "instalar:coluna": /coluna|movel|mobiliario/, "instalar:espelho": /espelho/, "instalar:toalheiro": /toalheiro/,
  pintura: /pintura/, imperm: /impermeab/, nicho: /nicho/, estores: /estore|pintura/, tomada: /tomada|eletric/, aplique: /ilumina|aplique|led/,
  ventilador: /ventila|ventaxia|exaust/, eletrica: /eletric/, reboco: /reboco|regulariza/, rodape: /rodape/, limpeza: /limpeza/,
};
/** As palavras de cada cor no nome de um produto. */
const COR: Record<string, RegExp> = { cinza: /cinz|antracite|grafite|cromad/, preto: /pret|negr|black/, branco: /branc|white/, madeira: /madeira|oak|carvalho|nogueira/, bege: /bege|creme|areia/ };

/** O produto real que melhor serve: o nome da categoria, e (entre esses) o que tem a cor pedida. */
export function produtoPara(chave: string, cores: readonly string[] | undefined, produtos: readonly ProdutoReal[]): ProdutoReal | null {
  const rx = PRODUTO[chave];
  if (!rx) return null;
  const candidatos = produtos.filter((p) => rx.test(limpo(p.n)));
  if (!candidatos.length) return null;
  const comCor = (cores ?? []).map((c) => COR[c]).filter(Boolean);
  return candidatos.find((p) => comCor.some((r) => r.test(limpo(p.n)))) ?? candidatos[0];
}

/** O serviço real com o nome da chave (o primeiro que serve, pela ordem do Catálogo). */
export function servicoPara(chave: string, servicos: Readonly<Record<string, ServicoReal>>): { id: string; n: string } | null {
  const rx = SERVICO[chave];
  if (!rx) return null;
  const achado = Object.entries(servicos).find(([, s]) => rx.test(limpo(s.n)));
  return achado ? { id: achado[0], n: achado[1].n } : null;
}

/**
 * As linhas do Estúdio com o par no Catálogo, juntas por alvo (duas instalações de louças somam-se). A instalação de uma peça cujo produto
 * real já traz o serviço fica marcada (vem com o produto). As que não têm par ficam à parte (alvo null), para o comercial ver.
 */
export function ligarAoCatalogo(linhas: readonly LinhaLevada[], servicos: Readonly<Record<string, ServicoReal>>, produtos: readonly ProdutoReal[]): Ligacao[] {
  const out: Ligacao[] = [];
  const porAlvo = new Map<string, Ligacao>();
  const produtoDaPeca = new Map<string, ProdutoReal>();
  // primeiro os produtos (para saber que instalações já vêm com eles)
  const ordem = [...linhas].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "produto" ? -1 : 1));
  for (const l of ordem) {
    let alvo: Alvo | null = null, vemComProduto = false;
    if (l.tipo === "produto") {
      const p = produtoPara(l.chave, l.cores, produtos);
      if (p) { alvo = { tipo: "produto", id: p.id, n: p.n }; if (l.par && !["coluna_duche", "resguardo", "torneira"].includes(l.chave)) produtoDaPeca.set(l.par, p); }
    } else {
      const doProduto = l.par && l.chave.startsWith("instalar:") ? produtoDaPeca.get(l.par) : undefined;
      if (doProduto?.servico) vemComProduto = true;
      const s = servicoPara(l.chave, servicos);
      if (s) alvo = { tipo: "servico", id: s.id, n: s.n };
    }
    if (!alvo) { out.push({ linhas: [l], alvo: null, q: l.q }); continue; }
    const chave = `${alvo.tipo}:${alvo.id}:${vemComProduto ? "p" : ""}`;
    const ja = porAlvo.get(chave);
    if (ja) { ja.linhas.push(l); ja.q = Math.round((ja.q + l.q) * 100) / 100; continue; }
    const nova: Ligacao = { linhas: [l], alvo, q: l.q, ...(vemComProduto ? { vemComProduto } : {}) };
    porAlvo.set(chave, nova); out.push(nova);
  }
  return out;
}
