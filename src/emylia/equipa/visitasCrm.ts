// 29/10/2026: as visitas marcadas fora do Negócio da Emylia (no Pipeline, na agenda do CRM), para a agenda da Emylia as mostrar. A agenda
// refaz as visitas a partir das respostas de cada negócio (regrasAgenda.ts: visitasDaAgenda); estas não têm respostas, só a linha em
// schedule_items. Quem as lê da base é real/agendaReal.ts; aqui só se guarda o que veio. Sem nada definido (os testes, o protótipo), não há.

/** Uma visita do CRM, já no formato da agenda: quem vai, o dia e a hora (de Lisboa), as horas e o que mostrar. */
export interface VisitaCrm { nome: string; papel: string; data: string; hora?: string; horas: number; titulo: string; sub: string; negocio?: number; feito?: boolean }

let atuais: readonly VisitaCrm[] = [];
export function definirVisitasCrm(v: readonly VisitaCrm[] | null): void { atuais = v ?? []; }
export const lerVisitasCrm = (): readonly VisitaCrm[] => atuais;
