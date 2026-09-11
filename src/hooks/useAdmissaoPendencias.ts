/**
 * O que ainda falta a uma ficha para a admissao ficar completa.
 *
 * Chama `hr_admissao_pendencias(uuid)`, que ate 20261129020000 era so
 * `service_role` e existia unicamente para servir de portao a submissao do
 * convite. Passou a ser chamavel por quem tem sessao, com gate: cada codigo
 * exige a permissao da TABELA DE ORIGEM (ver `hr_admissao_campo_permissao`).
 *
 * A funcao devolve SO CODIGOS -- nunca valores. E isso que permite mostrar
 * "falta o NISS" a quem pode ver a identificacao sem nunca revelar o NISS a
 * ninguem.
 *
 * Quem nao pode ver a ficha de todo recebe `insufficient_privilege` (42501) e
 * NAO uma lista vazia: uma lista vazia le-se como "esta tudo preenchido", que
 * e a mentira mais facil de dizer sem querer. Por isso `semAcesso` e um estado
 * proprio, distinto de `pendencias.length === 0`.
 */
import { useCallback, useEffect, useState } from "react";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export type OrigemPendencia = "pessoa" | "rh";

export interface Pendencia {
  codigo: string;
  origem: OrigemPendencia;
}

export interface EstadoAdmissaoPendencias {
  /** Tudo o que falta, de ambas as origens. */
  pendencias: Pendencia[];
  /** O que a PROPRIA PESSOA tem de dar (e o que o convite de admissao pede). */
  daPessoa: Pendencia[];
  /** O que os RH tem de preencher na retaguarda (hoje so a data de admissao). */
  doRh: Pendencia[];
  carregando: boolean;
  /** A base recusou por permissao: nao se sabe o que falta, e nao se finge que nada falta. */
  semAcesso: boolean;
  /** Falha real (rede, timeout). Distinta de uma recusa legitima. */
  erro: boolean;
  recarregar: () => void;
}

export function useAdmissaoPendencias(pessoaId: string | null): EstadoAdmissaoPendencias {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    if (!pessoaId) {
      setPendencias([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setSemAcesso(false);
    setErro(false);
    try {
      const { data, error } = await hrRpc("hr_admissao_pendencias", { p_pessoa_id: pessoaId });
      if (error) {
        if (isPermissionError(error)) {
          setSemAcesso(true);
        } else {
          captureFlowError(error, "hr-admissao-pendencias");
          setErro(true);
        }
        setPendencias([]);
        return;
      }
      const linhas = Array.isArray(data) ? data : [];
      setPendencias(
        linhas
          .filter((linha) => linha && typeof linha.codigo === "string")
          .map((linha) => ({
            codigo: String(linha.codigo),
            origem: linha.origem === "rh" ? "rh" : "pessoa",
          })),
      );
    } catch (e) {
      captureFlowError(e, "hr-admissao-pendencias");
      setErro(true);
      setPendencias([]);
    } finally {
      setCarregando(false);
    }
  }, [pessoaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return {
    pendencias,
    daPessoa: pendencias.filter((p) => p.origem === "pessoa"),
    doRh: pendencias.filter((p) => p.origem === "rh"),
    carregando,
    semAcesso,
    erro,
    recarregar: () => void carregar(),
  };
}
