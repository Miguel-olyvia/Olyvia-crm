/**
 * A revisao do RH de um processo de admissao (V3a, so leitura).
 *
 * Duas leituras, de propositos diferentes:
 *  1. `rpc_hr_admissao_rever_ler(p_organization_id, p_convite_id)`: so campos NAO sensiveis, atras de
 *     `hr.onboarding.approve` (num processo cancelado ou rejeitado, tambem `hr.onboarding.restrito`). Corre ao abrir.
 *  2. `rpc_hr_admissao_rever_sensivel(p_organization_id, p_convite_id, p_campo)`: o valor do NISS ou do IBAN, atras de
 *     `hr.onboarding.sensitive`. Cada leitura fica registada na base (120 por hora por pessoa). So corre quando
 *     `revelar` e chamado, ou seja, quando o RH o pede.
 *
 * O valor sensivel NUNCA fica neste hook: `revelar` entrega-o a quem o pediu e esquece-o. Quem o mostra tem de o apagar ao
 * fechar a janela. Nunca vai para logs, toast, armazenamento do browser nem URL, e o Sentry so recebe um `Error` sintetico
 * sem corpo. Os erros saem em CODIGO (o ecra traduz); nunca o texto da base nem `error.details`.
 *
 * A organizacao e SEMPRE a ativa no ecra; mudar de processo ou de organizacao descarta o que ainda vem a caminho.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import { codigoDeErroRpc } from "@/lib/hr/admissaoPipeline";
import {
  eCampoSensivel,
  revisaoDaRpc,
  type CampoSensivel,
  type ResultadoRevelar,
  type RevisaoAdmissao,
} from "@/lib/hr/admissaoRevisao";
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";

const FLUXO_LER: BusinessFlow = "hr-admissao-revisao";
const FLUXO_SENSIVEL: BusinessFlow = "hr-admissao-revisao-sensivel";

export interface ErroRevisao {
  /** O codigo que o ecra traduz; `null` e um defeito (rede, timeout...). */
  codigo: string | null;
}

export interface EstadoRevisao {
  carregando: boolean;
  erro: ErroRevisao | null;
  /** `null` ate chegar (ou depois de fechar). */
  revisao: RevisaoAdmissao | null;
  revelar: (campo: CampoSensivel) => Promise<ResultadoRevelar>;
  recarregar: () => void;
}

/** Um defeito vai para o Sentry sem o corpo da base: so o SQLSTATE (5 caracteres) quando o ha. */
function registarDefeito(erro: unknown, fluxo: BusinessFlow): void {
  const code = erro && typeof erro === "object" ? (erro as { code?: unknown }).code : undefined;
  const estado = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : "falha_de_rede";
  captureFlowError(new Error(`${fluxo}: ${estado}`), fluxo);
}

export function useRevisaoAdmissao(conviteId: string | null): EstadoRevisao {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const [carregando, setCarregando] = useState(conviteId !== null);
  const [erro, setErro] = useState<ErroRevisao | null>(null);
  const [revisao, setRevisao] = useState<RevisaoAdmissao | null>(null);
  // So a resposta do pedido MAIS RECENTE conta (a janela muda de processo sem desmontar).
  const pedidoAtual = useRef(0);

  const carregar = useCallback(async () => {
    const pedido = ++pedidoAtual.current;
    setRevisao(null);
    setErro(null);
    if (!conviteId || !organizationId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const { data, error } = await hrRpc("rpc_hr_admissao_rever_ler", {
        p_organization_id: organizationId,
        p_convite_id: conviteId,
      });
      if (pedido !== pedidoAtual.current) return;
      if (error) {
        const codigo = codigoDeErroRpc(error);
        if (codigo === null) registarDefeito(error, FLUXO_LER);
        setErro({ codigo });
        return;
      }
      setRevisao(revisaoDaRpc(data));
    } catch (e) {
      if (pedido !== pedidoAtual.current) return;
      registarDefeito(e, FLUXO_LER);
      setErro({ codigo: null });
    } finally {
      if (pedido === pedidoAtual.current) setCarregando(false);
    }
  }, [conviteId, organizationId]);

  useEffect(() => {
    void carregar();
    return () => {
      pedidoAtual.current += 1;
    };
  }, [carregar]);

  const revelar = useCallback(
    async (campo: CampoSensivel): Promise<ResultadoRevelar> => {
      // So niss e iban se pedem: qualquer outra coisa nem chega a base.
      if (!eCampoSensivel(campo) || !conviteId || !organizationId) return { ok: false, codigo: "pedido_invalido" };
      try {
        const { data, error } = await hrRpc("rpc_hr_admissao_rever_sensivel", {
          p_organization_id: organizationId,
          p_convite_id: conviteId,
          p_campo: campo,
        });
        if (error) {
          const codigo = codigoDeErroRpc(error);
          if (codigo === null) registarDefeito(error, FLUXO_SENSIVEL);
          return { ok: false, codigo };
        }
        const entregue = data && typeof data === "object" ? (data as { valor?: unknown }).valor : undefined;
        if (typeof entregue === "string" && entregue !== "") return { ok: true, valor: entregue };
        // Uma resposta sem valor e um defeito: nunca um «ok» vazio.
        captureFlowError(new Error(`${FLUXO_SENSIVEL}: resposta_sem_valor`), FLUXO_SENSIVEL);
        return { ok: false, codigo: null };
      } catch (e) {
        registarDefeito(e, FLUXO_SENSIVEL);
        return { ok: false, codigo: null };
      }
    },
    [conviteId, organizationId],
  );

  const recarregar = useCallback(() => void carregar(), [carregar]);

  return { carregando, erro, revisao, revelar, recarregar };
}
