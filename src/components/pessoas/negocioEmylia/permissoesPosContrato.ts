// O que a ficha pode oferecer no Negócio, no Financeiro e na Obra: `pessoas.edit` da ficha E as permissões da Emylia lidas da base COM SUCESSO. Três
// estados, nunca confundidos: a ler, falhou, lidas. Uma leitura que falha NÃO vale por «sem permissões» e não dá gravar: diz-se, com repetir. A guarda do
// ecrã não é a guarda: a base recusa na mesma em neg_guardar_negocio. Os códigos são os reais da base (CODIGO_BASE em permissoes.ts:
// negocios.validar_pagamento, negocios.registar_fatura, client_contracts.cancel, negocios.obra.planear, negocios.margem.aprovar; 20270102200000).
import { useCallback, useEffect, useState } from "react";
import { definirPermissoesReais } from "@/emylia/permissoes";
import { CODIGOS_NEGOCIOS } from "@/emylia/permissoesReais";
import type { Estado } from "@/emylia/motor";
import { supabase } from "@/integrations/supabase/client";

/**
 * As permissões de quem entrou, lidas por `fn_cat_pode(org, código)`: a MESMA função com que o servidor decide nas funções do Negócio
 * (neg_guardar_negocio, obra_guardar_negocio, neg_perder_negocio, …; 20270101340000 e 20270105200000) e que dá EXECUTE a authenticated.
 * Junta o perfil da Olyvia (has_anew_permission_in_org), o Papel no Negócio do RH (fn_neg_papel_permite) e o admin do sistema. Antes lia-se
 * `fn_neg_tem_permissao_org`, que ignora o Papel no Negócio e o admin do sistema e escondia ações que o servidor deixa fazer (3/11). O
 * `tem_permissao(org, perm)` que o código da Emylia pergunta não existe nesta base. `null`: a leitura falhou.
 */
export async function lerPermissoesDaFicha(org: string): Promise<ReadonlySet<string> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  try {
    const r = await Promise.all(CODIGOS_NEGOCIOS.map((codigo) => db.rpc("fn_cat_pode", { p_org: org, p_perm: codigo }) as Promise<{ data: unknown; error: unknown }>));
    if (r.some((x) => x.error)) return null;
    return new Set(CODIGOS_NEGOCIOS.filter((_, i) => r[i].data === true));
  } catch {
    return null;
  }
}

export type LeituraDePermissoes = { k: "a-ler" } | { k: "falhou" } | { k: "lidas"; codigos: ReadonlySet<string> };

/** O que a ficha pode oferecer a quem entrou. */
export interface PodeNoPosContrato {
  /** Escrever (gravar o negócio): `pessoas.edit` na ficha, mais as permissões da base lidas com sucesso. */
  gravar: boolean;
  /** As permissões da base ainda estão a ser lidas. */
  aLer: boolean;
  /** A leitura das permissões falhou: não se grava e diz-se. */
  falhou: boolean;
}

export function podeNoPosContrato(podeEditarFicha: boolean, leitura: LeituraDePermissoes): PodeNoPosContrato {
  return { gravar: podeEditarFicha && leitura.k === "lidas", aLer: leitura.k === "a-ler", falhou: leitura.k === "falhou" };
}

/** Põe as permissões reais no motor enquanto a ficha está aberta e fixa o papel; devolve o que a ficha pode e como repetir a leitura. */
export function usePermissoesPosContrato(org: string | null, S: Estado | null, podeEditarFicha: boolean): PodeNoPosContrato & { repetir: () => void } {
  const [lida, setLida] = useState<{ org: string; tentativa: number; leitura: LeituraDePermissoes } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!org) return;
    let cancelado = false;
    void lerPermissoesDaFicha(org).then((codigos) => {
      if (!cancelado) setLida({ org, tentativa, leitura: codigos ? { k: "lidas", codigos } : { k: "falhou" } });
    });
    return () => { cancelado = true; };
  }, [org, tentativa]);
  const leitura: LeituraDePermissoes = lida && lida.org === org && lida.tentativa === tentativa ? lida.leitura : { k: "a-ler" };
  useEffect(() => {
    // sem leitura bem-sucedida fica um conjunto vazio: a Emylia não dá nada por concedido
    definirPermissoesReais({ codigos: leitura.k === "lidas" ? leitura.codigos : new Set(), simular: false });
    return () => definirPermissoesReais(null);
  }, [leitura]);
  // o papel da Emylia no Pipeline é fixo; muda-se num efeito, nunca durante o render
  useEffect(() => { if (S && S.role !== "direcao") S.role = "direcao"; }, [S]);
  const repetir = useCallback(() => { setTentativa((n) => n + 1); }, []);
  return { ...podeNoPosContrato(podeEditarFicha, leitura), repetir };
}
