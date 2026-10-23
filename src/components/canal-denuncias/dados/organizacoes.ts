// As organizações de exemplo do canal de denúncias. O canal pertence à ORGANIZAÇÃO, nunca a uma filial nem a um centro de
// trabalho: por isso aqui não há nenhuma estrutura de RH, só o identificador e o nome de cada organização.
//
// O módulo é autónomo (um teste vigia que não importa outros módulos de exemplo), por isso o identificador da organização
// ativa repete o do RH de exemplo; `organizacaoAtiva.test.ts` confirma que os dois continuam iguais.

export interface OrganizacaoExemplo {
  id: string;
  nome: string;
}

/** A organização ativa da apresentação (a mesma do RH de exemplo). */
export const ORG_ATIVA: OrganizacaoExemplo = { id: "org-exemplo-olyvia-retail", nome: "Olyvia Retail (exemplo)" };

/** Outra organização de exemplo, só para provar que as denúncias de uma não aparecem na outra. */
export const OUTRA_ORG: OrganizacaoExemplo = { id: "org-exemplo-casa-aurora", nome: "Casa Aurora, Lda. (exemplo)" };

export const ORGANIZACOES_EXEMPLO: readonly OrganizacaoExemplo[] = [ORG_ATIVA, OUTRA_ORG];

/** A pessoa de exemplo que usa «A minha área» (a mesma do RH de exemplo). */
export const PESSOA_EXEMPLO_ID = "p-sofia";

/**
 * A organização da página pública, que não tem sessão: `?org=<id>` escolhe uma das organizações de exemplo; sem o
 * parâmetro, ou com um valor desconhecido, usa a organização ativa de exemplo.
 */
export function organizacaoPublica(parametro: string | null): OrganizacaoExemplo {
  return ORGANIZACOES_EXEMPLO.find((o) => o.id === parametro) ?? ORG_ATIVA;
}
