// Os técnicos de obra do protótipo (22/10/2026): uma ficha por técnico (nome, ofício, custo/hora editável, férias, ligação à pessoa do RH).
// · A ficha vive no Estado (S.tecnicos), na parte "global" da sincronização: o custo/hora mudado num aparelho chega aos outros.
// · Os estados guardados de antes não têm o campo: garantirTecnicos() junta os seis técnicos de sempre (os mesmos ids, o custo/hora
//   que estava em obraOps.ts: FICHA_TEC) sem mexer em mais nada.
// · O registo vivo (TECNICOS) é o array que o motor exporta como TECS: os ~40 sítios que procuram um técnico (TECS.find, TECS.filter)
//   continuam iguais e passam a ver a ficha do Estado aberto. garantirTecnicos(S) liga-o ao Estado (seed, ler, sincronizar, acoes).
// Sem imports em tempo de execução (o motor importa este ficheiro).

export interface Tecnico {
  id: string; n: string; sk: string;
  /** Os dias de férias nos planos de exemplo (índice do dia, DIAS). */
  ferias: number[];
  /** As férias em datas reais ("aaaa-mm-dd"), para os planos do orçamento (14/10). */
  feriasDatas?: string[];
}

/** A ficha do técnico: o que o motor já usava (Tecnico) mais o custo/hora, o contacto e a pessoa do RH. */
export interface FichaTecnico extends Tecnico {
  /** €/h que a obra custa por cada hora deste técnico (o custo previsto e o real da obra usam-no). Só a Direção e as Operações o mudam. */
  custoHora: number;
  tel: string;
  /** Na empresa desde (ano). */
  desde: string;
  /** A pessoa do RH de exemplo que é este técnico (equipa/pontes.ts). */
  pessoaRhId?: string;
}

/** Os ofícios dos técnicos (o mesmo que skDaTarefa devolve, preparacaoObra.ts). */
export const OFICIOS = ["Servente · demolição", "Canalizador", "Ladrilhador", "Montador"] as const;
/** O custo/hora quando o técnico não tem ficha (o de sempre). */
export const CUSTO_HORA_OMISSAO = 16;

const BASE: readonly FichaTecnico[] = [
  { id: "js", n: "João Silva", sk: "Servente · demolição", ferias: [], custoHora: 14.2, tel: "912 418 330", desde: "2019", pessoaRhId: "p-tec-js" },
  { id: "ra", n: "Rui Alves", sk: "Servente · demolição", ferias: [], custoHora: 14.2, tel: "913 552 071", desde: "2022", pessoaRhId: "p-tec-ra" },
  { id: "ma", n: "Marco Antunes", sk: "Canalizador", ferias: [], custoHora: 18.5, tel: "936 120 447", desde: "2017", pessoaRhId: "p-tec-ma" },
  // férias de exemplo: no plano de exemplo, o 4.º dia; em datas reais, 21 a 23 de outubro
  { id: "sf", n: "Sérgio Faria", sk: "Ladrilhador", ferias: [3], feriasDatas: ["2026-10-21", "2026-10-22", "2026-10-23"], custoHora: 17.8, tel: "961 734 205", desde: "2018", pessoaRhId: "p-tec-sf" },
  { id: "hn", n: "Hugo Neves", sk: "Ladrilhador", ferias: [], custoHora: 17.8, tel: "924 806 113", desde: "2021", pessoaRhId: "p-tec-hn" },
  { id: "pm", n: "Paulo Mota", sk: "Montador", ferias: [], custoHora: 16.9, tel: "917 645 382", desde: "2020", pessoaRhId: "p-tec-pm" },
];

/** Os seis técnicos de exemplo (uma cópia nova de cada vez). */
export const tecnicosIniciais = (): FichaTecnico[] => structuredClone(BASE) as FichaTecnico[];

/** O registo vivo: as fichas do Estado aberto (o motor exporta-o como TECS). Muda-se só no sítio (usarTecnicos), nunca se troca o array. */
export const TECNICOS: FichaTecnico[] = tecnicosIniciais();

/** O registo vivo passa a ser `L` (os mesmos objetos: editar a ficha no Estado vê-se logo no registo). */
export function usarTecnicos(L: FichaTecnico[]): void {
  if (L === TECNICOS) return;
  if (L.length === TECNICOS.length && L.every((x, i) => x === TECNICOS[i])) return;
  TECNICOS.splice(0, TECNICOS.length, ...L);
}

const numero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Completa uma ficha que veio de fora (um estado antigo ou de outro aparelho): os campos em falta tomam o valor de exemplo. */
function completar(t: FichaTecnico): boolean {
  const b = BASE.find((x) => x.id === t.id);
  let mudou = false;
  if (!numero(t.custoHora) || t.custoHora <= 0) { t.custoHora = b?.custoHora ?? CUSTO_HORA_OMISSAO; mudou = true; }
  if (!Array.isArray(t.ferias)) { t.ferias = [...(b?.ferias ?? [])]; mudou = true; }
  if (typeof t.tel !== "string") { t.tel = b?.tel ?? "—"; mudou = true; }
  if (typeof t.desde !== "string") { t.desde = b?.desde ?? ""; mudou = true; }
  if (t.pessoaRhId === undefined && b?.pessoaRhId) { t.pessoaRhId = b.pessoaRhId; mudou = true; }
  return mudou;
}

/**
 * Garante a ficha dos técnicos no Estado e liga-lhe o registo vivo. Um estado sem `tecnicos` (guardado antes de 22/10) fica com os seis
 * de exemplo; fichas incompletas completam-se. Devolve se mudou alguma coisa no Estado (para a página o voltar a partilhar).
 */
export function garantirTecnicos(S: { tecnicos?: FichaTecnico[] }): boolean {
  let mudou = false;
  if (!Array.isArray(S.tecnicos) || !S.tecnicos.length) { S.tecnicos = tecnicosIniciais(); mudou = true; }
  else for (const t of S.tecnicos) if (completar(t)) mudou = true;
  usarTecnicos(S.tecnicos);
  return mudou;
}

/** A ficha de um técnico no registo vivo. */
export const fichaTecnico = (id: string | null | undefined): FichaTecnico | undefined => (id ? TECNICOS.find((x) => x.id === id) : undefined);
/** O custo/hora de quem faz a tarefa (sem técnico, ou sem ficha: 16 €/h). */
export const custoHoraDe = (tec: string | null | undefined): number => fichaTecnico(tec)?.custoHora || CUSTO_HORA_OMISSAO;
