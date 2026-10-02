// Validador único das moradas (morada de entrega e morada principal do
// cliente). As regras são as MESMAS que a base aplica em
// rpc_add_entity_delivery_address / rpc_update_entity_delivery_address e, para
// a morada principal, em rpc_update_client / rpc_create_client_manual
// (20261206160000):
//   • rua, código postal e localidade obrigatórios;
//   • código postal no formato 0000-000 e diferente de 0000-000;
//   • número, andar e fração opcionais.
// Os limites de tamanho são os do addressSchema (src/lib/validations.ts).
// A ficha técnica do edifício (só moradas de entrega) valida-se com
// validarFichaTecnica, reexportado daqui.

export {
  validarFichaTecnica,
  pisoNumerico,
  type ErrosFichaTecnica,
  type FichaTecnicaValores,
  type ResultadoValidacaoFichaTecnica,
} from "@/lib/addresses/fichaTecnicaEdificio";

/** Os campos de uma morada, como texto (o que o formulário edita). */
export interface MoradaCampos {
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
}
export type CampoMorada = keyof MoradaCampos;
export type ErrosMorada = Partial<Record<CampoMorada, string>>;

export interface ResultadoValidacaoMorada {
  valido: boolean;
  erros: ErrosMorada;
}

export interface OpcoesValidarMorada {
  /**
   * true  → a morada tem de existir (morada de entrega).
   * false → todos os campos vazios é válido (cliente sem morada); se algum
   *         campo estiver preenchido, aplicam-se as regras todas.
   */
  obrigatoria: boolean;
}

export const MORADA_VAZIA: MoradaCampos = {
  street: "",
  number: "",
  floor: "",
  unit: "",
  postal_code: "",
  city: "",
};

export const LIMITES_MORADA: Record<CampoMorada, number> = {
  street: 255,
  number: 20,
  floor: 20,
  unit: 20,
  postal_code: 8,
  city: 100,
};

export const MENSAGENS_MORADA = {
  ruaObrigatoria: "A rua é obrigatória",
  codigoPostalObrigatorio: "O código postal é obrigatório",
  codigoPostalInvalido: "Código postal inválido (formato 0000-000)",
  localidadeObrigatoria: "A localidade é obrigatória",
  demasiadoLongo: (max: number) => `Máximo de ${max} caracteres`,
} as const;

const CODIGO_POSTAL_RE = /^[0-9]{4}-[0-9]{3}$/;

const limpar = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/**
 * Tira os espaços e põe o hífen quando vêm 7 dígitos seguidos:
 * " 1000 001 " → "1000-001", "1000001" → "1000-001". Outros valores ficam
 * como estão (sem espaços), para o validador os recusar.
 */
export const normalizarCodigoPostal = (valor: string | null | undefined): string => {
  const semEspacos = (valor ?? "").replace(/\s+/g, "").replace(/[‐-―−]/g, "-");
  if (/^[0-9]{7}$/.test(semEspacos)) return `${semEspacos.slice(0, 4)}-${semEspacos.slice(4)}`;
  return semEspacos;
};

export const codigoPostalValido = (valor: string | null | undefined): boolean => {
  const cp = normalizarCodigoPostal(valor);
  return CODIGO_POSTAL_RE.test(cp) && cp !== "0000-000";
};

/** Campos sem espaços nas pontas e código postal normalizado — é isto que se grava. */
export const normalizarMorada = (m: Partial<MoradaCampos> | null | undefined): MoradaCampos => ({
  street: limpar(m?.street),
  number: limpar(m?.number),
  floor: limpar(m?.floor),
  unit: limpar(m?.unit),
  postal_code: normalizarCodigoPostal(limpar(m?.postal_code)),
  city: limpar(m?.city),
});

export const moradaVazia = (m: Partial<MoradaCampos> | null | undefined): boolean => {
  const n = normalizarMorada(m);
  return (Object.keys(MORADA_VAZIA) as CampoMorada[]).every((campo) => n[campo] === "");
};

export const validarMorada = (
  m: Partial<MoradaCampos> | null | undefined,
  { obrigatoria }: OpcoesValidarMorada,
): ResultadoValidacaoMorada => {
  if (!obrigatoria && moradaVazia(m)) return { valido: true, erros: {} };

  const n = normalizarMorada(m);
  const erros: ErrosMorada = {};

  if (!n.street) erros.street = MENSAGENS_MORADA.ruaObrigatoria;

  if (!n.postal_code) erros.postal_code = MENSAGENS_MORADA.codigoPostalObrigatorio;
  else if (!codigoPostalValido(n.postal_code)) erros.postal_code = MENSAGENS_MORADA.codigoPostalInvalido;

  if (!n.city) erros.city = MENSAGENS_MORADA.localidadeObrigatoria;

  for (const campo of Object.keys(LIMITES_MORADA) as CampoMorada[]) {
    if (erros[campo]) continue;
    const max = LIMITES_MORADA[campo];
    if (n[campo].length > max) erros[campo] = MENSAGENS_MORADA.demasiadoLongo(max);
  }

  return { valido: Object.keys(erros).length === 0, erros };
};

/** Tira os erros dos campos que mudaram (o erro some assim que se corrige o campo). */
export const limparErrosAlterados = (
  erros: ErrosMorada,
  antes: Partial<MoradaCampos>,
  depois: Partial<MoradaCampos>,
): ErrosMorada => {
  const alterados = (Object.keys(erros) as CampoMorada[]).filter((campo) => antes[campo] !== depois[campo]);
  if (alterados.length === 0) return erros;
  const resto = { ...erros };
  for (const campo of alterados) delete resto[campo];
  return resto;
};

/** Primeira mensagem de erro (para um toast). */
export const primeiroErroMorada = (erros: ErrosMorada): string | undefined => {
  const ordem: CampoMorada[] = ["street", "number", "floor", "unit", "postal_code", "city"];
  for (const campo of ordem) if (erros[campo]) return erros[campo];
  return undefined;
};
