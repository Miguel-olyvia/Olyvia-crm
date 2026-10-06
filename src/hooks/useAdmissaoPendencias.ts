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
import { useCallback, useEffect, useRef, useState } from "react";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

export type OrigemPendencia = "pessoa" | "rh";

/**
 * Onde a pendencia se resolve:
 *  - `convite`: a pessoa tem de a preencher no convite (trava a submissao);
 *  - `ficha`: dado da pessoa que o RH completa na ficha (nao travou o convite,
 *    mas continua a travar as credenciais);
 *  - `rh`: campo do RH (data de admissao, cargo, tipo de contrato, ...).
 */
export type PosicaoPendencia = "convite" | "ficha" | "rh";

export interface Pendencia {
  codigo: string;
  origem: OrigemPendencia;
  posicao: PosicaoPendencia;
}

/** Uma linha da RPC -> `Pendencia`. Sem `posicao` (base antiga): rh -> `rh`, pessoa -> `convite`. */
export function pendenciaDaLinha(linha: {
  codigo: unknown;
  origem?: unknown;
  posicao?: unknown;
}): Pendencia {
  const origem: OrigemPendencia = linha.origem === "rh" ? "rh" : "pessoa";
  const posicao: PosicaoPendencia =
    linha.posicao === "convite" || linha.posicao === "ficha" || linha.posicao === "rh"
      ? linha.posicao
      : origem === "rh"
        ? "rh"
        : "convite";
  return { codigo: String(linha.codigo), origem, posicao };
}

export interface EstadoAdmissaoPendencias {
  /** Tudo o que falta, de todas as posicoes. */
  pendencias: Pendencia[];
  /** O que a pessoa tem de preencher no convite. */
  noConvite: Pendencia[];
  /** Dados da pessoa que o RH completa na ficha. */
  naFicha: Pendencia[];
  /** O que a PROPRIA PESSOA da (convite + ficha); mantido por compatibilidade. */
  daPessoa: Pendencia[];
  /** O que o RH tem de preencher na retaguarda. */
  doRh: Pendencia[];
  /** SO a primeira carga desta pessoa: nas recargas os dados anteriores mantem-se e `carregando` fica false. */
  carregando: boolean;
  /** Uma recarga em curso (depois de uma gravacao): os dados que se veem ainda sao os anteriores. */
  recarregando: boolean;
  /** A base recusou por permissao: nao se sabe o que falta, e nao se finge que nada falta. */
  semAcesso: boolean;
  /** Falha real (rede, timeout). Distinta de uma recusa legitima. */
  erro: boolean;
  recarregar: () => void;
}

export function useAdmissaoPendencias(pessoaId: string | null): EstadoAdmissaoPendencias {
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState(false);
  // So a resposta do pedido MAIS RECENTE conta: a ficha muda de pessoa sem
  // desmontar, e duas gravacoes seguidas disparam duas recargas; sem isto uma
  // resposta lenta da pessoa anterior pintava as pendencias da seguinte.
  const pedidoAtual = useRef(0);

  const carregar = useCallback(
    async (primeira: boolean) => {
      const pedido = ++pedidoAtual.current;
      if (!pessoaId) {
        setPendencias([]);
        setSemAcesso(false);
        setErro(false);
        setCarregando(false);
        setRecarregando(false);
        return;
      }
      if (primeira) {
        // Outra pessoa: nada do que estava na memoria lhe pertence.
        setPendencias([]);
        setCarregando(true);
      }
      setRecarregando(true);
      setSemAcesso(false);
      setErro(false);
      try {
        const { data, error } = await hrRpc("hr_admissao_pendencias", { p_pessoa_id: pessoaId });
        if (pedido !== pedidoAtual.current) return;
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
            .map((linha) => pendenciaDaLinha(linha)),
        );
      } catch (e) {
        if (pedido !== pedidoAtual.current) return;
        captureFlowError(e, "hr-admissao-pendencias");
        setErro(true);
        setPendencias([]);
      } finally {
        if (pedido === pedidoAtual.current) {
          setCarregando(false);
          setRecarregando(false);
        }
      }
    },
    [pessoaId],
  );

  useEffect(() => {
    void carregar(true);
    return () => {
      // Desmontar ou mudar de pessoa invalida o que ainda vem a caminho.
      pedidoAtual.current += 1;
    };
  }, [carregar]);

  // Estavel entre renders: quem a usa em dependencias de efeitos (a ficha
  // recarrega as pendencias quando uma gravacao termina) nao pode ver uma
  // funcao nova a cada render. Recarregar NAO limpa os dados nem poe `carregando`.
  const recarregar = useCallback(() => void carregar(false), [carregar]);

  return {
    pendencias,
    noConvite: pendencias.filter((p) => p.posicao === "convite"),
    naFicha: pendencias.filter((p) => p.posicao === "ficha"),
    daPessoa: pendencias.filter((p) => p.posicao === "convite" || p.posicao === "ficha"),
    doRh: pendencias.filter((p) => p.posicao === "rh"),
    carregando,
    recarregando,
    semAcesso,
    erro,
    recarregar,
  };
}
