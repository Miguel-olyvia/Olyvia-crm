// 12/11 (Rúben, numa visita de teste: «na voz, ao dizer que quero tirar o bidé, o cliente quer, deve também tirar o bidé»; «e os serviços
// a mesma coisa!»). O que se decide em voz alta sobre as peças e os serviços, lido das falas como as cores (estiloDaConversa.ts):
//  · peças: «tirar o bidé», «não quero o bidé», «trocar a sanita», «a banheira fica», «quero uma base de duche» (uma peça que não há
//    junta-se por colocar; uma que há troca-se);
//  · serviços: «quero um nicho no duche», «pintar o teto», «uma tomada nova» → junta; «a limpeza não é precisa» → sai.
// Uma pergunta («Tiramos o bidé?») só conta com um sim logo a seguir. O que se disse por último ganha. Só lógica, sem React.
import type { Fala } from "@/emylia/chamadaMotor";
import { PECAS, type TipoPeca } from "@/emylia/planta";
import { servico } from "./catalogoFake";
import { NEGA, SIM, corDe, palavras, type DitoEstilo } from "./estiloDaConversa";

export type AcaoPeca = "tira" | "troca" | "fica" | "junta";
interface Dito { frase: string; inicio: number; origem: DitoEstilo["origem"] }
export interface DitoPeca extends Dito { tipo: TipoPeca; acao: AcaoPeca }
export interface DitoServico extends Dito { id: string; quer: boolean }
export interface Pedidos { pecas: DitoPeca[]; servicos: DitoServico[] }

const PECA: [RegExp, TipoPeca][] = [
  [/^(bid[eé]s?)$/, "bide"], [/^(sanitas?|retretes?|sanit[aá]rios?)$/, "sanita"], [/^banheiras?$/, "banheira"],
  [/^(bases?|duches?|polibans?|polib[aã]s?)$/, "base"], [/^(m[oó]veis|m[oó]vel|lavat[oó]rios?)$/, "movel"], [/^espelhos?$/, "espelho"],
  [/^toalheiros?$/, "toalheiro"], [/^bancadas?$/, "bancada"], [/^(placa|fog[aã]o)$/, "placa"], [/^fornos?$/, "forno"],
  [/^(frigor[ií]ficos?|frigos?)$/, "frigorifico"], [/^exaustor(es)?$/, "exaustor"], [/^arm[aá]rios?$/, "armario"],
];
const pecaDe = (w: string): TipoPeca | null => PECA.find(([rx]) => rx.test(w))?.[1] ?? null;
/** 13/11: o tipo de peça mencionado num texto livre (o 'peca' que o modelo extraiu): a 1.ª que casar. */
export function tipoPecaDeTexto(t: string): TipoPeca | null { for (const w of palavras(t)) { const x = pecaDe(w); if (x) return x; } return null; }

const TIRA = /^(tirar|tira|tiramos|tirem|retirar|retira|remover|remove|arrancar|arranca|eliminar|elimina|sair|sai|dispenso|dispensar)$/;
const TROCA = /^(trocar|troca|trocamos|substituir|substitui|mudar|muda|mudamos|renovar|renova)$/;
const FICA = /^(manter|mant[eé]m|mantemos|mantenho|deixar|deixa|deixamos|aproveitar|aproveita|aproveitamos|fica|ficar|ficam)$/;
const JUNTA = /^(p[oô]r|p[oõ]e|pomos|ponha|meter|mete|metemos|colocar|coloca|instalar|instala|quero|queria|queremos|gostava|gostaria|preciso|precisamos|juntar|junta|acrescentar)$/;
const ARTIGO = /^(o|a|os|as|um|uma|uns|umas|de|do|da|novo|nova|novos|novas|esse|essa|este|esta|aquele|aquela|tamb[eé]m|já)$/;

/** Os serviços do catálogo pelas palavras com que se pedem. */
const SERVICO: [RegExp, string][] = [
  [/impermeabiliza/, "sv-imperm"], [/\bnicho/, "sv-nicho"], [/pint\w*\s+(d?[oa]\s+)?teto|teto\s+pintado/, "sv-pintura-teto"],
  [/estore/, "sv-estores"], [/\btomadas?\b/, "sv-tomada"], [/aplique|luz\s+(por\s+)?cima\s+do\s+espelho/, "sv-aplique"],
  [/ventila|ventaxia|extrator/, "sv-ventilador"], [/(instala\w*|parte|circuito)\s+el[eé]tric|eletricidade\s+nova/, "sv-eletrica"],
  [/reboc|regulariza\w*\s+(d?as\s+)?paredes/, "sv-reboco"], [/rodap/, "sv-rodape"], [/limpeza/, "sv-limpeza"],
  [/montagem\s+(d?os\s+)?m[oó]veis|montar\s+os\s+m[oó]veis/, "sv-montagem-cozinha"], [/recortes?/, "sv-recortes"],
  [/circuito\s+(d?a\s+)?placa|linha\s+(pr[oó]pria\s+)?(d?a\s+)?placa/, "sv-circuito-placa"], [/conduta|tubo\s+do\s+exaustor/, "sv-conduta"],
  [/liga\w*\s+(d?a\s+)?m[aá]quina/, "sv-ligacao-maquina"],
];
/** «não é preciso», «dispensa», «sem» antes do serviço: sai. */
/** 13/11: o serviço do catálogo que uma frase (o 'servico' que o modelo extraiu) refere, ou null. O modelo já separou cada serviço; aqui
 *  é só casar o nome com o id. */
export function servicoDeTexto(t: string): string | null { const s = t.toLowerCase(); return SERVICO.find(([rx]) => rx.test(s))?.[1] ?? null; }

const NAO_SERVICO = /\b(n[aã]o\s+(quero|queremos|[eé]\s+preciso|precisa|precisamos|vale\s+a\s+pena|fazemos|faz\s+falta)|dispens\w*|sem|escusa|escusamos|nada\s+de)\b/;
const PEDE_SERVICO = /\b(quer\w*|gosta\w*|precis\w*|p[oô]r|p[oõ]e|pomos|meter|mete|fazer|faz|fazemos|pintar|pinta|instalar|instala|colocar|coloca|juntar|junta|acrescentar|leva|levar|tamb[eé]m|incluir|inclui|convém|conv[eé]m)\b/;

/** As decisões ditas sobre as peças e os serviços (por ordem). */
export function pedidosDaConversa(falas: readonly Fala[], origem: Dito["origem"]): Pedidos {
  const pecas: DitoPeca[] = [], servicos: DitoServico[] = [];
  falas.forEach((f, i) => {
    const prox = falas[i + 1];
    const sim = !!prox && SIM.test(prox.texto);
    for (const frase of f.texto.split(/(?<=[.!?;])\s+/)) {
      const pergunta = /\?\s*$/.test(frase);
      if (pergunta && !sim) continue;
      const texto = pergunta ? `${frase.trim()} ${prox!.texto.trim()}` : frase.trim();
      const base = { frase: texto, inicio: f.inicio, origem };
      for (const oracao of frase.split(/[,:]|\s+(?=(?:mas|e\s+(?:tirar|trocar|manter|p[oô]r|meter|deixar))\s)/i)) {
        pecasDaOracao(oracao, base, pecas);
        servicosDaOracao(oracao, base, servicos);
      }
    }
  });
  return { pecas, servicos };
}

function pecasDaOracao(oracao: string, base: Dito, out: DitoPeca[]) {
  const ws = palavras(oracao);
  ws.forEach((w, j) => {
    const tipo = pecaDe(w);
    if (!tipo) return;
    // «base de duche» é uma peça: o «duche» a seguir a «base» não conta outra vez
    if (tipo === "base" && /^duches?$/.test(w) && ws.slice(Math.max(0, j - 2), j).some((x) => /^bases?$/.test(x))) return;
    // o verbo antes da peça (só artigos pelo meio: «tirar o bidé», «quero uma base nova»), ou logo depois («o bidé sai», «a banheira fica»)
    let k = j - 1;
    while (k >= 0 && ARTIGO.test(ws[k]) && j - k <= 3) k--;
    const antes = k >= 0 ? ws[k] : "";
    const depois = ws.slice(j + 1, j + 3).find((x) => !ARTIGO.test(x)) ?? "";
    const negado = ws.slice(Math.max(0, k - 2), Math.max(0, k)).some((x) => NEGA.test(x));
    let acao: AcaoPeca | null = null;
    if (TIRA.test(antes) || /^(sai|sair|vai|fora)$/.test(depois)) acao = negado ? "fica" : "tira";
    else if (TROCA.test(antes) || /^(nov[oa]s?)$/.test(depois)) acao = negado ? "fica" : "troca";
    // «fica a sanita preta» é uma escolha de cor (troca-se), não «fica como está»
    else if ((FICA.test(antes) || /^(fica|ficam|mant[eé]m)$/.test(depois)) && !ws.some((x) => corDe(x))) acao = negado ? "tira" : "fica";
    // «não quero o bidé» tira; «quero uma base de duche» junta (ou troca, se já há)
    else if (JUNTA.test(antes)) acao = negado || ws.slice(Math.max(0, k - 2), k + 1).some((x) => /^n[aã]o$/.test(x)) ? "tira" : "junta";
    else if (/^sem$/.test(antes)) acao = "tira";
    if (!acao) return;
    if (PECAS[tipo]?.abertura) return;
    out.push({ ...base, tipo, acao });
  });
}

function servicosDaOracao(oracao: string, base: Dito, out: DitoServico[]) {
  const t = oracao.toLowerCase();
  for (const [rx, id] of SERVICO) {
    const m = t.match(rx);
    if (!m || !servico(id)) continue;
    const antes = t.slice(0, m.index);
    const nao = NAO_SERVICO.test(antes) || /\b(n[aã]o\s+([eé]\s+)?(preciso|precisa|necess[aá]ri[oa])|dispens|escusa)/.test(t.slice(m.index));
    if (!nao && !PEDE_SERVICO.test(t)) continue;
    out.push({ ...base, id, quer: !nao });
  }
}

/** Uma chave por decisão dita (a 2.ª vez que se diz o mesmo tem outra chave; a frase revista da mesma fala dá a mesma). */
export function chavesDosPedidos(p: Pedidos): { pecas: string[]; servicos: string[] } {
  const n = new Map<string, number>();
  const conta = (k: string) => { const i = (n.get(k) ?? 0) + 1; n.set(k, i); return `${k}#${i}`; };
  return { pecas: p.pecas.map((d) => conta(`peca|${d.tipo}|${d.acao}`)), servicos: p.servicos.map((d) => conta(`sv|${d.id}|${d.quer ? 1 : 0}`)) };
}

const ACAO_NOME: Record<AcaoPeca, string> = { tira: "tirar", troca: "trocar", fica: "fica", junta: "nova" };
/** Em palavras, para o cartão: «Bidé: tirar», «Nicho embutido no duche: juntar». Só a última decisão de cada peça e serviço. */
export function resumoPedidos(p: Pedidos): string[] {
  const pec = new Map<TipoPeca, AcaoPeca>(), sv = new Map<string, boolean>();
  for (const d of p.pecas) pec.set(d.tipo, d.acao);
  for (const d of p.servicos) sv.set(d.id, d.quer);
  return [
    ...[...pec].map(([t, a]) => `${PECAS[t].n}: ${ACAO_NOME[a]}`),
    ...[...sv].map(([id, q]) => `${servico(id)!.n}: ${q ? "juntar" : "não"}`),
  ];
}
