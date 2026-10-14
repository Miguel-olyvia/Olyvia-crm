// Tipos da página "Utilizadores e perfis" (exemplo, sem base de dados).
export type Ambito = "NONE" | "OWNED" | "TEAM" | "ORG";
/** Quem tem a permissão acrescentada ao catálogo: migration, guarda de rota/menu, uso no código ou só nos docs. */
export type FontePermissao = "migration" | "rota" | "codigo" | "docs";

export interface Permissao {
  codigo: string;
  /** A categoria em anew_permissions (a que o ecrã de Roles agrupa por menu). */
  categoria: string;
  nome: string;
  fonte: FontePermissao;
  /** Assinalada como perigosa (eliminar, exportar dados sensíveis, aprovar, receber...). */
  perigosa: boolean;
  /** Tem âmbito configurável por vínculo (nenhum, só os meus, equipa, organização). */
  comAmbito: boolean;
}

export interface Role {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  /** Roles de sistema não se eliminam. */
  sistema: boolean;
  podeAssinar: boolean;
  permissoes: string[];
}

export interface Vinculo {
  organizacaoId: string;
  roleId: string;
  ativo: boolean;
  /** Âmbito por permissão com âmbito; o que não estiver aqui é "OWNED". */
  ambitos: Record<string, Ambito>;
}

export interface Utilizador {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** Último acesso (AAAA-MM-DD) ou `null` se nunca entrou. */
  ultimoAcesso: string | null;
  vinculos: Vinculo[];
  atividade: { data: string; texto: string }[];
}

/** Organização da PLATAFORMA (workorg) em que um utilizador tem vínculo e role; `pai` é o grupo a que pertence. */
export interface Organizacao {
  id: string;
  nome: string;
  pai?: string;
}

export interface ClientePortal {
  id: string;
  nome: string;
  organizacaoId: string;
  ativo: boolean;
  ultimoAcesso: string | null;
}

export type EstadoFiltro = "ativos" | "inativos" | "todos";

export interface FiltrosUtilizadores {
  texto: string;
  estado: EstadoFiltro;
  /** Id da role, ou "" para todas. */
  roleId: string;
  /** Id da organização, ou "" para todas. */
  organizacaoId: string;
}

export const FILTROS_INICIAIS: FiltrosUtilizadores = { texto: "", estado: "ativos", roleId: "", organizacaoId: "" };

export type Separador = "utilizadores" | "roles" | "portal";
export type Aberto = { tipo: "utilizador" | "role"; id: string } | null;
