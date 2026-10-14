/** O estado do convite de admissão de uma pessoa de exemplo, lido da ficha em memória. */
import { useCallback } from "react";
import { useFichaRh } from "@/components/rh-exemplo/dados/loja";

export type EstadoConvite = "pendente" | "usado" | "expirado" | "substituido" | "bloqueado" | "desconhecido";

export interface RecusaConvite {
  codigo: string;
  em: string | null;
  campos: string[];
}

export interface ResumoConvite {
  conviteId: string | null;
  estado: EstadoConvite;
  emailDestino: string | null;
  criadoEm: string | null;
  validUntil: string | null;
  usadoEm: string | null;
  emailEnviado: boolean | null;
  emailErro: string | null;
  ultimaRecusa: RecusaConvite | null;
}

export interface ConflitoConvite {
  pessoaId: string;
  nome: string;
  campo: "nif" | "niss";
  estado: "activa" | "apagada";
}

export interface EstadoConviteResumo {
  carregando: boolean;
  recarregando: boolean;
  semAcesso: boolean;
  erro: boolean;
  resumo: ResumoConvite | null;
  conflitosIndisponiveis: boolean;
  conflitos: ConflitoConvite[];
  recarregar: () => void;
}

const SEM_CONFLITOS: ConflitoConvite[] = [];

export function useConviteAdmissaoResumo(pessoaId: string | null): EstadoConviteResumo {
  const ficha = useFichaRh(pessoaId);
  const recarregar = useCallback(() => undefined, []);
  return {
    carregando: false,
    recarregando: false,
    semAcesso: false,
    erro: false,
    resumo: ficha?.convite ?? null,
    conflitosIndisponiveis: false,
    conflitos: SEM_CONFLITOS,
    recarregar,
  };
}
