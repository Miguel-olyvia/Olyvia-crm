// Tipos da página "Utilizadores e perfis" (exemplo, sem base de dados).
export type Ambito = "NONE" | "OWNED" | "TEAM" | "ORG";
/** Quem tem a permissão acrescentada ao catálogo: migration, guarda de rota/menu, uso no código ou só nos docs. */
export type FontePermissao = "migration" | "rota" | "codigo" | "docs";

export interface Permissao {
  codigo: string;
  /** A categoria em anew_permissions (a que o ecrã de Roles agrupa por menu). */
  categoria: string;
  nome: string;
  /** Só existe nos dados de exemplo; a base não guarda de onde veio a permissão. */
  fonte?: FontePermissao;
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
  /** Role eliminada (soft delete, `deleted_at` preenchido). Só aparece em "Ver eliminadas". */
  eliminada?: boolean;
  /** Organização dona da role; `null` nas roles de sistema. Vem da base. */
  organizacaoId?: string | null;
  /** Quem criou a role (id de negócio); serve ao âmbito OWNED/TEAM das ações. */
  criadoPor?: string | null;
}

/** O que o formulário de role grava. */
export interface DadosRole {
  nome: string;
  codigo: string;
  descricao: string;
  podeAssinar: boolean;
  permissoes: string[];
}

/** Resultado de uma gravação: nunca se engole um erro, devolve-se a mensagem a mostrar. */
export type ResultadoMutacao = { ok: true } | { ok: false; erro: string };

export interface Vinculo {
  organizacaoId: string;
  roleId: string;
  ativo: boolean;
  /** Âmbito por permissão com âmbito; o que não estiver aqui é "OWNED". */
  ambitos: Record<string, Ambito>;
  /** Só vem da base: id do membership (ausente num vínculo ainda por gravar). */
  membershipId?: string;
  /** Só vem da base: relationship_type do membership (reenviado tal como está ao gravar). */
  relationshipType?: string;
  /** Só vem da base: código da role (super_admin, org_admin, client...). */
  roleCodigo?: string;
  /** Só vem da base: o vínculo criou a organização (join_method created_org). */
  criador?: boolean;
}

export interface Utilizador {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** Convidado: criado com convite e ainda sem entrar. Só os utilizadores criados no formulário o têm. */
  convidado?: boolean;
  telefone?: string;
  morada?: string;
  /** Posição na PLATAFORMA (não é o cargo de RH). */
  posicao?: string;
  /** Último acesso (AAAA-MM-DD) ou `null` se nunca entrou. */
  ultimoAcesso: string | null;
  vinculos: Vinculo[];
  atividade: { data: string; texto: string }[];
  /** Só vem da base: id de autenticação (login), `null` se nunca teve login. */
  authUserId?: string | null;
  /** Só vem da base: entidade (telefones, moradas, NIF). */
  entityId?: string | null;
  /** Só vem da base: quem criou o utilizador (id de negócio); serve ao âmbito OWNED/TEAM. */
  criadoPor?: string | null;
}

/** Organização da PLATAFORMA (workorg) em que um utilizador tem vínculo e role; `pai` é o grupo a que pertence. */
export interface Organizacao {
  id: string;
  nome: string;
  pai?: string;
  /** Só vem da base: id da organização-pai (serve a saber que roles herda). */
  paiId?: string;
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

/** A parte da chave de tradução do título de cada modo do formulário. */
export const CHAVE_MODO = { criar: "create", editar: "edit", duplicar: "duplicate" } as const;

export type AbaFormUtilizador = "dados" | "vinculos" | "permissoes";

/** O formulário aberto: criar, editar ou duplicar uma role; convidar ou editar um utilizador. */
export type FormAberto =
  | { tipo: "role"; modo: "criar" | "editar" | "duplicar"; id?: string }
  | { tipo: "utilizador"; modo: "criar" | "editar"; id?: string; aba?: AbaFormUtilizador }
  | null;
