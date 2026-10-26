// A regra do grupo «Quem pede» do passo Chamada (funções puras): o NIF e a ligação entre o tipo de cliente e o tipo de identidade.
// O NIF nunca é lido da base (só os últimos 3 dígitos), por isso o campo abre vazio e só se grava, ou limpa, o que se tocou.
import type { TipoCliente } from "../pessoasTipos";
import type { TipoIdentidade } from "@/components/pessoas-lista/identidadeFormulario";

const DIGITOS_NIF = 9;
const PESOS = [9, 8, 7, 6, 5, 4, 3, 2] as const;

/** Tira espaços, pontos e hífenes e passa a maiúsculas (como o servidor). */
export const normalizarNif = (texto: string): string => texto.trim().toUpperCase().replace(/[\s.-]/g, "");

/** Nove dígitos com o dígito de controlo certo (módulo 11). */
export function nifValido(texto: string): boolean {
  const nif = normalizarNif(texto);
  if (!/^[0-9]{9}$/.test(nif) || nif.length !== DIGITOS_NIF) return false;
  const soma = PESOS.reduce((acc, peso, i) => acc + peso * Number(nif[i]), 0);
  const resto = soma % 11;
  const controlo = resto < 2 ? 0 : 11 - resto;
  return controlo === Number(nif[8]);
}

/** O que a ficha sabe do NIF da pessoa. */
export interface NifAtual {
  nifUltimos3?: string | null;
  temNif?: boolean;
  nif?: string | null;
}

export type PedidoNif =
  | { estado: "semAlteracao" }
  | { estado: "guardar"; nif: string }
  | { estado: "limpar" }
  | { estado: "invalido" };

/**
 * O que fazer ao NIF ao continuar. Sem tocar no campo nada se grava (a pessoa pode ter um NIF que o ecrã não mostra, e um campo vazio não pode
 * apagá-lo). Tocado e vazio pede SEMPRE «limpar»: a ficha pode não dizer que há NIF (nunca se lê da base) e a função é idempotente.
 * Um NIF igual ao que a ficha já mostra não se volta a gravar.
 */
export function pedidoDeNif(texto: string, tocado: boolean, atual: NifAtual): PedidoNif {
  if (!tocado) return { estado: "semAlteracao" };
  const nif = normalizarNif(texto);
  if (nif === "") return { estado: "limpar" };
  if (!nifValido(nif)) return { estado: "invalido" };
  if (atual.nif && normalizarNif(atual.nif) === nif) return { estado: "semAlteracao" };
  return { estado: "guardar", nif };
}

/** O tipo de cliente da base como tipo de identidade; `null` quando a ficha ainda não o disse. */
export function tipoIdentidadeDe(tipo: TipoCliente | undefined): TipoIdentidade | null {
  if (tipo === "particular") return "person";
  if (tipo === "empresa") return "organization";
  if (tipo === "condominio") return "condominio";
  return null;
}

export function tipoClienteDeIdentidade(tipo: TipoIdentidade): TipoCliente {
  return tipo === "person" ? "particular" : tipo === "organization" ? "empresa" : "condominio";
}
