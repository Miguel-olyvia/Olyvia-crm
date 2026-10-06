/**
 * Nomes das coisas por empresa (cfg_empresa.termos). Numa empresa de
 * manutenção o "Cliente" pode ser um "Condomínio" e a "Obra" uma
 * "Intervenção". Sem configuração ficam os de sempre.
 */

export type Termo = "cliente" | "local" | "obra" | "negocio" | "lead";
export const TERMOS: readonly Termo[] = ["cliente", "local", "obra", "negocio", "lead"];

export interface FormaTermo {
  singular: string;
  plural: string;
}
export type Termos = Record<Termo, FormaTermo>;

export const TERMOS_PADRAO: Termos = {
  cliente: { singular: "Cliente", plural: "Clientes" },
  local: { singular: "Local", plural: "Locais" },
  obra: { singular: "Obra", plural: "Obras" },
  negocio: { singular: "Negócio", plural: "Negócios" },
  lead: { singular: "Lead", plural: "Leads" },
};

export const DESCRICAO_TERMO: Record<Termo, string> = {
  cliente: "Quem compra (ex.: Cliente, Condomínio, Loja)",
  local: "Onde se faz o trabalho (ex.: Local, Instalação, Fração)",
  obra: "O trabalho (ex.: Obra, Intervenção, Serviço)",
  negocio: "A oportunidade comercial (ex.: Negócio, Pedido)",
  lead: "O contacto ainda por qualificar (ex.: Lead, Pedido de contacto)",
};

/** Junta o gravado com os de sempre (ignora o que vier vazio ou estranho). */
export function combinarTermos(gravado: unknown): Termos {
  const r: Termos = { ...TERMOS_PADRAO };
  if (!gravado || typeof gravado !== "object") return r;
  for (const t of TERMOS) {
    const v = (gravado as Record<string, unknown>)[t] as Partial<FormaTermo> | undefined;
    const s = typeof v?.singular === "string" ? v.singular.trim() : "";
    const p = typeof v?.plural === "string" ? v.plural.trim() : "";
    if (s && p) r[t] = { singular: s, plural: p };
  }
  return r;
}

/** Só os que diferem dos de sempre (o que se grava). */
export function termosParaGravar(t: Termos): Partial<Termos> {
  const r: Partial<Termos> = {};
  for (const k of TERMOS) {
    if (t[k].singular !== TERMOS_PADRAO[k].singular || t[k].plural !== TERMOS_PADRAO[k].plural) r[k] = t[k];
  }
  return r;
}

/** "Clientes" → "clientes" quando aparece a meio de uma frase. */
export const minuscula = (s: string) => (s ? s.charAt(0).toLocaleLowerCase("pt-PT") + s.slice(1) : s);
