// O negócio da Emylia para a ficha do Pipeline: liga o React ao armazém da organização (armazemNegocioEmylia.ts). Partilha o estado entre fichas; a
// gravação é a de /negocios e continua se a ficha fechar. Ao abrir a ficha relê a organização (o armazém não é cache eterna). Sem o negócio na base
// (ou ainda por ler) não há `d`. Nada se muda durante o render: abrir o negócio no motor é um efeito.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { obterArmazem, type AvisoEmylia, type GravacaoEmylia, type LeituraEmylia } from "./armazemNegocioEmylia";

export interface NegocioEmylia {
  leitura: LeituraEmylia;
  gravacao: GravacaoEmylia;
  avisos: readonly AvisoEmylia[];
  /** O negócio, só quando a organização já foi lida e o devolveu. */
  d: Negocio | undefined;
  /** O negócio tem documentos do CRM: a Emylia lê-o mas não o grava (a base recusa, NE005). */
  docsCrm: boolean;
  ctx: Ctx | null;
  /** Ler outra vez; `false` se não se leu (há alterações por gravar, e diz-se nos avisos). */
  reler: () => boolean;
  /** Voltar a gravar o que ficou por gravar. */
  regravar: () => void;
}

const SEM_NEGOCIO: NegocioEmylia = {
  leitura: { k: "a-ler" }, gravacao: { k: "parado" }, avisos: [], d: undefined, docsCrm: false, ctx: null, reler: () => false, regravar: () => undefined,
};

export function useNegocioEmylia(org: string | null, negocioId: string, aoGravar?: () => void, sb: SupabaseClient = supabase as unknown as SupabaseClient, utilizador = ""): NegocioEmylia {
  const armazem = useMemo(() => (org ? obterArmazem(sb, org, utilizador) : null), [org, sb, utilizador]);
  const subscrever = useCallback((f: () => void) => (armazem ? armazem.subscrever(f) : () => undefined), [armazem]);
  useSyncExternalStore(subscrever, () => (armazem ? armazem.versao() : 0), () => 0);
  useEffect(() => (armazem && aoGravar ? armazem.aoGravar(aoGravar) : undefined), [armazem, aoGravar]);
  // ao abrir a ficha (ou outro negócio): ler outra vez, se não houver nada por gravar
  useEffect(() => { armazem?.atualizar(); }, [armazem, negocioId]);
  const leitura = armazem?.leitura();
  const d = armazem && leitura?.k === "pronto" ? armazem.negocioDaBase(negocioId) : undefined;
  const idDoNegocio = d?.id;
  // as ações do motor olham para S.deal e S.view: põe-se num efeito, nunca durante o render
  useEffect(() => {
    if (armazem && d && (armazem.S.deal !== d.id || armazem.S.view !== "negocio")) armazem.abrir(d);
    // `d` muda de identidade em cada leitura; o que conta é o número do negócio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armazem, idDoNegocio]);
  if (!armazem || !leitura) return SEM_NEGOCIO;
  const ctx: Ctx | null = d ? { S: armazem.S, A: armazem.A, run: armazem.run, go: armazem.go, q: "" } : null;
  return { leitura, gravacao: armazem.gravacao(), avisos: armazem.avisos(), d, docsCrm: d ? armazem.docsCrm(negocioId) : false, ctx, reler: armazem.reler, regravar: armazem.regravar };
}
