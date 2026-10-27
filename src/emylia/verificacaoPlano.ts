// 23/10/2026: a verificação do plano antes de o aprovar (Operações). Cada ponto diz se está bem e, se não, o que falta.
// Junta ao que já havia (sinal, férias, materiais) duas verificações novas: tarefas sem técnico e o mesmo técnico em duas
// obras nos mesmos dias (os planos do orçamento, com datas reais).
import { conflitos, type Estado, type Negocio, type Plano, TECS } from "./motor";
import { diasDaObra, isoDia, proximoUtil } from "./planoObra";
import { inicioDoPlano, rotuloDia } from "./preparacaoObra";

export interface PontoPlano { id: string; ok: boolean; t: string; ir?: "plano" | "equipa" | "mat" | "compras";
  /** Técnicos noutra obra: o 1.º dia útil depois dessas obras acabarem ("aaaa-mm-dd"), para começar sem choques. */ depois?: string }

/** Os dias reais ("aaaa-mm-dd") de cada tarefa de um plano do orçamento; null nos planos de exemplo. */
function diasReais(p: Plano): string[][] | null {
  const i = inicioDoPlano(p);
  if (!i) return null;
  const fim = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const D = diasDaObra(i, fim).map(isoDia);
  return p.tasks.map((t) => D.slice(t.dia, t.dia + t.dur));
}

/** O último dia real de um plano do orçamento ("aaaa-mm-dd"). */
function ultimoDia(p: Plano): string | null { const A = diasReais(p); return A ? A.flat().sort().pop() ?? null : null; }

/** O mesmo técnico noutra obra (por aprovar, aprovada ou em curso) num dos mesmos dias. */
export function sobreposicoes(d: Negocio, S: Estado): { tec: string; n: string; tarefa: string; outra: string; dia: string; fimOutra: string | null }[] {
  const p = d.obra.plano, A = p && diasReais(p);
  if (!p || !A) return [];
  const out: { tec: string; n: string; tarefa: string; outra: string; dia: string; fimOutra: string | null }[] = [];
  for (const o of S.deals) {
    const q = o.obra.plano;
    if (o.id === d.id || !q || q.estado === "concluída" || o.perdido || o.anulado) continue;
    const B = diasReais(q);
    if (!B) continue;
    p.tasks.forEach((t, i) => {
      if (!t.tec || out.some((x) => x.tec === t.tec && x.outra === o.nome)) return;
      q.tasks.forEach((u, j) => {
        if (u.tec !== t.tec || out.some((x) => x.tec === t.tec && x.outra === o.nome)) return;
        const dia = A[i].find((x) => B[j].includes(x));
        if (dia) out.push({ tec: t.tec, n: TECS.find((x) => x.id === t.tec)?.n ?? t.tec, tarefa: t.nome, outra: o.nome, dia, fimOutra: ultimoDia(q) });
      });
    });
  }
  return out;
}

export function verificarPlano(d: Negocio, S: Estado, falta: string[]): PontoPlano[] {
  const p = d.obra.plano;
  if (!p) return [];
  const semTec = p.tasks.filter((t) => !t.tec), semHoras = p.tasks.filter((t) => !(t.h > 0));
  const fer = conflitos(p), sob = sobreposicoes(d, S);
  const fins = sob.map((x) => x.fimOutra).filter((x): x is string => !!x).sort();
  const depois = fins.length ? (() => { const [a, m, x] = fins[fins.length - 1].split("-").map(Number); return isoDia(proximoUtil(new Date(a, m - 1, x + 1))); })() : undefined;
  const mats = falta.filter((f) => !/plano|pagamento|sinal/i.test(f));
  const dataCurta = (iso: string) => { const [a, m, x] = iso.split("-").map(Number); return new Date(a, m - 1, x).toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" }); };
  return [
    { id: "sinal", ok: d.fin.pago, t: d.fin.pago ? "Sinal pago" : "À espera do pagamento do sinal (Financeiro)" },
    { id: "inicio", ok: !!p.tasks.length, t: p.tasks.length ? `Começa a ${rotuloDia(p, 0)} e acaba a ${rotuloDia(p, Math.max(...p.tasks.map((t) => t.dia + t.dur)) - 1)}` : "O plano não tem tarefas", ir: "plano" },
    { id: "tecnicos", ok: !semTec.length, t: semTec.length ? `${semTec.length} ${semTec.length === 1 ? "tarefa sem técnico" : "tarefas sem técnico"}: ${semTec.map((t) => t.nome).join(", ")}` : "Todas as tarefas têm técnico", ir: "plano" },
    { id: "horas", ok: !semHoras.length, t: semHoras.length ? `${semHoras.length} ${semHoras.length === 1 ? "tarefa" : "tarefas"} sem horas` : "Todas as tarefas têm horas", ir: "plano" },
    { id: "ferias", ok: !fer.length, t: fer.length ? `${fer.map((c) => c.tec.n.split(" ")[0]).join(", ")} de férias numa tarefa` : "Ninguém de férias nos dias da obra", ir: "plano" },
    { id: "outras", ok: !sob.length, t: sob.length ? sob.map((x) => `${x.n.split(" ")[0]} também está na obra de ${x.outra} a ${dataCurta(x.dia)}`).join(" · ") : "Nenhum técnico noutra obra nos mesmos dias", ir: "equipa", depois },
    // 26/10: falta aprovar encomendas a fornecedor: o "resolver" leva às compras desta obra no Inventário, já filtradas
    { id: "materiais", ok: !mats.length, t: mats.length ? `Materiais: falta ${mats.join(", ")}` : "Materiais encomendados", ir: mats.some((m) => /encomendas? a fornecedor/i.test(m)) ? "compras" : "mat" },
  ];
}
