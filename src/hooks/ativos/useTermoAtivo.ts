/**
 * O termo de ENTREGA ou de DEVOLUÇÃO de um equipamento (um ativo atribuído a uma pessoa no RH), só por
 * `rpc_ativos_termo_emitir(p_organization_id, p_pessoa_equipamento_id, p_momento, p_modelo_id)`. Cria o documento do RH a partir de um
 * modelo do tipo recibo, já «a aguardar assinatura», e devolve `{documento_id, pessoa_id, titulo, estado}`. NÃO ENVIA NADA ao
 * colaborador (sem SMS nem email): o envio faz-se à parte, no RH, com o documento já criado. Quem pode emitir
 * (`hr.pessoas.documentos.emitir`), o momento e o modelo (ATV36, ATV37) decidem-se na base. Devolve um RESULTADO (nunca lança), com a
 * mensagem já traduzida; só um defeito vai para o registo de erros.
 */
import { useCallback, useRef, useState } from "react";
import { ativosIndisponivel, ativosRecusado, chaveDoErro, codigoAtv } from "@/components/ativos/lib/errosAtivo";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";

export type MomentoTermo = "entrega" | "devolucao";

export interface TermoEmitido {
  documentoId: string;
  pessoaId: string | null;
  titulo: string | null;
  estado: string | null;
}

export type ResultadoTermo = { ok: true; termo: TermoEmitido } | { ok: false; mensagem: string };

export interface TermoAtivoHook {
  /** Emite o termo da linha `pessoaEquipamentoId` (a entrega do ativo a uma pessoa). */
  emitir: (pessoaEquipamentoId: string, momento: MomentoTermo, modeloId: string) => Promise<ResultadoTermo>;
  aEmitir: boolean;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

const falha = (chave: string): ResultadoTermo => ({ ok: false, mensagem: getLocalizedFallback(chave) });

export function useTermoAtivo(): TermoAtivoHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const [aEmitir, setAEmitir] = useState(false);
  // Um segundo clique antes de a base responder não emite um segundo documento.
  const ocupado = useRef(false);

  const emitir = useCallback(
    async (pessoaEquipamentoId: string, momento: MomentoTermo, modeloId: string): Promise<ResultadoTermo> => {
      if (!organizationId) return falha("ativos.erro.semOrganizacao");
      if (ocupado.current) return falha("ativos.erro.generico");
      ocupado.current = true;
      setAEmitir(true);
      try {
        const { data, error } = await hrRpc("rpc_ativos_termo_emitir", {
          p_organization_id: organizationId,
          p_pessoa_equipamento_id: pessoaEquipamentoId,
          p_momento: momento,
          p_modelo_id: modeloId,
        });
        if (error) {
          // Regras (ATV36, ATV37), recusas e RPC por aplicar não são defeitos: só o resto vai para o registo.
          if (!codigoAtv(error) && !ativosRecusado(error) && !ativosIndisponivel(error)) captureFlowError(error, "ativos-escrever");
          if (!codigoAtv(error) && ativosRecusado(error)) return falha("ativos.termo.erro.semPermissao");
          return falha(chaveDoErro(error));
        }
        const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const documentoId = texto(r.documento_id);
        if (!documentoId) {
          captureFlowError(new Error("rpc_ativos_termo_emitir respondeu sem documento_id"), "ativos-escrever");
          return falha("ativos.erro.generico");
        }
        return { ok: true, termo: { documentoId, pessoaId: texto(r.pessoa_id), titulo: texto(r.titulo), estado: texto(r.estado) } };
      } catch (e) {
        captureFlowError(e, "ativos-escrever");
        return falha("ativos.erro.generico");
      } finally {
        ocupado.current = false;
        setAEmitir(false);
      }
    },
    [organizationId],
  );

  return { emitir, aEmitir };
}
