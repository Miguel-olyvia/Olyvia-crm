// Indicativos do seletor de telefone do RH (nova pessoa, convite de admissão, ficha, centros).
//
// O telefone pessoal recebe o código SMS que assina o contrato no portal; a RPC rpc_hr_portal_documento_codigo_pedir só aceita
// estes 18 indicativos. Três deles (+245, +239, +670) não estão em COUNTRY_CODES: ficam aqui, só para o RH, sem mexer na lista
// partilhada com as leads.
import { COUNTRY_CODES, type CountryCode } from "@/constants/countryCodes";
import { joinInternationalPhone, splitInternationalPhone, type SplitPhone } from "./splitInternationalPhone";

export const INDICATIVOS_SMS_CONTRATO: readonly string[] = [
  "+351", "+34", "+33", "+49", "+44", "+55", "+244", "+258", "+238", "+245", "+239", "+670", "+352", "+41", "+32", "+31", "+353", "+1",
];

const EXTRAS_RH: readonly CountryCode[] = [
  { name: "Guinea-Bissau", code: "GW", dialCode: "+245", flag: "🇬🇼" },
  { name: "Sao Tome and Principe", code: "ST", dialCode: "+239", flag: "🇸🇹" },
  { name: "Timor-Leste", code: "TL", dialCode: "+670", flag: "🇹🇱" },
];

export interface OpcaoIndicativo {
  value: string;
  label: string;
}

const rotuloDe = (c: CountryCode): string => `${c.flag} ${c.dialCode} ${c.code}`;

// Um indicativo por opção (vários países partilham o mesmo): ganha o primeiro da lista.
const TODOS: readonly CountryCode[] = (() => {
  const vistos = new Set<string>();
  return [...COUNTRY_CODES, ...EXTRAS_RH].filter((c) => (vistos.has(c.dialCode) ? false : (vistos.add(c.dialCode), true)));
})();

/** Como `splitInternationalPhone`, mas reconhece também os indicativos extra do RH (+245, +239, +670). */
export function partirTelefoneRh(raw: unknown): SplitPhone {
  const compacto = typeof raw === "string" ? raw.replace(/[\s().-]/g, "") : "";
  const normalizado = compacto.startsWith("00") ? `+${compacto.slice(2)}` : compacto;
  const extra = EXTRAS_RH.find((c) => normalizado.startsWith(c.dialCode));
  if (extra) return { dialCode: extra.dialCode, digits: normalizado.slice(extra.dialCode.length).replace(/\D/g, "") };
  const partido = splitInternationalPhone(raw);
  // Um «+» com indicativo que não conhecemos não pode perder o «+» ao editar: o indicativo fica «+» e os dígitos são o resto.
  if (partido.dialCode === "" && normalizado.startsWith("+")) return { dialCode: "+", digits: normalizado.slice(1).replace(/\D/g, "") };
  return partido;
}

/**
 * O valor a guardar quando se escreve (ou cola) no campo do número. Um valor colado já internacional («+351 912…», «00351…») traz o
 * seu próprio indicativo: usa-se esse e não se junta ao do seletor (dava «+351351…»). Senão: o indicativo do seletor mais os
 * dígitos e espaços escritos.
 */
export function juntarTelefoneRh(indicativo: string, texto: string): string {
  const colado = texto.trim();
  if (colado.startsWith("+") || colado.startsWith("00")) {
    const p = partirTelefoneRh(colado);
    if (p.dialCode !== "" && p.digits !== "") return joinInternationalPhone(p.dialCode, p.digits);
  }
  return joinInternationalPhone(indicativo, texto.replace(/[^\d\s]/g, ""));
}

/**
 * As opções do seletor. Com `permitidos` só esses indicativos; o indicativo já guardado (`atual`) nunca desaparece, mesmo fora
 * dos permitidos. Sem indicativo reconhecido (`atual` vazio) há uma opção vazia à frente, para o seletor não mentir.
 */
export function opcoesDeIndicativo(permitidos: readonly string[] | undefined, atual: string): OpcaoIndicativo[] {
  const base = TODOS.filter((c) => permitidos === undefined || permitidos.includes(c.dialCode));
  const opcoes = base.map((c) => ({ value: c.dialCode, label: rotuloDe(c) }));
  if (atual === "") return [{ value: "", label: "—" }, ...opcoes];
  if (opcoes.some((o) => o.value === atual)) return opcoes;
  const conhecido = TODOS.find((c) => c.dialCode === atual);
  return [...opcoes, { value: atual, label: conhecido ? rotuloDe(conhecido) : atual === "+" ? "+…" : atual }];
}
