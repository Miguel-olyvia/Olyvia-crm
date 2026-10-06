import { supabase } from "./supabase";
import { ErroDeEscrita } from "./dados";

/**
 * Chegada à obra pelo QR da porta (db/chegadas.sql).
 *
 * O SQL é opcional: sem ele aplicado, `registarChegada` devolve null e a app
 * segue só com o início do relógio; `chegadasDaObra` devolve [].
 */

export interface Posicao {
  latitude: number;
  longitude: number;
  precisao: number | null;
}

export interface ChegadaObra {
  id: string;
  obra_id: string;
  utilizador_id: string;
  tarefa_id: string | null;
  chegou_em: string;
  com_localizacao: boolean;
  nome: string;
}

/** O endereço que o QR da porta abre. */
export function urlChegada(codigo: string, origem = window.location.origin): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${origem}${base}/obras/${encodeURIComponent(codigo)}?chegada=1`;
}

function semSql(e: { code?: string; message?: string }): boolean {
  const m = e.message ?? "";
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    m.includes("Could not find the function") ||
    m.includes("does not exist")
  );
}

export async function registarChegada(args: {
  obraId: string;
  tarefaId?: string | null;
  posicao?: Posicao | null;
}): Promise<{ id: string; chegou_em: string } | null> {
  const p = args.posicao;
  const { data, error } = await supabase.rpc("rpc_ops_obra_registar_chegada", {
    p_obra_id: args.obraId,
    p_tarefa_id: args.tarefaId ?? null,
    p_latitude: p ? p.latitude : null,
    p_longitude: p ? p.longitude : null,
    p_precisao_m: p?.precisao ?? null,
  });
  if (error) {
    if (semSql(error)) return null;
    throw new ErroDeEscrita(error.message || "Não foi possível registar a chegada.");
  }
  return data as { id: string; chegou_em: string };
}

/** As chegadas de uma obra desde `desde` (ISO), a mais recente primeiro. */
export async function chegadasDaObra(obraId: string, desde: string): Promise<ChegadaObra[]> {
  try {
    const { data, error } = await supabase
      .from("ops_v_obra_chegada")
      .select("id, obra_id, utilizador_id, tarefa_id, chegou_em, com_localizacao, nome")
      .eq("obra_id", obraId)
      .gte("chegou_em", desde)
      .order("chegou_em", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []) as ChegadaObra[];
  } catch {
    // Informativo: sem a vista (SQL por aplicar) ou sem rede, não se mostra nada.
    return [];
  }
}

/**
 * A posição do telemóvel — SÓ quando a pessoa a pediu. null se o browser não
 * tiver geolocalização, se a pessoa recusar, ou se demorar mais de `ms`.
 */
export function obterPosicao(ms = 8000): Promise<Posicao | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisao: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: ms, maximumAge: 60_000 }
    );
  });
}
