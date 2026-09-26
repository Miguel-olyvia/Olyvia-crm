/**
 * Quem devia ir a esta ordem.
 *
 * Hoje quem coordena escolhe a pessoa de cabeça: abre a lista, lê os nomes, e
 * decide com o que se lembra. Isso funciona com quatro técnicos e uma cidade.
 * Com doze e três distritos, o que acontece é que vai sempre o mesmo — o que a
 * pessoa se lembra é de quem lhe respondeu da última vez, e não de quem está
 * mais perto, livre, e sabe fazer aquilo.
 *
 * As três perguntas que uma pessoa faria se tivesse tempo para as fazer:
 *
 *     "quem é que SABE fazer isto?"   ← as especialidades que as tarefas pedem
 *     "quem está LIVRE?"              ← a agenda, com férias e feriados
 *     "quem está PERTO?"              ← as outras paragens do dia dessa pessoa
 *
 * ⚠ **Isto sugere; não decide.** Devolve uma lista ordenada com a razão de
 * cada lugar escrita por extenso, e quem coordena escolhe — incluindo escolher
 * o terceiro, que é frequentemente o certo por um motivo que nenhum código
 * sabe (o cliente conhece-o, a carrinha tem a peça, ele pediu para ir).
 * Uma sugestão sem o "porquê" ao lado é um oráculo, e ninguém confia num
 * oráculo à segunda vez que ele erra.
 *
 * ⚠ **Nenhum serviço de fora.** Distância em linha reta, com a mesma
 * trigonometria de `rota.ts`; agenda com o que a base já tem. Não há chave de
 * API, não há fatura, e não há dados de ninguém a sair daqui.
 *
 * Puro: nada aqui sabe o que é React nem o que é uma base de dados.
 */

import { chaveDoDia, horasDoCompromisso, type Compromisso } from "./agenda";
import { coordenadasValidas } from "./mapa";
import { distanciaKm } from "./rota";

/* ────────────────────────────── O que entra ─────────────────────────────── */

export interface Ponto {
  latitude: number;
  longitude: number;
}

export interface Candidato {
  utilizador_id: string;
  nome: string;
  funcao: string;
  /** Os ids das especialidades que esta pessoa tem. */
  especialidades: readonly string[];
}

/** Uma ordem já marcada, de quem quer que seja, dentro do horizonte. */
export interface OrdemMarcada {
  id: string;
  responsavel_id: string | null;
  agendada_para: string | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  local_id: string | null;
}

export interface ImpedimentoNoDia {
  utilizador_id: string;
  /** `2026-09-16`, no fuso local. */
  dia: string;
  tipo: "ausente" | "fora_de_horario" | "feriado";
  detalhe: string;
}

export interface Pergunta {
  /** A ordem que se está a despachar. Não se conta a si própria. */
  ordemId: string;
  candidatos: readonly Candidato[];
  /** As especialidades que as tarefas desta ordem pedem. Vazio = não pede nada. */
  exigidas: readonly string[];
  /** id → nome, para as razões saírem em português e não em uuid. */
  nomes: ReadonlyMap<string, string>;
  /** Onde é o trabalho. `null` quando o local não tem ponto no mapa. */
  destino: Ponto | null;
  marcadas: readonly OrdemMarcada[];
  /** `local_id` → ponto. Só os locais que têm coordenadas válidas. */
  pontos: ReadonlyMap<string, Ponto>;
  impedimentos: readonly ImpedimentoNoDia[];
  compromissos: readonly Compromisso[];
  /**
   * Os dias que se olham, por ordem. O primeiro é o dia da ordem quando ela já
   * tem data; senão é hoje.
   */
  dias: readonly Date[];
  /** A hora já marcada, se houver. Sem ela não há choque de hora nenhum. */
  hora: Date | null;
}

/* ────────────────────────────── O que sai ───────────────────────────────── */

export interface Perfil {
  exigidas: number;
  tem: number;
  /** Os nomes das que faltam, para se poder dizer qual. */
  falta: string[];
}

export interface Bloqueio {
  tipo: "ausente" | "feriado" | "fora_de_horario" | "choque";
  texto: string;
}

export interface Sugestao {
  utilizador_id: string;
  nome: string;
  funcao: string;
  /** 0 a 100. Só serve para ordenar — não é uma probabilidade de nada. */
  pontos: number;
  /** `null` quando a ordem não pede especialidade nenhuma. */
  perfil: Perfil | null;
  /** Quilómetros em linha reta à paragem mais próxima dessa pessoa, nesse dia. */
  km: number | null;
  /** Horas já comprometidas no dia que se está a olhar. */
  horasNoDia: number;
  /** O primeiro dia do horizonte em que esta pessoa cabe. `null` = nenhum. */
  primeiroDiaLivre: Date | null;
  /** O que impede, ou desaconselha. Nunca proíbe: quem decide é quem coordena. */
  bloqueios: Bloqueio[];
  /** As razões do lugar que ocupa, escritas para serem lidas. */
  porque: string[];
}

/* ────────────────────────────── As regras ───────────────────────────────── */

/** O que se considera um dia cheio. O mesmo número que a agenda já usa. */
export const HORAS_DE_UM_DIA = 8;

/** Abaixo disto, "está lá ao lado". Acima de `LONGE_KM`, a distância manda. */
export const PERTO_KM = 2;
export const LONGE_KM = 40;

/**
 * Quanto pesa cada pergunta.
 *
 * A especialidade pesa mais do que as outras duas juntas, e é de propósito:
 * mandar a pessoa errada a 3 km custa uma segunda visita, e mandar a pessoa
 * certa a 30 km custa meia hora de carro. Uma dessas contas é muito pior do
 * que a outra.
 *
 * **Uma pergunta sem resposta não vota.** Se a ordem não pede especialidade
 * nenhuma, ou se ninguém sabe onde é o local, esse peso reparte-se pelos
 * restantes em vez de contar como zero. Contar um desconhecido como zero
 * castigava toda a gente por igual — e mudava a ordem final por causa de uma
 * coisa que não se sabe.
 */
export const PESOS = { perfil: 0.5, agenda: 0.3, proximidade: 0.2 } as const;

/* ─────────────────────────── Peças de cálculo ───────────────────────────── */

/**
 * Quantas horas ocupa uma ordem marcada.
 *
 * Com janela, é a janela. Sem janela, uma hora — o mesmo pressuposto que o
 * aviso de choque e a régua da agenda já usam. Três sítios a assumir durações
 * diferentes dariam três respostas sobre o mesmo dia.
 */
export function horasDaOrdem(o: OrdemMarcada): number {
  if (o.janela_inicio && o.janela_fim) {
    const h = (new Date(o.janela_fim).getTime() - new Date(o.janela_inicio).getTime()) / 3_600_000;
    return Number.isFinite(h) && h > 0 ? h : 1;
  }
  return 1;
}

/** Se dois intervalos se cruzam nem que seja um minuto. */
function cruzam(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1.getTime() < b2.getTime() && b1.getTime() < a2.getTime();
}

/** O intervalo que uma ordem ocupa: a janela, ou uma hora a partir da marca. */
function intervalo(o: OrdemMarcada): [Date, Date] | null {
  const marca = o.agendada_para ? new Date(o.agendada_para) : null;
  if (!marca || Number.isNaN(marca.getTime())) return null;
  const de = o.janela_inicio ? new Date(o.janela_inicio) : marca;
  const ate = o.janela_fim ? new Date(o.janela_fim) : new Date(de.getTime() + 3_600_000);
  return [de, ate];
}

/**
 * A carga de cada pessoa, dia a dia.
 *
 * Ordens e compromissos do CRM na mesma conta. A agenda é uma só: uma pessoa
 * com uma visita comercial às 10h não está livre às 10h, e até se cruzarem as
 * duas Operações dizia que estava.
 */
function cargaPorDia(p: Pergunta): Map<string, Map<string, number>> {
  const fora = new Map<string, Map<string, number>>();

  const somar = (uid: string, dia: string, horas: number) => {
    const meu = fora.get(uid) ?? new Map<string, number>();
    meu.set(dia, (meu.get(dia) ?? 0) + horas);
    fora.set(uid, meu);
  };

  for (const o of p.marcadas) {
    if (o.id === p.ordemId) continue; // a própria não conta contra ninguém
    if (!o.responsavel_id || !o.agendada_para) continue;
    const quando = new Date(o.agendada_para);
    if (Number.isNaN(quando.getTime())) continue;
    somar(o.responsavel_id, chaveDoDia(quando), horasDaOrdem(o));
  }

  for (const c of p.compromissos) {
    const quando = new Date(c.inicio);
    if (Number.isNaN(quando.getTime())) continue;
    somar(c.utilizador_id, chaveDoDia(quando), horasDoCompromisso(c));
  }

  return fora;
}

/** Os impedimentos de uma pessoa, num dia. */
function impedimentosDe(
  p: Pergunta,
  uid: string,
  dia: string
): ImpedimentoNoDia[] {
  return p.impedimentos.filter(
    // Um feriado é de toda a gente: vem sem dono, ou com o dono a zeros.
    (i) => i.dia === dia && (i.tipo === "feriado" || i.utilizador_id === uid)
  );
}

/**
 * A que distância é que esta pessoa já vai estar, nesse dia.
 *
 * Mede-se à paragem mais próxima que ela já tem marcada — não à média nem à
 * primeira. Quem já tem uma visita no mesmo prédio está *lá*, e é isso que
 * interessa; a média de duas paragens em pontas opostas da cidade daria um
 * ponto onde ninguém vai estar.
 *
 * `null` quando não se sabe: sem destino, sem paragens nesse dia, ou com
 * paragens em locais que ninguém pôs no mapa. Não se inventa um número.
 */
function kmNoDia(p: Pergunta, uid: string, dia: string): number | null {
  if (!p.destino) return null;

  let melhor: number | null = null;
  for (const o of p.marcadas) {
    if (o.id === p.ordemId) continue;
    if (o.responsavel_id !== uid || !o.agendada_para || !o.local_id) continue;
    if (chaveDoDia(new Date(o.agendada_para)) !== dia) continue;
    const ponto = p.pontos.get(o.local_id);
    if (!ponto) continue;
    const km = distanciaKm(p.destino, ponto);
    if (melhor === null || km < melhor) melhor = km;
  }
  return melhor;
}

/** 1 ao pé da porta, 0 a partir de `LONGE_KM`, a descer a direito no meio. */
function pontosDeProximidade(km: number): number {
  if (km <= PERTO_KM) return 1;
  if (km >= LONGE_KM) return 0;
  return 1 - (km - PERTO_KM) / (LONGE_KM - PERTO_KM);
}

/* ───────────────────────────── A sugestão ───────────────────────────────── */

/**
 * A lista de quem devia ir, do mais indicado ao menos.
 *
 * Devolve **toda a gente**, e não só os três primeiros. Esconder o resto
 * transformava uma sugestão num veredicto: quem coordena tem de conseguir ver
 * porque é que a pessoa em que estava a pensar ficou em quinto — e às vezes a
 * resposta é que o motivo não se aplica hoje.
 */
export function sugerirTecnicos(p: Pergunta): Sugestao[] {
  const carga = cargaPorDia(p);
  const dias = p.dias.map(chaveDoDia);
  const diaAlvo = dias[0] ?? chaveDoDia(new Date());
  const janelaDaOrdem = p.hora
    ? ([p.hora, new Date(p.hora.getTime() + 3_600_000)] as [Date, Date])
    : null;

  const exigidas = [...new Set(p.exigidas)];

  const fora = p.candidatos.map((c): Sugestao => {
    const minhas = carga.get(c.utilizador_id) ?? new Map<string, number>();
    const horasNoDia = minhas.get(diaAlvo) ?? 0;
    const bloqueios: Bloqueio[] = [];
    const porque: string[] = [];

    /* ── 1. Sabe fazer isto? ──────────────────────────────────────────── */
    let perfil: Perfil | null = null;
    if (exigidas.length > 0) {
      const tem = c.especialidades ?? [];
      const falta = exigidas.filter((id) => !tem.includes(id));
      perfil = {
        exigidas: exigidas.length,
        tem: exigidas.length - falta.length,
        falta: falta.map((id) => p.nomes.get(id) ?? "especialidade sem nome"),
      };
      if (falta.length === 0) {
        porque.push(
          exigidas.length === 1
            ? `Tem a especialidade que a ordem pede (${p.nomes.get(exigidas[0]) ?? "—"}).`
            : `Tem as ${exigidas.length} especialidades que a ordem pede.`
        );
      } else {
        porque.push(`Não tem ${listar(perfil.falta)}.`);
      }
    }

    /* ── 2. Está livre? ───────────────────────────────────────────────── */
    const impedeAlvo = impedimentosDe(p, c.utilizador_id, diaAlvo);
    for (const i of impedeAlvo) {
      if (i.tipo === "ausente") {
        bloqueios.push({ tipo: "ausente", texto: "Tem ausência aprovada nesse dia." });
      } else if (i.tipo === "feriado") {
        bloqueios.push({ tipo: "feriado", texto: `Nesse dia é feriado: ${i.detalhe}.` });
      } else {
        bloqueios.push({
          tipo: "fora_de_horario",
          texto: "A hora marcada está fora do horário declarado desta pessoa.",
        });
      }
    }

    // Choque de hora: só existe se a ordem já tiver hora marcada.
    if (janelaDaOrdem) {
      for (const o of p.marcadas) {
        if (o.id === p.ordemId || o.responsavel_id !== c.utilizador_id) continue;
        const outra = intervalo(o);
        if (!outra) continue;
        if (cruzam(janelaDaOrdem[0], janelaDaOrdem[1], outra[0], outra[1])) {
          bloqueios.push({ tipo: "choque", texto: "Já tem outra ordem a essa hora." });
          break;
        }
      }
    }

    // O primeiro dia do horizonte em que ainda cabe alguma coisa.
    const primeiro = dias.findIndex(
      (d) =>
        (minhas.get(d) ?? 0) < HORAS_DE_UM_DIA &&
        impedimentosDe(p, c.utilizador_id, d).every((i) => i.tipo === "fora_de_horario")
    );
    const primeiroDiaLivre = primeiro >= 0 ? p.dias[primeiro] : null;

    let agenda: number;
    if (bloqueios.length > 0) {
      agenda = 0;
    } else if (p.hora) {
      // Há data marcada: o que interessa é o quão cheio está ESSE dia.
      agenda = 1 - Math.min(1, horasNoDia / HORAS_DE_UM_DIA);
      porque.push(
        horasNoDia === 0
          ? "Tem o dia todo livre."
          : `Já tem ${comoHoras(horasNoDia)} marcadas nesse dia.`
      );
    } else {
      // Sem data: o que interessa é quão cedo é que ela pode ir.
      agenda = primeiro < 0 ? 0 : 1 - primeiro / Math.max(1, dias.length);
      porque.push(
        primeiroDiaLivre
          ? `Tem espaço já a partir de ${comoDia(primeiroDiaLivre)}.`
          : `Não tem espaço nenhum nos próximos ${dias.length} dias.`
      );
    }

    /* ── 3. Está perto? ───────────────────────────────────────────────── */
    const diaDaDistancia = p.hora
      ? diaAlvo
      : primeiroDiaLivre
        ? chaveDoDia(primeiroDiaLivre)
        : diaAlvo;
    const km = kmNoDia(p, c.utilizador_id, diaDaDistancia);
    if (km !== null) {
      porque.push(`Já vai estar a ${comoKm(km)} dali nesse dia.`);
    }

    /* ── A conta ──────────────────────────────────────────────────────── */
    const parcelas: { peso: number; valor: number }[] = [
      { peso: PESOS.agenda, valor: agenda },
    ];
    if (perfil) {
      parcelas.push({ peso: PESOS.perfil, valor: perfil.tem / perfil.exigidas });
    }
    if (km !== null) {
      parcelas.push({ peso: PESOS.proximidade, valor: pontosDeProximidade(km) });
    }

    const totalDosPesos = parcelas.reduce((s, x) => s + x.peso, 0);
    const soma = parcelas.reduce((s, x) => s + x.peso * x.valor, 0);
    const pontos = totalDosPesos > 0 ? Math.round((soma / totalDosPesos) * 100) : 0;

    return {
      utilizador_id: c.utilizador_id,
      nome: c.nome,
      funcao: c.funcao,
      pontos,
      perfil,
      km,
      horasNoDia,
      primeiroDiaLivre,
      bloqueios,
      porque,
    };
  });

  /*
   * O desempate final é sempre o nome. Sem ele, duas pessoas com a mesma
   * pontuação trocam de lugar entre carregar duas vezes no mesmo botão — e uma
   * sugestão que muda sozinha não se consegue discutir com ninguém.
   */
  return fora.sort(
    (a, b) =>
      b.pontos - a.pontos ||
      a.bloqueios.length - b.bloqueios.length ||
      a.nome.localeCompare(b.nome, "pt")
  );
}

/* ──────────────────────── Como se diz em voz alta ───────────────────────── */

/** "Eletricista" · "Eletricista e AVAC" · "Eletricista, AVAC e Canalizador" */
export function listar(nomes: readonly string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** "1 h" · "1 h 30" · "6 h" — sem casas decimais a fingir precisão. */
export function comoHoras(h: number): string {
  const inteiras = Math.floor(h);
  const minutos = Math.round((h - inteiras) * 60);
  if (minutos === 0) return `${inteiras} h`;
  if (inteiras === 0) return `${minutos} min`;
  return `${inteiras} h ${String(minutos).padStart(2, "0")}`;
}

/** A mesma escala que a rota do dia usa: metros abaixo de 1 km. */
export function comoKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** "seg, 16/09" — o dia da semana ajuda mais do que o ano. */
export function comoDia(d: Date): string {
  return d.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/* ──────────────────────── Ajudas para quem chama ────────────────────────── */

/** Os pontos dos locais que estão mesmo no mapa. Os outros ficam de fora. */
export function pontosDosLocais(
  locais: readonly { id: string; latitude: number | null; longitude: number | null }[]
): Map<string, Ponto> {
  const m = new Map<string, Ponto>();
  for (const l of locais) {
    if (coordenadasValidas(l.latitude, l.longitude)) {
      m.set(l.id, { latitude: l.latitude as number, longitude: l.longitude as number });
    }
  }
  return m;
}

/**
 * Os dias que se olham: `quantos` a partir de `de`, inclusive.
 *
 * Fins de semana entram. Quem trabalha ao sábado tem o sábado na agenda, e
 * saltá-lo aqui era o código a decidir por uma empresa que ele não conhece —
 * as ausências e os horários do CRM já dizem quem não trabalha quando.
 */
export function diasAOlhar(de: Date, quantos: number): Date[] {
  const zero = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  return Array.from({ length: Math.max(1, quantos) }, (_, i) => {
    const d = new Date(zero);
    d.setDate(d.getDate() + i);
    return d;
  });
}
