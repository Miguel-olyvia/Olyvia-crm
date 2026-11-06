// 5/11 (Rúben: «os serviços já estão associados ao orçamento?» … «sim, liga-os»). O que o Estúdio decidiu (as necessidades que saem das
// plantas: peças, materiais, trabalhos e serviços) entra nas Necessidades do cliente do negócio, e daí no orçamento. O Estúdio usa um
// catálogo de teste: cada linha leva uma «chave» (o que é: uma sanita, um revestimento, retirar, canalização…) e aqui procura-se o par no
// Catálogo verdadeiro pelo nome (e pela cor, nos produtos). O comercial revê antes de juntar. Só regras; o ecrã está em PlantaDivisao.

/** Uma linha do Estúdio, como chega ao negócio. `par`: a peça da planta (junta o produto com a sua instalação). */
export interface LinhaLevada { id: string; n: string; q: number; un: string; tipo: "produto" | "servico"; chave: string; cores?: string[]; par?: string }
export interface ServicoReal { n: string; un?: string }
export interface ProdutoReal { id: string; n: string; servico?: string }
export type Alvo = { tipo: "servico"; id: string; n: string } | { tipo: "produto"; id: string; n: string };
export interface Ligacao {
  /** As linhas do Estúdio que caem neste alvo (as quantidades somam-se). */
  linhas: LinhaLevada[];
  alvo: Alvo | null;
  q: number;
  /** A instalação vem com o produto real (o produto traz o serviço): não se junta à parte. */
  vemComProduto?: boolean;
  /** A unidade do serviço do Catálogo não é a da linha do Estúdio (ex.: un e m²): o comercial confirma a quantidade. */
  unDiferente?: string;
  /** 6/11: linhas que caem no mesmo serviço noutra unidade (retirar a banheira, em un, dentro da demolição em m²): ficam incluídas. */
  incluidas?: LinhaLevada[];
}

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O que procurar no nome de um produto do Catálogo, por categoria do Estúdio. */
const PRODUTO: Record<string, RegExp> = {
  sanita: /sanita/, bide: /bide/, base: /base de duche|base duche|base/, banheira: /banheira/, movel: /movel|mobiliario/,
  coluna: /coluna (suspensa|de arrumacao)|movel coluna/, espelho: /espelho/, toalheiro: /toalheiro/,
  coluna_duche: /coluna de duche|coluna termostatica|coluna termo|chuveiro/, resguardo: /resguardo|divisoria|vidro/,
  torneira: /torneira|misturadora/, revestimento: /revestimento|azulejo|parede|ceramic/, pavimento: /pavimento|piso|ladrilho|ceramic/,
  bancada: /bancada|tampo/, lava: /lava.?loica|cuba/, placa: /placa|fogao|vitroceram|inducao/, forno: /forno/, frigorifico: /frigorif|combinado/,
  maquina: /maquina.*loica/, exaustor: /exaust|chamine/, armario: /armario|modulo alto|coluna de cozinha/,
};
/** A palavra com que o nome de um bom par começa (ganha aos que só a têm no meio: «Móvel…» antes de «Toalheiro de móvel»). */
const COMECA: Record<string, RegExp> = {
  sanita: /^sanita/, bide: /^bide/, base: /^base/, banheira: /^banheira/, movel: /^(movel|mobiliario)/, coluna: /^(coluna|movel coluna)/, espelho: /^espelho/,
  toalheiro: /^toalheiro/, coluna_duche: /^coluna/, resguardo: /^(resguardo|divisoria)/, torneira: /^(torneira|misturadora)/, revestimento: /^(revestimento|azulejo)/,
  pavimento: /^(pavimento|piso|ladrilho)/,
  bancada: /^(bancada|tampo)/, lava: /^(lava|cuba)/, placa: /^(placa|fogao)/, forno: /^forno/, frigorifico: /^frigorif/, maquina: /^maquina/, exaustor: /^(exaust|chamine)/, armario: /^armario/,
};
/** Nomes que são de outra coisa, mesmo tendo a palavra (o toalheiro «de móvel», a sanita «de chão»). */
const EXCLUI: Record<string, RegExp> = {
  movel: /toalheiro|espelho|torneira|puxador/, coluna: /toalheiro|duche|chuveiro/, base: /sanita|espelho|movel|torneira|lavatorio/,
  pavimento: /sanita|banheira|base|revestimento de parede/, revestimento: /sanita|banheira|base/, espelho: /movel coluna/, sanita: /tampo|tampa |acessorio/,
  lava: /maquina/, placa: /exaustor/, bancada: /lava|placa/,
};
/** O que procurar no nome de um serviço do Catálogo, pela chave do Estúdio. */
const SERVICO: Record<string, RegExp> = {
  retirar: /demoli|remoc|retirar|desmont|entulho/, demolicao: /demoli|entulho/, agua: /canaliza|ponto de agua|esgoto/, canalizacao: /canaliza/,
  eletrico: /eletric|tomada|ponto/, revestimento: /revestimento|azulejo/, pavimento: /pavimento/, teto: /teto falso|pladur/, protecoes: /protec/,
  "instalar:sanita": /sanita|louca/, "instalar:bide": /bide|louca/, "instalar:base": /base de duche|base/, "instalar:banheira": /banheira/,
  "instalar:movel": /movel|mobiliario/, "instalar:coluna": /coluna|movel|mobiliario/, "instalar:espelho": /espelho/, "instalar:toalheiro": /toalheiro/,
  pintura: /pintura/, imperm: /impermeab/, nicho: /nicho/, estores: /estore|pintura/, tomada: /tomada|eletric/, aplique: /ilumina|aplique|led/,
  ventilador: /ventila|ventaxia|exaust/, eletrica: /eletric/, reboco: /reboco|regulariza/, rodape: /rodape/, limpeza: /limpeza/,
  // 6/11: a cozinha
  "instalar:bancada": /montagem.*cozinha|moveis de cozinha|cozinha/, "instalar:armario": /montagem.*cozinha|moveis de cozinha|cozinha/,
  "instalar:lava": /lava.?loica|canaliza/, "instalar:placa": /placa|eletrodomest/, "instalar:forno": /forno|eletrodomest/,
  "instalar:frigorifico": /frigorif|eletrodomest/, "instalar:maquina": /maquina|eletrodomest/, "instalar:exaustor": /exaust/,
  montagem_cozinha: /montagem.*cozinha|moveis de cozinha|cozinha/, recortes: /recorte|furo|corte/, conduta: /conduta|exaust/,
};
/** As palavras de cada cor no nome de um produto. */
const COR: Record<string, RegExp> = { cinza: /cinz|antracite|grafite|cromad/, preto: /pret|negr|black/, branco: /branc|white/, madeira: /madeira|oak|carvalho|nogueira/, bege: /bege|creme|areia/ };

/** O produto real que melhor serve: o nome da categoria, e (entre esses) o que tem a cor pedida. */
export function produtoPara(chave: string, cores: readonly string[] | undefined, produtos: readonly ProdutoReal[]): ProdutoReal | null {
  const rx = PRODUTO[chave];
  if (!rx) return null;
  const fora = EXCLUI[chave], comeca = COMECA[chave];
  const comCor = (cores ?? []).map((c) => COR[c]).filter(Boolean);
  const nota = (p: ProdutoReal) => { const n = limpo(p.n).trim(); return (comeca?.test(n) ? 4 : 0) + (comCor.some((r) => r.test(n)) ? 2 : 0); };
  const candidatos = produtos.filter((p) => { const n = limpo(p.n); return rx.test(n) && !fora?.test(n); });
  if (!candidatos.length) return null;
  // o melhor: começa pela palavra e tem a cor; entre iguais, a ordem do Catálogo
  return candidatos.reduce((m, p) => (nota(p) > nota(m) ? p : m), candidatos[0]);
}

/** O serviço real com o nome da chave (o primeiro que serve, pela ordem do Catálogo). */
export function servicoPara(chave: string, servicos: Readonly<Record<string, ServicoReal>>): { id: string; n: string; un?: string } | null {
  // retirar uma peça: primeiro um serviço dessa peça («Remoção de banheira»), depois o geral (demolição)
  const m = chave.match(/^retirar:(.+)$/);
  if (m) {
    const peca = ({ banheira: "banheira", base: "base", sanita: "sanita|louca", bide: "bide|louca", movel: "movel|mobiliario", espelho: "espelho", toalheiro: "toalheiro", coluna: "coluna|movel", bancada: "bancada|cozinha|movel", armario: "armario|cozinha|movel", lava: "lava|cuba" } as Record<string, string>)[m[1]] ?? m[1];
    const rx = new RegExp(`(remoc|retir|desmont|levant).*(${peca})|(${peca}).*(remoc|retir|desmont)`);
    const achado = Object.entries(servicos).find(([, s]) => rx.test(limpo(s.n)));
    if (achado) return { id: achado[0], n: achado[1].n, un: achado[1].un };
    return servicoPara("retirar", servicos);
  }
  const rx = SERVICO[chave];
  if (!rx) return null;
  const achado = Object.entries(servicos).find(([, s]) => rx.test(limpo(s.n)));
  return achado ? { id: achado[0], n: achado[1].n, un: achado[1].un } : null;
}

/** A mesma unidade, com as maneiras de a escrever (m2 e m², un e pç e pt…). */
const unidade = (u: string | undefined) => {
  const t = limpo(u ?? "").replace(/\s|\./g, "");
  if (/^m2|^m²/.test(t)) return "m2";
  if (/^(ml|m)$/.test(t)) return "m";
  if (/^(un|unid|unidade|pc|pç|pt|ponto|peca|mod|modulo|vg)$/.test(t)) return "un";
  return t;
};

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
    let alvo: Alvo | null = null, vemComProduto = false, unDiferente: string | undefined;
    if (l.tipo === "produto") {
      const p = produtoPara(l.chave, l.cores, produtos);
      if (p) { alvo = { tipo: "produto", id: p.id, n: p.n }; if (l.par && !["coluna_duche", "resguardo", "torneira"].includes(l.chave)) produtoDaPeca.set(l.par, p); }
    } else {
      const doProduto = l.par && l.chave.startsWith("instalar:") ? produtoDaPeca.get(l.par) : undefined;
      if (doProduto?.servico) vemComProduto = true;
      const s = servicoPara(l.chave, servicos);
      if (s) { alvo = { tipo: "servico", id: s.id, n: s.n }; if (s.un && unidade(s.un) !== unidade(l.un)) unDiferente = s.un; }
    }
    if (!alvo) { out.push({ linhas: [l], alvo: null, q: l.q }); continue; }
    // só se somam linhas com a mesma unidade (retirar uma banheira, em un, não se soma à demolição em m²)
    const chave = `${alvo.tipo}:${alvo.id}:${vemComProduto ? "p" : ""}:${unidade(l.un)}`;
    const ja = porAlvo.get(chave);
    if (ja) { ja.linhas.push(l); ja.q = Math.round((ja.q + l.q) * 100) / 100; continue; }
    const nova: Ligacao = { linhas: [l], alvo, q: l.q, ...(vemComProduto ? { vemComProduto } : {}), ...(unDiferente ? { unDiferente } : {}) };
    porAlvo.set(chave, nova); out.push(nova);
  }
  // 6/11 (o teste no testarh: «Demolição e entulho · 3 un» e «· 27,53 m²»): o mesmo serviço só entra uma vez nas necessidades. Fica a
  // linha na unidade do Catálogo (ou a primeira); as outras ficam incluídas nela, sem somar quantidades de unidades diferentes.
  const final: Ligacao[] = [];
  for (const g of out) {
    if (g.alvo?.tipo !== "servico" || g.vemComProduto) { final.push(g); continue; }
    const irmas = out.filter((x) => x !== g && x.alvo?.tipo === "servico" && x.alvo.id === g.alvo!.id && !x.vemComProduto);
    if (!irmas.length) { final.push(g); continue; }
    const grupo = [g, ...irmas];
    const principal = grupo.find((x) => !x.unDiferente) ?? grupo[0];
    if (g !== principal) continue;
    final.push({ ...principal, incluidas: grupo.filter((x) => x !== principal).flatMap((x) => x.linhas) });
  }
  return final;
}
