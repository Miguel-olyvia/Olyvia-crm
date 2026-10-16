/**
 * A lista do pipeline de admissoes do RH: `rpc_hr_admissao_listar` (V3a).
 *
 * Assinatura da base (desenho H2): `(p_organization_id uuid, p_estados text[], p_limite int, p_apos_criado_em
 * timestamptz, p_apos_id uuid) -> jsonb {itens[], contadores{estado:n}, seguinte}`. Exige `hr.pessoas.convite.enviar` ou
 * `hr.onboarding.approve` e uma work organization; nao tem limite por hora. Pagina por cursor (`created_at desc, id`).
 *
 * A organizacao e SEMPRE a ativa no ecra. Mudar de organizacao, de filtro ou recarregar recomeca a lista e descarta o que
 * ainda vem a caminho: nunca se mostram processos de outra organizacao. Para quem nao tem `hr.onboarding.restrito`, um
 * processo cancelado ou rejeitado chega como `terminado`, sem datas: o hook nao o altera.
 *
 * Os erros saem em CODIGO (o ecra traduz; nunca o texto da base) e so um defeito vai para o Sentry, como `Error`
 * sintetico sem corpo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import { codigoDeErroRpc, paginaDaRpc, type CursorPipeline, type ItemPipeline } from "@/lib/hr/admissaoPipeline";
import { captureFlowError } from "@/lib/observability/captureFlowError";

/** Quantos processos pede cada pagina. O teto da base e 100. */
export const LIMITE_PIPELINE = 50;

const FLUXO = "hr-admissao-pipeline";

export interface ErroPipeline {
  /** O codigo que o ecra traduz; `null` e um defeito (rede, timeout...). */
  codigo: string | null;
}

interface Opcoes {
  /** Os estados a pedir; `null` ou vazio = todos. */
  estados: readonly string[] | null;
}

export interface EstadoPipeline {
  itens: ItemPipeline[];
  contadores: Record<string, number>;
  /** So a primeira pagina (ou depois de mudar de organizacao ou de filtro). */
  carregando: boolean;
  aCarregarMais: boolean;
  temMais: boolean;
  erro: ErroPipeline | null;
  carregarMais: () => Promise<void>;
  recarregar: () => void;
}

/** Um defeito vai para o Sentry sem o corpo da base: so o SQLSTATE (5 caracteres) quando o ha. */
function registarDefeito(erro: unknown): void {
  const code = erro && typeof erro === "object" ? (erro as { code?: unknown }).code : undefined;
  const estado = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : "falha_de_rede";
  captureFlowError(new Error(`${FLUXO}: ${estado}`), FLUXO);
}

export function useAdmissoesPipeline({ estados }: Opcoes): EstadoPipeline {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;

  // Uma lista nova com o mesmo conteudo nao e um filtro novo: compara-se pelo conteudo.
  const chaveEstados = estados && estados.length > 0 ? estados.join(",") : "";
  const estadosPedidos = useMemo(() => (chaveEstados ? chaveEstados.split(",") : null), [chaveEstados]);

  const [itens, setItens] = useState<ItemPipeline[]>([]);
  const [contadores, setContadores] = useState<Record<string, number>>({});
  const [seguinte, setSeguinte] = useState<CursorPipeline | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aCarregarMais, setACarregarMais] = useState(false);
  const [erro, setErro] = useState<ErroPipeline | null>(null);

  // So a resposta do pedido MAIS RECENTE conta; o cursor vive numa ref para `carregarMais` nunca ler um valor velho.
  const pedidoAtual = useRef(0);
  const cursor = useRef<CursorPipeline | null>(null);

  const pedir = useCallback(
    (apos: CursorPipeline | null) =>
      hrRpc("rpc_hr_admissao_listar", {
        p_organization_id: organizationId,
        p_estados: estadosPedidos,
        p_limite: LIMITE_PIPELINE,
        p_apos_criado_em: apos?.criadoEm ?? null,
        p_apos_id: apos?.id ?? null,
      }),
    [organizationId, estadosPedidos],
  );

  const carregar = useCallback(async () => {
    const pedido = ++pedidoAtual.current;
    cursor.current = null;
    setItens([]);
    setSeguinte(null);
    setErro(null);
    setACarregarMais(false);
    if (!organizationId) {
      setContadores({});
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const { data, error } = await pedir(null);
      if (pedido !== pedidoAtual.current) return;
      if (error) {
        const codigo = codigoDeErroRpc(error);
        if (codigo === null) registarDefeito(error);
        setErro({ codigo });
        return;
      }
      const pagina = paginaDaRpc(data);
      cursor.current = pagina.seguinte;
      setItens(pagina.itens);
      setContadores(pagina.contadores);
      setSeguinte(pagina.seguinte);
    } catch (e) {
      if (pedido !== pedidoAtual.current) return;
      registarDefeito(e);
      setErro({ codigo: null });
    } finally {
      if (pedido === pedidoAtual.current) setCarregando(false);
    }
  }, [organizationId, pedir]);

  useEffect(() => {
    void carregar();
    return () => {
      // Desmontar, mudar de organizacao ou de filtro invalida o que ainda vem a caminho.
      pedidoAtual.current += 1;
    };
  }, [carregar]);

  const carregarMais = useCallback(async () => {
    const apos = cursor.current;
    if (!organizationId || !apos) return;
    const pedido = ++pedidoAtual.current;
    setACarregarMais(true);
    setErro(null);
    try {
      const { data, error } = await pedir(apos);
      if (pedido !== pedidoAtual.current) return;
      if (error) {
        const codigo = codigoDeErroRpc(error);
        if (codigo === null) registarDefeito(error);
        setErro({ codigo });
        return;
      }
      const pagina = paginaDaRpc(data);
      cursor.current = pagina.seguinte;
      setItens((atuais) => {
        const vistos = new Set(atuais.map((i) => i.conviteId));
        return [...atuais, ...pagina.itens.filter((i) => !vistos.has(i.conviteId))];
      });
      setContadores(pagina.contadores);
      setSeguinte(pagina.seguinte);
    } catch (e) {
      if (pedido !== pedidoAtual.current) return;
      registarDefeito(e);
      setErro({ codigo: null });
    } finally {
      if (pedido === pedidoAtual.current) setACarregarMais(false);
    }
  }, [organizationId, pedir]);

  const recarregar = useCallback(() => void carregar(), [carregar]);

  return { itens, contadores, carregando, aCarregarMais, temMais: seguinte !== null, erro, carregarMais, recarregar };
}
