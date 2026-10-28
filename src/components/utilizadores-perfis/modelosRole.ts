// "Começar de um modelo" do formulário de role. Os modelos vêm da tabela role_templates (nome, descrição e permissões são da
// base, não do código): lê-os `hooks/useModelosRole.ts` e a página passa-os ao formulário.
import { gerarCodigo } from "./validacoes";
import type { Role } from "./tipos";

export interface ModeloRole {
  id: string;
  nome: string;
  descricao: string;
  permissoes: string[];
}

export interface ValoresFormRole {
  nome: string;
  codigo: string;
  descricao: string;
  podeAssinar: boolean;
  permissoes: string[];
}

export const ROLE_EM_BRANCO: ValoresFormRole = { nome: "", codigo: "", descricao: "", podeAssinar: false, permissoes: [] };

/** Os valores com que o formulário abre: em branco, os da role a editar, ou os da role a duplicar com "(cópia)" no nome. */
export function valoresIniciaisRole(modo: "criar" | "editar" | "duplicar", role: Role | undefined, copia: string): ValoresFormRole {
  if (!role || modo === "criar") return { ...ROLE_EM_BRANCO };
  const base = { descricao: role.descricao, podeAssinar: role.podeAssinar, permissoes: [...role.permissoes] };
  if (modo === "editar") return { ...base, nome: role.nome, codigo: role.codigo };
  const nome = `${role.nome} ${copia}`;
  return { ...base, nome, codigo: gerarCodigo(nome) };
}

/**
 * Aplica um modelo ou uma role existente: leva as permissões e a descrição; o nome só se ainda estiver vazio (para não
 * apagar o que se escreveu). Sem origem (Em branco) devolve os valores como estão.
 */
export function aplicarOrigem(
  v: ValoresFormRole, origem: { nome: string; descricao: string; permissoes: readonly string[]; podeAssinar?: boolean } | null,
  sufixo = "",
): ValoresFormRole {
  if (!origem) return v;
  const nome = v.nome.trim() ? v.nome : `${origem.nome}${sufixo ? ` ${sufixo}` : ""}`;
  return {
    ...v, nome, descricao: origem.descricao, permissoes: [...origem.permissoes],
    podeAssinar: origem.podeAssinar ?? v.podeAssinar,
  };
}
