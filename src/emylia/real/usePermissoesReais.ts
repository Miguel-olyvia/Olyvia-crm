// 5/11: as permissões de quem entrou nos Negócios, lidas por `fn_cat_pode(org, código)` (a MESMA função com que o servidor decide) e
// postas no motor da Emylia (definirPermissoesReais, `simular: false`). Usado pela ficha da pessoa (permissoesPosContrato.ts) e por
// /negocios (NegociosEmylia.tsx). Três estados, nunca confundidos: a ler, falhou, lidas. Uma leitura que falha NÃO vale por «sem
// permissões»: diz-se, com repetir. Enquanto não há leitura bem-sucedida o motor recebe um conjunto vazio (nada se dá por concedido).
// O ecrã não é a guarda: a base recusa na mesma.
import { useCallback, useEffect, useState } from "react";
import { definirPermissoesReais } from "@/emylia/permissoes";
import { CODIGOS_NEGOCIOS } from "@/emylia/permissoesReais";
import { supabase } from "@/integrations/supabase/client";

/**
 * As permissões de quem entrou, lidas por `fn_cat_pode(org, código)`: a MESMA função com que o servidor decide nas funções do Negócio
 * (neg_guardar_negocio, obra_guardar_negocio, neg_perder_negocio, …; 20270101340000 e 20270105200000) e que dá EXECUTE a authenticated.
 * Junta o perfil da Olyvia (has_anew_permission_in_org), o Papel no Negócio do RH (fn_neg_papel_permite, de TODOS os papéis da pessoa) e
 * o admin do sistema. Antes lia-se `fn_neg_tem_permissao_org`, que ignora o Papel no Negócio e o admin do sistema e escondia ações que o
 * servidor deixa fazer (3/11). O `tem_permissao(org, perm)` que o código da Emylia pergunta não existe nesta base. `null`: a leitura falhou.
 */
export async function lerPermissoesReais(org: string): Promise<ReadonlySet<string> | null> {
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

/** Lê as permissões de `org`, põe-nas no motor enquanto o componente está montado (e tira-as ao sair: `null`) e devolve a leitura e como
 *  repetir. O papel da Emylia (`S.role`) não se toca aqui: na ficha fixa-o permissoesPosContrato.ts; em /negocios escolhe-o o «A ver como». */
export function usePermissoesReaisNegocio(org: string | null): { leitura: LeituraDePermissoes; repetir: () => void } {
  const [lida, setLida] = useState<{ org: string; tentativa: number; leitura: LeituraDePermissoes } | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!org) return;
    let cancelado = false;
    void lerPermissoesReais(org).then((codigos) => {
      if (!cancelado) setLida({ org, tentativa, leitura: codigos ? { k: "lidas", codigos } : { k: "falhou" } });
    });
    return () => { cancelado = true; };
  }, [org, tentativa]);
  const leitura: LeituraDePermissoes = lida && lida.org === org && lida.tentativa === tentativa ? lida.leitura : { k: "a-ler" };
  // 5/11: também já no render, para que o que se desenha nesta passagem (podeVerCustos, podeNeg) use a leitura que acabou de chegar e
  // não a anterior; o efeito abaixo continua a ser quem a deixa posta (e a tira ao sair)
  definirPermissoesReais({ codigos: leitura.k === "lidas" ? leitura.codigos : new Set(), simular: false });
  useEffect(() => {
    // sem leitura bem-sucedida fica um conjunto vazio: a Emylia não dá nada por concedido
    definirPermissoesReais({ codigos: leitura.k === "lidas" ? leitura.codigos : new Set(), simular: false });
    return () => definirPermissoesReais(null);
  }, [leitura]);
  const repetir = useCallback(() => { setTentativa((n) => n + 1); }, []);
  return { leitura, repetir };
}
