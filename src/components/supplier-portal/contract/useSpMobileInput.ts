import { useCallback, useEffect, useState } from "react";
import { isSpFunctionMissing } from "@/lib/supplierPortal/spRpc";
import {
  TELEMOVEL_INVALIDO,
  describeSpContractError,
  normalizarTelemovel,
  spContractsRpc,
  telemovelParaEditar,
} from "@/lib/supplierContracts/portal";
import { useInvalidateSpContracts, useSpMyPhone } from "./useSpContracts";

/**
 * Estado do campo "O seu telemóvel" (sp_get_my_phone / sp_set_my_phone):
 * pré-preenche com o número gravado e grava só se mudou. Sem validação por
 * SMS aqui (o SMS da assinatura é que prova o número).
 * `available=false` quando a BD ainda não tem as funções: o campo não aparece
 * e nada bloqueia.
 */
export function useSpMobileInput({ enabled = true, required = true }: { enabled?: boolean; required?: boolean } = {}) {
  const query = useSpMyPhone(enabled);
  const invalidate = useInvalidateSpContracts();
  const [value, setValueState] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = query.data?.phone ?? null;

  useEffect(() => {
    if (!touched && saved) setValueState(telemovelParaEditar(saved));
  }, [saved, touched]);

  const setValue = useCallback((v: string) => {
    setTouched(true);
    setValueState(v);
    setError(null);
  }, []);

  const available = !(query.isError && isSpFunctionMissing(query.error));

  /** true = pode seguir (gravado, sem mudanças ou não aplicável). */
  const save = useCallback(async (): Promise<boolean> => {
    if (!available) return true;
    const trimmed = value.trim();
    if (!trimmed) {
      if (!required) return true;
      setError("Indique o seu telemóvel.");
      return false;
    }
    const normalized = normalizarTelemovel(trimmed);
    if (!normalized) {
      setError(TELEMOVEL_INVALIDO);
      return false;
    }
    if (normalized === saved) return true;
    try {
      await spContractsRpc.setMyPhone(normalized);
      void invalidate();
      return true;
    } catch (err) {
      setError(describeSpContractError(err));
      return false;
    }
  }, [available, value, required, saved, invalidate]);

  return { value, setValue, error, save, available, loading: query.isLoading, saved };
}
