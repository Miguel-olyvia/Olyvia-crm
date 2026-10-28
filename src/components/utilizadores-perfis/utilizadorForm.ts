// Lógica pura do formulário de utilizador: valores iniciais e o utilizador de pré-visualização das permissões.
// A palavra-passe vive só no formulário: nunca vai para o utilizador. O estado (ativo/inativo) não se escolhe aqui:
// muda-se com Desativar/Reativar na ficha, que revogam e repõem o login a sério, como em /users.
import type { Utilizador, Vinculo } from "./tipos";

export interface ValoresFormUtilizador {
  nome: string;
  email: string;
  telefone: string;
  posicao: string;
  palavraPasse: string;
  vinculos: Vinculo[];
}

/** Uma linha de vínculo por escolher (organização e role vazias), ativa e sem âmbitos alterados. */
export const vinculoVazio = (): Vinculo => ({ organizacaoId: "", roleId: "", ativo: true, ambitos: {} });

const copiar = (v: Vinculo): Vinculo => ({ ...v, ambitos: { ...v.ambitos } });

/** Os valores com que o formulário abre: um utilizador novo em branco (uma linha de vínculo) ou os do utilizador (só os vínculos ativos, como /users). */
export function valoresIniciaisUtilizador(u?: Utilizador): ValoresFormUtilizador {
  if (!u) return { nome: "", email: "", telefone: "", posicao: "", palavraPasse: "", vinculos: [vinculoVazio()] };
  return {
    nome: u.nome, email: u.email, telefone: u.telefone ?? "", posicao: u.posicao ?? "", palavraPasse: "",
    vinculos: u.vinculos.filter((v) => v.ativo).map(copiar),
  };
}

/** O utilizador tal como ficaria, só com os vínculos completos: serve a aba Permissões (efetivas e origem). */
export function utilizadorDeValores(v: ValoresFormUtilizador, id: string): Utilizador {
  return {
    id, nome: v.nome, email: v.email, ativo: true, ultimoAcesso: null,
    vinculos: v.vinculos.filter((x) => x.organizacaoId && x.roleId), atividade: [],
  };
}

const CARACTERES = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
export const TAMANHO_GERADA = 12;

/** Uma palavra-passe aleatória de 12 caracteres (sem os que se confundem, como 0/O e 1/l). `aleatorio` devolve 0 a 1. */
export function gerarPalavraPasse(aleatorio: () => number = Math.random): string {
  return Array.from({ length: TAMANHO_GERADA }, () => CARACTERES[Math.min(CARACTERES.length - 1, Math.floor(aleatorio() * CARACTERES.length))]).join("");
}
