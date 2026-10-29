// O tipo e a duração de uma visita nos dois mundos: o CRM guarda a chave (levantamento, medicao, materiais, revisita; minutos) e a Emylia guarda o texto
// («Medição técnica», «1 h 30»). Funções puras; nada aqui lê a base nem o relógio.
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";

export const TIPOS_DE_VISITA: readonly TipoVisitaNegocio[] = ["levantamento", "medicao", "materiais", "revisita"];

/** O texto que a Emylia usa para cada tipo (o mesmo do campo «Tipo de visita» dela). */
export const TEXTO_DO_TIPO: Readonly<Record<TipoVisitaNegocio, string>> = {
  levantamento: "Levantamento", medicao: "Medição técnica", materiais: "Escolha de materiais", revisita: "Revisita",
};

/** O tipo do CRM a partir do texto da Emylia; texto desconhecido dá `null` (nada se adivinha). */
export function tipoDoTexto(texto: string | null | undefined): TipoVisitaNegocio | null {
  return TIPOS_DE_VISITA.find((t) => TEXTO_DO_TIPO[t] === texto) ?? null;
}

/** O tipo do CRM a partir do `visit_kind` da base; o que não é um dos quatro dá `null`. */
export function tipoDaBase(kind: string | null | undefined): TipoVisitaNegocio | null {
  return TIPOS_DE_VISITA.find((t) => t === kind) ?? null;
}

// As durações que a Emylia oferece, em minutos.
const DURACOES_EMYLIA: readonly [number, string][] = [[30, "30 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"]];

/**
 * A duração no texto da Emylia. A visita do CRM pode durar outra coisa (45 min): a Emylia só tem quatro opções, por isso guarda a mais próxima
 * (a duração verdadeira fica no CRM, que é a fonte).
 */
export function textoDaDuracao(minutos: number | null | undefined): string {
  const m = typeof minutos === "number" && Number.isFinite(minutos) && minutos > 0 ? minutos : 60;
  return DURACOES_EMYLIA.reduce((melhor, atual) => (Math.abs(atual[0] - m) < Math.abs(melhor[0] - m) ? atual : melhor))[1];
}

// «Quem vai estar»: a chave do CRM e o texto da Emylia.
const PRESENTES_EMYLIA: Readonly<Record<string, string>> = { cliente: "O cliente", casal: "O casal", familia: "A família", outra: "Outra pessoa" };
/** A chave do CRM a partir do texto da Emylia («O casal» dá `casal`); vazio quando não se disse. */
export const chaveDosPresentes = (texto: string | null | undefined): string => Object.entries(PRESENTES_EMYLIA).find(([, t]) => t === texto)?.[0] ?? "";
export const textoDosPresentes =(chave: string | null | undefined): string => (chave ? PRESENTES_EMYLIA[chave] ?? "" : "");
