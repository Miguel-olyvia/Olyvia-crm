// Seletores puros por organização. O canal é da ORGANIZAÇÃO ativa: nunca se filtra nem se agrupa por filial ou centro.
import type { Denuncia } from "./tipos";

/** As denúncias de uma organização; as de qualquer outra ficam de fora. */
export function filtrarPorOrganizacao(lista: readonly Denuncia[], organizationId: string): Denuncia[] {
  return lista.filter((d) => d.organizationId === organizationId);
}

/** As denúncias IDENTIFICADAS que uma pessoa fez, só da organização dada. Uma anónima nunca fica ligada a ninguém. */
export function denunciasDaPessoa(lista: readonly Denuncia[], organizationId: string, pessoaId: string): Denuncia[] {
  return filtrarPorOrganizacao(lista, organizationId).filter((d) => !d.anonima && d.pessoaId === pessoaId);
}

export interface ContagemOrigem {
  todas: number;
  anonimas: number;
  identificadas: number;
}

export function contarPorOrigem(lista: readonly Denuncia[]): ContagemOrigem {
  const anonimas = lista.filter((d) => d.anonima).length;
  return { todas: lista.length, anonimas, identificadas: lista.length - anonimas };
}

/** As denúncias «por confirmar»: as que ainda esperam a confirmação de receção. */
export const porConfirmar = (lista: readonly Denuncia[]): number => lista.filter((d) => d.estado === "recebida").length;
