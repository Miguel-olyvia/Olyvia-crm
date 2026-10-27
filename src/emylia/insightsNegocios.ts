// Os insights do Painel de Negócios (27/10/2026): o que os números querem dizer, em frases curtas, com a ação que os resolve.
// Também a previsão (o valor em aberto a multiplicar pela taxa de fecho de cada fase) e a comparação com o período anterior.
// Funções puras sobre as linhas do histórico (historicoNegocios.ts): nada aqui muda o Estado.
import { FASES } from "./motor";
import { dataDe, dataGanho, funilH, ganhos, motivosPerda, porCampo, resumoH, type FiltrosH, type LinhaH } from "./historicoNegocios";
import { eurosTexto } from "./graficosTipos";

const DIA = 86_400_000;
const meiaNoite = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const soma = (ls: readonly LinhaH[]): number => ls.reduce((a, l) => a + (l.valor ?? 0), 0);
const negocios = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);

/** A data em que o negócio se perdeu: o último acontecimento marcado como mau ("x"), ou o último de todos. */
export function dataPerda(l: LinhaH, hoje: Date = new Date()): Date | null {
  if (l.estado !== "perdido") return null;
  return dataDe((l.d.hist.find((e) => e.k === "x") ?? l.d.hist[0])?.q, hoje);
}

/* ------------------------------------------------------------------ séries e comparação */
/** Uma série por semana (a última acaba hoje): conta (ou soma `peso`) as linhas cuja data cai em cada semana. */
export function serieSemanal(ls: readonly LinhaH[], hoje: Date, semanas: number, data: (l: LinhaH) => Date | null, peso: (l: LinhaH) => number = () => 1): number[] {
  const fim = meiaNoite(hoje).getTime() + DIA;
  return Array.from({ length: semanas }, (_, i) => {
    const ate = fim - (semanas - 1 - i) * 7 * DIA, de = ate - 7 * DIA;
    return ls.reduce((a, l) => { const d = data(l)?.getTime(); return d !== undefined && d >= de && d < ate ? a + peso(l) : a; }, 0);
  });
}

export interface Comparado { atual: number; antes: number; /** A variação em %; null quando antes era 0. */ delta: number | null }
const comparado = (atual: number, antes: number): Comparado => ({ atual, antes, delta: antes ? Math.round((100 * (atual - antes)) / antes) : null });

/** Os últimos `dias` contra os `dias` antes deles: entradas, ganhos, valor ganho e perdidos. */
export function compararPeriodos(ls: readonly LinhaH[], hoje: Date = new Date(), dias = 30) {
  const fim = meiaNoite(hoje).getTime() + DIA, meio = fim - dias * DIA, ini = meio - dias * DIA;
  const em = (d: Date | null, de: number, ate: number): boolean => !!d && d.getTime() >= de && d.getTime() < ate;
  const g = ganhos(ls);
  const conta = (de: number, ate: number) => ({
    entradas: ls.filter((l) => em(l.entrada, de, ate)).length,
    ganhos: g.filter((l) => em(dataGanho(l.d, hoje), de, ate)),
    perdidos: ls.filter((l) => em(dataPerda(l, hoje), de, ate)).length,
  });
  const a = conta(meio, fim), b = conta(ini, meio);
  return {
    dias,
    entradas: comparado(a.entradas, b.entradas),
    ganhos: comparado(a.ganhos.length, b.ganhos.length),
    valorGanho: comparado(soma(a.ganhos), soma(b.ganhos)),
    perdidos: comparado(a.perdidos, b.perdidos),
  };
}

/* ------------------------------------------------------------------ previsão */
/** A taxa de fecho por fase quando ainda não há histórico que chegue (de exemplo, a afinar com a Mudelar). */
export const PROB_BASE = [10, 20, 35, 55, 95, 100];
/** Com menos decididos do que isto numa fase, usa-se a taxa de exemplo. */
export const MIN_DECIDIDOS = 10;

/** A taxa de fecho de cada fase: dos negócios decididos (ganhos ou perdidos) que lá chegaram, quantos se ganharam. */
export function taxasFecho(ls: readonly LinhaH[]): { prob: number; decididos: number; historica: boolean }[] {
  return FASES.map((_, i) => {
    const dec = ls.filter((l) => l.fase >= i && l.estado !== "aberto"), gh = dec.filter((l) => l.estado !== "perdido").length;
    const historica = dec.length >= MIN_DECIDIDOS;
    return { prob: historica ? Math.round((100 * gh) / dec.length) : PROB_BASE[i], decididos: dec.length, historica };
  });
}

export interface Previsao {
  /** O valor em aberto (só os que têm orçamento). */
  aberto: number;
  /** O que se espera fechar dos que têm orçamento: cada um vezes a taxa de fecho da fase em que está. */
  ponderado: number;
  /** Os abertos ainda sem orçamento e o que valeriam ao valor médio ganho (null sem nenhum ganho com valor). */
  semOrcamento: number;
  estimadoSemOrcamento: number | null;
  /** O que se espera fechar dos sem orçamento, ao valor médio ganho e à taxa da fase (0 sem valor médio). */
  ponderadoEstimado: number;
  /** A previsão inteira: ponderado mais ponderadoEstimado. */
  total: number;
  porFase: { fase: number; rotulo: string; n: number; valor: number; estimado: number; prob: number; ponderado: number; historica: boolean }[];
}

export function previsao(ls: readonly LinhaH[]): Previsao {
  const t = taxasFecho(ls), ab = ls.filter((l) => l.estado === "aberto"), r = resumoH(ls);
  const porFase = FASES.map((rotulo, fase) => {
    const f = ab.filter((l) => l.fase === fase), valor = soma(f), estimado = f.filter((l) => l.valor === null).length * (r.ticket ?? 0);
    return { fase, rotulo, n: f.length, valor, estimado, prob: t[fase].prob, ponderado: ((valor + estimado) * t[fase].prob) / 100, historica: t[fase].historica };
  }).filter((p) => p.n > 0);
  const sem = ab.filter((l) => l.valor === null).length;
  const firme = porFase.reduce((a, p) => a + (p.valor * p.prob) / 100, 0), total = porFase.reduce((a, p) => a + p.ponderado, 0);
  return {
    aberto: soma(ab), ponderado: firme, ponderadoEstimado: total - firme, total, porFase,
    semOrcamento: sem, estimadoSemOrcamento: r.ticket === null ? null : sem * r.ticket,
  };
}

/* ------------------------------------------------------------------ insights */
export type Tom = "risco" | "atencao" | "bom" | "info";
export interface Insight {
  id: string;
  tom: Tom;
  titulo: string;
  texto: string;
  /** O número em destaque no cartão (já em texto). */
  numero?: string;
  /** O filtro que mostra na Lista os negócios de que o insight fala. */
  acao?: Partial<FiltrosH>;
  acaoTexto?: string;
  /** Pede atenção já: o cartão pulsa (sem movimento reduzido). */
  urgente?: boolean;
}
const ORDEM_TOM: Record<Tom, number> = { risco: 0, atencao: 1, bom: 2, info: 3 };

/** As frases do Painel, das mais urgentes para as informativas (no máximo `max`). */
export function insights(ls: readonly LinhaH[], hoje: Date = new Date(), max = 6): Insight[] {
  const out: Insight[] = [];
  const ab = ls.filter((l) => l.estado === "aberto");

  // 1. leads por contactar há 2 dias ou mais: cada dia sem chamada baixa a hipótese de fechar
  const frias = ab.filter((l) => l.fase === 0 && (l.parado ?? 0) >= 2);
  if (frias.length) out.push({
    id: "frias", tom: "risco", urgente: true, numero: String(frias.length),
    titulo: frias.length === 1 ? "1 pedido à espera de chamada" : `${frias.length} pedidos à espera de chamada`,
    texto: `O mais antigo é de ${frias.sort((a, b) => (b.parado ?? 0) - (a.parado ?? 0))[0].nome}, há ${frias[0].parado} dias. Ligar hoje.`,
    acao: { estado: "aberto", fase: "0", parados: false }, acaoTexto: "Ver quem ligar",
  });

  // 2. dinheiro parado: abertos com orçamento sem nada há 7 dias ou mais (sem as propostas à espera do cliente, que têm o seu)
  const aEspera = (l: LinhaH): boolean => l.fase === 3 && !!l.d.orc?.enviada && !l.d.orc.aceite;
  const parados = ab.filter((l) => l.valor !== null && (l.parado ?? 0) >= 7 && !aEspera(l));
  if (parados.length) out.push({
    id: "dinheiro", tom: "risco", urgente: soma(parados) > 0, numero: eurosTexto(Math.round(soma(parados))),
    titulo: "Dinheiro parado", texto: `${negocios(parados.length)} com orçamento sem nada há 7 dias ou mais. Um telefonema pode desbloquear.`,
    acao: { estado: "aberto", parados: true }, acaoTexto: "Ver os parados",
  });

  // 3. propostas enviadas à espera do cliente
  const espera = ab.filter(aEspera);
  if (espera.length) {
    const dias = Math.max(...espera.map((l) => l.parado ?? 0));
    out.push({
      id: "propostas", tom: dias >= 7 ? "atencao" : "info", numero: eurosTexto(Math.round(soma(espera))),
      titulo: espera.length === 1 ? "1 proposta à espera do cliente" : `${espera.length} propostas à espera do cliente`,
      texto: dias >= 7 ? `A mais antiga está sem resposta há ${dias} dias. Vale a pena perguntar se há dúvidas.` : "Todas enviadas há menos de uma semana.",
      acao: { estado: "aberto", fase: "3" }, acaoTexto: "Ver as propostas",
    });
  }

  // 4. o maior aperto do funil (só com pelo menos 3 negócios na fase de partida)
  const f = funilH(ls);
  const passos = f.slice(1).map((e, i) => ({ de: f[i], para: e })).filter((p) => p.de.chegaram >= 3 && p.para.passagem !== null);
  const pior = passos.sort((a, b) => (a.para.passagem ?? 100) - (b.para.passagem ?? 100))[0];
  if (pior && (pior.para.passagem ?? 100) < 80) out.push({
    id: "aperto", tom: "atencao", numero: `${100 - (pior.para.passagem ?? 0)} %`,
    titulo: `O maior aperto: ${pior.de.rotulo} → ${pior.para.rotulo}`,
    texto: textoAperto(ls, pior.de.fase, pior.de.chegaram, pior.de.rotulo),
    acao: { fase: String(pior.de.fase), estado: "aberto" }, acaoTexto: `Ver os de ${pior.de.rotulo}`,
  });

  // 5. a melhor origem (pela conversão, com pelo menos 2 decididos) e a que mais traz sem converter
  const origens = porCampo(ls, "origem").filter((g) => g.ganhos + g.perdidos >= 2 && g.conversao !== null);
  const melhor = [...origens].sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0) || b.n - a.n)[0];
  if (melhor && (melhor.conversao ?? 0) >= 50) out.push({
    id: "origem", tom: "bom", numero: `${melhor.conversao} %`,
    titulo: `${melhor.rotulo} é a origem que mais fecha`,
    texto: `${melhor.ganhos} ganhos em ${melhor.ganhos + melhor.perdidos} decididos. Merece mais investimento.`,
    acao: { origem: melhor.id }, acaoTexto: `Ver os de ${melhor.rotulo}`,
  });

  // 6. o ritmo de entradas: as últimas 4 semanas contra as 4 antes
  const s = serieSemanal(ls, hoje, 8, (l) => l.entrada), agora = s.slice(4).reduce((a, x) => a + x, 0), antes = s.slice(0, 4).reduce((a, x) => a + x, 0);
  if (agora + antes >= 3 && antes > 0) {
    const d = Math.round((100 * (agora - antes)) / antes);
    if (Math.abs(d) >= 15) out.push({
      id: "ritmo", tom: d > 0 ? "bom" : "atencao", numero: `${d > 0 ? "+" : ""}${d} %`,
      titulo: d > 0 ? "Estão a entrar mais pedidos" : "Estão a entrar menos pedidos",
      texto: `${agora} nas últimas 4 semanas, contra ${antes} nas 4 antes.${d < 0 ? " Ver as campanhas e as origens." : ""}`,
      acao: { periodo: "30" }, acaoTexto: "Ver os últimos 30 dias",
    });
  }

  // 8. porque se perde
  const m = motivosPerda(ls)[0];
  const nPerd = ls.filter((l) => l.estado === "perdido").length;
  if (m && nPerd >= 1) out.push({
    id: "perda", tom: "info", numero: String(m.n),
    titulo: "Porque se perde mais", texto: `«${m.motivo}»: ${m.n} de ${nPerd} perdidos.`,
    acao: { estado: "perdido" }, acaoTexto: "Ver os perdidos",
  });

  return out.sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom]).slice(0, max);
}

/** Os que não passaram de uma fase: quantos ainda lá estão e quantos se perderam. */
function textoAperto(ls: readonly LinhaH[], fase: number, chegaram: number, rotulo: string): string {
  const ficaram = ls.filter((l) => l.fase === fase), ab = ficaram.filter((l) => l.estado === "aberto").length, pe = ficaram.length - ab;
  return `${ficaram.length} de ${chegaram} não passaram de ${rotulo}: ${ab} ainda lá, ${pe} ${pe === 1 ? "perdido" : "perdidos"}. É aqui que mais se ganha a melhorar.`;
}

/** A saúde do funil, de 0 a 100: conversão, ritmo e quanto do aberto está parado. Só para o mostrador do Painel. */
export function saude(ls: readonly LinhaH[]): { nota: number; rotulo: string } {
  const r = resumoH(ls), ab = ls.filter((l) => l.estado === "aberto");
  if (!ls.length) return { nota: 0, rotulo: "Sem dados" };
  const conv = r.conversao ?? 50, frescos = ab.length ? (100 * ab.filter((l) => (l.parado ?? 0) < 7).length) / ab.length : 100;
  const nota = Math.round(0.6 * conv + 0.4 * frescos);
  return { nota, rotulo: nota >= 70 ? "Saudável" : nota >= 45 ? "A precisar de atenção" : "Em risco" };
}
