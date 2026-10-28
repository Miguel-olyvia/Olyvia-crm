// Os passos da visita da Emylia com o levantamento configurável: os passos são os da Emylia (Visitas, Exterior, Interior, Área, Medidas, Necessidades) e,
// antes das Necessidades, entra um passo por secção do questionário da organização que tenha perguntas sem campo da Emylia. O resto não se toca.
import { ClipboardList } from "lucide-react";
import type { Passo } from "@/emylia/CamposFase";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { PerguntaDef } from "@/components/negocio-metas/perguntasTipos";
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import { efeitosDaPergunta } from "./efeitosConfigurados";
import { perguntasDaSeccao, PerguntasConfiguraveis, respondida } from "./PerguntasConfiguraveis";

const ID_NECESSIDADES = "nec";

export const idDoPassoCfg = (seccaoId: string): string => `cfg:${seccaoId}`;

export function comPassosConfiguraveis(passos: Passo[], ctx: Ctx, d: Negocio, q: QuestionarioForm | null): Passo[] {
  if (!q || q.semBase) return passos;
  const todas: PerguntaDef[] = q.seccoes.filter((s) => s.aba !== "qualificacao").flatMap((s) => s.blocos.flatMap((b) => b.perguntas));
  const extra: Passo[] = [];
  for (const seccao of q.seccoes) {
    if (seccao.aba === "qualificacao" || seccao.especial) continue;
    const visiveis = perguntasDaSeccao(seccao, todas, d.f);
    // só há passo se a secção tem perguntas que a Emylia não tem; sem elas, as respostas já estão nos campos da Emylia
    if (visiveis.length === 0 && !seccao.blocos.some((b) => b.perguntas.some((p) => (p.efeitoCfg?.campoEmylia ?? "") === ""))) continue;
    const feitas = visiveis.filter((p) => respondida(p, d.f)).length;
    const resumo = visiveis.flatMap((p) => efeitosDaPergunta(p, d.f).map((e) => e.d)).slice(0, 4);
    extra.push({
      id: idDoPassoCfg(seccao.id), titulo: seccao.titulo[0], personalizado: true, icone: ClipboardList, semAvancar: true,
      ...(visiveis.length > 0 ? { conta: { f: feitas, n: visiveis.length } } : { feito: true }), resumo,
      corpo: <PerguntasConfiguraveis seccao={seccao} todas={todas} d={d} ctx={ctx} />,
    });
  }
  if (extra.length === 0) return passos;
  const i = passos.findIndex((p) => p.id === ID_NECESSIDADES);
  return i < 0 ? [...passos, ...extra] : [...passos.slice(0, i), ...extra, ...passos.slice(i)];
}
