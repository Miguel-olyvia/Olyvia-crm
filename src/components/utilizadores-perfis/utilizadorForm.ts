// Lógica pura do formulário de utilizador: valores iniciais, o que se guarda e o utilizador de pré-visualização das permissões.
// A palavra-passe vive só no formulário: nunca vai para o utilizador nem para o store.
import { estadoDe, type DadosUtilizador, type EstadoUtilizador } from "./perfisStore";
import type { Utilizador, Vinculo } from "./tipos";

export interface ValoresFormUtilizador {
  nome: string;
  email: string;
  telefone: string;
  morada: string;
  posicao: string;
  palavraPasse: string;
  estado: EstadoUtilizador;
  vinculos: Vinculo[];
}

/** Uma linha de vínculo por escolher (organização e role vazias), ativa e sem âmbitos alterados. */
export const vinculoVazio = (): Vinculo => ({ organizacaoId: "", roleId: "", ativo: true, ambitos: {} });

/** Os valores com que o formulário abre: um convite em branco (Convidado, uma linha de vínculo) ou os do utilizador. */
export function valoresIniciaisUtilizador(u?: Utilizador): ValoresFormUtilizador {
  if (!u) {
    return { nome: "", email: "", telefone: "", morada: "", posicao: "", palavraPasse: "", estado: "convidado", vinculos: [vinculoVazio()] };
  }
  return {
    nome: u.nome, email: u.email, telefone: u.telefone ?? "", morada: u.morada ?? "", posicao: u.posicao ?? "", palavraPasse: "",
    estado: estadoDe(u), vinculos: u.vinculos.map((v) => ({ ...v, ambitos: { ...v.ambitos } })),
  };
}

/** O que se guarda: tudo menos a palavra-passe. */
export function paraDados(v: ValoresFormUtilizador): DadosUtilizador {
  return {
    nome: v.nome, email: v.email, telefone: v.telefone, morada: v.morada, posicao: v.posicao, estado: v.estado,
    vinculos: v.vinculos.map((x) => ({ ...x, ambitos: { ...x.ambitos } })),
  };
}

/** O utilizador tal como ficaria, só com os vínculos completos: serve a aba Permissões (efetivas e origem). */
export function utilizadorDeValores(v: ValoresFormUtilizador, id: string): Utilizador {
  return {
    id, nome: v.nome, email: v.email, ativo: v.estado !== "inativo", convidado: v.estado === "convidado", ultimoAcesso: null,
    vinculos: v.vinculos.filter((x) => x.organizacaoId && x.roleId), atividade: [],
  };
}

const CARACTERES = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
export const TAMANHO_GERADA = 12;

/** Uma palavra-passe aleatória de 12 caracteres (sem os que se confundem, como 0/O e 1/l). `aleatorio` devolve 0 a 1. */
export function gerarPalavraPasse(aleatorio: () => number = Math.random): string {
  return Array.from({ length: TAMANHO_GERADA }, () => CARACTERES[Math.min(CARACTERES.length - 1, Math.floor(aleatorio() * CARACTERES.length))]).join("");
}
