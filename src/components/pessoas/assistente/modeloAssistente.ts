// O modelo do assistente de passos: funções puras, sem JSX nem hooks. Diz o que falta em cada passo, quanto tempo leva, que estado tem na coluna,
// para onde salta o «Ir para» e quais são os passos das fases Contacto e Visita. As secções do levantamento vêm do questionário da base.
import type { QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { Respostas, SeccaoDef } from "@/components/negocio-metas/perguntasTipos";
import { contarSeccao } from "@/components/negocio-metas/respostasVisita";
import type { EstadoDoPasso, PassoAssistente, TempoDoPasso } from "./tiposAssistente";

/** Segundos que se contam por resposta que falta (a regra do protótipo). */
const SEGUNDOS_POR_RESPOSTA = 6;

export const faltam = (p: PassoAssistente): number => Math.max(0, p.obrigatorias - p.respondidas);

export const completo = (p: PassoAssistente): boolean => p.feito ?? faltam(p) === 0;

export function tempoDoPasso(emFalta: number): TempoDoPasso {
  if (emFalta <= 0) return { tipo: "completo" };
  const segundos = emFalta * SEGUNDOS_POR_RESPOSTA;
  return segundos < 60 ? { tipo: "menosDeUmMinuto" } : { tipo: "minutos", minutos: Math.ceil(segundos / 60) };
}

export function estadoDoPasso(p: PassoAssistente, { ativo, visitado }: { ativo: boolean; visitado: boolean }): EstadoDoPasso {
  if (completo(p)) return "feito";
  if (ativo) return "atual";
  return visitado ? "comFalta" : "porFazer";
}

/** O passo para onde salta o «Ir para»: o primeiro à frente que ainda tem falta, ou o último; `null` no último passo. */
export function proximoRelevante(passos: readonly PassoAssistente[], indice: number): number | null {
  const ultimo = passos.length - 1;
  if (indice >= ultimo) return null;
  const falta = passos.findIndex((p, i) => i > indice && !completo(p));
  return falta === -1 ? ultimo : falta;
}

// ---------------------------------------------------------------- fase Contacto

export interface ContextoContacto {
  /** Chamadas registadas à pessoa. */
  chamadas: number;
  /** Já há uma visita marcada. */
  visitaMarcada: boolean;
  /** As perguntas visíveis da Qualificação (as do questionário da base) e as respondidas. */
  perguntas: { respondidas: number; total: number };
  morada: { rua: string; codigoPostal: string; localidade: string };
  preparar: { duracao: string; quem: string };
}

const cheio = (texto: string): number => (texto.trim() === "" ? 0 : 1);

export function passosDoContacto(c: ContextoContacto): PassoAssistente[] {
  const p = (id: string, icone: PassoAssistente["icone"], obrigatorias: number, respondidas: number, precisaNegocio: boolean): PassoAssistente => ({
    id, rotuloChave: `pessoasPagina.assistente.passo.${id}`, icone, obrigatorias, respondidas, precisaNegocio,
  });
  return [
    p("chamada", "telefone", 1, c.chamadas > 0 ? 1 : 0, false),
    p("qualificacao", "qualificacao", c.perguntas.total, c.perguntas.respondidas, true),
    p("morada", "morada", 3, cheio(c.morada.rua) + cheio(c.morada.codigoPostal) + cheio(c.morada.localidade), true),
    p("preparar", "preparar", 2, cheio(c.preparar.duracao) + cheio(c.preparar.quem), true),
    p("marcar", "agenda", 1, c.visitaMarcada ? 1 : 0, false),
  ];
}

// ---------------------------------------------------------------- fase Visita

export interface SeccaoDoAssistente {
  id: string;
  titulo: string;
  respondidas: number;
  total: number;
}

export interface ContextoVisita {
  /** Visitas ligadas ao negócio (as canceladas não contam). */
  visitas: number;
  seccoes: readonly SeccaoDoAssistente[];
  /** O levantamento já foi guardado. */
  guardado: boolean;
}

export function passosDaVisita(c: ContextoVisita): PassoAssistente[] {
  return [
    { id: "visitas", rotuloChave: "pessoasPagina.assistente.passo.visitas", icone: "visitas", obrigatorias: 1, respondidas: c.visitas > 0 ? 1 : 0, precisaNegocio: false },
    ...c.seccoes.map((s): PassoAssistente => ({
      id: `seccao:${s.id}`, rotulo: s.titulo, icone: "seccao", obrigatorias: s.total, respondidas: s.respondidas, precisaNegocio: true,
    })),
    { id: "fechar", rotuloChave: "pessoasPagina.assistente.passo.fechar", icone: "fechar", obrigatorias: 0, respondidas: 0, precisaNegocio: true, feito: c.guardado },
  ];
}

/** Fica de fora do levantamento por agora (serviços e produtos): a secção «Necessidades do cliente». */
const SECCAO_FORA = "necessidades";

/** As secções que são um passo cada: as do questionário da base, sem Visitas (é o primeiro passo), sem Necessidades e sem a Qualificação (é do Contacto). */
export function seccoesDoAssistente(q: QuestionarioForm, respostas: Respostas, linhasDeMedidas: number): SeccaoDoAssistente[] {
  return q.seccoes
    .filter((s: SeccaoDef) => s.aba !== "qualificacao" && s.especial !== "visitas" && s.id !== SECCAO_FORA)
    .map((s) => {
      // As medidas não são perguntas: a secção pede pelo menos uma linha.
      if (s.especial === "medidas") return { id: s.id, titulo: s.titulo[0], respondidas: linhasDeMedidas > 0 ? 1 : 0, total: 1 };
      const { respondidas, total } = contarSeccao(s, respostas);
      return { id: s.id, titulo: s.titulo[0], respondidas, total };
    });
}
