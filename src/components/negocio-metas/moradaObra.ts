// Lógica pura da Morada da obra de "Novo negócio": o que o formulário guarda, o formato do código postal e o atalho
// "Usar a morada do contacto". A morada fica no negócio, não na pessoa.
import type { MoradaObraNegocio } from "./negocioMetas";

export type MoradaObraForm = MoradaObraNegocio;
export type ChaveMorada = keyof MoradaObraForm;

export const CHAVES_MORADA = ["rua", "codigoPostal", "localidade", "andar"] as const satisfies readonly ChaveMorada[];

export const MORADA_VAZIA: MoradaObraForm = { rua: "", codigoPostal: "", localidade: "", andar: "" };

const FORMATO_CODIGO_POSTAL = /^\d{4}-\d{3}$/;

/** O código postal é opcional; quando escrito tem de ser 0000-000. */
export function validarCodigoPostal(texto: string): "invalido" | null {
  const limpo = texto.trim();
  return limpo === "" || FORMATO_CODIGO_POSTAL.test(limpo) ? null : "invalido";
}

export const temMorada = (m: MoradaObraForm | undefined): m is MoradaObraForm => !!m && CHAVES_MORADA.some((c) => m[c].trim() !== "");

export function moradaAparada(m: MoradaObraForm): MoradaObraForm {
  return { rua: m.rua.trim(), codigoPostal: m.codigoPostal.trim(), localidade: m.localidade.trim(), andar: m.andar.trim() };
}

const COM_CODIGO_POSTAL = /^(.*?)[,\s]*(\d{4}-\d{3})\s*(.*)$/;

/** A morada de um só texto da aba Geral ("Rua A, 1000-001 Lisboa") em rua, código postal e localidade; sem código postal, tudo vai para a rua. */
export function moradaDoContacto(texto: string): MoradaObraForm {
  const limpo = texto.trim();
  const partes = COM_CODIGO_POSTAL.exec(limpo);
  if (!partes) return { ...MORADA_VAZIA, rua: limpo };
  return { rua: partes[1].trim(), codigoPostal: partes[2], localidade: partes[3].trim(), andar: "" };
}
