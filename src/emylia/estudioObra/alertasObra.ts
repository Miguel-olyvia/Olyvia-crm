// 11/11/2026: os alertas dentro do Estúdio da obra, sem React. Cada alerta diz o que se passa numa frase e traz o próximo passo (o Estúdio
// liga-o à ação): o que está atrasado, o que espera pela validação ou pela decisão do cliente, os técnicos noutra obra, os materiais que
// ainda não chegaram para a fase que vem, a conversa por ler, o fim que derrapou e a folga para adiantar.
import { TECS, type Estado, type Negocio, type Plano } from "../motor";
import { imprevistosDe } from "../imprevistos";
import { motivoOcupado, obraQueOcupa, tecnicosDoOficio } from "../preparacaoObra";
import { materiaisPorFase } from "../obraOps";
import type { ResumoEcNeg } from "../inventario/ponteNegocios";
import { dataCurta } from "../planoObra";
import { comecada, dataDoDia, derrapagem, diasDeAtraso, estadoVivo, replanear } from "./planoVivo";

export type Nivel = "critico" | "atencao" | "oportunidade";
export type AcaoAlerta =
  | { k: "prolongar"; ti: number; dur: number }
  | { k: "validar"; ti: number }
  | { k: "tarefa"; ti: number }
  | { k: "imprevisto"; id: string }
  | { k: "passar"; ti: number; tec: string; n: string }
  | { k: "outra"; obra: Negocio }
  | { k: "replanear" }
  | { k: "adiantar" }
  | { k: "conversa" }
  | { k: "materiais" };
export interface Alerta { id: string; nivel: Nivel; t: string; sub: string; acoes: { rot: string; a: AcaoAlerta }[]; ti?: number }

const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
const quem = (id: string | null) => TECS.find((x) => x.id === id)?.n.split(" ")[0] ?? "Sem técnico";
const quando = (p: Plano, k: number) => { const d = dataDoDia(p, k); return d ? dataCurta(d) : `dia ${k + 1}`; };

export function alertasDaObra(d: Negocio, S: Pick<Estado, "deals">, ocup: Map<string, Set<string>>, inv?: ResumoEcNeg | null): Alerta[] {
  const p = d.obra.plano;
  if (!p || p.estado === "concluída") return [];
  const L: Alerta[] = [];
  const vivo = p.estado === "em curso";

  p.tasks.forEach((t, ti) => {
    const v = estadoVivo(t, p);
    // atrasada: os dias dela já passaram e não está feita
    if (v === "atrasada") {
      const n = diasDeAtraso(t, p);
      const ja = comecada(t);
      L.push({ id: `atraso-${ti}`, nivel: "critico", ti, t: `${t.nome} está atrasada ${dias(n)}`,
        sub: ja ? `Devia ter acabado a ${quando(p, t.dia + t.dur - 1)} · ${quem(t.tec)}. Prolongar até hoje empurra o que vem depois.`
          : `Devia ter acabado a ${quando(p, t.dia + t.dur - 1)} e ${quem(t.tec)} ainda não a começou. Pô-la a começar hoje empurra o que vem depois.`,
        acoes: [{ rot: ja ? "Prolongar até hoje" : "Começar hoje", a: { k: "prolongar", ti, dur: p.dia - t.dia + 1 } }, { rot: "Abrir", a: { k: "tarefa", ti } }] });
    }
    // começou ontem ou antes e ainda não há nenhum registo
    if (vivo && v === "hoje" && t.dia < p.dia) {
      L.push({ id: `arranque-${ti}`, nivel: "atencao", ti, t: `${t.nome} ainda não tem registo`, sub: `Começou a ${quando(p, t.dia)} · ${quem(t.tec)} ainda não registou horas nem fotografias.`, acoes: [{ rot: "Abrir", a: { k: "tarefa", ti } }] });
    }
    if (v === "feita") L.push({ id: `validar-${ti}`, nivel: "atencao", ti, t: `${t.nome} espera pela validação`, sub: `${quem(t.tec)} deu-a por feita, com ${t.exec?.fotos.length ?? 0} ${t.exec?.fotos.length === 1 ? "fotografia" : "fotografias"}.`,
      acoes: [{ rot: "Validar", a: { k: "validar", ti } }, { rot: "Ver", a: { k: "tarefa", ti } }] });
    if (v === "corrigir") L.push({ id: `corrigir-${ti}`, nivel: "atencao", ti, t: `${t.nome} está a ser corrigida`, sub: t.exec?.motivo ? `Pedido: ${t.exec.motivo}` : "Voltou ao técnico.", acoes: [{ rot: "Abrir", a: { k: "tarefa", ti } }] });
    // o técnico noutra obra ou de férias nos dias que faltam
    if (vivo && t.tec && v !== "validada" && v !== "feita" && t.dia + t.dur > p.dia) {
      const resto = { dia: Math.max(t.dia, p.dia), dur: t.dia + t.dur - Math.max(t.dia, p.dia) };
      const m = motivoOcupado(t.tec, resto, p, ocup);
      if (m) {
        const onde = m === "noutra obra" ? obraQueOcupa(S, t.tec, resto, p, d.id) : null;
        const livres = tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, resto, p, ocup) == null).slice(0, 2);
        L.push({ id: `conflito-${ti}`, nivel: "critico", ti, t: `${quem(t.tec)} está ${m === "noutra obra" && onde ? `na obra ${onde.nome}` : m} nos dias de ${t.nome}`, sub: `A partir de ${quando(p, resto.dia)}. Passe a tarefa a quem está livre, ou replaneie.`,
          acoes: [...livres.map((x) => ({ rot: `Passar para ${x.n.split(" ")[0]}`, a: { k: "passar" as const, ti, tec: x.id, n: x.n } })), ...(onde ? [{ rot: `Abrir ${onde.nome}`, a: { k: "outra" as const, obra: onde } }] : []), { rot: "Replanear", a: { k: "replanear" } }] });
      }
    }
    if (!t.tec && v !== "validada") L.push({ id: `sem-${ti}`, nivel: "critico", ti, t: `${t.nome} não tem técnico`, sub: "Escolha quem a faz.", acoes: [{ rot: "Abrir", a: { k: "tarefa", ti } }] });
  });

  // os imprevistos que esperam pela empresa (a proposta ao cliente, ou decidir depois de ele recusar) e os que esperam pelo cliente
  for (const im of imprevistosDe(d)) {
    if (im.estado === "aberto") L.push({ id: `im-${im.id}`, nivel: "critico", t: `Imprevisto: ${im.texto}`, sub: im.grav === "impede" ? "As tarefas afetadas estão paradas. Faça a proposta ao cliente, ou resolva sem custo." : `Atrasou ${dias(im.atraso ?? 1)}. Falta decidir se tem custo para o cliente.`, acoes: [{ rot: "Tratar", a: { k: "imprevisto", id: im.id } }] });
    if (im.estado === "recusado") L.push({ id: `im-${im.id}`, nivel: "critico", t: `O cliente não aceitou: ${im.texto}`, sub: "Decida: seguir sem esse trabalho, fazer outra proposta ou suspender.", acoes: [{ rot: "Decidir", a: { k: "imprevisto", id: im.id } }] });
    if (im.estado === "proposta") L.push({ id: `im-${im.id}`, nivel: "atencao", t: `À espera do cliente: ${im.texto}`, sub: `Adenda ${im.adenda ?? ""} no portal.`, acoes: [{ rot: "Ver", a: { k: "imprevisto", id: im.id } }] });
  }

  // os materiais da fase que vem (nos próximos 3 dias úteis) que ainda não estão garantidos
  if (vivo || p.estado === "aprovado") {
    const hoje = vivo ? p.dia : 0;
    for (const g of materiaisPorFase(d, inv)) {
      const ts = p.tasks.filter((t) => (t.fase ?? 0) === g.fase && estadoVivo(t, p) !== "validada");
      if (!ts.length) continue;
      const ini = Math.min(...ts.map((t) => t.dia));
      if (ini - hoje > 3) continue;
      const faltam = g.itens.filter((x) => x.estado === "em falta" || x.estado === "por encomendar" || x.estado === "encomendado" || x.estado === "a chegar");
      if (!faltam.length) continue;
      L.push({ id: `mat-${g.fase}`, nivel: ini <= hoje ? "critico" : "atencao", t: `${faltam.length} ${faltam.length === 1 ? "material ainda não chegou" : "materiais ainda não chegaram"} para a fase ${g.fase}`,
        sub: `${faltam.slice(0, 3).map((x) => `${x.n}${x.quando ? ` (chega a ${x.quando})` : ` (${x.estado})`}`).join(", ")}${faltam.length > 3 ? "…" : ""}. A fase começa a ${quando(p, ini)}.`, acoes: [{ rot: "Ver materiais", a: { k: "materiais" } }] });
    }
  }

  // a conversa com o cliente por ler
  const porLer = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  if (porLer) L.push({ id: "chat", nivel: "atencao", t: `${porLer} ${porLer === 1 ? "mensagem do cliente por ler" : "mensagens do cliente por ler"}`, sub: (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).slice(-1)[0]?.t ?? "", acoes: [{ rot: "Ler", a: { k: "conversa" } }] });

  // o fim face ao orçamento, e a folga
  if (vivo) {
    const der = derrapagem(p);
    if (der > 0) L.push({ id: "derrapagem", nivel: "atencao", t: `A obra acaba ${dias(der)} depois do previsto`, sub: "Face ao plano que veio do orçamento. Veja se dá para adiantar alguma coisa.", acoes: [{ rot: "Replanear", a: { k: "replanear" } }] });
    // a folga: o que o plano ganha se se adiantar (face a só o pôr em dia)
    const so = replanear(p, ocup, { adiantar: false }), r = replanear(p, ocup, { adiantar: true });
    const adiantadas = r.mudancas.filter((m) => m.para.dia < so.plano.tasks[m.ti].dia);
    if (adiantadas.length) {
      const ganho = so.fimDepois - r.fimDepois;
      L.push({ id: "folga", nivel: "oportunidade", t: ganho > 0 ? `Há folga: a obra pode acabar ${dias(ganho)} mais cedo` : `Há folga: ${adiantadas.length} ${adiantadas.length === 1 ? "tarefa pode" : "tarefas podem"} começar mais cedo`,
        sub: `${adiantadas.slice(0, 3).map((m) => `${m.nome} a ${quando(p, m.para.dia)}`).join(", ")}${adiantadas.length > 3 ? "…" : ""}.`, acoes: [{ rot: "Ver e adiantar", a: { k: "adiantar" } }] });
    }
  }
  const peso: Record<Nivel, number> = { critico: 0, atencao: 1, oportunidade: 2 };
  return L.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
