// SÓ PARA TESTES da página "Utilizadores e perfis": um `useUtilizadoresPerfis` simulado. Por omissão está pronto e sem
// utilizadores; cada teste muda o que precisa. Usa-se assim, no topo do ficheiro de teste:
//   vi.mock("@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis", async () => (await import("./utilizadoresPerfisFalso")).moduloFalso());
import { vi } from "vitest";
import type { UtilizadoresPerfisDados } from "@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis";

export const dadosFalsos = {
  atual: null as unknown as UtilizadoresPerfisDados,
  idAberto: null as string | null,
};

export function criarDadosFalsos(extra: Partial<UtilizadoresPerfisDados> = {}): UtilizadoresPerfisDados {
  return {
    todos: [], utilizadores: [], clientes: [], organizacoes: [], rolesDosVinculos: [],
    carregando: false, semOrganizacao: false, erro: null, recarregar: vi.fn(),
    autorizacoes: {
      podeCriar: true, podeGerirRoles: true, podeEditar: () => true, podeDesativar: () => true, podeVerHistorico: () => true,
    },
    acoes: {
      criar: vi.fn(async () => ({ ok: true as const })), atualizar: vi.fn(async () => ({ ok: true as const })),
      mudarRole: vi.fn(async () => ({ ok: true as const })), desativar: vi.fn(async () => ({ ok: true as const })),
      reativar: vi.fn(async () => ({ ok: true as const })),
    },
    aberto: null, atividade: { estado: "ok", entradas: [] },
    ...extra,
  };
}

/** `useRolesPerfis` simulado, vazio e pronto (para os testes que só querem ver separadores e permissões). */
export function moduloRolesFalso() {
  const vazio = {
    roles: [], lista: [], estado: { carregando: false, erro: null, semOrganizacao: false }, recarregar: vi.fn(),
    verEliminadas: false, mudarVerEliminadas: vi.fn(),
    catalogo: { catalogo: [], editor: { administradorSistema: false, codigos: [] }, visiveis: [], carregando: false, erro: null },
    modelos: { modelos: [], erro: null }, contagem: { contagem: {}, disponivel: false }, permissoesPorRole: {},
    autorizacoes: { podeCriar: true, podeEditar: () => true, podeEliminar: () => true, podeRestaurar: true },
    acoes: { criar: vi.fn(), guardar: vi.fn(), eliminar: vi.fn(), restaurar: vi.fn() },
  };
  return { useRolesPerfis: () => vazio };
}

/** O módulo simulado: devolve `dadosFalsos.atual`, com o utilizador aberto resolvido pelo id que a página pede. */
export function moduloFalso() {
  dadosFalsos.atual = criarDadosFalsos();
  return {
    useUtilizadoresPerfis: (abertoId: string | null): UtilizadoresPerfisDados => {
      const d = dadosFalsos.atual;
      return { ...d, aberto: abertoId ? d.todos.find((u) => u.id === abertoId) ?? null : null };
    },
  };
}
