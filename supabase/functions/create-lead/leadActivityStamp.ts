// "Voltou a contactar" — o carimbo de `last_activity_at`.
//
// Quem JA e lead e volta a preencher o formulario publico nao ganha ficha
// nova: carimba-se `last_activity_at` na ficha que ja ca estava, e e esse
// carimbo que poe o aviso na lista de Leads e a faz subir.
//
// Isto vive fora do `index.ts` por uma razao so: o `index.ts` e um
// `Deno.serve` com imports remotos e nao se consegue importar num teste.
// Aqui a decisao (QUAL a lead) e o carimbo (o que se escreve) ficam
// verificaveis sem levantar a funcao inteira.

import type { ExistingRoleSummary } from '../_shared/entityScopedLookup.ts';

/**
 * Qual a lead que leva o carimbo — `null` quando nao ha nenhuma.
 *
 * `activeLeadId` vem de `classifyEntityInOrg` e ja exclui o que nao deve ser
 * carimbado: leads apagadas (`deleted_at`) e leads em `converted`, `lost` ou
 * `rejected`. Vem preenchido MESMO quando quem ganha o `targetType` e o
 * CLIENTE, e isso e de proposito: e a lead que aparece na lista de Leads, e e
 * la que o aviso tem de aparecer. Um cliente que nao tenha nenhuma lead activa
 * nao tem onde levar carimbo — e nao leva.
 *
 * `null`/`undefined` como argumento significa "nao ha entidade reconhecida" ou
 * "o classify falhou": nesses casos nasce lead nova e nao se carimba nada.
 */
export function resolveLeadToStamp(
  summary: ExistingRoleSummary | null | undefined,
): string | null {
  return summary?.activeLeadId ?? null;
}

/**
 * Escreve o carimbo. Chamado SEMPRE depois de a submissao ja estar gravada:
 * falhar aqui so custa o aviso, nunca a submissao nem o visitante.
 *
 * Nada mais na ficha da lead e tocado — so `last_activity_at`.
 *
 * A coluna so existe a partir da migration 20261116050000; enquanto ela nao
 * estiver aplicada o PostgREST devolve PGRST204/42703, loga-se e segue.
 *
 * Devolve `true` quando o carimbo ficou escrito.
 */
export async function stampLeadActivity(
  supabase: any,
  leadId: string,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  const { error } = await supabase
    .from('anew_leads')
    .update({ last_activity_at: nowIso })
    .eq('id', leadId);

  if (error) {
    console.error(
      '[create-lead] nao foi possivel carimbar last_activity_at (a coluna pode nao existir ainda; continuando):',
      error.message,
    );
    return false;
  }
  return true;
}
