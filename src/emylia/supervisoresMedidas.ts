// 23/11/2026 (permissões, M7): quem pode ser escolhido para medir no local, além dos técnicos de obra (TECS). Pela regra, quem mede e
// retifica é o supervisor de obra: na Olyvia são as pessoas cujo PERFIL tem negocios.obra.planear (neg_gestores_obra, a mesma fonte do
// «Responsável de obra»; derivado do perfil, não do Papel no Negócio). No protótipo (sem a base) a lista fica vazia e ficam só os técnicos.
// O id é o da pessoa do RH (o mesmo dos técnicos reais, TECS), por isso d.f.supervisor_medidas guarda-o da mesma forma.
// Sem imports em tempo de execução (o motor e a preparação da obra importam este ficheiro).

export interface SupervisorMedidas { id: string; n: string }

/** O registo vivo: muda-se só no sítio (definirSupervisoresMedidas), nunca se troca o array. */
export const SUPERVISORES_MEDIDAS: SupervisorMedidas[] = [];

/** Põe a lista lida da base (neg_gestores_obra); null ou vazia: nenhum (o protótipo, ou ao sair da página). */
export function definirSupervisoresMedidas(L: readonly SupervisorMedidas[] | null): void {
  const vistos = new Set<string>();
  const limpos = (L ?? []).filter((x) => !!x.id && !!x.n?.trim() && !vistos.has(x.id) && !!vistos.add(x.id)).map((x) => ({ id: x.id, n: x.n.trim() }));
  SUPERVISORES_MEDIDAS.splice(0, SUPERVISORES_MEDIDAS.length, ...limpos);
}

export const supervisorDeMedidas = (id: string | null | undefined): SupervisorMedidas | undefined =>
  id ? SUPERVISORES_MEDIDAS.find((x) => x.id === id) : undefined;
