// 23/11 (Rúben: «mega next-level», o diário automático): o resumo de um dia de obra, escrito a partir do que os técnicos registaram no
// Hoje (as horas, as notas, as fotografias, as tarefas dadas por feitas) e do que o gestor validou. Sem IA: só o que está nos registos,
// em frases curtas. As notas de voz já chegam transcritas (a nota do registo).
import { nfmt, type Plano } from "../motor";
import { enviosDe } from "../trabalhoObra";
import { nomeCurtoTarefa } from "./planoVivo";

export interface LinhaResumo { quem: string; t: string; fotos: string[]; nota?: string; k: string }
export interface ResumoDia { dia: number; horas: number; fotos: number; linhas: LinhaResumo[]; frase: string }

const primeiro = (n: string) => (n || "").split(" ")[0];
const lista = (L: string[]) => (L.length <= 1 ? L.join("") : `${L.slice(0, -1).join(", ")} e ${L[L.length - 1]}`);

/** Os dias do plano com registos, do mais recente para o mais antigo. */
export function diasComRegistos(p: Plano): number[] {
  const s = new Set<number>();
  for (const t of p.tasks) for (const e of enviosDe(t)) if (typeof e.dia === "number" && e.dia >= 0) s.add(e.dia);
  return [...s].sort((a, b) => b - a);
}

/** O resumo do dia k: quem fez o quê, com as horas, as fotografias e as notas. Null sem registos nesse dia. */
export function resumoDoDia(p: Plano, k: number): ResumoDia | null {
  const linhas: LinhaResumo[] = [];
  let horas = 0, fotos = 0;
  const feitas: string[] = [], validadas: string[] = [], trabalho: string[] = [];
  for (const t of p.tasks) {
    const nome = nomeCurtoTarefa(t.nome);
    for (const e of enviosDe(t).filter((x) => x.dia === k)) {
      const f = e.fotos ?? [], h = e.horas ?? 0;
      horas += h; fotos += f.length;
      const quem = primeiro(e.quem);
      const t2 = e.k === "validada" ? `${quem} validou ${nome}` : e.k === "feita" ? `${quem} deu ${nome} por feita${h ? ` (${nfmt(h)} h)` : ""}` : e.k === "correcao" ? `${quem} pediu uma correção em ${nome}` : `${quem} trabalhou ${h ? `${nfmt(h)} h ` : ""}em ${nome}`;
      linhas.push({ quem: e.quem, t: t2, fotos: f, ...(e.nota ? { nota: e.nota } : {}), k: e.k });
      if (e.k === "validada") validadas.push(nome); else if (e.k === "feita") feitas.push(nome); else if (e.k !== "correcao") trabalho.push(`${nome} (${quem})`);
    }
  }
  if (!linhas.length) return null;
  const partes = [
    trabalho.length ? `Trabalhou-se em ${lista([...new Set(trabalho)])}` : "",
    feitas.length ? `${feitas.length === 1 ? "ficou feita" : "ficaram feitas"} ${lista(feitas)}` : "",
    validadas.length ? `${validadas.length === 1 ? "foi validada" : "foram validadas"} ${lista(validadas)}` : "",
  ].filter(Boolean);
  const frase = `${partes.join("; ").replace(/^./, (c) => c.toUpperCase())}. ${nfmt(Math.round(horas * 10) / 10)} h registadas${fotos ? ` e ${fotos} ${fotos === 1 ? "fotografia" : "fotografias"}` : ""}.`;
  return { dia: k, horas, fotos, linhas, frase };
}
