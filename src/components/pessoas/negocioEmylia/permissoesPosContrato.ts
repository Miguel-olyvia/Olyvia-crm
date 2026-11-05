// O que a ficha pode oferecer no Negócio, no Financeiro e na Obra: `pessoas.edit` da ficha E as permissões da Emylia lidas da base COM SUCESSO. Três
// estados, nunca confundidos: a ler, falhou, lidas. Uma leitura que falha NÃO vale por «sem permissões» e não dá gravar: diz-se, com repetir. A guarda do
// ecrã não é a guarda: a base recusa na mesma em neg_guardar_negocio. Os códigos são os reais da base (CODIGO_BASE em permissoes.ts:
// negocios.validar_pagamento, negocios.registar_fatura, client_contracts.cancel, negocios.obra.planear, negocios.margem.aprovar; 20270102200000).
// 5/11: a leitura (fn_cat_pode) e o pô-la no motor passaram para usePermissoesReaisNegocio (emylia/real/usePermissoesReais.ts), que
// /negocios também usa; aqui fica o que é só da ficha: o gravar com `pessoas.edit` e a Direção fixa.
import { useEffect } from "react";
import type { Estado } from "@/emylia/motor";
import { lerPermissoesReais, usePermissoesReaisNegocio, type LeituraDePermissoes } from "@/emylia/real/usePermissoesReais";

export type { LeituraDePermissoes };
/** A leitura das permissões por fn_cat_pode (ver lerPermissoesReais). `null`: a leitura falhou. */
export const lerPermissoesDaFicha = lerPermissoesReais;

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
  const { leitura, repetir } = usePermissoesReaisNegocio(org);
  // o papel da Emylia no Pipeline é fixo; muda-se num efeito, nunca durante o render
  useEffect(() => { if (S && S.role !== "direcao") S.role = "direcao"; }, [S]);
  return { ...podeNoPosContrato(podeEditarFicha, leitura), repetir };
}
