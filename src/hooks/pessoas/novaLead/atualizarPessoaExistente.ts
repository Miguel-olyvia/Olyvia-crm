// «Atualizar dados» da pessoa que já existe (regras 3 e 6 do desenho), por esta ordem:
//   1. revalida (fail-closed): o email e o telefone novos não podem ser de OUTRA pessoa da organização;
//   2. substitui o email e/ou o telefone da própria entidade (UPDATE direto em anew_entities; nunca se acrescenta um segundo);
//   3. junta os campos do formulário ao `extra` da entidade (a lead é a entidade) e, se se escolheu um comercial, muda o responsável com
//      neg_atribuir_pessoa (o responsável não se escreve diretamente);
//   4. se a abordagem está encerrada, neg_reabrir_abordagem com a entidade;
//   5. cria um negócio novo (neg_criar_negocio): quem escolhe uma pessoa que já existe quer outro negócio para ela.
// Os passos 2 a 5 não são atómicos: uma falha a meio lança AtualizacaoParcial, com o que ficou feito e o que falhou. Repetir é seguro.
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "../errosNeg";
import { criarNegocioNovaLead } from "./criarNegocioNovaLead";
import { revalidarAntesDeAtualizar } from "./revalidarNovaLead";
import type { DecisaoDuplicados, Escrito, PlanoAtualizar } from "./tiposNovaLead";

export type PassoAtualizar = "contacto" | "lead" | "abordagem" | "negocio";

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
  /** O negócio novo da pessoa existente (id escolhido por quem chama e reusado ao repetir; título = nome da pessoa). Último passo. */
  negocio?: { id: string; titulo: string };
}

export type ResultadoAtualizar =
  | { tipo: "atualizada"; feito: PassoAtualizar[] }
  | { tipo: "conflito"; decisao: DecisaoDuplicados };

const DUPLICADO = "23505";

function comoErroNeg(causa: unknown): ErroNeg {
  if (causa instanceof ErroNeg) return causa;
  // Um email ou telefone que entretanto passou a ser de outra pessoa (único por organização): o mesmo aviso da procura de duplicados.
  if ((causa as { code?: string } | null)?.code === DUPLICADO) return new ErroNeg(causa, "NG019", CHAVES_ERRO_NEG.NG019);
  captureFlowError(causa, "pessoas-neg");
  return new ErroNeg(causa, null, CHAVE_ERRO_GENERICO);
}

type Db = { from: (t: string) => any };
const db = (): Db => supabase as unknown as Db;

/** Um UPDATE direto à entidade desta organização; sem linha atualizada (apagada ou escondida pela RLS) é uma falha, não um sucesso. */
async function atualizarEntidade(p: PedidoAtualizar, dados: Record<string, unknown>): Promise<void> {
  const { data, error } = await db().from("anew_entities").update(dados).eq("id", p.entityId).eq("organization_id", p.organizationId).select("id");
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) throw new Error("pessoa não encontrada");
}

/** Substitui o email e/ou o telefone da entidade (só as colunas que mudam). */
async function substituirContacto(p: PedidoAtualizar): Promise<void> {
  await atualizarEntidade(p, {
    ...(p.plano.email ? { email: p.plano.email.novo } : {}),
    ...(p.plano.telefone ? { phone: p.plano.telefone.novo } : {}),
  });
}

/** Junta os campos do formulário ao `extra` da entidade (os novos por cima dos antigos) e muda o responsável se se escolheu um. */
async function juntarALead(p: PedidoAtualizar): Promise<void> {
  const { _assigned_to: atribuido, ...limpos } = p.valores as Record<string, unknown>;
  const lida = await db().from("anew_entities").select("extra").eq("id", p.entityId).eq("organization_id", p.organizationId).single();
  if (lida.error || !lida.data) throw lida.error ?? new Error("pessoa não encontrada");
  const antigos = typeof lida.data.extra === "object" && lida.data.extra !== null ? lida.data.extra : {};
  await atualizarEntidade(p, { extra: { ...antigos, ...limpos } });
  if (typeof atribuido === "string" && atribuido) {
    await chamarNeg("neg_atribuir_pessoa", { p_organization_id: p.organizationId, p_entity_id: p.entityId, p_assigned_to: atribuido });
  }
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
    await passo("contacto", () => substituirContacto(p));
  }
  await passo("lead", () => juntarALead(p));
  if (p.plano.reabrirAbordagem) {
    await passo("abordagem", () => chamarNeg("neg_reabrir_abordagem", {
      p_organization_id: p.organizationId, p_entity_id: p.entityId, p_motivo: null, p_lead_id: p.plano.leadId,
    }));
  }
  const negocio = p.negocio;
  if (negocio) {
    await passo("negocio", () => criarNegocioNovaLead({ organizationId: p.organizationId, entityId: p.entityId, negocioId: negocio.id, titulo: negocio.titulo }));
  }
  return { tipo: "atualizada", feito };
}
