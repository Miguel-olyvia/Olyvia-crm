/**
 * As escritas da conta da pessoa na ficha: a conta bancaria (IBAN e BIC) e a
 * ligacao a uma conta de CRM. Extraidas de `usePessoa` (que passava as 800
 * linhas); o `guardar` da ficha entra por argumento porque e ele que trata do
 * estado de gravacao, do recarregamento e do registo de erros.
 *
 * Cada funcao devolve `null` em sucesso ou a mensagem de erro, tal como
 * `guardar`: quem chama decide o que mostrar.
 */
import { useCallback } from "react";
import { hrRpc } from "@/lib/hr/hrDb";
import type { FormatoConta } from "@/types/hr";

export type GuardarFicha = (
  executar: (autorId: string | null) => Promise<{ error: unknown }>,
) => Promise<string | null>;

export interface DefinirContaArgs {
  formato: FormatoConta;
  conta: string;
  titular?: string | null;
  banco?: string | null;
  agencia?: string | null;
  swift?: string | null;
}

export function usePessoaConta(pessoaId: string | undefined, guardar: GuardarFicha) {
  /**
   * A conta bancaria, em qualquer dos seis formatos.
   *
   * `rpc_hr_definir_conta` substituiu `rpc_hr_definir_iban` e a antiga foi
   * largada na mesma migration (20261120220000): duas funcoes com o mesmo
   * proposito e assinaturas diferentes deixam o PostgREST sem saber qual
   * escolher -- ja parou um botao neste projecto.
   */
  const definirConta = useCallback(
    (args: DefinirContaArgs) =>
      guardar(async () =>
        hrRpc("rpc_hr_definir_conta", {
          p_pessoa_id: pessoaId,
          p_formato: args.formato,
          p_conta: args.conta,
          p_titular: args.titular ?? null,
          p_banco: args.banco ?? null,
          p_agencia: args.agencia ?? null,
          p_swift: args.swift ?? null,
        }),
      ),
    [guardar, pessoaId],
  );

  /** So o BIC, sem repor o IBAN: `rpc_hr_definir_bic` (gate bancarios.edit). */
  const definirBic = useCallback(
    (bic: string | null) =>
      guardar(async () => hrRpc("rpc_hr_definir_bic", { p_pessoa_id: pessoaId, p_bic: bic })),
    [guardar, pessoaId],
  );

  const ligarConta = useCallback(
    (anewUserId: string) =>
      guardar(async () =>
        hrRpc("rpc_hr_ligar_conta", { p_pessoa_id: pessoaId, p_anew_user_id: anewUserId }),
      ),
    [guardar, pessoaId],
  );

  const revogarConta = useCallback(
    (motivo: string | null) =>
      guardar(async () =>
        hrRpc("rpc_hr_revogar_conta", { p_pessoa_id: pessoaId, p_motivo: motivo }),
      ),
    [guardar, pessoaId],
  );

  return { definirConta, definirBic, ligarConta, revogarConta };
}
