// O motivo de perder um negócio: um da lista do Workflow (os `motivosPerda` que já existem, ver `workflowNegocio.ts`) ou «Outro» com
// texto livre. Funções puras. O valor `MOTIVO_OUTRO` só vive no formulário (nunca se guarda): o que se guarda é o texto do motivo.

/** O valor da opção «Outro» no seletor (o texto livre é que se guarda). */
export const MOTIVO_OUTRO = "__outro__";
export const MAX_MOTIVO_OUTRO = 80;

/** O que pode estar mal no motivo: falta escolher um, ou o «Outro» está sem texto. */
export type ErroMotivoPerda = "motivoVazio" | "outroVazio";

/** As opções do seletor: os motivos da lista (sem vazios nem repetidos, e sem o «Outro» textual) e, no fim, «Outro». */
export function opcoesMotivoPerda(motivos: readonly string[]): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const bruto of motivos) {
    const motivo = bruto.trim();
    const chave = motivo.toLowerCase();
    if (motivo === "" || chave === "outro" || vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(motivo);
  }
  return [...lista, MOTIVO_OUTRO];
}

/** O erro do motivo escolhido (e do texto, se for «Outro»); `null` = válido. */
export function erroDoMotivoPerda(escolhido: string, outro: string): ErroMotivoPerda | null {
  if (escolhido.trim() === "") return "motivoVazio";
  return escolhido === MOTIVO_OUTRO && outro.trim() === "" ? "outroVazio" : null;
}

/** O texto do motivo que se guarda; `null` se o formulário ainda não o tem. */
export function motivoDaPerda(escolhido: string, outro: string): string | null {
  if (erroDoMotivoPerda(escolhido, outro)) return null;
  return escolhido === MOTIVO_OUTRO ? outro.trim().slice(0, MAX_MOTIVO_OUTRO) : escolhido.trim();
}
