// 3/11 (Rúben): no Financeiro, os dados de faturação vêm da ficha do cliente em Pessoas: o nome (anew_entities.display_name) e o NIF.
// O NIF está cifrado na base e só a Edge Function nif-faturacao o devolve inteiro (a quem fatura ou valida pagamentos). O que já estiver
// escrito nos dados de faturação não se troca; o nome fiscal só substitui a sugestão automática (o título do negócio).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negocio } from "../motor";

export interface FaturacaoDaFicha { nome: string | null; nif: string | null }

/** Ainda falta alguma coisa que a ficha pode dar: no Financeiro, antes de pago, sem NIF ou com o nome fiscal sugerido (o título). */
export const precisaDaFicha = (d: Negocio): boolean =>
  d.fase === 4 && !d.fin.pago && (!d.f.nif_fat || !d.f.nome_fiscal || d.f.nome_fiscal === d.nome);

/** Põe no negócio o que a ficha deu, sem apagar o que alguém escreveu. Devolve true se mudou alguma coisa. */
export function aplicarFaturacao(d: Negocio, x: FaturacaoDaFicha): boolean {
  let mudou = false;
  const nome = x.nome?.trim(), nif = x.nif?.trim();
  if (nome && (!d.f.nome_fiscal || d.f.nome_fiscal === d.nome) && d.f.nome_fiscal !== nome) { d.f.nome_fiscal = nome; mudou = true; }
  if (nif && !d.f.nif_fat) { d.f.nif_fat = nif; mudou = true; }
  return mudou;
}

/** Pede à Edge Function o nome e o NIF da ficha do cliente do negócio. Null se não deu (sem permissão, função por publicar, erro). */
export async function lerFaturacaoDaFicha(sb: SupabaseClient, org: string, negocioId: string): Promise<FaturacaoDaFicha | null> {
  const { data, error } = await sb.functions.invoke("nif-faturacao", { body: { organizacao_id: org, negocio_id: negocioId } });
  if (error || !data || typeof data !== "object") return null;
  const j = data as { nome?: unknown; nif?: unknown };
  return { nome: typeof j.nome === "string" ? j.nome : null, nif: typeof j.nif === "string" ? j.nif : null };
}
