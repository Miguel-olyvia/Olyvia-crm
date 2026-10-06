/**
 * O que cada empresa usa: a Manutenção (ordens, planos, locais) e as Obras.
 *
 * Uma empresa que só faz obras (a Mudelar) não precisa de ver Ordens, Planos
 * e Locais no menu — confundem. A base decide (`rpc_ops_modulos`, db/equipa.sql):
 * a escolha feita em Definições ou, sem ela, o que já existe.
 *
 * Nunca esconde nada por engano: sem a RPC instalada, ou se falhar, mostra
 * tudo. As páginas continuam a abrir pelo endereço — só saem do menu.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ErroDeEscrita } from "./dados";

export interface Modulos {
  manutencao: boolean;
  obras: boolean;
  /** A escolha guardada (null = automático). */
  escolhido: { manutencao: boolean | null; obras: boolean | null };
  /** O que já existe na empresa (o que decide o automático). */
  existe: { manutencao: boolean; obras: boolean };
}

export const TUDO: Modulos = {
  manutencao: true,
  obras: true,
  escolhido: { manutencao: null, obras: null },
  existe: { manutencao: false, obras: false },
};

const EVENTO = "operacao-modulos";
const cache = new Map<string, Modulos>();

function normalizar(d: unknown): Modulos {
  const m = (d ?? {}) as Partial<Modulos>;
  if (typeof m.manutencao !== "boolean" || typeof m.obras !== "boolean") return TUDO;
  return {
    manutencao: m.manutencao,
    obras: m.obras,
    escolhido: {
      manutencao: m.escolhido?.manutencao ?? null,
      obras: m.escolhido?.obras ?? null,
    },
    existe: { manutencao: !!m.existe?.manutencao, obras: !!m.existe?.obras },
  };
}

export async function lerModulos(orgId: string): Promise<Modulos> {
  const guardado = cache.get(orgId);
  if (guardado) return guardado;
  try {
    const { data, error } = await supabase.rpc("rpc_ops_modulos", { p_org: orgId });
    if (error) return TUDO;
    const m = normalizar(data);
    cache.set(orgId, m);
    return m;
  } catch {
    return TUDO;
  }
}

export async function gravarModulos(
  orgId: string,
  manutencao: boolean | null,
  obras: boolean | null
): Promise<Modulos> {
  const { data, error } = await supabase.rpc("rpc_ops_gravar_modulos", {
    p_org: orgId,
    p_manutencao: manutencao,
    p_obras: obras,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar.");
  const m = normalizar(data);
  cache.set(orgId, m);
  window.dispatchEvent(new Event(EVENTO));
  return m;
}

/** Para o menu: começa com tudo (nunca pisca vazio) e afina quando a base responde. */
export function useModulos(orgId: string | null): Modulos {
  const [m, setM] = useState<Modulos>(() => (orgId && cache.get(orgId)) || TUDO);
  useEffect(() => {
    if (!orgId) {
      setM(TUDO);
      return;
    }
    let vivo = true;
    const ler = () => {
      lerModulos(orgId).then((x) => vivo && setM(x));
    };
    ler();
    window.addEventListener(EVENTO, ler);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, ler);
    };
  }, [orgId]);
  return m;
}
