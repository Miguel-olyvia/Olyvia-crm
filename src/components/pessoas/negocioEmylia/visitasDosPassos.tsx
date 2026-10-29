// As visitas do negócio da Emylia com o agendamento do CRM, ligadas pelo ponto de extensão `ajustarPassos` (a Emylia, src/emylia, não se edita): o passo «Visitas»
// (fase da Visita) e o passo «Marcar a visita» (fase do Contacto, a primeira visita) trocam o corpo da Emylia por VisitasDoCrm. Compõe com comTemplatesNosPassos
// (os ids são outros) e com comPassosConfiguraveis. Os outros passos ficam como a Emylia os montou.
import type { Passo } from "@/emylia/CamposFase";
import { VisitasDoCrm, type ContextoDasVisitas } from "./VisitasDoCrm";

export type { ContextoDasVisitas };

/** Troca o corpo dos passos `visitas` e `vaga`; o título, o ícone e as contagens ficam os da Emylia (o espelho mantém-nas certas). */
export function comVisitasDoCrm(passos: Passo[], c: ContextoDasVisitas): Passo[] {
  return passos.map((p) => {
    if (p.id === "visitas") return { ...p, corpo: <VisitasDoCrm c={c} modo="visitas" /> };
    if (p.id === "vaga") return { ...p, corpo: <VisitasDoCrm c={c} modo="primeira" /> };
    return p;
  });
}
