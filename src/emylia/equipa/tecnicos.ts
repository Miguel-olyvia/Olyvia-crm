// Os técnicos de obra do protótipo (22/10/2026): uma ficha por técnico (nome, ofício, custo/hora editável, férias, ligação à pessoa do RH).
// · 22/10 (tarde): o ofício é um perfil do Catálogo (perfilId). O €/h de cada perfil, que entra no custo das receitas e do orçamento,
//   é a média do custo/hora dos técnicos com esse perfil (v2/custosModelo.ts: horaPerfil).
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
  /** €/h que a obra custa por cada hora deste técnico. 22/10: não se escreve à mão: é o custo/hora calculado nos Custos do RH
   *  (equipa/pontes.ts: custosDoRh), guardado aqui porque o RH não se sincroniza entre aparelhos. */
  custoHora: number;
  /** 22/10: de onde vem o custo/hora (o cálculo do RH): o salário base, os encargos da empresa (%) e as horas do contrato por mês. */
  custoRh?: { salario: number; encargosPct: number; horasMes: number };
  /** 22/10: a pessoa no RH não tem dados de custo (sem retribuição ou vínculo): fica fora da média do ofício, com aviso. */
  semCustoRh?: true;
  /** 23/10: o custo/hora foi escrito à mão (Utilizadores › Técnico de obra): o cálculo do RH não o muda até o tirarem. */
  custoManual?: true;
  tel: string;
  /** Na empresa desde (ano). */
  desde: string;
  /** A pessoa do RH de exemplo que é este técnico (equipa/pontes.ts). */
  pessoaRhId?: string;
  /** 22/10: o ofício pelo id do perfil do Catálogo (v2/custosModelo.ts: Custos.perfis). É o que liga o técnico às receitas: o €/h de
   *  cada perfil é a média do custo/hora dos técnicos com esse perfil. `sk` fica com o nome do perfil (o que os ecrãs mostram). */
  perfilId?: string;
}

/** Os ofícios dos técnicos de exemplo (os nomes dos perfis; a lista completa está nos perfis do Catálogo). */
export const OFICIOS = ["Servente · demolição", "Canalizador", "Ladrilhador", "Montador"] as const;
/** 22/10: o ofício antigo (sk, pelo nome) → o id do perfil do Catálogo: migra as fichas de antes de perfilId. */
export const PERFIL_DO_SK: Readonly<Record<string, string>> = { "Servente · demolição": "servente", Canalizador: "canalizador", Ladrilhador: "ladrilhador", Montador: "montador" };
/** O custo/hora quando o técnico não tem ficha (o de sempre). */
export const CUSTO_HORA_OMISSAO = 16;

const BASE: readonly FichaTecnico[] = [
  { id: "js", n: "João Silva", sk: "Servente · demolição", perfilId: "servente", ferias: [], custoHora: 14.2, tel: "912 418 330", desde: "2019", pessoaRhId: "p-tec-js", custoRh: { salario: 1685, encargosPct: 25.25, horasMes: 173.3 } },
  { id: "ra", n: "Rui Alves", sk: "Servente · demolição", perfilId: "servente", ferias: [], custoHora: 14.2, tel: "913 552 071", desde: "2022", pessoaRhId: "p-tec-ra", custoRh: { salario: 1685, encargosPct: 25.25, horasMes: 173.3 } },
  { id: "ma", n: "Marco Antunes", sk: "Canalizador", perfilId: "canalizador", ferias: [], custoHora: 18.5, tel: "936 120 447", desde: "2017", pessoaRhId: "p-tec-ma", custoRh: { salario: 2195, encargosPct: 25.25, horasMes: 173.3 } },
  // férias de exemplo: no plano de exemplo, o 4.º dia; em datas reais, 21 a 23 de outubro
  { id: "sf", n: "Sérgio Faria", sk: "Ladrilhador", perfilId: "ladrilhador", ferias: [3], feriasDatas: ["2026-10-21", "2026-10-22", "2026-10-23"], custoHora: 17.8, tel: "961 734 205", desde: "2018", pessoaRhId: "p-tec-sf", custoRh: { salario: 2112, encargosPct: 25.25, horasMes: 173.3 } },
  { id: "hn", n: "Hugo Neves", sk: "Ladrilhador", perfilId: "ladrilhador", ferias: [], custoHora: 17.8, tel: "924 806 113", desde: "2021", pessoaRhId: "p-tec-hn", custoRh: { salario: 2112, encargosPct: 25.25, horasMes: 173.3 } },
  { id: "pm", n: "Paulo Mota", sk: "Montador", perfilId: "montador", ferias: [], custoHora: 16.9, tel: "917 645 382", desde: "2020", pessoaRhId: "p-tec-pm", custoRh: { salario: 2005, encargosPct: 25.25, horasMes: 173.3 } },
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
  // 22/10: o custo/hora escrito à mão (antes do cálculo do RH) passa ao do RH das pessoas de exemplo
  if (!t.custoRh && !t.semCustoRh && b?.custoRh) { t.custoHora = b.custoHora; t.custoRh = { ...b.custoRh }; mudou = true; }
  if (!Array.isArray(t.ferias)) { t.ferias = [...(b?.ferias ?? [])]; mudou = true; }
  if (typeof t.tel !== "string") { t.tel = b?.tel ?? "—"; mudou = true; }
  if (typeof t.desde !== "string") { t.desde = b?.desde ?? ""; mudou = true; }
  if (t.pessoaRhId === undefined && b?.pessoaRhId) { t.pessoaRhId = b.pessoaRhId; mudou = true; }
  // 22/10: as fichas de antes do perfil do Catálogo ligam-se pelo ofício que tinham (o nome); um ofício desconhecido fica sem perfil
  if (t.perfilId === undefined && PERFIL_DO_SK[t.sk]) { t.perfilId = PERFIL_DO_SK[t.sk]; mudou = true; }
  return mudou;
}

/** O id do perfil do Catálogo de um técnico (o da ficha; nas de antes, pelo ofício); "" sem perfil. */
export const perfilDoTecnico = (t: Pick<FichaTecnico, "sk"> & { perfilId?: string }): string => t.perfilId ?? PERFIL_DO_SK[t.sk] ?? "";
/** Os técnicos (do registo vivo, ou de `L`) com o perfil `perfilId`. */
export const tecnicosDoPerfil = (perfilId: string, L: readonly FichaTecnico[] = TECNICOS): FichaTecnico[] =>
  perfilId ? L.filter((t) => perfilDoTecnico(t) === perfilId) : [];

/**
 * Garante a ficha dos técnicos no Estado e liga-lhe o registo vivo. Um estado sem `tecnicos` (guardado antes de 22/10) fica com os seis
 * de exemplo; fichas incompletas completam-se. Devolve se mudou alguma coisa no Estado (para a página o voltar a partilhar).
 * 24/10: numa organização real (`semExemplos`, estadoVazio) uma lista vazia fica vazia: os técnicos criam-se em Utilizadores.
 */
export function garantirTecnicos(S: { tecnicos?: FichaTecnico[]; semExemplos?: boolean }): boolean {
  let mudou = false;
  if (S.semExemplos && Array.isArray(S.tecnicos) && !S.tecnicos.length) { usarTecnicos(S.tecnicos); return false; }
  if (!Array.isArray(S.tecnicos) || !S.tecnicos.length) { S.tecnicos = tecnicosIniciais(); mudou = true; }
  else for (const t of S.tecnicos) if (completar(t)) mudou = true;
  usarTecnicos(S.tecnicos);
  return mudou;
}

/* ------------------------------------------------------------------ as ausências aprovadas no RH (23/10) */
// 23/10: os conflitos do plano (motor.ts: diaDeFerias) só viam as férias da ficha do técnico; as ausências aprovadas no RH (férias pedidas
// e aprovadas, baixas) ficavam só na Agenda. A ponte do RH (rh/ponteEstado.ts) publica aqui, a cada mudança no RH, os dias de cada técnico;
// sem ela (os testes do motor), não há nenhuma e tudo fica como antes.
let AUSENCIAS_RH: Readonly<Record<string, ReadonlySet<string>>> = {};
/** Os dias ("aaaa-mm-dd") de ausência aprovada no RH de cada técnico (id → data → o nome do tipo). */
export function definirAusenciasRh(m: Record<string, Record<string, string>>): void {
  AUSENCIAS_RH = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, new Set(Object.keys(v))]));
}
/** O técnico tem uma ausência aprovada no RH nesse dia? */
export const ausenteNoRh = (tec: string, iso: string): boolean => !!AUSENCIAS_RH[tec]?.has(iso);
/** O técnico tem alguma ausência aprovada no RH? */
export const temAusenciasRh = (tec: string): boolean => (AUSENCIAS_RH[tec]?.size ?? 0) > 0;

/* ------------------------------------------------------------------ criar e mudar técnicos (23/10, Utilizadores) */
export interface DadosTecnico { nome: string; perfilId: string; perfilNome: string; custoHora: number }
/** Um id novo para um técnico ("t-ana-2"): letras, números e hífen (a base só aceita estes em membros.ref_v1). */
export function idNovoTecnico(nome: string, L: readonly Pick<FichaTecnico, "id">[]): string {
  const base = "t-" + (nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "tecnico");
  let id = base, n = 1;
  while (L.some((t) => t.id === id)) id = `${base}-${++n}`;
  return id;
}
/** O que está errado nos dados de um técnico (ou null). */
export function erroTecnico(d: Pick<DadosTecnico, "nome" | "perfilId" | "custoHora">): string | null {
  if (!d.nome.trim()) return "Escreva o nome do técnico.";
  if (!d.perfilId) return "Escolha o ofício do técnico.";
  if (!numero(d.custoHora) || d.custoHora <= 0 || d.custoHora > 500) return "O custo/hora tem de ser um valor entre 0 e 500 €.";
  return null;
}
/** Cria (sem `id`) ou muda a ficha de um técnico em `L`. O custo/hora escrito aqui fica à mão (custoManual). Devolve o id. */
export function guardarFichaTecnico(L: FichaTecnico[], d: DadosTecnico, id?: string): string {
  const custo = Math.round(d.custoHora * 100) / 100;
  const t = id ? L.find((x) => x.id === id) : undefined;
  if (t) {
    t.n = d.nome.trim(); t.perfilId = d.perfilId; t.sk = d.perfilNome;
    if (t.custoHora !== custo) { t.custoHora = custo; t.custoManual = true; delete t.semCustoRh; }
    return t.id;
  }
  const novo: FichaTecnico = {
    id: idNovoTecnico(d.nome, L), n: d.nome.trim(), sk: d.perfilNome, perfilId: d.perfilId, ferias: [], custoHora: custo, custoManual: true,
    tel: "—", desde: String(new Date().getFullYear()),
  };
  L.push(novo);
  return novo.id;
}

/** A ficha de um técnico no registo vivo. */
export const fichaTecnico = (id: string | null | undefined): FichaTecnico | undefined => (id ? TECNICOS.find((x) => x.id === id) : undefined);
/** O custo/hora de quem faz a tarefa (sem técnico, ou sem ficha: 16 €/h). */
export const custoHoraDe = (tec: string | null | undefined): number => fichaTecnico(tec)?.custoHora || CUSTO_HORA_OMISSAO;
