// 4/11 (Rúben): a «Nova lead» guiada, um passo de cada vez (como chegou, quem é, o formulário, quem acompanha, confirmar). Os campos e a
// gravação são os de sempre (os da Leads original); aqui só se diz que campos tem cada passo e se valida o passo antes de avançar,
// com a mesma validação de quando se cria (validateLeadFieldValues).
import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import { validateLeadFieldValues } from "@/hooks/pessoas/novaLead/validarCamposLead";

export type IdPasso = "origem" | "contacto" | "pedido" | "comercial" | "confirmar";
export interface PassoNovaLead { id: IdPasso; campos: readonly DefinicaoCampo[] }

/** Os passos: o do formulário só existe quando o formulário escolhido tem campos. */
export function passosNovaLead(base: readonly DefinicaoCampo[], campanha: readonly DefinicaoCampo[]): PassoNovaLead[] {
  return [
    { id: "origem", campos: [] },
    { id: "contacto", campos: base },
    ...(campanha.length > 0 ? [{ id: "pedido" as const, campos: campanha }] : []),
    { id: "comercial", campos: [] },
    { id: "confirmar", campos: [] },
  ];
}

/** Os erros dos campos de um passo ({chave: mensagem}), como os de «Criar lead». */
export function errosDoPasso(passo: PassoNovaLead, valores: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(validateLeadFieldValues([...passo.campos], { ...valores }).map((e) => [e.fieldKey, e.message]));
}

/** O primeiro passo com um campo em erro (depois de «Criar lead»), para voltar a ele. */
export function passoComErro(passos: readonly PassoNovaLead[], erros: Readonly<Record<string, string>>): IdPasso | null {
  return passos.find((p) => p.campos.some((c) => erros[c.field_key]))?.id ?? null;
}

/** O valor de um campo como se lê no resumo; vazio se não foi preenchido. */
export function textoDoValor(v: unknown, sim: string, nao: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? sim : nao;
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && String(x).trim() !== "").join(", ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).filter((x) => typeof x === "string" && x.trim()).join(", ");
  return String(v).trim();
}
