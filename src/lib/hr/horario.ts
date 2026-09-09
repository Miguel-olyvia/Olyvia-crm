/**
 * O modelo de horario variavel do lado do ecra, e as contas que o acompanham.
 *
 * O REQUISITO, NAS PALAVRAS DE QUEM O PEDIU
 * -----------------------------------------
 * "neste dia ela fez das 9 as 14 naquela empresa e so das 15 as 19 naquilo";
 * "as senhoras da limpeza nao teem horas fixas por semana e sim por exemplo na
 * segunda das 3 as 6, terca das 7 as 9".
 *
 * Ou seja: NAO ha horario semanal fixo. Ha dias, cada dia com VARIOS
 * intervalos, e cada intervalo com o seu LOCAL. Uma linha da base =
 * `pessoas_horario_planeado` = UM intervalo (20261120150000).
 *
 * PRECEDENCIA (a mesma que esta no COMMENT da tabela)
 * --------------------------------------------------
 * Se existir qualquer linha viva com `data = D`, essa data e definida
 * EXCLUSIVAMENTE por essas linhas -- o padrao semanal e ignorado nesse dia.
 * Uma excepcao sem intervalos (ou com `nao_trabalha`) e folga naquela data.
 *
 * MEIA-NOITE
 * ----------
 * A base tem `CHECK (hora_fim > hora_inicio)`: um turno que atravessa a
 * meia-noite representa-se como DUAS linhas, em dois dias. `partirNaMeiaNoite`
 * faz essa divisao, para o ecra nunca chegar a receber o erro do servidor.
 *
 * Aqui nao ha acesso a base: sao formas e funcoes puras, testaveis sem rede.
 */
import type { DiaSemana, HorarioPlaneado } from "@/types/hr";

/** Um intervalo em edicao. `chave` e so para o React; nunca vai para a base. */
export interface IntervaloRascunho {
  chave: string;
  /** `id` da linha na base quando o intervalo ja foi gravado. */
  id?: string;
  hora_inicio: string;
  hora_fim: string;
  local_id: string | null;
}

export interface DiaRascunho {
  /** 0 = domingo .. 6 = sabado, a convencao da base. */
  dia_semana: number;
  nao_trabalha: boolean;
  intervalos: IntervaloRascunho[];
}

export interface ExcepcaoRascunho {
  chave: string;
  data: string;
  nao_trabalha: boolean;
  intervalos: IntervaloRascunho[];
}

export interface HorarioRascunho {
  dias: DiaRascunho[];
  excepcoes: ExcepcaoRascunho[];
}

/**
 * A ordem em que os dias aparecem no ecra: segunda primeiro, porque e assim
 * que se le um horario em Portugal. O INDICE GUARDADO nao muda por isso --
 * domingo continua a ser 0 na base.
 */
export const ORDEM_DIAS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** Chave de traducao do nome do dia, por indice da base. */
const CHAVE_DIA: Record<number, DiaSemana> = {
  0: "dom",
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

export function chaveDoDia(diaSemana: number): DiaSemana {
  return CHAVE_DIA[diaSemana] ?? "seg";
}

let contador = 0;
/** Chave local unica. Nao e um id: nunca se manda para a base. */
export function novaChave(prefixo = "int"): string {
  contador += 1;
  return `${prefixo}-${contador}-${Math.random().toString(36).slice(2, 8)}`;
}

export function horarioVazio(): HorarioRascunho {
  return {
    dias: ORDEM_DIAS.map((dia_semana) => ({ dia_semana, nao_trabalha: false, intervalos: [] })),
    excepcoes: [],
  };
}

export function intervaloVazio(): IntervaloRascunho {
  return { chave: novaChave(), hora_inicio: "", hora_fim: "", local_id: null };
}

// -- Horas -------------------------------------------------------------------

/** "09:30" ou "09:30:00" -> 570. `null` quando nao e uma hora. */
export function minutosDe(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const encaixe = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
  if (!encaixe) return null;
  const h = Number(encaixe[1]);
  const m = Number(encaixe[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Normaliza para "HH:MM", que e o que a base aceita em `time`. */
export function horaNormalizada(hora: string): string {
  const total = minutosDe(hora);
  if (total === null) return hora;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function duracaoMinutos(intervalo: IntervaloRascunho): number {
  const inicio = minutosDe(intervalo.hora_inicio);
  const fim = minutosDe(intervalo.hora_fim);
  if (inicio === null || fim === null || fim <= inicio) return 0;
  return fim - inicio;
}

/** 570 -> "9h30". Zero minutos mostra-se como "0h00", nao como vazio. */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function totalDoDia(intervalos: IntervaloRascunho[]): number {
  return intervalos.reduce((soma, intervalo) => soma + duracaoMinutos(intervalo), 0);
}

/** Um intervalo em que o fim e anterior ao inicio: 22:00 -> 02:00. */
export function atravessaMeiaNoite(intervalo: IntervaloRascunho): boolean {
  const inicio = minutosDe(intervalo.hora_inicio);
  const fim = minutosDe(intervalo.hora_fim);
  return inicio !== null && fim !== null && fim <= inicio;
}

/**
 * Parte um turno nocturno em duas metades: [22:00-24:00] no dia, e
 * [00:00-02:00] no dia seguinte. Devolve `null` se nao houver o que partir.
 */
export function partirNaMeiaNoite(
  intervalo: IntervaloRascunho,
): { hoje: IntervaloRascunho; amanha: IntervaloRascunho } | null {
  if (!atravessaMeiaNoite(intervalo)) return null;
  const fim = minutosDe(intervalo.hora_fim);
  if (fim === null || fim === 0) return null;
  return {
    hoje: { ...intervalo, chave: novaChave(), hora_fim: "23:59" },
    amanha: {
      ...intervalo,
      chave: novaChave(),
      id: undefined,
      hora_inicio: "00:00",
      hora_fim: horaNormalizada(intervalo.hora_fim),
    },
  };
}

/** Dia seguinte, na convencao da base (0..6). */
export function diaSeguinte(diaSemana: number): number {
  return (diaSemana + 1) % 7;
}

/**
 * As chaves dos intervalos que se sobrepoem dentro do mesmo dia.
 *
 * E o espelho do trigger `hr_horario_planeado_sem_sobreposicao` da base: se o
 * ecra apanhar a colisao ao sair do campo, o utilizador nunca chega a ver um
 * erro de servidor por isto. Intervalos incompletos nao colidem com nada.
 */
export function chavesSobrepostas(intervalos: IntervaloRascunho[]): Set<string> {
  const colididas = new Set<string>();
  const validos = intervalos
    .map((intervalo) => ({
      intervalo,
      inicio: minutosDe(intervalo.hora_inicio),
      fim: minutosDe(intervalo.hora_fim),
    }))
    .filter((linha) => linha.inicio !== null && linha.fim !== null && linha.fim > linha.inicio);

  for (let i = 0; i < validos.length; i += 1) {
    for (let j = i + 1; j < validos.length; j += 1) {
      const a = validos[i];
      const b = validos[j];
      // A mesma comparacao explicita da base: a.inicio < b.fim AND b.inicio < a.fim.
      if ((a.inicio as number) < (b.fim as number) && (b.inicio as number) < (a.fim as number)) {
        colididas.add(a.intervalo.chave);
        colididas.add(b.intervalo.chave);
      }
    }
  }
  return colididas;
}

export interface ProblemaHorario {
  chave: string;
  tipo: "sobreposicao" | "incompleto" | "meiaNoite";
}

/** Tudo o que esta mal no rascunho, para o resumo global do assistente. */
export function problemasDoHorario(rascunho: HorarioRascunho): ProblemaHorario[] {
  const problemas: ProblemaHorario[] = [];
  const grupos: IntervaloRascunho[][] = [
    ...rascunho.dias.map((dia) => dia.intervalos),
    ...rascunho.excepcoes.map((excepcao) => excepcao.intervalos),
  ];
  for (const intervalos of grupos) {
    const sobrepostas = chavesSobrepostas(intervalos);
    for (const intervalo of intervalos) {
      if (sobrepostas.has(intervalo.chave)) {
        problemas.push({ chave: intervalo.chave, tipo: "sobreposicao" });
        continue;
      }
      if (atravessaMeiaNoite(intervalo)) {
        problemas.push({ chave: intervalo.chave, tipo: "meiaNoite" });
        continue;
      }
      if (minutosDe(intervalo.hora_inicio) === null || minutosDe(intervalo.hora_fim) === null) {
        problemas.push({ chave: intervalo.chave, tipo: "incompleto" });
      }
    }
  }
  return problemas;
}

/** Minutos por local, para o resumo "Loja Boavista 12h, Sede 8h". */
export function totaisPorLocal(rascunho: HorarioRascunho): Map<string | null, number> {
  const totais = new Map<string | null, number>();
  const todos = [
    ...rascunho.dias.flatMap((dia) => dia.intervalos),
    ...rascunho.excepcoes.flatMap((excepcao) => excepcao.intervalos),
  ];
  for (const intervalo of todos) {
    const minutos = duracaoMinutos(intervalo);
    if (minutos === 0) continue;
    totais.set(intervalo.local_id, (totais.get(intervalo.local_id) ?? 0) + minutos);
  }
  return totais;
}

export function totalSemanal(rascunho: HorarioRascunho): number {
  return rascunho.dias.reduce((soma, dia) => soma + totalDoDia(dia.intervalos), 0);
}

export function temAlgumIntervalo(rascunho: HorarioRascunho): boolean {
  return (
    rascunho.dias.some((dia) => dia.intervalos.length > 0 || dia.nao_trabalha) ||
    rascunho.excepcoes.length > 0
  );
}

// -- Base <-> ecra -----------------------------------------------------------

/** Linha pronta a inserir em `pessoas_horario_planeado`, sem chaves locais. */
export interface LinhaPlaneadoParaGravar {
  dia_semana: number | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  nao_trabalha: boolean;
  ordem: number;
  local_id: string | null;
}

/**
 * Transforma o rascunho em linhas. Uma linha por intervalo; um dia marcado
 * como nao laboravel da uma linha com `nao_trabalha` e horas nulas -- que e
 * exactamente o que os CHECK da base exigem (`nao_trabalha` implica horas e
 * local nulos).
 *
 * Intervalos incompletos sao IGNORADOS, nao rejeitados: quem esta a preencher
 * e deixou uma fila a meio nao perde o resto do horario por isso. O que e
 * invalido a serio (sobreposicao, meia-noite) e apanhado antes, por
 * `problemasDoHorario`.
 */
export function linhasParaGravar(rascunho: HorarioRascunho): LinhaPlaneadoParaGravar[] {
  const linhas: LinhaPlaneadoParaGravar[] = [];

  for (const dia of rascunho.dias) {
    if (dia.nao_trabalha) {
      linhas.push({
        dia_semana: dia.dia_semana,
        data: null,
        hora_inicio: null,
        hora_fim: null,
        nao_trabalha: true,
        ordem: 1,
        local_id: null,
      });
      continue;
    }
    let ordem = 0;
    for (const intervalo of dia.intervalos) {
      if (duracaoMinutos(intervalo) === 0) continue;
      ordem += 1;
      linhas.push({
        dia_semana: dia.dia_semana,
        data: null,
        hora_inicio: horaNormalizada(intervalo.hora_inicio),
        hora_fim: horaNormalizada(intervalo.hora_fim),
        nao_trabalha: false,
        ordem,
        local_id: intervalo.local_id,
      });
    }
  }

  for (const excepcao of rascunho.excepcoes) {
    if (excepcao.data.trim() === "") continue;
    if (excepcao.nao_trabalha || excepcao.intervalos.length === 0) {
      linhas.push({
        dia_semana: null,
        data: excepcao.data,
        hora_inicio: null,
        hora_fim: null,
        nao_trabalha: true,
        ordem: 1,
        local_id: null,
      });
      continue;
    }
    let ordem = 0;
    for (const intervalo of excepcao.intervalos) {
      if (duracaoMinutos(intervalo) === 0) continue;
      ordem += 1;
      linhas.push({
        dia_semana: null,
        data: excepcao.data,
        hora_inicio: horaNormalizada(intervalo.hora_inicio),
        hora_fim: horaNormalizada(intervalo.hora_fim),
        nao_trabalha: false,
        ordem,
        local_id: intervalo.local_id,
      });
    }
  }

  return linhas;
}

/** O caminho de volta: o que esta na base, pronto a editar. */
export function rascunhoDeLinhas(linhas: HorarioPlaneado[]): HorarioRascunho {
  const rascunho = horarioVazio();
  const porData = new Map<string, ExcepcaoRascunho>();

  const ordenadas = [...linhas].sort((a, b) => {
    const chaveA = `${a.data ?? ""}-${String(a.ordem).padStart(2, "0")}-${a.hora_inicio ?? ""}`;
    const chaveB = `${b.data ?? ""}-${String(b.ordem).padStart(2, "0")}-${b.hora_inicio ?? ""}`;
    return chaveA.localeCompare(chaveB);
  });

  for (const linha of ordenadas) {
    if (linha.data) {
      let excepcao = porData.get(linha.data);
      if (!excepcao) {
        excepcao = {
          chave: novaChave("exc"),
          data: linha.data,
          nao_trabalha: false,
          intervalos: [],
        };
        porData.set(linha.data, excepcao);
      }
      if (linha.nao_trabalha) {
        excepcao.nao_trabalha = true;
        continue;
      }
      excepcao.intervalos.push({
        chave: novaChave(),
        id: linha.id,
        hora_inicio: horaNormalizada(linha.hora_inicio ?? ""),
        hora_fim: horaNormalizada(linha.hora_fim ?? ""),
        local_id: linha.local_id,
      });
      continue;
    }

    const dia = rascunho.dias.find((d) => d.dia_semana === linha.dia_semana);
    if (!dia) continue;
    if (linha.nao_trabalha) {
      dia.nao_trabalha = true;
      continue;
    }
    dia.intervalos.push({
      chave: novaChave(),
      id: linha.id,
      hora_inicio: horaNormalizada(linha.hora_inicio ?? ""),
      hora_fim: horaNormalizada(linha.hora_fim ?? ""),
      local_id: linha.local_id,
    });
  }

  rascunho.excepcoes = [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
  return rascunho;
}
