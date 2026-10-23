// "Começar de um modelo" do formulário de role. O ecrã de Roles atual lê os modelos da tabela role_templates (nome, descrição e
// permissões vêm da base, não do código), por isso os modelos de exemplo são inventados aqui, a partir das roles de exemplo.
import { ROLES_EXEMPLO } from "./catalogoExemplo";
import { gerarCodigo } from "./validacoes";
import type { Role } from "./tipos";

export interface ModeloRole {
  id: string;
  nome: string;
  descricao: string;
  permissoes: string[];
}

const daRole = (roleId: string): string[] => ROLES_EXEMPLO.find((r) => r.id === roleId)?.permissoes ?? [];

export const MODELOS_EXEMPLO: ModeloRole[] = [
  { id: "m-vendas", nome: "Gestor de vendas", descricao: "Trabalha leads, clientes, propostas e contratos; não elimina nem exporta dados sensíveis.", permissoes: daRole("r-comercial") },
  { id: "m-armazem", nome: "Operador de armazém", descricao: "Compras, receção, stock e encomendas de cliente.", permissoes: daRole("r-operacoes") },
  { id: "m-consulta", nome: "Consulta", descricao: "Só vê a atividade comercial e de inventário.", permissoes: daRole("r-leitura") },
];

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
