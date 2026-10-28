// Wrapper: as ações de escrita sobre utilizadores para a página. Cada uma corre a escrita real (escritasUtilizador.ts),
// recarrega a lista quando correu bem e devolve o erro já em texto para o ecrã (o «email já registado» vem traduzido).
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { ValoresGravar } from "../payloadsUtilizador";
import type { ResultadoMutacao, Utilizador, Vinculo } from "../tipos";
import {
  atualizarUtilizadorNaBase, criarUtilizadorNaBase, desativarUtilizadorNaBase, ERRO_EMAIL_EXISTENTE, mudarRoleNaBase, reativarUtilizadorNaBase,
} from "./escritasUtilizador";
import { useRecarregarUtilizadores } from "./useUtilizadoresReais";

export interface AcoesUtilizador {
  criar: (valores: ValoresGravar, vinculos: Vinculo[]) => Promise<ResultadoMutacao>;
  atualizar: (u: Utilizador, valores: ValoresGravar, vinculos: Vinculo[], ambitosEditaveis: boolean) => Promise<ResultadoMutacao>;
  mudarRole: (u: Utilizador, membershipId: string, roleId: string, ambitosEditaveis: boolean) => Promise<ResultadoMutacao>;
  desativar: (u: Utilizador) => Promise<ResultadoMutacao>;
  reativar: (u: Utilizador) => Promise<ResultadoMutacao>;
}

export function useAcoesUtilizador(): AcoesUtilizador {
  const { t } = useTranslation();
  const recarregar = useRecarregarUtilizadores();
  return useMemo(() => {
    const concluir = async (pedido: Promise<ResultadoMutacao>): Promise<ResultadoMutacao> => {
      const r = await pedido;
      // Recarrega sempre: uma escrita em vários passos pode ter falhado a meio com a base já alterada.
      try { await recarregar(); } catch { /* a lista mostra o seu próprio erro; não esconde o resultado da escrita */ }
      if (!r.ok) return { ok: false, erro: r.erro === ERRO_EMAIL_EXISTENTE ? t("users.errors.emailAlreadyRegistered") : r.erro };
      return r;
    };
    return {
      criar: (valores, vinculos) => concluir(criarUtilizadorNaBase(valores, vinculos)),
      atualizar: (utilizador, valores, vinculos, ambitosEditaveis) => concluir(atualizarUtilizadorNaBase({ utilizador, valores, vinculos, ambitosEditaveis })),
      mudarRole: (u, membershipId, roleId, ambitosEditaveis) => concluir(mudarRoleNaBase(u, membershipId, roleId, ambitosEditaveis)),
      desativar: (u) => concluir(desativarUtilizadorNaBase(u)),
      reativar: (u) => concluir(reativarUtilizadorNaBase(u)),
    };
  }, [recarregar, t]);
}
