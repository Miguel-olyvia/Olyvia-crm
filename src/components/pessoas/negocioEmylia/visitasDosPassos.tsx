// As visitas do negócio da Emylia com o agendamento do CRM, ligadas pelo ponto de extensão `ajustarPassos` (a Emylia, src/emylia, não se edita): o passo «Visitas»
// (fase da Visita) e o passo «Marcar a visita» (fase do Contacto, a primeira visita) trocam o corpo da Emylia por VisitasDoCrm. Compõe com comTemplatesNosPassos
// (os ids são outros) e com comPassosConfiguraveis. Os outros passos ficam como a Emylia os montou.
import type { Passo } from "@/emylia/CamposFase";
import type { Negocio } from "@/emylia/motor";
import { semSombras, type VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { marcasDoEspelho } from "./espelhoVisitaEmylia";
import { VisitasDoCrm, type ContextoDasVisitas } from "./VisitasDoCrm";

export type { ContextoDasVisitas };

/** 12/11: a visita do CRM ligada ao negócio que conta como «marcada» (sem as sombras do espelho, não cancelada); a marcada antes da feita, a mais cedo primeiro. */
export function visitaAtivaDoCrm(visitas: readonly VisitaDoNegocio[] | undefined, d: Negocio): VisitaDoNegocio | null {
  if (!visitas || visitas.length === 0) return null;
  const reais = semSombras(visitas, marcasDoEspelho(d));
  return reais.find((v) => v.estado === "marcada") ?? reais.find((v) => v.estado === "feita") ?? null;
}

/** «qui, 15/10 · 10:00» (de Lisboa, como a visita vem lida). */
export function resumoDaVisitaCrm(v: Pick<VisitaDoNegocio, "dia" | "hora">): string {
  const dia = v.dia ? new Date(`${v.dia}T12:00:00`).toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "";
  return [dia, v.hora].filter(Boolean).join(" · ") || "Visita marcada";
}

/** Troca o corpo dos passos `visitas` e `vaga`; o título, o ícone e as contagens ficam os da Emylia (o espelho mantém-nas certas).
 *  12/11: com uma visita ativa na agenda do CRM (`c.visitasCrm`), «Marcar a visita» fica feito; sem vaga do motor, o resumo é o dia e a hora dela. */
export function comVisitasDoCrm(passos: Passo[], c: ContextoDasVisitas): Passo[] {
  return passos.map((p) => {
    if (p.id === "visitas") return { ...p, corpo: <VisitasDoCrm c={c} modo="visitas" /> };
    if (p.id === "vaga") {
      const crm = visitaAtivaDoCrm(c.visitasCrm, c.d);
      return {
        ...p,
        ...(crm ? { feito: true } : {}),
        ...(crm && p.resumo.length === 0 ? { resumo: [resumoDaVisitaCrm(crm)] } : {}),
        corpo: <VisitasDoCrm c={c} modo="primeira" />,
      };
    }
    return p;
  });
}
