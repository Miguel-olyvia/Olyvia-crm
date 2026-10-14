/**
 * O convite de admissão visto por quem o recebe (página pública), em memória. Só o token `exemplo` abre um convite
 * válido; qualquer outro mostra o cartão de ligação inválida. O rascunho guarda-se enquanto a página estiver aberta
 * e a submissão não envia nada para lado nenhum: devolve sucesso e a página mostra o ecrã final.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { motivoDoCodigo, type CorpoErroEdge, type MotivoConvite } from "@/components/rh-exemplo/lib/errosAdmissao";
import type { AnexoConvite } from "@/components/rh-exemplo/lib/conviteAnexos";

export const TOKEN_CONVITE_EXEMPLO = "exemplo";

export interface ConviteEstado {
  pessoa_nome: string | null;
  email_pessoal: string | null;
  nif: string | null;
  niss_ultimos4: string | null;
  conta_ultimos4: string | null;
  formato_conta: string | null;
  rascunho: Record<string, unknown> | null;
  valid_until: string;
  campos_obrigatorios: { codigo: string; condicional: boolean }[] | null;
  anexos?: AnexoConvite[];
}

export interface DadosSubmissaoConvite {
  [campo: string]: unknown;
}

export type ResultadoSubmissao =
  | { ok: true; avisos: string[]; corpoErro?: undefined }
  | { ok: false; corpoErro: CorpoErroEdge; avisos: string[] };

export function useConviteAdmissaoPublico(token: string | undefined) {
  const campos = useGestao((g) => g.admissaoCampos);
  const [submetendo, setSubmetendo] = useState(false);
  const rascunhoGuardado = useRef<Record<string, unknown> | null>(null);

  const valido = token === TOKEN_CONVITE_EXEMPLO;

  const estado = useMemo<ConviteEstado | null>(() => {
    if (!valido) return null;
    return {
      pessoa_nome: "Beatriz Lopes",
      email_pessoal: "beatriz.lopes@exemplo.pt",
      nif: null,
      niss_ultimos4: null,
      conta_ultimos4: null,
      formato_conta: null,
      rascunho: null,
      valid_until: `${diaIso(7)}T23:59:59Z`,
      campos_obrigatorios: campos
        .filter((c) => c.origem === "pessoa" && c.posicao === "convite")
        .map((c) => ({ codigo: c.codigo, condicional: c.condicional })),
      anexos: [],
    };
  }, [valido, campos]);

  const gravarRascunho = useCallback(async (rascunho: Record<string, unknown>): Promise<void> => {
    rascunhoGuardado.current = rascunho;
  }, []);

  const gravarRascunhoAoFechar = useCallback((rascunho: Record<string, unknown>): void => {
    rascunhoGuardado.current = rascunho;
  }, []);

  const submeter = useCallback(
    async (_dados: DadosSubmissaoConvite, _assinaturaNome: string): Promise<ResultadoSubmissao> => {
      setSubmetendo(true);
      await Promise.resolve();
      setSubmetendo(false);
      return { ok: true, avisos: [] };
    },
    [],
  );

  const erroInicial = valido ? null : "convite_invalido";
  const motivo: MotivoConvite | null = erroInicial ? motivoDoCodigo(erroInicial) : null;

  return {
    estado,
    loading: false,
    erroInicial,
    motivo,
    submetendo,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  };
}
