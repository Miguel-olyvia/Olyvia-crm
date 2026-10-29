// O ESPELHO derivado das visitas do CRM dentro do negócio da Emylia. A visita verdadeira é o schedule_item (neg_guardar_visita com p_negocio_id): o passo
// lê, mostra e age só sobre esse. O motor da Emylia, porém, lê as visitas de d.vis e das chaves v<n>_ de d.f (fecharVisita, extrasVisita, visitaFeita), e este
// ficheiro põe lá uma cópia, que só este componente escreve e que ninguém edita à mão. Se discordarem, ganha o CRM e a cópia reescreve-se.
//  · A marca v<n>_crm guarda o id da visita do CRM: é o que separa o espelho das visitas antigas só da Emylia (sem marca; essas ficam como estão, só de leitura).
//  · Nunca se apaga nada: uma visita cancelada no CRM fica «Cancelada» no espelho.
//  · «Quem vai estar» e «O que ficou combinado» não vêm do CRM: só se escrevem na hora de marcar, e a leitura não lhes toca.
import { visitas as numerosDe, type Negocio } from "@/emylia/motor";
import type { VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { TEXTO_DO_TIPO, textoDaDuracao } from "@/hooks/pessoas/tipoVisitaChave";

const ESTADO_EMYLIA = { marcada: "Marcada", feita: "Feita", cancelada: "Cancelada" } as const;

export interface PlanoEspelho {
  f: Record<string, string>;
  vis: number[];
}

/** número da Emylia → id da visita do CRM, para as visitas que o espelho já aponta. */
export function marcasDoEspelho(d: Negocio): Map<number, string> {
  const m = new Map<number, string>();
  for (const n of numerosDe(d)) {
    const id = d.f[`v${n}_crm`];
    if (id) m.set(n, id);
  }
  return m;
}

/** As visitas antigas só da Emylia (sem marca do CRM): ficam só de leitura. */
export const visitasSoDaEmylia = (d: Negocio): number[] => numerosDe(d).filter((n) => !d.f[`v${n}_crm`]);

interface Ligacao {
  visitaId: string;
  /** O número que a visita acabou de receber do motor (a primeira visita: marcarVisita cria a 1); sem ele, recebe o seguinte. */
  numero?: number;
}

export function calcularEspelho(d: Negocio, visitas: readonly VisitaDoNegocio[], nomes: ReadonlyMap<string, string>, ligar: Ligacao | null = null): PlanoEspelho | null {
  const marcas = marcasDoEspelho(d);
  const numeroDe = new Map<string, number>([...marcas].map(([n, id]) => [id, n]));
  if (ligar?.numero !== undefined) numeroDe.set(ligar.visitaId, ligar.numero);
  const vis = [...numerosDe(d)];
  let seguinte = Math.max(0, ...vis, ...numeroDe.values()) + 1;
  const f: Record<string, string> = {};
  const pedir = (n: number, k: string, valor: string): void => {
    if (valor !== "" && (d.f[`v${n}_${k}`] ?? "") !== valor) f[`v${n}_${k}`] = valor;
  };
  for (const v of visitas) {
    let n = numeroDe.get(v.id);
    if (n === undefined) {
      if (v.estado === "cancelada") continue; // uma visita cancelada que o espelho nunca viu não entra
      n = seguinte++;
      numeroDe.set(v.id, n);
    }
    if (!vis.includes(n)) vis.push(n);
    pedir(n, "crm", v.id);
    if (v.tipo) pedir(n, "tipo", TEXTO_DO_TIPO[v.tipo]);
    pedir(n, "data", v.dia);
    pedir(n, "hora", v.hora);
    pedir(n, "duracao", textoDaDuracao(v.minutos));
    const quem = v.recursos.map((r) => nomes.get(r) ?? "").filter(Boolean).join(" e ");
    pedir(n, "quem", quem);
    const atual = d.f[`v${n}_estado`] ?? "";
    // o motor da Emylia marca sozinho como feita (v<n>_auto) quando as necessidades ficam completas: não se luta com isso (feita fica feita)
    const feitaSozinha = v.estado === "marcada" && atual === "Feita" && !!d.f[`v${n}_auto`];
    if (!feitaSozinha) pedir(n, "estado", ESTADO_EMYLIA[v.estado]);
  }
  const mudouVis = vis.length !== numerosDe(d).length;
  return Object.keys(f).length === 0 && !mudouVis ? null : { f, vis };
}

/** Escreve o espelho no negócio (chamar dentro de `run`, como tudo o que muda o negócio, para ficar gravado). */
export function aplicarEspelho(d: Negocio, plano: PlanoEspelho): void {
  d.vis = plano.vis;
  for (const k in plano.f) d.f[k] = plano.f[k];
}

/** Só no momento de marcar: o que o CRM não guarda mas o motor da Emylia exige na visita. */
export function escreverDoFormulario(d: Negocio, numero: number, presentes: string, combinado: string): void {
  if (presentes) d.f[`v${numero}_presentes`] = presentes;
  if (combinado) d.f[`v${numero}_combinado`] = combinado;
}

/** A vaga no formato do motor («qui 15/10 · 10:00»), que `marcarVisita` sabe ler. */
export function vagaDoMotor(dia: string, hora: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const semana = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()] ?? "";
  return `${semana} ${dia.slice(8, 10)}/${dia.slice(5, 7)} · ${hora}`;
}
