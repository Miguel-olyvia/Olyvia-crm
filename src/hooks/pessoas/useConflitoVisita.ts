import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Quanto se espera, depois da última alteração, antes de perguntar à base. */
export const ESPERA_CONFLITO_MS = 400;

export interface ConflitoVisita {
  /** Os recursos que já têm uma marcação ou uma ausência nesse horário. */
  emConflito: string[];
  /** Há uma pergunta à espera ou em curso. */
  aVerificar: boolean;
  /** Os recursos cuja pergunta falhou: o aviso falha aberto (não se sabe) e nunca se diz «disponível» deles. */
  falharam: string[];
}

const SEM_AVISO: ConflitoVisita = { emConflito: [], aVerificar: false, falharam: [] };

type Leitura = { recurso: string; conflito: boolean; falhou: boolean };

async function perguntar(recurso: string, inicio: string, fim: string, excluirId: string | null): Promise<Leitura> {
  try {
    const { data, error } = await supabase.rpc("check_schedule_conflict", {
      p_resource_id: recurso, p_start: inicio, p_end: fim, p_exclude_item_id: excluirId,
    });
    if (error) return { recurso, conflito: false, falhou: true };
    return { recurso, conflito: data === true, falhou: false };
  } catch {
    return { recurso, conflito: false, falhou: true };
  }
}

const horarioValido = (inicio: string | null, fim: string | null): inicio is string =>
  inicio !== null && fim !== null && Date.parse(inicio) < Date.parse(fim);

/**
 * Pré-aviso de conflito de horário: pergunta a `check_schedule_conflict` por cada recurso, 400 ms depois da última alteração. É só um
 * aviso de leitura; a recusa verdadeira (NG010) vem da base ao gravar. Falha aberto e nunca devolve «livre». `excluirId` é a própria
 * visita, ao alterar.
 */
export function useConflitoVisita(recursos: readonly string[], inicio: string | null, fim: string | null, excluirId: string | null = null): ConflitoVisita {
  const [estado, setEstado] = useState<{ chave: string; resultado: ConflitoVisita }>({ chave: "", resultado: SEM_AVISO });
  // Recursos repetidos ou vazios contam uma vez; a chave estável evita refazer a pergunta a cada render (a lista chega nova).
  const limpos = Array.from(new Set(recursos.filter((r) => r !== "")));
  const valido = limpos.length > 0 && horarioValido(inicio, fim);
  const chave = valido ? JSON.stringify([limpos, inicio, fim, excluirId]) : "";

  useEffect(() => {
    if (chave === "") return undefined;
    // A chave é o único valor que decide quando o efeito corre (os recursos chegam como lista nova a cada render); desfaz-se aqui para não
    // depender de `limpos`, `inicio` e `fim`, que mudariam de identidade sem a pergunta mudar.
    const [lista, de, ate, fora] = JSON.parse(chave) as [string[], string, string, string | null];
    let atual = true;
    const temporizador = setTimeout(() => {
      void Promise.all(lista.map((r) => perguntar(r, de, ate, fora))).then((leituras) => {
        if (!atual) return;
        setEstado({
          chave,
          resultado: { emConflito: leituras.filter((l) => l.conflito).map((l) => l.recurso), aVerificar: false, falharam: leituras.filter((l) => l.falhou).map((l) => l.recurso) },
        });
      });
    }, ESPERA_CONFLITO_MS);
    return () => {
      atual = false;
      clearTimeout(temporizador);
    };
  }, [chave]);

  if (chave === "") return SEM_AVISO;
  // Enquanto a pergunta nova não volta, não se mostra o resultado da anterior (era de outro horário ou de outros recursos).
  return estado.chave === chave ? estado.resultado : { emConflito: [], aVerificar: true, falharam: [] };
}
