// 4/11 (Rúben): numa visita nova, o que se escreveu no passo «Preparar a visita» (quem vai estar, a duração prevista e a nota) já vem
// preenchido em «Marcar a visita» (MarcarVisitaNegocio). Funções puras.
import type { Negocio } from "@/emylia/motor";
import { chaveDosPresentes } from "@/hooks/pessoas/tipoVisitaChave";

const MINUTOS_PREPARADOS: Record<string, number> = { "1 h": 60, "1 h 30": 90, "2 h": 120 };

export function preparadoNoNegocio(d: Pick<Negocio, "f">): { presentesInicial?: string; duracaoInicialMin?: number; notaInicial?: string } {
  const presentes = chaveDosPresentes(d.f.presentes), minutos = MINUTOS_PREPARADOS[d.f.duracao ?? ""], nota = (d.f.nota_visita ?? "").trim();
  return { ...(presentes ? { presentesInicial: presentes } : {}), ...(minutos ? { duracaoInicialMin: minutos } : {}), ...(nota ? { notaInicial: nota } : {}) };
}
