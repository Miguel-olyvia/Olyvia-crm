// 27/11/2026 (Rúben: «no plano, adicionar novas tarefas podem ter de gerar novas encomendas de fornecedor e atualizar a tab de materiais
// e equipamentos e ver em destaque o que falta, link para ver o detalhe etc»).
// Uma tarefa juntada ao plano (a «Nova tarefa» no Gantt, o «+» de uma fase, uma adenda assinada) traz os materiais do serviço do
// Catálogo. O motor já os encomenda sozinho numa encomenda de ajuste (encomendasAjuste.ts: reserva do stock e, do que faltar, encomenda
// ao fornecedor, por aprovar), mas o separador Materiais só mostrava a encomenda inicial: o que a tarefa nova pedia não se via.
// Aqui, sem mexer em nada, o estado de cada material de cada tarefa com materiais próprios (as novas e as de materiais mudados à mão):
//  · por encomendar: ainda não foi a nenhuma encomenda (pode encomendar-se já);
//  · à espera: da adenda paga (decisão B, 21/10) ou da encomenda de cliente inicial (sai com ela);
//  · pedido ao fornecedor: por aprovar no Inventário (Compras), encomendado ou a chegar (com a data prometida);
//  · sem fornecedor: o Inventário não tem fornecedor para ele;
//  · garantido: reservado no armazém, na carrinha ou na obra.
// O separador Materiais põe em destaque o que não está garantido; o aviso de quando se junta a tarefa usa o mesmo resumo.
import type { Negocio, Plano, Tarefa } from "../motor";
import { equipamentosDaObra } from "../obraOps";
import { linhaDoResumo, type LinhaResumoNeg, type ResumoEcNeg } from "../inventario/ponteNegocios";
import { ajusteDisponivel, contaParaAjuste, ecDaAdenda } from "../encomendasAjuste";

const r2 = (x: number) => Math.round(x * 100) / 100;

export type EstadoMatNovo = "por encomendar" | "espera adenda" | "espera inicial" | "por aprovar" | "encomendado" | "a chegar" | "sem fornecedor" | "garantido";
/** O rótulo curto de cada estado (o chip da linha). */
export const ROTULO_MAT_NOVO: Record<EstadoMatNovo, string> = {
  "por encomendar": "por encomendar", "espera adenda": "à espera da adenda paga", "espera inicial": "sai com a encomenda inicial",
  "por aprovar": "compra por aprovar", encomendado: "encomendado ao fornecedor", "a chegar": "a chegar", "sem fornecedor": "sem fornecedor", garantido: "garantido",
};

export interface MatDaTarefaNova {
  /** a tarefa (índice no plano de agora), o nome, a fase e o dia em que começa (precisa do material nesse dia) */
  ti: number; tarefa: string; fase: number; dia: number;
  n: string; q: number; un: string; produto?: string;
  estado: EstadoMatNovo;
  /** a encomenda de ajuste onde foi (EC-<id>-A<k>), quando se sabe */
  ec?: string;
  /** a adenda de que a tarefa é (as que esperam pelo pagamento dela) */
  adenda?: string;
  /** a data prometida pelo fornecedor (aaaa-mm-dd), nas que estão a chegar */
  chega?: string;
  /** 27/11 (teste): dado como recebido pelo botão «Recebido» (garantido) */
  recebido?: true;
}

/** O estado de uma linha da encomenda de ajuste no Inventário (como materiaisPorFase lê as da inicial). */
function estadoNoInventario(li: LinhaResumoNeg): { estado: EstadoMatNovo; chega?: string } {
  if (li.st === "served" || li.aBordo || li.st === "ready" || li.st === "recvpo") return { estado: "garantido" };
  if (li.semForn > 0) return { estado: "sem fornecedor" };
  if (li.aChegar > 0) {
    const chega = li.pos.find((p) => p.prometida)?.prometida ?? undefined;
    if (li.pos.length && li.pos.every((p) => p.fase === "por aprovar")) return { estado: "por aprovar" };
    return chega ? { estado: "a chegar", chega } : { estado: "encomendado" };
  }
  return { estado: "garantido" };
}

/**
 * Os materiais das tarefas com materiais próprios (as novas e as mudadas à mão), cada um com o seu estado. Um material em parte
 * encomendado e em parte não dá duas linhas (o encomendado e o que falta). As tarefas já validadas ficam de fora (o trabalho está feito).
 * `inv`: o resumo da encomenda de cliente no Inventário (com as de ajuste); sem ele (a Olyvia, ou a encomenda fora do Inventário), o
 * encomendado conta como pedido ao fornecedor, por aprovar por Compras (é assim que a base o recebe: obra_encomendar_materiais).
 */
export function materiaisDasTarefasNovas(d: Negocio, inv?: ResumoEcNeg | null): MatDaTarefaNova[] {
  const p = d.obra.plano;
  if (!p || p.estado === "concluída") return [];
  const out: MatDaTarefaNova[] = [];
  p.tasks.forEach((t, ti) => {
    if (!contaParaAjuste(t) || t.exec?.estado === "validada") return;
    const base = { ti, tarefa: t.nome, fase: t.fase ?? 1, dia: t.dia };
    for (const m of t.mats ?? []) {
      if (!(m.q > 0)) continue;
      const comum = { ...base, n: m.n, un: m.un, ...(m.produto ? { produto: m.produto } : {}) };
      // 27/11 (teste): o que se deu como recebido é garantido; o que se pedir depois a mais segue as regras de sempre
      const rec = Math.min(m.q, t.recebidos?.find((x) => x.n === m.n)?.q ?? 0);
      if (rec > 0) out.push({ ...comum, q: r2(rec), estado: "garantido", recebido: true });
      const enc = r2(Math.max(0, Math.min(m.q, t.encomendado?.find((x) => x.n === m.n)?.q ?? 0) - rec)), falta = r2(m.q - rec - enc);
      if (enc > 0) {
        // a encomenda de ajuste desta tarefa que tem o material (a última que o pediu)
        const ec = [...(t.ecs ?? [])].reverse().find((n) => (d.obra.ecsAjuste ?? []).some((a) => a.n === n && !a.anulada && a.linhas.some((l) => l.n === m.n)));
        const li = ec ? linhaDoResumo(inv, m.n, ec) : undefined;
        const ea = ec ? d.obra.ecsAjuste?.find((a) => a.n === ec)?.linhas.find((l) => l.n === m.n) : undefined;
        const e = li ? estadoNoInventario(li) : ea ? { estado: (ea.falta > 0 ? "encomendado" : "garantido") as EstadoMatNovo } : { estado: "por aprovar" as EstadoMatNovo };
        out.push({ ...comum, q: r2(enc), ...e, ...(ec ? { ec } : {}) });
      }
      if (falta > 0) {
        const estado: EstadoMatNovo = t.adenda && !ecDaAdenda(d, t.adenda) ? "espera adenda" : !d.obra.ec ? "espera inicial" : "por encomendar";
        out.push({ ...comum, q: falta, estado, ...(t.adenda ? { adenda: t.adenda } : {}) });
      }
    }
  });
  return out;
}

/* ------------------------------------------------------------------ os equipamentos das tarefas novas */
// 27/11 (Rúben: «novo equipamento funciona tal como o step de materiais»): o equipamento que uma tarefa nova pede fora dos dias em que já
// estava na obra (para as tarefas do contrato) entra no destaque como os materiais: por receber (do armazém ou de aluguer) até alguém o dar
// como recebido. A carrinha da Frota não conta (vai todos os dias).
export interface EquipDaTarefaNova { n: string; origem: "Armazém" | "Aluguer"; de?: string; tarefas: number[]; dia: number; fim: number; recebido: boolean }
export function equipamentosDasTarefasNovas(p: Plano | null | undefined): EquipDaTarefaNova[] {
  if (!p || p.estado === "concluída") return [];
  return equipamentosDaObra(p).flatMap((e) => {
    if (e.origem === "Frota") return [];
    const ts = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => e.tarefas.includes(t.nome) && t.exec?.estado !== "validada");
    const velhas = ts.filter(({ t }) => !t.nova).map(({ t }) => t);
    const ini = Math.min(...velhas.map((t) => t.dia)), fim = Math.max(...velhas.map((t) => t.dia + t.dur));
    const fora = ts.filter(({ t }) => t.nova && (!velhas.length || t.dia < ini || t.dia + t.dur > fim));
    if (!fora.length) return [];
    return [{ n: e.n, origem: e.origem, ...(e.de ? { de: e.de } : {}), tarefas: fora.map((x) => x.i), dia: Math.min(...fora.map((x) => x.t.dia)), fim: Math.max(...fora.map((x) => x.t.dia + x.t.dur)),
      recebido: fora.every(({ t }) => !!t.recebidos?.some((r) => r.n === e.n)) }];
  });
}

/** 27/11: o botão «Recebido» aparece enquanto estamos em testes (Rúben: «como estamos em testes podes e deves meter um botão»). Para o
 *  tirar quando as receções reais (armazém, aluguer) estiverem ligadas, basta pôr false. */
export const RECEBIDO_DE_TESTE = true;

/** O que não está garantido (o destaque «Falta» do separador Materiais). */
export const emFalta = (L: readonly MatDaTarefaNova[]): MatDaTarefaNova[] => L.filter((x) => x.estado !== "garantido");

export interface ResumoFalta {
  /** quantos materiais (linhas) faltam e quantos se podem encomendar já (o botão) */
  falta: number; porEncomendar: number;
  /** pode encomendar-se daqui (a encomenda de cliente está no Inventário, ou é a da base na Olyvia) */
  podeEncomendar: boolean;
  /** a frase curta: «2 por encomendar · 1 com a compra por aprovar» */
  frase: string;
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** O resumo do que falta, para o cabeçalho do destaque e para o aviso. */
export function resumoFalta(d: Negocio, L: readonly MatDaTarefaNova[]): ResumoFalta {
  const F = emFalta(L);
  const conta = new Map<EstadoMatNovo, number>();
  for (const x of F) conta.set(x.estado, (conta.get(x.estado) ?? 0) + 1);
  const ordem: EstadoMatNovo[] = ["por encomendar", "sem fornecedor", "por aprovar", "encomendado", "a chegar", "espera adenda", "espera inicial"];
  // 27/11 (visto no testarh: «2 compra por aprovar»): a frase com o número concorda com ele
  const FRASE: Record<EstadoMatNovo, (n: number) => string> = {
    "por encomendar": (n) => `${n} por encomendar`, "sem fornecedor": (n) => `${n} sem fornecedor`,
    "por aprovar": (n) => `${n} com a compra por aprovar`, encomendado: (n) => `${n} ${n === 1 ? "encomendado" : "encomendados"} ao fornecedor`,
    "a chegar": (n) => `${n} a chegar`, "espera adenda": (n) => `${n} à espera da adenda paga`,
    "espera inicial": (n) => `${n} ${n === 1 ? "sai" : "saem"} com a encomenda inicial`, garantido: (n) => `${n} ${n === 1 ? "garantido" : "garantidos"}`,
  };
  const frase = ordem.filter((k) => conta.get(k)).map((k) => FRASE[k](conta.get(k)!)).join(" · ");
  const porEncomendar = conta.get("por encomendar") ?? 0;
  return { falta: F.length, porEncomendar, podeEncomendar: porEncomendar > 0 && ajusteDisponivel(d), frase };
}

/** A frase do aviso ao juntar uma tarefa: o que ela precisa e o que falta («Faltam 2 de 3 materiais: …»). Null sem materiais próprios. */
export function fraseDaTarefaNova(d: Negocio, t: Tarefa, inv?: ResumoEcNeg | null): string | null {
  const ti = d.obra.plano?.tasks.indexOf(t) ?? -1;
  const L = materiaisDasTarefasNovas(d, inv).filter((x) => x.ti === ti);
  if (!L.length) return null;
  const nomes = new Set(L.map((x) => x.n)).size, F = emFalta(L), nf = new Set(F.map((x) => x.n)).size;
  if (!F.length) return `${plural(nomes, "material", "materiais")}, já ${nomes === 1 ? "garantido" : "garantidos"} no armazém`;
  return `Faltam ${nf} de ${plural(nomes, "material", "materiais")}: ${resumoFalta(d, F).frase}`;
}

/* ------------------------------------------------------------------ levar ao separador Materiais */
// O Estúdio da obra regista aqui como se vai ao separador Materiais (e que tarefa realçar). O motor usa-o no aviso de quando se junta uma
// tarefa («Ver nos Materiais»); sem o Estúdio aberto, o aviso leva ao Inventário, como antes.
type IrMateriais = (tarefa?: string) => void;
let irMateriais: IrMateriais | null = null;
export const definirIrMateriais = (f: IrMateriais | null): void => { irMateriais = f; };
export const irParaMateriais = (): IrMateriais | null => irMateriais;
