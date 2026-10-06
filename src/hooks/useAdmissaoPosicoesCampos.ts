/**
 * A configuracao da admissao da organizacao activa, lida por quem CRIA ou
 * EDITA pessoas -- o formulario interno precisa de saber que campos da pessoa
 * estao na posicao `convite` (obrigatorios aqui quando o RH os preenche) e
 * quais ficam como pendencia na ficha.
 *
 * Chama `rpc_hr_admissao_posicoes_campos`, com gate `hr.pessoas.create` OU
 * `hr.pessoas.edit` -- e nao a RPC de quem GERE a configuracao
 * (`rpc_hr_admissao_campos_obrigatorios_org`, gate
 * `hr.admissao.obrigatorios.gerir`): ler a configuracao para preencher um
 * formulario nao pode exigir a permissao de a alterar.
 *
 * `campos = null` quer dizer "nao se sabe a configuracao": ou ainda esta a
 * carregar (`carregando`), ou quem pede nao pode ler (42501, `semAcesso`), ou
 * a leitura FALHOU (`erro`, rede ou base). O formulario NAO pode tratar o
 * `null` como "sem configuracao": em modo "RH, agora" isso deixava passar uma
 * ficha sem os campos que a organizacao pos no convite, sem dizer nada. Por
 * isso os tres estados saem separados -- quem usa o hook bloqueia a criacao
 * ou avisa enquanto `campos === null` e nao e `semAcesso`. Nunca vai para o
 * Sentry uma recusa por permissao, que e a resposta correcta.
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { ConfiguracaoCampo } from "@/lib/hr/admissaoObrigatorios";

interface LinhaPosicoes {
  codigo?: unknown;
  origem?: unknown;
  condicional?: unknown;
  posicao?: unknown;
  configuravel?: unknown;
}

function comoConfiguracao(linha: LinhaPosicoes): ConfiguracaoCampo | null {
  if (typeof linha.codigo !== "string" || linha.codigo === "") return null;
  const origem = linha.origem === "rh" ? "rh" : "pessoa";
  const posicao =
    origem === "rh"
      ? "rh"
      : linha.posicao === "ficha" || linha.posicao === "opcional"
        ? linha.posicao
        : "convite";
  return {
    codigo: linha.codigo,
    origem,
    condicional: linha.condicional === true,
    posicao,
    configuravel: linha.configuravel === true,
  };
}

export interface EstadoAdmissaoPosicoes {
  /** `null` ate chegar, ou quando nao se pode ler: nao se inventa configuracao. */
  campos: ConfiguracaoCampo[] | null;
  carregando: boolean;
  /** A leitura falhou (rede ou base): `campos` e `null` e NAO e "sem configuracao". */
  erro: boolean;
  /** A base recusou por permissao: `campos` e `null` e nao ha nada a esperar. */
  semAcesso: boolean;
}

/** Marca a recusa por permissao, que nao e erro nem vai para o Sentry. */
const SEM_ACESSO = "sem_acesso" as const;

export function useAdmissaoPosicoesCampos(enabled = true): EstadoAdmissaoPosicoes {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hr-admissao-posicoes-campos", orgId],
    enabled: enabled && !!orgId,
    // A configuracao muda raramente; reler a cada abertura do formulario so
    // gastava uma chamada. O ecra de configuracao invalida esta chave ao gravar.
    staleTime: 60_000,
    queryFn: async (): Promise<ConfiguracaoCampo[] | typeof SEM_ACESSO> => {
      const { data: linhas, error } = await hrRpc("rpc_hr_admissao_posicoes_campos", {
        p_organization_id: orgId,
      });
      if (error) {
        if (isPermissionError(error)) return SEM_ACESSO;
        captureFlowError(error, "hr-admissao-posicoes-campos");
        throw error;
      }
      if (!Array.isArray(linhas)) {
        const invalida = new Error("hr-admissao-posicoes-campos: resposta invalida");
        captureFlowError(invalida, "hr-admissao-posicoes-campos");
        throw invalida;
      }
      return linhas
        .map((linha: LinhaPosicoes) => comoConfiguracao(linha))
        .filter((campo): campo is ConfiguracaoCampo => campo !== null);
    },
  });

  const semAcesso = data === SEM_ACESSO;
  return {
    campos: Array.isArray(data) ? data : null,
    carregando: isLoading,
    erro: isError,
    semAcesso,
  };
}
