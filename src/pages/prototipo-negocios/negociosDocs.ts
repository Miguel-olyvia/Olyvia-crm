// V2 da página de Negócios: só negócios a decorrer, por fase de documento
// (Orçamento, Proposta, Contrato, Financeiro). Funções puras: nada aqui muda o Estado.
import { criarOrc, aberto, proximo, tot, type Estado, type LinhaId, type Negocio } from "./motor";

export type DocFase = "orcamento" | "proposta" | "contrato" | "financeiro";

export const COLUNAS_V2: { id: DocFase; nome: string }[] = [
  { id: "orcamento", nome: "Orçamento" },
  { id: "proposta", nome: "Proposta" },
  { id: "contrato", nome: "Contrato" },
  { id: "financeiro", nome: "Financeiro" },
];

export interface LinhaCartaoV2 {
  rotulo: string;
  valor: number;
}

export interface CartaoV2 {
  id: string;
  doc: DocFase;
  /** O negócio base que se abre ao clicar no cartão. */
  negocioId: number;
  nome: string;
  servico: string;
  local: string;
  /** Linhas (casa de banho, cozinha) do orçamento do cartão; a proposta conjunta tem as duas. Serve os filtros. */
  linhasFiltro: LinhaId[];
  valor: number | null;
  proximo: string;
  /** Exemplo acrescentado só nesta camada; não existe no Estado. */
  demo: boolean;
  /** Proposta conjunta: os orçamentos que agrupa. */
  conjunta?: boolean;
  linhas?: LinhaCartaoV2[];
}

/** Em que fase de documento está o negócio; null se fica fora desta página. */
export function docFase(d: Negocio): DocFase | null {
  if (d.perdido || d.fase < 3) return null;
  if (d.fase === 4) return "financeiro";
  if (d.fase === 5) return null; // a obra vê-se em Operações
  const o = d.orc;
  if (!o || !o.enviada) return "orcamento";
  if (!o.aceite) return "proposta";
  return o.vendaDireta ? "financeiro" : "contrato"; // sem contrato exigido, a proposta aceite passa direta ao Financeiro
}

const NOME_LINHA: Record<LinhaId, string> = { wc: "Casa de banho", coz: "Cozinha" };
const OUTRA: Record<LinhaId, LinhaId> = { wc: "coz", coz: "wc" };
/** Medidas de exemplo da outra linha, vindas dos negócios do seed (Sérgio Pinto = wc, Carla Nunes = coz). */
const MEDIDAS_DE: Record<LinhaId, number> = { wc: 1030, coz: 1031 };

function localDe(d: Negocio): string {
  return d.f.localidade || d.local.split(",").pop()!.trim();
}

function cartaoBase(d: Negocio, doc: DocFase, S: Estado): CartaoV2 {
  return {
    id: `neg-${d.id}`, doc, negocioId: d.id, nome: d.nome, servico: d.servico, local: localDe(d), linhasFiltro: [d.linha],
    valor: d.orc ? tot(d, S).pf : null, proximo: proximo(d, S).t, demo: false,
  };
}

/** Um orçamento de exemplo da outra linha, para a mesma pessoa. Trabalha numa cópia: o Estado não muda. */
function orcamentoDemo(d: Negocio, S: Estado): { linha: LinhaId; pf: number } | null {
  const linha = OUTRA[d.linha];
  const fonte = S.deals.find((x) => x.id === MEDIDAS_DE[linha]);
  if (!fonte) return null;
  const c = structuredClone(d);
  c.linha = linha;
  c.visita = { ...structuredClone(fonte.visita), extra: {}, off: [] };
  c.orc = criarOrc(c, S);
  return { linha, pf: tot(c, S).pf };
}

/**
 * A lista de cartões da V2. Cada negócio a decorrer aparece na coluna da sua fase.
 * Mais dois exemplos (demo): um segundo orçamento da mesma pessoa e uma proposta conjunta.
 */
export function cartoesV2(S: Estado): CartaoV2[] {
  const cs: CartaoV2[] = [];
  const pessoas = aberto(S).filter((d) => docFase(d));
  const comProposta = pessoas.filter((d) => docFase(d) === "proposta" && d.orc);
  // A proposta conjunta: o último negócio em proposta; o cartão dele passa a agrupar dois orçamentos.
  const conj = comProposta[comProposta.length - 1];
  // O segundo orçamento: a primeira pessoa em proposta que não seja a da proposta conjunta.
  const segundo = comProposta.find((d) => d !== conj);

  for (const d of pessoas) {
    const doc = docFase(d)!;
    if (d === conj) {
      const o2 = orcamentoDemo(d, S);
      if (o2) {
        const v1 = tot(d, S).pf;
        cs.push({
          ...cartaoBase(d, doc, S), id: `conj-${d.id}`, demo: true, conjunta: true, valor: v1 + o2.pf,
          linhasFiltro: d.linha === o2.linha ? [d.linha] : [d.linha, o2.linha],
          servico: "2 orçamentos numa proposta",
          linhas: [{ rotulo: NOME_LINHA[d.linha], valor: v1 }, { rotulo: NOME_LINHA[o2.linha], valor: o2.pf }],
        });
        continue;
      }
    }
    cs.push(cartaoBase(d, doc, S));
    if (d === segundo) {
      const o2 = orcamentoDemo(d, S);
      if (o2) {
        cs.push({
          ...cartaoBase(d, "orcamento", S), id: `demo-orc-${d.id}`, demo: true, servico: NOME_LINHA[o2.linha], linhasFiltro: [o2.linha],
          valor: o2.pf, proximo: "Verificar e enviar a proposta",
        });
      }
    }
  }
  return cs;
}

/** Pessoas ainda em lead, contacto ou visita (fases da pessoa, não do negócio). */
export function pessoasAntes(S: Estado): number {
  return aberto(S).filter((d) => d.fase < 3).length;
}

/** Quantos cartões tem cada pessoa (por nome). */
export function negociosPorPessoa(cs: CartaoV2[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of cs) m[c.nome] = (m[c.nome] || 0) + 1;
  return m;
}
