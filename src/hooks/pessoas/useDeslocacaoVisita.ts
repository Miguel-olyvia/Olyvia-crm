// Quem consegue chegar à visita, por recurso e por hora. Lê as visitas vizinhas do dia (neg_visitas_vizinhas: só início, fim e coordenadas) e avalia
// cada hora livre com a regra 13 do main (deslocacaoVisita.ts). Um recurso de que a base não deu dados (inativo, fora da lista, resposta inválida,
// erro, função por colar: PGRST202, 42883) continua escolhível como hoje, mas NUNCA se dá por verificado: `semDadosDe` diz-o e o ecrã avisa.
// Recursos da agenda, nunca utilizadores. Só o fuso Europe/Lisbon é suportado (as horas livres são de Lisboa): outro fuso vale «sem dados».
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { instanteLisboa } from "./tempoLisboa";
import {
  avaliarViagem, type AlmocoVizinhas, type PontoDestino, type RecursoVizinhas, type Veredicto, type VisitaVizinha, type VizinhasDoDia,
} from "./deslocacaoVisita";
import { useFontePessoas } from "./useFontePessoas";

const MS_MINUTO = 60_000;
/** A base só aceita até 50 recursos por chamada: partem-se os ids em blocos deste tamanho. */
const MAX_RECURSOS_POR_CHAMADA = 50;
const FUSO_SUPORTADO = "Europe/Lisbon";

const semFuncao = (code: string | undefined): boolean => code === "PGRST202" || code === "42883";
const ehData = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const ehCoordenada = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));

function validarVisita(v: unknown): VisitaVizinha | null {
  const x = v as { inicio?: unknown; fim?: unknown; lat?: unknown; lng?: unknown } | null;
  if (!x || typeof x !== "object") return null;
  const lat = x.lat ?? null, lng = x.lng ?? null;
  if (!ehData(x.inicio) || !ehData(x.fim) || !ehCoordenada(lat) || !ehCoordenada(lng)) return null;
  return { inicio: x.inicio, fim: x.fim, lat, lng };
}

/** Um recurso só vale se tem id e TODAS as visitas são válidas; senão fica de fora e conta como «sem dados» (nunca se ignora uma visita em silêncio). */
function validarRecurso(r: unknown): RecursoVizinhas | null {
  const x = r as { resource_id?: unknown; resource_name?: unknown; latitude?: unknown; longitude?: unknown; visitas?: unknown } | null;
  if (!x || typeof x !== "object" || typeof x.resource_id !== "string" || !Array.isArray(x.visitas)) return null;
  const visitas = x.visitas.map(validarVisita);
  if (visitas.some((v) => v === null)) return null;
  const lat = x.latitude ?? null, lng = x.longitude ?? null;
  const base = ehCoordenada(lat) && ehCoordenada(lng) ? { latitude: lat, longitude: lng } : { latitude: null, longitude: null };
  return { resource_id: x.resource_id, resource_name: typeof x.resource_name === "string" ? x.resource_name : null, ...base, visitas: visitas as VisitaVizinha[] };
}

/** Aceita só o que tem a forma esperada; qualquer outra coisa (uma resposta de outra função, um fuso que não é o de Lisboa) vale «sem dados». */
function lerVizinhas(data: unknown): VizinhasDoDia | null {
  const d = data as { recursos?: unknown; almoco?: unknown } | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.recursos)) return null;
  const almoco = d.almoco && typeof d.almoco === "object" ? d.almoco as AlmocoVizinhas : null;
  if (almoco?.timezone && almoco.timezone !== FUSO_SUPORTADO) {
    console.warn("neg_visitas_vizinhas", "fuso-nao-suportado");
    return null;
  }
  return { recursos: d.recursos.map(validarRecurso).filter((r): r is RecursoVizinhas => r !== null), almoco };
}

export interface Deslocacao {
  /** A ler as visitas vizinhas (só a primeira leitura: a lista não desaparece ao voltar à janela). */
  aLer: boolean;
  /** A base não deu dados deste recurso (ou não se leu nada): continua escolhível, mas não verificado. false enquanto se lê ou sem dia escolhido. */
  semDadosDe: (recursoId: string) => boolean;
  /** Quantos dos recursos pedidos ficaram sem dados. */
  semDadosTotal: number;
  /** O veredicto de um recurso a uma hora; undefined se não se pode avaliar (a ler, sem dados deste recurso, hora inválida). */
  veredicto: (recursoId: string, hora: string) => Veredicto | undefined;
  /** As horas em que o recurso consegue ir. Sem dados do recurso: todas (não se bloqueia por desconhecimento, mas fica `semDadosDe`). */
  horasQuePode: (recursoId: string, horas: readonly string[] | undefined) => string[] | undefined;
  /** O que a base deu deste recurso no dia (base e visitas vizinhas); undefined se não deu. */
  recursoDe: (recursoId: string) => RecursoVizinhas | undefined;
  /** O veredicto da hora em que o recurso parte de mais perto (para mostrar a viagem estimada); sem horas ou sem origem, undefined. */
  melhorVeredicto: (recursoId: string, horas: readonly string[] | undefined) => Veredicto | undefined;
  /** O km mais curto do recurso (da vizinha ou da base) entre as suas horas; para ordenar. null se não se sabe. */
  kmDoRecurso: (recursoId: string, horas: readonly string[] | undefined) => number | null;
}

interface Entrada {
  recursos: readonly string[];
  /** AAAA-MM-DD; vazio = ainda não escolhido. */
  dia: string;
  duracaoMin: number;
  destino: PontoDestino | null;
  /** Ao remarcar: a visita que se remarca não conta como vizinha (a base deixa-a de fora). */
  excluirId?: string | null;
  ativo?: boolean;
}

/** Uma chamada por bloco de 50 ids; um bloco que falha deixa só os seus recursos «sem dados». Null se nenhum bloco deu dados. */
async function lerDoDia(org: string, ids: readonly string[], dia: string, excluir: string | null): Promise<VizinhasDoDia | null> {
  const blocos: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_RECURSOS_POR_CHAMADA) blocos.push(ids.slice(i, i + MAX_RECURSOS_POR_CHAMADA));
  const respostas = await Promise.all(blocos.map(async (bloco) => {
    const { data, error } = await supabase.rpc("neg_visitas_vizinhas" as never, { p_organization_id: org, p_resource_ids: bloco, p_date: dia, p_exclude_item_id: excluir } as never);
    if (error) {
      // só o código, nunca morada, código postal nem nomes; a função por colar é esperada e não se regista
      if (!semFuncao(error.code)) console.warn("neg_visitas_vizinhas", error.code ?? "sem-codigo");
      return null;
    }
    return lerVizinhas(data);
  }));
  const lidas = respostas.filter((r): r is VizinhasDoDia => r !== null);
  if (lidas.length === 0) return null;
  return { recursos: lidas.flatMap((r) => r.recursos), almoco: lidas.find((r) => r.almoco)?.almoco ?? null };
}

export function useDeslocacaoVisita(e: Entrada): Deslocacao {
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const ids = useMemo(() => [...new Set(e.recursos)].sort(), [e.recursos]);
  const ativo = (e.ativo ?? true) && org !== null && e.dia !== "" && ids.length > 0;
  const excluir = e.excluirId ?? null;
  const q = useQuery({
    queryKey: ["neg-visitas-vizinhas", org, ids, e.dia, excluir],
    enabled: ativo,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () => lerDoDia(org as string, ids, e.dia, excluir),
  });
  const dados = ativo ? q.data ?? null : null;
  const aLer = ativo && q.isLoading;
  const porRecurso = useMemo(() => new Map((dados?.recursos ?? []).map((r) => [r.resource_id, r])), [dados]);
  // a cache vale enquanto não mudam os dados, o dia, a duração, o destino nem a visita excluída
  const cacheRef = useRef<{ chave: unknown[]; mapa: Map<string, Veredicto | undefined> }>({ chave: [], mapa: new Map() });
  const chaveAtual = [dados, e.dia, e.duracaoMin, e.destino, excluir];
  if (cacheRef.current.chave.length !== chaveAtual.length || cacheRef.current.chave.some((x, i) => x !== chaveAtual[i])) {
    cacheRef.current = { chave: chaveAtual, mapa: new Map() };
  }
  const cache = cacheRef.current.mapa;

  const semDadosDe = (recursoId: string): boolean => ativo && !aLer && !porRecurso.has(recursoId);
  const veredicto = (recursoId: string, hora: string): Veredicto | undefined => {
    const recurso = porRecurso.get(recursoId);
    if (!dados || !recurso) return undefined;
    const chave = `${recursoId}|${hora}`;
    if (cache.has(chave)) return cache.get(chave);
    const inicio = instanteLisboa(e.dia, hora);
    const resultado = inicio === null ? undefined : avaliarViagem({
      recurso, inicio, fim: new Date(Date.parse(inicio) + e.duracaoMin * MS_MINUTO).toISOString(), destino: e.destino, almoco: dados.almoco,
    });
    cache.set(chave, resultado);
    return resultado;
  };
  const horasQuePode = (recursoId: string, horas: readonly string[] | undefined): string[] | undefined =>
    horas === undefined ? undefined : horas.filter((h) => veredicto(recursoId, h)?.pode !== false);
  const kmDoRecurso = (recursoId: string, horas: readonly string[] | undefined): number | null => {
    const kms = (horas ?? []).map((h) => veredicto(recursoId, h)?.km).filter((k): k is number => typeof k === "number");
    return kms.length > 0 ? Math.min(...kms) : null;
  };
  const melhorVeredicto = (recursoId: string, horas: readonly string[] | undefined): Veredicto | undefined => {
    const todos = (horas ?? []).map((h) => veredicto(recursoId, h)).filter((v): v is Veredicto => v !== undefined);
    const comKm = todos.filter((v) => v.km !== null).sort((x, y) => (x.km as number) - (y.km as number));
    return comKm[0] ?? todos[0];
  };
  return {
    aLer, semDadosDe, semDadosTotal: ids.filter(semDadosDe).length, veredicto, horasQuePode, kmDoRecurso, melhorVeredicto,
    recursoDe: (recursoId) => porRecurso.get(recursoId),
  };
}
