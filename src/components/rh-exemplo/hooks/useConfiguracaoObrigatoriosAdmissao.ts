/** A configuração dos campos da admissão (onde cada campo se pede: convite, ficha ou opcional), em memória. */
import { useCallback } from "react";
import { definirGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type { ConfiguracaoCampo, PosicaoCampoPessoa } from "@/components/rh-exemplo/lib/admissaoObrigatorios";

export type { ConfiguracaoCampo, PosicaoCampoPessoa };

interface LinhaConfiguracao {
  codigo: string;
  origem: "pessoa" | "rh";
  condicional?: boolean;
  posicao?: string | null;
  obrigatorio?: boolean;
  configuravel?: boolean;
}

const POSICOES_VALIDAS: readonly string[] = ["convite", "ficha", "opcional", "rh"];

/** Uma linha da configuração como o servidor a devolve -> o que o ecrã usa. */
export function normalizarLinhaConfiguracao(linha: LinhaConfiguracao): ConfiguracaoCampo {
  const origem = linha.origem === "rh" ? "rh" : "pessoa";
  let posicao: ConfiguracaoCampo["posicao"];
  if (origem === "rh") {
    posicao = "rh";
  } else if (linha.posicao && POSICOES_VALIDAS.includes(linha.posicao)) {
    posicao = linha.posicao as ConfiguracaoCampo["posicao"];
  } else {
    posicao = linha.obrigatorio === false ? "opcional" : "convite";
  }
  return {
    codigo: linha.codigo,
    origem,
    condicional: linha.condicional === true,
    posicao,
    configuravel: linha.configuravel ?? origem === "pessoa",
  };
}

export function useConfiguracaoObrigatoriosAdmissao() {
  const campos = useGestao((g) => g.admissaoCampos);

  const definirPosicao = useCallback(async (codigo: string, posicao: PosicaoCampoPessoa): Promise<void> => {
    definirGestao((g) => ({
      ...g,
      admissaoCampos: g.admissaoCampos.map((c) => (c.codigo === codigo && c.configuravel ? { ...c, posicao } : c)),
    }));
  }, []);

  return {
    campos,
    isLoading: false,
    isSaving: false,
    definirPosicao,
    erro: null as string | null,
    erroOriginal: null as unknown,
  };
}
