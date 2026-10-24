// «Atualizar dados» da pessoa que já existe (regras 3 e 6 do desenho), por esta ordem:
//   1. revalida (fail-closed): o email e o telefone novos não podem ser de OUTRA pessoa da organização;
//   2. substitui o email e/ou o telefone principal com neg_substituir_contacto (uma transação na base; nunca se acrescenta um segundo);
//   3. junta os campos do formulário à lead e reabre a lead perdida ou rejeitada (cópia de AnewLeads.tsx:4373-4401);
//   4. se a abordagem está encerrada, neg_reabrir_abordagem com essa lead.
// Os passos 2 a 4 não são atómicos: uma falha a meio lança AtualizacaoParcial, com o que ficou feito e o que falhou. Repetir é seguro.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { revalidarAntesDeAtualizar } from "./revalidarNovaLead";
import type { DecisaoDuplicados, Escrito, PlanoAtualizar } from "./tiposNovaLead";

export type PassoAtualizar = "contacto" | "lead" | "abordagem";

/** Falha a meio: o que já ficou gravado e o passo que falhou, com o erro (traduzível) desse passo. */
export class AtualizacaoParcial extends Error {
  readonly feito: readonly PassoAtualizar[];
  readonly falhou: PassoAtualizar;
  readonly erro: ErroNeg;
  constructor(feito: readonly PassoAtualizar[], falhou: PassoAtualizar, erro: ErroNeg) {
    super("atualização parcial");
    this.name = "AtualizacaoParcial";
    this.feito = feito;
    this.falhou = falhou;
    this.erro = erro;
  }
}

export interface PedidoAtualizar {
  organizationId: string;
  entityId: string;
  escrito: Escrito;
  /** Os valores do formulário (com `_assigned_to` se se escolheu um comercial). */
  valores: Readonly<Record<string, unknown>>;
  plano: PlanoAtualizar;
}

export type ResultadoAtualizar =
  | { tipo: "atualizada"; feito: PassoAtualizar[] }
  | { tipo: "conflito"; decisao: DecisaoDuplicados };

const REABRIVEIS = new Set(["lost", "rejected"]);

function comoErroNeg(causa: unknown): ErroNeg {
  if (causa instanceof ErroNeg) return causa;
  captureFlowError(causa, "pessoas-neg");
  return new ErroNeg(causa, null, CHAVE_ERRO_GENERICO);
}

/** Junta os campos do formulário à lead (os novos por cima dos antigos) e reabre a lead perdida ou rejeitada. */
async function juntarALead(p: PedidoAtualizar): Promise<void> {
  const db = supabase as unknown as { from: (t: string) => any };
  const { _assigned_to: atribuido, ...limpos } = p.valores as Record<string, unknown>;
  const lida = await db.from("anew_leads").select("field_values, status").eq("id", p.plano.leadId).eq("organization_id", p.organizationId).single();
  if (lida.error || !lida.data) throw lida.error ?? new Error("lead não encontrada");
  const antigos = typeof lida.data.field_values === "object" && lida.data.field_values !== null ? lida.data.field_values : {};
  const estado = REABRIVEIS.has(lida.data.status) ? "new" : lida.data.status;
  const escrita = await db.from("anew_leads")
    .update({ field_values: { ...antigos, ...limpos }, status: estado, ...(typeof atribuido === "string" && atribuido ? { assigned_to: atribuido } : {}) })
    .eq("id", p.plano.leadId).eq("organization_id", p.organizationId);
  if (escrita.error) throw escrita.error;
}

export async function atualizarPessoaExistente(p: PedidoAtualizar): Promise<ResultadoAtualizar> {
  const revalidacao = await revalidarAntesDeAtualizar(p.organizationId, p.escrito, p.entityId, p.plano);
  if (revalidacao.tipo === "conflito") return { tipo: "conflito", decisao: revalidacao.decisao };

  const feito: PassoAtualizar[] = [];
  const passo = async (nome: PassoAtualizar, correr: () => Promise<unknown>): Promise<void> => {
    try {
      await correr();
    } catch (causa) {
      const erro = comoErroNeg(causa);
      // Nada ficou gravado: o erro simples. Se alguma coisa ficou, o aviso parcial.
      if (feito.length === 0) throw erro;
      throw new AtualizacaoParcial([...feito], nome, erro);
    }
    feito.push(nome);
  };

  if (p.plano.email || p.plano.telefone) {
    await passo("contacto", () => chamarNeg("neg_substituir_contacto", {
      p_organization_id: p.organizationId,
      p_entity_id: p.entityId,
      p_email: p.plano.email?.novo ?? null,
      p_telefone: p.plano.telefone?.novo ?? null,
    }));
  }
  await passo("lead", () => juntarALead(p));
  if (p.plano.reabrirAbordagem) {
    await passo("abordagem", () => chamarNeg("neg_reabrir_abordagem", {
      p_organization_id: p.organizationId, p_entity_id: p.entityId, p_motivo: null, p_lead_id: p.plano.leadId,
    }));
  }
  return { tipo: "atualizada", feito };
}
