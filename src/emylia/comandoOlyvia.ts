// 17/11 (Rúben, ideia WOW): a Olyvia por comando — um botão flutuante que ouve (ou lê) uma frase e salta para o sítio certo:
//  «abre os negócios», «vai ao catálogo», «mostra o inventário», «procura o Nuno Pereira». Protótipo v1: SÓ navegação e pesquisa —
//  nada que mude dados (uma ação irreversível por voz pede sempre confirmação, fica para depois). A compreensão é determinística
//  (palavras-chave), sem modelo nem custo: fiável e instantânea. Só lógica, sem React, para testar à parte.

export interface Destino { url: string; nome: string; palavras: string[] }

/** Os sítios para onde a Olyvia salta. A palavra mais específica ganha (ex.: «catálogo e custos» ganha a «custos»). */
export const DESTINOS: Destino[] = [
  { url: "/negocios", nome: "Negócios", palavras: ["negocios", "negocio", "pipeline", "funil", "o quadro", "quadro dos negocios"] },
  { url: "/negocios?vista=hoje", nome: "Hoje", palavras: ["hoje", "o meu dia", "meu dia", "tarefas de hoje"] },
  { url: "/negocios?vista=operacoes", nome: "Operações", palavras: ["operacoes", "obras em curso", "gestao de obra", "as obras"] },
  { url: "/pessoas", nome: "Pessoas", palavras: ["pessoas", "clientes", "contactos", "contatos", "os leads", "lista de clientes"] },
  { url: "/client-orders", nome: "Inventário", palavras: ["inventario", "stock", "armazem", "encomendas de cliente"] },
  { url: "/equipas-obra", nome: "Equipas de obra", palavras: ["equipas de obra", "equipa de obra", "as equipas", "equipas"] },
  { url: "/catalogo-custos", nome: "Catálogo e custos", palavras: ["catalogo e custos", "catalogo", "custos", "produtos e servicos", "precos"] },
  { url: "/prototipo/estudio", nome: "Estúdio", palavras: ["estudio", "a planta", "o projeto 3d"] },
];

export type Comando =
  | { acao: "navegar"; url: string; nome: string }
  | { acao: "pesquisar"; termo: string }
  | { acao: "nada" };

/** Minúsculas, sem acentos nem pontuação, espaços colapsados. */
export const normal = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** `p` (já normalizado) aparece em `s` como palavra/expressão inteira. */
const temExpressao = (s: string, p: string): boolean => ` ${s} `.includes(` ${p} `);

/** O destino cuja palavra-chave aparece na frase; empate, ganha a mais longa (mais específica). */
export function melhorDestino(s: string): Destino | null {
  let melhor: Destino | null = null, tamanho = 0;
  for (const d of DESTINOS) for (const p of d.palavras) {
    const pn = normal(p);
    if (temExpressao(s, pn) && pn.length > tamanho) { melhor = d; tamanho = pn.length; }
  }
  return melhor;
}

const VERBO_BUSCA = /\b(?:procura[r]?|pesquisa[r]?|encontra[r]?|busca[r]?|localiza[r]?)\b\s+(.+)$/;
const COISA_COM_NOME = /\b(?:o |a |os |as )?(?:negocio|cliente|ficha|pessoa)\s+(?:d[oa]s?\s+|do\s+|da\s+|de\s+)?(.+)$/;
// artigos, preposições e os substantivos «negócio/cliente/ficha/pessoa» no início do termo (ex.: «a cliente Ana» → «Ana»)
const LIXO_INICIO = /^(?:o |a |os |as |um |uma |pel[oa]\s+|d[oa]s?\s+|do\s+|da\s+|de\s+|negocio\s+|cliente\s+|ficha\s+|pessoa\s+)+/;

/** O termo a procurar, se a frase for uma pesquisa («procura o Nuno», «mostra o negócio da Maria»). Senão, null. */
export function extrairBusca(s: string): string | null {
  const m = s.match(VERBO_BUSCA) ?? s.match(COISA_COM_NOME);
  if (!m) return null;
  const termo = m[1].replace(LIXO_INICIO, "").trim();
  // termo curto demais, ou que é afinal um destino («os negócios»): não é uma pesquisa por nome
  if (termo.length < 2 || melhorDestino(termo)) return null;
  return termo;
}

/** A frase dita ou escrita vira um comando. Tira a palavra de ativação «Olyvia» do início, se vier. */
export function interpretarComando(texto: string): Comando {
  const t = normal(texto);
  if (!t) return { acao: "nada" };
  const s = t.replace(/^(?:ok |o |a )?olyvia\s*/, "").trim() || t;
  const busca = extrairBusca(s);
  if (busca) return { acao: "pesquisar", termo: busca };
  const dest = melhorDestino(s);
  if (dest) return { acao: "navegar", url: dest.url, nome: dest.nome };
  return { acao: "nada" };
}
