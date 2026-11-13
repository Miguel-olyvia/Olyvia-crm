// 12/11 (Rúben: «é possível termos a transcrição a acontecer em tempo real durante a entrevista e, se o cliente disser que quer tudo preto,
// o Estúdio, no passo dos estilos, já sugere tudo a preto e combinações boas para preto?»). O que o cliente diz das cores, lido das falas
// da conversa (a chamada e a visita) enquanto ela decorre: as provisórias chegam em segundos, por isso o Estúdio reage logo.
// Só lógica, sem React. Lê-se frase a frase:
//  · a cor dita, e a peça de que se fala perto dela («o móvel em madeira»; «tudo preto» é para tudo);
//  · «não quero nada preto», «sem branco» → a evitar;
//  · só o que se quer: frases com vontade («quero», «gostava», «prefiro», «tudo», «põe»…) ou ditadas («Sanita preta.»), diga-as quem
//    disser (na visita o comercial repete a escolha em voz alta). Uma pergunta («Quer tudo preto?») só conta com um sim a seguir.
// O que se disse por último ganha (o cliente muda de ideias a meio da conversa).
import type { Fala } from "@/emylia/chamadaMotor";
import { CORES, melhorPara, type Categoria, type Cor, type Estilo } from "./catalogoFake";

/** Uma coisa dita sobre cores, com a frase e quando (para mostrar «o cliente disse…»). */
export interface DitoEstilo {
  cor: Cor;
  /** As peças de que se falava (vazio: é para tudo). */
  cats: Categoria[];
  evitar: boolean;
  /** «tudo preto», «todo em branco»: a cor principal. */
  tudo: boolean;
  frase: string;
  inicio: number;
  origem: "chamada" | "visita";
}

export interface EstiloOuvido { estilo: Estilo; evitar: Cor[]; ditos: DitoEstilo[] }

const COR_PALAVRA: [RegExp, Cor][] = [
  [/^(pret[oa]s?|negr[oa]s?|black)$/, "preto"],
  [/^(branc[oa]s?|white)$/, "branco"],
  [/^(cinzas?|cinzent[oa]s?|antracite|grafite|cromad[oa]s?|inox)$/, "cinza"],
  [/^(madeiras?|carvalho|nogueira|pinho|faia|oak)$/, "madeira"],
  [/^(bege|beges|creme|marfim|dourad[oa]s?)$/, "bege"],
];
export const corDe = (w: string): Cor | null => COR_PALAVRA.find(([rx]) => rx.test(w))?.[1] ?? null;

const PECA_PALAVRA: [RegExp, Categoria[]][] = [
  [/^(m[oó]veis|m[oó]vel|gavetas?|gaveteiros?)$/, ["movel"]],
  [/^arm[aá]rios?$/, ["movel", "armario"]],
  [/^(sanitas?|retretes?)$/, ["sanita"]],
  [/^loi[cç]as?$/, ["sanita", "bide", "banheira"]],
  [/^bid[eé]s?$/, ["bide"]],
  [/^(torneiras?|misturadoras?|monocomandos?)$/, ["torneira"]],
  [/^metais$/, ["torneira", "coluna_duche", "toalheiro"]],
  [/^(bases?|duches?)$/, ["base"]],
  [/^(chuveiros?|colunas?)$/, ["coluna_duche"]],
  [/^(resguardos?|vidros?|perfis|perfil|box)$/, ["resguardo"]],
  [/^banheiras?$/, ["banheira"]],
  [/^(azulejos?|paredes?|revestimentos?|mosaicos?)$/, ["revestimento"]],
  [/^(ch[aã]o|pavimentos?|pisos?|soalhos?)$/, ["pavimento"]],
  [/^espelhos?$/, ["espelho"]],
  [/^toalheiros?$/, ["toalheiro"]],
  [/^(bancadas?|tampos?)$/, ["bancada"]],
  [/^lava(-loi[cç]a)?$/, ["lava"]],
  [/^(placas?|fog[aã]o)$/, ["placa"]],
  [/^fornos?$/, ["forno"]],
  [/^(frigor[ií]ficos?|frigos?)$/, ["frigorifico"]],
  [/^exaustor(es)?$/, ["exaustor"]],
  [/^eletrodom[eé]sticos?$/, ["placa", "forno", "frigorifico", "maquina", "exaustor"]],
];
const pecasDe = (w: string): Categoria[] | null => PECA_PALAVRA.find(([rx]) => rx.test(w))?.[1] ?? null;

const TUDO = /^(tudo|tod[oa]s?|tudinho|total|inteir[oa])$/;
export const NEGA = /^(n[aã]o|nada|nunca|sem|detesto|odeio|evitar|evito|evitava|menos)$/;
export const VONTADE = /\b(quer(o|ia|emos|[ií]amos)?|gosta(va|ria|mos)?|gosto|prefir(o|a|am)|prefer(e|em|ia|imos|[ií]amos|ência)|adoro|adoramos|apetece|sonho|tudo|tod[oa]s?|pode ser|a ideia|pensei|pens[aá]mos|imagino|escolh(o|i|emos)|vamos|fica(r|va)?|seja|p[oô]r|p[oõ]e|ponha|pomos|mete|meter|leva|levar|trocar|troca)\b/;
const NAO_SEI = /^(sei|tenho|sabemos)$/;
// 13/11: os conectores e artigos/possessivos que ligam as peças de uma lista («a sanita e a banheira», «sanita, bidé e banheira»).
// Servem para a cor no fim da lista se distribuir por todas, parando na 1.ª palavra de conteúdo (um verbo, outra cor já tratada…).
const LIGA = /^(e|ou|com|a|o|as|os|à|ao|aos|às|um|uma|uns|umas|minha|meu|minhas|meus|nossa|nosso|nossas|nossos|sua|seu|suas|seus|da|do|das|dos|de|em|no|na|nos|nas|and|the)$/;
export const SIM = /^\s*(sim|isso|exato|exatamente|claro|pode ser|perfeito|é isso|gosto|adoro|era isso|tal e qual|sem dúvida)\b/i;

export const palavras = (t: string) => [...t.toLowerCase().matchAll(/[\p{L}\d-]+/gu)].map((m) => m[0]);

/** Uma escolha ditada sem verbo («Sanita preta, torneiras pretas.»): frase curta com peça e cor, sem descrever o que há («está», «é»). */
const DESCREVE = /^(est[aá]|est[aã]o|é|s[aã]o|era|eram|tem|t[eê]m|tinha|ficou|temos|tenho|h[aá]|existe|existem|vendemos|trabalhamos|costuma|costumam)$/;
function ditado(frase: string): boolean {
  const ws = palavras(frase);
  return ws.length <= 8 && ws.some((w) => pecasDe(w)) && ws.some((w) => corDe(w)) && !ws.some((w) => DESCREVE.test(w));
}

/** As coisas ditas sobre cores numa conversa (por ordem). */
export function ditosDaConversa(falas: readonly Fala[], origem: DitoEstilo["origem"]): DitoEstilo[] {
  const out: DitoEstilo[] = [];
  falas.forEach((f, i) => {
    const prox = falas[i + 1];
    // 12/11 (Rúben, na visita: «estou a dizer que quero uma sanita preta mas o Estúdio não se adapta»): conta quem quer que fale. Na
    // visita, quem segura o telemóvel é o comercial (e o modelo marca-o «comercial»), e é muitas vezes ele que diz a escolha em voz alta
    // («então fica a sanita preta»). Uma pergunta («Quer tudo preto?») só conta com um sim logo a seguir.
    const sim = !!prox && SIM.test(prox.texto);
    for (const frase of f.texto.split(/(?<=[.!?;])\s+/)) {
      const pergunta = /\?\s*$/.test(frase);
      if (pergunta && !sim) continue;
      const confirmado = pergunta && sim;
      if (!confirmado && !VONTADE.test(frase.toLowerCase()) && !ditado(frase)) continue;
      // a peça e a negação procuram-se na oração (até à vírgula): «tudo preto, menos o móvel, que é em madeira»
      const oracoes = frase.split(/[,:]|\s+(?=(?:mas|menos|exceto|só)\s)/i).map(palavras);
      oracoes.forEach((ws, o) => {
        const tudo = ws.some((w) => TUDO.test(w));
        ws.forEach((w, j) => {
          const cor = corDe(w);
          if (!cor) return;
          const antes = ws.slice(Math.max(0, j - 4), j);
          // «não quero nada branco», e também «branco não» / «branco nunca» (a negação logo a seguir à cor)
          const evitar = antes.some((x, k) => NEGA.test(x) && !NAO_SEI.test(antes[k + 1] ?? "")) || /^(n[aã]o|nunca|jamais)$/.test(ws[j + 1] ?? "");
          // 13/11 (Rúben, teste real: «a minha sanita e banheira branca» só pôs a banheira branca): a cor no fim de uma lista
          // distribui-se por TODAS as peças da lista. Recolhem-se as peças à esquerda da cor enquanto entre elas só houver conectores
          // ou artigos (LIGA); para-se na 1.ª palavra de conteúdo (ex.: «quero», «tirar», uma cor já tratada).
          const lista = new Set<Categoria>();
          for (let k = j - 1; k >= 0; k--) {
            const c = pecasDe(ws[k]);
            if (c) { for (const cc of c) lista.add(cc); continue; }
            if (LIGA.test(ws[k])) continue;
            break;
          }
          let cats: Categoria[] = [...lista];
          // sem lista colada à cor: a peça mais perto, em qualquer direção, na mesma oração («o móvel quero em madeira», «branca, a sanita»)
          if (!cats.length) { let dist = 7; ws.forEach((x, k) => { const c = pecasDe(x); if (c && Math.abs(k - j) < dist) { dist = Math.abs(k - j); cats = c; } }); }
          // sem peça e sem «tudo»: a última peça dita antes, noutra oração
          if (!cats.length && !tudo) for (let a = o - 1; a >= 0 && !cats.length; a--) for (const x of oracoes[a]) { const c = pecasDe(x); if (c) cats = c; }
          const texto = confirmado ? `${frase.trim()} ${prox!.texto.trim()}` : frase.trim();
          out.push({ cor, cats, evitar, tudo: tudo && !cats.length, frase: texto, inicio: f.inicio, origem });
        });
      });
    }
  });
  // a mesma cor dita duas vezes na mesma frase conta uma vez
  return out.filter((d, i) => out.findIndex((x) => x.frase === d.frase && x.cor === d.cor && x.cats.join() === d.cats.join() && x.evitar === d.evitar) === i);
}

/** Uma chave por coisa dita (o mesmo conteúdo dito pela 2.ª vez tem outra chave): a pré-visualização e a frase revista da mesma fala dão a
 *  mesma chave, por isso não se aplica duas vezes. */
export function chavesDosDitos(ditos: readonly DitoEstilo[]): string[] {
  const n = new Map<string, number>();
  return ditos.map((d) => {
    const k = `${d.cor}|${d.cats.join("+")}|${d.evitar ? 1 : 0}|${d.tudo ? 1 : 0}`;
    const i = (n.get(k) ?? 0) + 1;
    n.set(k, i);
    return `${k}#${i}`;
  });
}

/** O estilo que sai do que se disse: o que se disse por último ganha. */
export function estiloDosDitos(ditos: readonly DitoEstilo[]): EstiloOuvido | null {
  if (!ditos.length) return null;
  let cores: Cor[] = [];
  const porCategoria: Partial<Record<Categoria, Cor[]>> = {};
  const evitar = new Set<Cor>();
  for (const d of ditos) {
    if (d.evitar) {
      evitar.add(d.cor);
      if (d.cats.length) for (const c of d.cats) porCategoria[c] = (porCategoria[c] ?? []).filter((x) => x !== d.cor);
      else { cores = cores.filter((x) => x !== d.cor); for (const c of Object.keys(porCategoria) as Categoria[]) porCategoria[c] = porCategoria[c]!.filter((x) => x !== d.cor); }
      continue;
    }
    evitar.delete(d.cor);
    if (d.cats.length) for (const c of d.cats) porCategoria[c] = [d.cor, ...(porCategoria[c] ?? []).filter((x) => x !== d.cor)];
    // «tudo preto» passa à frente; uma cor dita sem peça junta-se às do cliente
    else cores = d.tudo ? [d.cor, ...cores.filter((x) => x !== d.cor)] : cores.includes(d.cor) ? cores : [...cores, d.cor];
  }
  for (const c of Object.keys(porCategoria) as Categoria[]) if (!porCategoria[c]!.length) delete porCategoria[c];
  return { estilo: { cores, porCategoria }, evitar: [...evitar], ditos: [...ditos] };
}

/** Junta o que se ouviu ao estilo que já havia: as cores ditas passam à frente, as peças ditas mudam, as cores a evitar saem. */
export function juntarEstilo(antes: Estilo, ouvido: EstiloOuvido): Estilo {
  const fora = (cs: Cor[]) => cs.filter((c) => !ouvido.evitar.includes(c));
  const cores = ouvido.estilo.cores.length ? [...ouvido.estilo.cores, ...fora(antes.cores).filter((c) => !ouvido.estilo.cores.includes(c))] : fora(antes.cores);
  const porCategoria: Partial<Record<Categoria, Cor[]>> = {};
  for (const [c, cs] of Object.entries({ ...antes.porCategoria, ...ouvido.estilo.porCategoria }) as [Categoria, Cor[]][]) {
    const l = fora(cs);
    if (l.length) porCategoria[c] = l;
  }
  return { cores, porCategoria };
}

export const mesmoEstilo = (a: Estilo, b: Estilo) =>
  a.cores.join() === b.cores.join() && JSON.stringify(Object.entries(a.porCategoria).sort()) === JSON.stringify(Object.entries(b.porCategoria).sort());

// ---------------------------------------------------------------- as combinações que resultam com a cor principal

export interface Combinacao { id: string; n: string; porque: string; estilo: Estilo }

const METAIS: Categoria[] = ["torneira", "coluna_duche", "resguardo", "toalheiro", "espelho"];
const LOICAS: Categoria[] = ["sanita", "bide", "banheira"];
const MOVEIS: Categoria[] = ["movel", "coluna", "armario"];
const com = (cats: Categoria[], cs: Cor[]) => Object.fromEntries(cats.map((c) => [c, cs])) as Partial<Record<Categoria, Cor[]>>;

/** Para cada cor principal, as combinações que um designer proporia (e que o catálogo tem). */
const COMBINACOES: Record<Cor, (Omit<Combinacao, "id">)[]> = {
  preto: [
    { n: "Preto total", porque: "Base, metais, móvel e sanita a preto; paredes e chão antracite. Forte e moderno.", estilo: { cores: ["preto", "cinza"], porCategoria: {} } },
    { n: "Preto e madeira", porque: "O preto nos metais e na base; o móvel e o chão em madeira aquecem o espaço.", estilo: { cores: ["preto"], porCategoria: { ...com(MOVEIS, ["madeira"]), pavimento: ["madeira"], bancada: ["madeira"], espelho: ["madeira", "preto"] } } },
    { n: "Preto e branco", porque: "Contraste clássico: loiças, móvel e paredes brancas; metais e base pretos.", estilo: { cores: ["preto"], porCategoria: { ...com(LOICAS, ["branco"]), ...com(MOVEIS, ["branco"]), revestimento: ["branco"], bancada: ["branco"] } } },
    { n: "Preto e pedra", porque: "Paredes cinza claro, chão antracite e metais pretos: calmo e sem marcas de água.", estilo: { cores: ["preto"], porCategoria: { revestimento: ["cinza"], pavimento: ["preto", "cinza"], sanita: ["cinza"], bide: ["cinza"], movel: ["cinza"] } } },
  ],
  branco: [
    { n: "Branco total", porque: "Luminoso e intemporal; o espaço parece maior.", estilo: { cores: ["branco", "cinza"], porCategoria: {} } },
    { n: "Branco e madeira", porque: "Paredes e loiças brancas, móvel e chão em madeira: acolhedor.", estilo: { cores: ["branco"], porCategoria: { ...com(MOVEIS, ["madeira"]), pavimento: ["madeira"], bancada: ["madeira"], espelho: ["madeira"] } } },
    { n: "Branco com metais pretos", porque: "Branco por todo o lado e os metais a preto dão o toque atual.", estilo: { cores: ["branco"], porCategoria: com([...METAIS, "base"], ["preto"]) } },
  ],
  cinza: [
    { n: "Cinza total", porque: "Tons de pedra, sereno; os metais cromados.", estilo: { cores: ["cinza"], porCategoria: {} } },
    { n: "Cinza e madeira", porque: "O cinza das paredes com o móvel em madeira: equilíbrio entre frio e quente.", estilo: { cores: ["cinza"], porCategoria: { ...com(MOVEIS, ["madeira"]), espelho: ["madeira"], bancada: ["madeira"] } } },
    { n: "Cinza com metais pretos", porque: "Paredes e chão cinza, metais e base a preto.", estilo: { cores: ["cinza"], porCategoria: com([...METAIS, "base"], ["preto"]) } },
  ],
  madeira: [
    { n: "Madeira e branco", porque: "O móvel e o chão em madeira, o resto branco: natural e claro.", estilo: { cores: ["branco"], porCategoria: { ...com(MOVEIS, ["madeira"]), pavimento: ["madeira"], bancada: ["madeira"] } } },
    { n: "Madeira e preto", porque: "Madeira com metais e base pretos: o estilo industrial.", estilo: { cores: ["preto"], porCategoria: { ...com(MOVEIS, ["madeira"]), pavimento: ["madeira"], bancada: ["madeira"], revestimento: ["cinza"] } } },
  ],
  bege: [
    { n: "Bege e madeira", porque: "Tons de areia com madeira: quente e descontraído.", estilo: { cores: ["bege"], porCategoria: { ...com(MOVEIS, ["madeira"]), espelho: ["madeira"] } } },
    { n: "Bege e branco", porque: "Paredes creme e loiças brancas: suave e luminoso.", estilo: { cores: ["bege"], porCategoria: { ...com(LOICAS, ["branco"]), ...com(MOVEIS, ["branco"]) } } },
  ],
};

/** As combinações para a cor principal do estilo, sem as que usam cores a evitar. */
export function combinacoesPara(cor: Cor | undefined, evitar: readonly Cor[] = []): Combinacao[] {
  if (!cor) return [];
  return COMBINACOES[cor]
    .filter((c) => ![...c.estilo.cores, ...Object.values(c.estilo.porCategoria).flat()].some((x) => evitar.includes(x as Cor)))
    .map((c, i) => ({ ...c, id: `${cor}-${i}` }));
}

/** As amostras de uma combinação: a cor do produto que o catálogo escolheria em cada peça (o que se vai ver de facto). */
export function amostras(e: Estilo, cats: readonly Categoria[]): { cat: Categoria; hex: string }[] {
  return cats.map((cat) => ({ cat, hex: melhorPara(cat, e)?.hex ?? "" })).filter((x) => x.hex);
}

export const nomeCor = (c: Cor) => CORES[c].n;
export const tempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
