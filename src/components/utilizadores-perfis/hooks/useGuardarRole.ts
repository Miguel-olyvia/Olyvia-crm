// Wrapper: criar, guardar, eliminar e restaurar roles. Cada ação devolve `ResultadoMutacao` (nunca lança) com a mensagem
// de erro real e, se correr bem, atualiza as listas de roles e de permissões.
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { mensagemDeErro } from "../rolesReais";
import type { DadosRole, ResultadoMutacao } from "../tipos";
import { criarRoleNaBase, eliminarRoleNaBase, guardarRoleNaBase, restaurarRoleNaBase } from "./rolesNaBase";

export interface AcoesRole {
  criar: (dados: DadosRole) => Promise<ResultadoMutacao>;
  guardar: (id: string, dados: DadosRole, sistema: boolean) => Promise<ResultadoMutacao>;
  /** `quantosUtilizadores`: a contagem real da role, ou `null` se não foi possível lê-la (então não elimina). */
  eliminar: (id: string, quantosUtilizadores: number | null) => Promise<ResultadoMutacao>;
  restaurar: (id: string) => Promise<ResultadoMutacao>;
  /** Há uma gravação em curso (para desativar os botões). */
  aGravar: boolean;
}

export function useGuardarRole(): AcoesRole {
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const [aGravar, setAGravar] = useState(false);

  const correr = useCallback(async (acao: () => Promise<unknown>): Promise<ResultadoMutacao> => {
    setAGravar(true);
    try {
      await acao();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["anew_roles"] }),
        queryClient.invalidateQueries({ queryKey: ["anew_role_permissions"] }),
        queryClient.invalidateQueries({ queryKey: ["perfis-contagem-por-role"] }),
      ]);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: mensagemDeErro(e) };
    } finally {
      setAGravar(false);
    }
  }, [queryClient]);

  return {
    aGravar,
    criar: (dados) => correr(() => {
      if (!activeCompany?.id) throw new Error("Escolha uma organização antes de criar a role.");
      return criarRoleNaBase(activeCompany.id, dados);
    }),
    guardar: (id, dados, sistema) => correr(() => guardarRoleNaBase(id, dados, sistema)),
    eliminar: (id, quantos) => correr(() => eliminarRoleNaBase(id, quantos)),
    restaurar: (id) => correr(() => restaurarRoleNaBase(id)),
  };
}
