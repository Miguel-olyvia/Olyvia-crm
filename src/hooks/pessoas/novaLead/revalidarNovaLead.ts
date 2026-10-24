// A revalidação imediatamente antes de gravar (regra 8 do desenho): repete a procura de duplicados e aplica a regra. É FAIL-CLOSED:
// se não se conseguir verificar (rede, limite de pedidos, erro da base) lança, e quem chama não grava. A de Leads
// (revalidateStrongDuplicatesBeforeWrite) é fail-open e devolve «sem coincidências» também quando falha, o que aqui não serve.
import { decidirDuplicados } from "./regraDuplicadosPessoas";
import { procurarDuplicados } from "./duplicadosNovaLead";
import type { DecisaoDuplicados, Escrito, PlanoAtualizar } from "./tiposNovaLead";

/** Antes de criar: o mesmo que a primeira procura. «criar» = pode criar; «bloquear» = apareceu uma coincidência. Lança se falhar. */
export async function revalidarAntesDeCriar(organizationId: string, escrito: Escrito): Promise<DecisaoDuplicados> {
  return decidirDuplicados(escrito, await procurarDuplicados(organizationId, escrito));
}

export type RevalidacaoAtualizar = { tipo: "ok" } | { tipo: "conflito"; decisao: DecisaoDuplicados };

/**
 * Antes de «Atualizar dados»: o email e o telefone que vão substituir os da pessoa não podem pertencer a OUTRA pessoa da organização
 * (substituir por um que é de outra juntava as identidades das duas). Só se procura o que se vai substituir. Lança se falhar.
 */
export async function revalidarAntesDeAtualizar(
  organizationId: string, escrito: Escrito, entityId: string, plano: PlanoAtualizar,
): Promise<RevalidacaoAtualizar> {
  const email = plano.email?.novo ?? null;
  const telefone = plano.telefone?.novo ?? null;
  if (email === null && telefone === null) return { tipo: "ok" };
  const encontrados = await procurarDuplicados(organizationId, { nome: escrito.nome, email, telefone, nif: null });
  // Uma pessoa escondida pela RLS (sem id) nunca é «a própria»: conta como outra.
  const outras = encontrados.pessoas.filter((p) => p.entityId !== entityId);
  if (outras.length === 0) return { tipo: "ok" };
  const decisao = decidirDuplicados(escrito, { pessoas: outras, grupo: encontrados.grupo });
  // Num conflito os dados escritos já não são «da pessoa que se ia atualizar»: nenhuma tem «Atualizar dados», só «Abrir» e «Cancelar».
  if (decisao.tipo !== "bloquear") return { tipo: "ok" };
  return { tipo: "conflito", decisao: { ...decisao, pessoas: decisao.pessoas.map((p) => ({ ...p, atualizar: null })) } };
}
