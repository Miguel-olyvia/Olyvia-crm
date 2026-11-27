// 11/11/2026: os alertas dentro do Estúdio da obra, sem React. Cada alerta diz o que se passa numa frase e traz o próximo passo (o Estúdio
// liga-o à ação): o que está atrasado, o que espera pela validação ou pela decisão do cliente, os técnicos noutra obra, os materiais que
// ainda não chegaram para a fase que vem, a conversa por ler, o fim que derrapou e a folga para adiantar.
import { desbloquearBuraco, simularBuraco, TECS, type Estado, type Negocio, type Plano } from "../motor";
import { imprevistosDe, pedidoDeAtraso, textoPedidoAtraso } from "../imprevistos";
import { motivoOcupado, obraQueOcupa, tecnicosDoOficio } from "../preparacaoObra";
import { materiaisPorFase } from "../obraOps";
import type { ResumoEcNeg } from "../inventario/ponteNegocios";
import { dataCurta } from "../planoObra";
import { antecessoras, comecada, dataDoDia, derrapagem, diasDeAtraso, diasSemNinguem, estadoVivo, nomeNoPlano, replanear } from "./planoVivo";

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
  | { k: "fecharBuraco"; ini: number; fim: number; ti: number | null }
  // 27/11 (agentes): passar a tarefa que trava a um colega livre e antecipar o resto, de uma vez
  | { k: "passarEAntecipar"; ti: number; tec: string; n: string; ini: number; fim: number }
  // 27/11 (Rúben: «devia ser tudo dentro do estúdio»): adiar a tarefa até o técnico estar livre, e puxar uma tarefa para dias vazios
  | { k: "adiar"; ti: number }
  | { k: "puxar"; ti: number; dia: number }
  | { k: "avisarCliente"; texto: string }
  | { k: "conversa" }
  | { k: "aceitarFim"; dias: number }
  | { k: "materiais" };
export interface Alerta { id: string; nivel: Nivel; t: string; sub: string; acoes: { rot: string; a: AcaoAlerta }[]; ti?: number }

const dias = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
const quem = (id: string | null) => TECS.find((x) => x.id === id)?.n.split(" ")[0] ?? "Sem técnico";
const quando = (p: Plano, k: number) => { const d = dataDoDia(p, k); return d ? dataCurta(d) : `dia ${k + 1}`; };

/** 27/11 (agentes): a tarefa por fazer, mais à frente, que pode passar para o dia `ini` (um buraco): as que a antecedem já acabaram (ou
 *  acabam antes de `ini`) e o técnico está livre (sem outra obra, férias nem outra tarefa desta obra nesses dias). A que vinha mais cedo. */
export function tarefaParaOBuraco(p: Plano, ini: number, ocup: Map<string, Set<string>>): number | null {
  const T = p.tasks;
  const feita = (j: number) => { const v = estadoVivo(T[j], p); return v === "feita" || v === "validada"; };
  const cands = T.map((t, ti) => ({ t, ti }))
    .filter(({ t, ti }) => t.tec && !t.exec && t.dia > ini && !feita(ti) && estadoVivo(t, p) !== "atrasada")
    .filter(({ ti }) => antecessoras(T, ti).every((j) => feita(j) || T[j].dia + T[j].dur <= ini))
    .filter(({ t, ti }) => motivoOcupado(t.tec!, { dia: ini, dur: t.dur, ...(t.h > 0 ? { h: t.h } : {}) }, p, ocup,
      T.filter((x, k) => k !== ti && x.tec === t.tec && !feita(k)).map((x) => ({ dia: x.dia, dur: x.dur, h: x.h, tec: x.tec }))) == null)
    .sort((a, b) => a.t.dia - b.t.dia);
  return cands[0]?.ti ?? null;
}

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
      // 23/11 (Rúben: «clico no erro de replanear e não permite fazer nada»): com as horas da tarefa. Sem elas contava-se o dia inteiro, e
      // qualquer hora do técnico noutra obra dava conflito, mesmo quando a tarefa cabia ao lado (até HORAS_DIA): o alerta aparecia e o
      // replanear (que conta as horas) não tinha nada para mudar.
      const resto0 = { dia: Math.max(t.dia, p.dia), dur: t.dia + t.dur - Math.max(t.dia, p.dia) };
      const resto = { ...resto0, ...(t.h > 0 && t.dur > 0 ? { h: (t.h * resto0.dur) / t.dur } : {}) };
      const m = motivoOcupado(t.tec, resto, p, ocup);
      if (m) {
        const onde = m === "noutra obra" ? obraQueOcupa(S, t.tec, resto, p, d.id) : null;
        const livres = tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, resto, p, ocup) == null).slice(0, 2);
        // 27/11 (Rúben: «ao clicar aqui ele remete para a outra obra e não devia, devia ser tudo dentro do estúdio»): as ações resolvem
        // aqui: passar a um colega livre, ou adiar até o técnico estar livre (só a que ainda não começou: diz-se para quando)
        let livreA: number | null = null;
        if (!t.exec && t.dia >= p.dia) {
          for (let nd = t.dia + 1; nd < t.dia + 60; nd++) if (motivoOcupado(t.tec, { dia: nd, dur: t.dur, ...(t.h > 0 ? { h: t.h } : {}) }, p, ocup) == null) { livreA = nd; break; }
        }
        const opcoes = [livres.length ? `passe a tarefa a ${livres.map((x) => x.n.split(" ")[0]).join(" ou ")} (livre${livres.length > 1 ? "s" : ""})` : "", livreA != null ? `adie-a para ${quando(p, livreA)}, quando ${quem(t.tec).split(" ")[0]} fica livre` : ""].filter(Boolean);
        L.push({ id: `conflito-${ti}`, nivel: "critico", ti, t: `${quem(t.tec)} está ${m === "noutra obra" && onde ? `na obra ${onde.nome}` : m} nos dias de ${t.nome}`,
          sub: `A partir de ${quando(p, resto.dia)}. ${opcoes.length ? `Para resolver: ${opcoes.join(", ou ")}.` : "Não há colega livre do mesmo ofício: replaneie a obra."}`,
          acoes: [...livres.map((x) => ({ rot: `Passar para ${x.n.split(" ")[0]}`, a: { k: "passar" as const, ti, tec: x.id, n: x.n } })),
            ...(livreA != null ? [{ rot: `Adiar para ${quando(p, livreA)}`, a: { k: "adiar" as const, ti } }] : []), { rot: "Replanear", a: { k: "replanear" } }] });
      }
    }
    if (!t.tec && v !== "validada") L.push({ id: `sem-${ti}`, nivel: "critico", ti, t: `${t.nome} não tem técnico`, sub: "Escolha quem a faz.", acoes: [{ rot: "Abrir", a: { k: "tarefa", ti } }] });
  });

  // os imprevistos que esperam pela empresa (a proposta ao cliente, ou decidir depois de ele recusar) e os que esperam pelo cliente
  for (const im of imprevistosDe(d)) {
    // 23/11: o pedido de atraso do técnico: o gestor aceita (o plano anda) ou recusa
    if (pedidoDeAtraso(im)) { L.push({ id: `im-${im.id}`, nivel: "critico", t: textoPedidoAtraso(im), sub: "Aceite (o plano anda e o cliente é avisado) ou recuse (o plano fica igual).", acoes: [{ rot: "Decidir", a: { k: "imprevisto", id: im.id } }] }); continue; }
    if (im.estado === "aberto") L.push({ id: `im-${im.id}`, nivel: "critico", t: `Imprevisto: ${im.texto}`, sub: im.grav === "impede" ? "As tarefas afetadas estão paradas. Faça a proposta ao cliente, ou resolva sem custo." : `Atrasou ${dias(im.atraso ?? 1)}. Falta decidir se tem custo para o cliente.`, acoes: [{ rot: "Tratar", a: { k: "imprevisto", id: im.id } }] });
    if (im.estado === "recusado") L.push({ id: `im-${im.id}`, nivel: "critico", t: `O cliente não aceitou: ${im.texto}`, sub: "Decida: seguir sem esse trabalho, fazer outra proposta ou suspender.", acoes: [{ rot: "Decidir", a: { k: "imprevisto", id: im.id } }] });
    // 12/11: a adenda por disparar está no alerta das adendas, em cima
    if (im.estado === "proposta" && d.adendas?.find((a) => a.n === im.adenda)?.estado === "rascunho") continue;
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
    // 12/11 (Rúben: «isto deve ser só um "está certo?" e ele clica ok ou reagenda»): confirmado uma vez, só volta se o atraso crescer
    if (der > 0 && der > (p.fimAceite?.dias ?? 0)) L.push({ id: "derrapagem", nivel: "atencao", t: `A obra acaba ${dias(der)} depois do previsto. Está certo?`, sub: "",
      acoes: [{ rot: "OK", a: { k: "aceitarFim", dias: der } }, { rot: "Reagendar", a: { k: "replanear" } }] });
    // a folga: o que o plano ganha se se adiantar (face a só o pôr em dia)
    const so = replanear(p, ocup, { adiantar: false }), r = replanear(p, ocup, { adiantar: true });
    const adiantadas = r.mudancas.filter((m) => m.para.dia < so.plano.tasks[m.ti].dia);
    if (adiantadas.length) {
      // 26/11 (teste ao vivo: o título dizia 6 dias e a proposta do agente 2): o ganho conta-se face ao plano de agora; o que só evita um
      // atraso (face a pôr em dia) diz-se assim
      const ganho = r.fimAntes - r.fimDepois, evita = so.fimDepois - Math.max(r.fimDepois, r.fimAntes);
      L.push({ id: "folga", nivel: "oportunidade", t: ganho > 0 ? `Há folga: a obra pode acabar ${dias(ganho)} mais cedo` : evita > 0 ? `Há folga: adiantar evita que a obra acabe ${dias(evita)} mais tarde`
        : `Há folga: ${adiantadas.length} ${adiantadas.length === 1 ? "tarefa pode" : "tarefas podem"} começar mais cedo`,
        sub: `${adiantadas.slice(0, 3).map((m) => `${m.nome} a ${quando(p, m.para.dia)}`).join(", ")}${adiantadas.length > 3 ? "…" : ""}.`, acoes: [{ rot: "Ver e adiantar", a: { k: "adiantar" } }] });
    }
  }
  // 25/11 (revisão): os dias em que a obra fica sem ninguém (uma tarefa que acabou mais cedo deixa um buraco até à seguinte)
  for (const g of diasSemNinguem(p)) {
    const n = g.fim - g.ini + 1, seg = g.seguinte != null ? p.tasks[g.seguinte] : null;
    // 26/11 (Rúben: «ao clicar em antecipar o resto, abre o detalhe mas não faz nada»): só se propõe antecipar o que dá; senão diz-se porquê
    const sim = simularBuraco(S, d, g.ini, g.fim);
    // 27/11 (agentes): sem dar, procura-se quem desbloqueia (um colega livre do mesmo ofício para a tarefa que trava)
    const des = !sim.s && sim.trava != null ? desbloquearBuraco(S, d, g.ini, g.fim, sim.trava) : null;
    // 27/11 (Rúben: «estes agentes não fazem nada, eu clico e ver a tarefa, isso não é útil»): sem antecipar tudo, procura-se uma tarefa
    // mais à frente que já possa começar nestes dias (as que a antecedem acabaram ou acabam antes) e cujo técnico esteja livre: puxa-se só essa
    const puxar = !sim.s && !des ? tarefaParaOBuraco(p, g.ini, ocup) : null;
    const ganhoTxt = (x: number) => (x > 0 ? ` A obra acaba ${dias(x)} mais cedo.` : "");
    // sem dar: «Ver a tarefa» abre a que trava (a do técnico ocupado), onde se troca o técnico
    const tiVer = !sim.s && sim.trava != null ? sim.trava : g.seguinte;
    const ver = tiVer != null ? [{ rot: "Ver a tarefa", a: { k: "tarefa" as const, ti: tiVer } }] : [];
    const nomeTrava = sim.trava != null ? nomeNoPlano(p, p.tasks[sim.trava]) : "";
    const sub = sim.s
      ? (seg ? `A seguir, ${seg.nome} a ${quando(p, seg.dia)}. «Antecipar ${dias(sim.s)}» puxa as ${sim.alvo.length} tarefas seguintes${sim.s < n ? ` (os ${n} dias não dão: ${sim.porque.charAt(0).toLowerCase() + sim.porque.slice(1)})` : ""}.${ganhoTxt(sim.ganho)}` : "Pode antecipar uma tarefa para esses dias.")
      : des ? `${sim.porque}. Se «${nomeTrava}» passar para ${des.n.split(" ")[0]} (do mesmo ofício e livre), as tarefas seguintes começam ${dias(des.s)} mais cedo.${ganhoTxt(des.ganho)}`
      : puxar != null ? `${sim.porque}, por isso não dá para antecipar tudo. Mas «${nomeNoPlano(p, p.tasks[puxar])}» já pode começar a ${quando(p, g.ini)} e ${quem(p.tasks[puxar].tec).split(" ")[0]} está livre: faz-se nestes dias em vez de a ${quando(p, p.tasks[puxar].dia)}.`
      : `${sim.porque} e nenhum colega do mesmo ofício está livre, por isso a obra fica parada nestes dias. Nada a fazer daqui: só se ${sim.trava != null ? quem(p.tasks[sim.trava].tec) : "o técnico"} ficar livre na outra obra.`;
    const acoes = sim.s ? [{ rot: `Antecipar ${dias(sim.s)}`, a: { k: "fecharBuraco" as const, ini: g.ini, fim: g.ini + sim.s - 1, ti: g.seguinte } }, ...ver]
      : des ? [{ rot: `Passar a ${des.n.split(" ")[0]} e antecipar ${dias(des.s)}`, a: { k: "passarEAntecipar" as const, ti: des.ti, tec: des.tec, n: des.n, ini: g.ini, fim: g.ini + des.s - 1 } }, ...ver]
      : puxar != null ? [{ rot: `Fazer «${nomeNoPlano(p, p.tasks[puxar])}» nestes dias`, a: { k: "puxar" as const, ti: puxar, dia: g.ini } }]
      : [];
    L.push({ id: `parada-${g.ini}`, nivel: "oportunidade", t: `A obra fica sem ninguém ${dias(n)}: ${quando(p, g.ini)} a ${quando(p, g.fim)}`, sub, acoes,
      ...(g.seguinte != null ? { ti: g.seguinte } : {}) });
  }
  const peso: Record<Nivel, number> = { critico: 0, atencao: 1, oportunidade: 2 };
  return L.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
