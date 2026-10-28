// As roles e os utilizadores de "Utilizadores e perfis" EM MEMÓRIA: começam iguais aos dados de exemplo (que nunca se
// alteram) e os formulários acrescentam, editam e (des)ativam aqui. Perdem-se ao recarregar a página; nada vai à base.
// Mesmo padrão de `negocio-metas/negociosNovos.ts`: store de módulo lido com useSyncExternalStore e `repor()` para os testes.
import { useSyncExternalStore } from "react";
import { ROLES_EXEMPLO } from "./catalogoExemplo";
import { ehProtegido } from "./logica";
import type { DadosRole, Role, Utilizador, Vinculo } from "./tipos";
import { HOJE_EXEMPLO, UTILIZADORES_EXEMPLO } from "./utilizadoresExemplo";

export type EstadoUtilizador = "convidado" | "ativo" | "inativo";

export type { DadosRole };

export interface DadosUtilizador {
  nome: string;
  email: string;
  telefone: string;
  morada: string;
  posicao: string;
  estado: EstadoUtilizador;
  vinculos: Vinculo[];
}

interface Estado {
  roles: Role[];
  utilizadores: Utilizador[];
}

const INICIAL: Estado = { roles: ROLES_EXEMPLO, utilizadores: UTILIZADORES_EXEMPLO };
let estado: Estado = INICIAL;
let sequenciaRoles = 0;
let sequenciaUtilizadores = 0;
const ouvintes = new Set<() => void>();

const mudar = (seguinte: Estado): void => {
  estado = seguinte;
  ouvintes.forEach((ouvinte) => ouvinte());
};

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

export const rolesAtuais = (): Role[] => estado.roles;
export const utilizadoresAtuais = (): Utilizador[] => estado.utilizadores;

/** O estado de um utilizador tal como o formulário o escolhe. */
export const estadoDe = (u: Pick<Utilizador, "ativo" | "convidado">): EstadoUtilizador =>
  !u.ativo ? "inativo" : u.convidado ? "convidado" : "ativo";

/** Cria uma role personalizada (nunca de sistema) sem utilizadores. */
export function criarRole(dados: DadosRole): Role {
  sequenciaRoles += 1;
  const criada: Role = { id: `r-nova-${sequenciaRoles}`, sistema: false, ...dados, permissoes: [...dados.permissoes] };
  mudar({ ...estado, roles: [...estado.roles, criada] });
  return criada;
}

/** Guarda as alterações de uma role. Uma role de sistema não se altera (devolve `null`), como em Roles.tsx. */
export function guardarRole(id: string, dados: DadosRole): Role | null {
  const atual = estado.roles.find((r) => r.id === id);
  if (!atual || atual.sistema) return null;
  const nova: Role = { ...atual, ...dados, permissoes: [...dados.permissoes] };
  mudar({ ...estado, roles: estado.roles.map((r) => (r.id === id ? nova : r)) });
  return nova;
}

const atividade = (texto: string) => ({ data: HOJE_EXEMPLO, texto });

/** Cria o utilizador: Convidado (ainda sem entrar) ou Ativo, conforme a escolha; nunca guarda a palavra-passe. */
export function criarUtilizador(dados: DadosUtilizador): Utilizador {
  sequenciaUtilizadores += 1;
  const n = UTILIZADORES_EXEMPLO.length + sequenciaUtilizadores;
  const criado: Utilizador = {
    id: `u-${String(n).padStart(2, "0")}`,
    nome: dados.nome.trim(), email: dados.email.trim(), telefone: dados.telefone.trim(), morada: dados.morada.trim(),
    posicao: dados.posicao.trim(), ativo: dados.estado !== "inativo", convidado: dados.estado === "convidado",
    ultimoAcesso: null, vinculos: dados.vinculos,
    atividade: [atividade(dados.estado === "convidado" ? "Convite enviado, ainda não aceite" : "Criado nesta página (exemplo)")],
  };
  mudar({ ...estado, utilizadores: [...estado.utilizadores, criado] });
  return criado;
}

/** Guarda as alterações. Um super administrador está protegido e não se altera (devolve `null`). */
export function guardarUtilizador(id: string, dados: DadosUtilizador): Utilizador | null {
  const atual = estado.utilizadores.find((u) => u.id === id);
  if (!atual || ehProtegido(atual, estado.roles)) return null;
  const novo: Utilizador = {
    ...atual, nome: dados.nome.trim(), email: dados.email.trim(), telefone: dados.telefone.trim(), morada: dados.morada.trim(),
    posicao: dados.posicao.trim(), ativo: dados.estado !== "inativo", convidado: dados.estado === "convidado",
    vinculos: dados.vinculos, atividade: [atividade("Dados alterados (exemplo)"), ...atual.atividade],
  };
  mudar({ ...estado, utilizadores: estado.utilizadores.map((u) => (u.id === id ? novo : u)) });
  return novo;
}

/** Desativa ou reativa (também os vínculos). Um super administrador está protegido (devolve `null`). */
export function definirAtivo(id: string, ativo: boolean): Utilizador | null {
  const atual = estado.utilizadores.find((u) => u.id === id);
  if (!atual || ehProtegido(atual, estado.roles)) return null;
  const novo: Utilizador = {
    ...atual, ativo, convidado: false, vinculos: atual.vinculos.map((v) => ({ ...v, ativo })),
    atividade: [atividade(ativo ? "Reativado" : "Desativado"), ...atual.atividade],
  };
  mudar({ ...estado, utilizadores: estado.utilizadores.map((u) => (u.id === id ? novo : u)) });
  return novo;
}

/** Elimina uma role personalizada. Uma role de sistema, ou com utilizadores, não se elimina (devolve `null`). */
export function eliminarRole(id: string): Role | null {
  const atual = estado.roles.find((r) => r.id === id);
  const emUso = estado.utilizadores.some((u) => u.vinculos.some((v) => v.roleId === id));
  if (!atual || atual.sistema || emUso) return null;
  mudar({ ...estado, roles: estado.roles.filter((r) => r.id !== id) });
  return atual;
}

/** Pede a reposição da palavra-passe: fica registada na atividade do utilizador (não se envia nenhum email). Um super administrador está protegido (devolve `null`). */
export function pedirReposicaoPalavraPasse(id: string): Utilizador | null {
  const atual = estado.utilizadores.find((u) => u.id === id);
  if (!atual || ehProtegido(atual, estado.roles)) return null;
  const novo: Utilizador = { ...atual, atividade: [atividade("Reposição da palavra-passe pedida (exemplo, nenhum email enviado)"), ...atual.atividade] };
  mudar({ ...estado, utilizadores: estado.utilizadores.map((u) => (u.id === id ? novo : u)) });
  return novo;
}

/** Muda a role de um utilizador numa organização (a escolha da aba Vínculos da ficha). */
export function mudarRoleVinculo(id: string, organizacaoId: string, roleId: string): Utilizador | null {
  const atual = estado.utilizadores.find((u) => u.id === id);
  if (!atual || ehProtegido(atual, estado.roles)) return null;
  const novo: Utilizador = {
    ...atual, vinculos: atual.vinculos.map((v) => (v.organizacaoId === organizacaoId ? { ...v, roleId } : v)),
  };
  mudar({ ...estado, utilizadores: estado.utilizadores.map((u) => (u.id === id ? novo : u)) });
  return novo;
}

/** Esquece tudo e volta aos dados de exemplo (para os testes e para repor o exemplo). */
export function repor(): void {
  sequenciaRoles = 0;
  sequenciaUtilizadores = 0;
  mudar(INICIAL);
}

/** As roles atuais, atualizadas sempre que um formulário as muda. */
export const useRoles = (): Role[] => useSyncExternalStore(subscrever, rolesAtuais, rolesAtuais);
/** Os utilizadores atuais, atualizados sempre que um formulário ou uma ação os muda. */
export const useUtilizadores = (): Utilizador[] => useSyncExternalStore(subscrever, utilizadoresAtuais, utilizadoresAtuais);
