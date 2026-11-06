// Quem pode enviar uma PROPOSTA ao portal do cliente (enviar, republicar, reenviar credenciais) — a mesma regra do servidor
// (create-client-portal-access e republish_proposal_snapshot, 04/11/2026): portal.manage OU negocios.proposta.enviar na organização ativa.
// negocios.proposta.enviar lê-se por fn_cat_pode(org, código), a MESMA função com que o servidor decide (perfil na organização, Papel no
// Negócio de neg_papeis_permissoes, admin do sistema); portal.manage pelo perfil (hasPermission). Antes a proposta pedia client_contracts.edit
// (uma permissão de contratos) no servidor e nada no ecrã. Enquanto se lê, `pode` é false e `aLer` é true; uma leitura que falha vale «não».
// Sem react-query de propósito: a página de Propostas não tem QueryClient nos testes e não precisa de cache para uma pergunta só.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";

export const PERMISSAO_ENVIAR_PROPOSTA = "negocios.proposta.enviar";
export const PERMISSAO_GERIR_PORTAL = "portal.manage";
export const SEM_PERMISSAO_PROPOSTA_PORTAL = "Sem permissão para enviar a proposta ao portal (requer negocios.proposta.enviar ou portal.manage).";
// 06/11/2026: os documentos que se põem/tiram do portal do cliente (documents.visible_to_client) seguem a regra da proposta.
export const SEM_PERMISSAO_DOCUMENTO_PORTAL = "Sem permissão para pôr ou tirar documentos do portal do cliente (requer negocios.proposta.enviar ou portal.manage).";

/** `ativo` false (por exemplo, o mesmo ecrã a tratar de um contrato): não se pergunta nada à base e devolve «não». */
export function usePodeEnviarPropostaPortal(ativo = true): { pode: boolean; aLer: boolean } {
  const { activeCompany } = useCompany();
  const { hasPermission, loading: aLerPerfil } = usePermissions();
  const org = activeCompany?.id ?? null;
  const gereOPortal = hasPermission(PERMISSAO_GERIR_PORTAL);
  const perguntar = ativo && org !== null && !gereOPortal;
  // a resposta guarda a organização a que respondeu: a de outra organização (troca de empresa a meio) não conta
  const [lida, setLida] = useState<{ org: string; pode: boolean } | null>(null);
  useEffect(() => {
    if (!perguntar || !org) return;
    let cancelado = false;
    void (async () => {
      let pode = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("fn_cat_pode", { p_org: org, p_perm: PERMISSAO_ENVIAR_PROPOSTA });
        pode = !error && data === true;
      } catch {
        pode = false;
      }
      if (!cancelado) setLida({ org, pode });
    })();
    return () => { cancelado = true; };
  }, [perguntar, org]);
  if (!ativo) return { pode: false, aLer: false };
  if (gereOPortal) return { pode: true, aLer: false };
  if (!org) return { pode: false, aLer: aLerPerfil };
  const daOrg = lida && lida.org === org ? lida : null;
  return { pode: daOrg?.pode === true, aLer: aLerPerfil || daOrg === null };
}

// 04/11/2026 (/negocios, «Acesso ao portal»): o mesmo para o CONTRATO, com a regra do servidor (create-client-portal-access):
// portal.manage OU client_contracts.send_signature no perfil da organização ativa (hasPermission; o System Admin tem todas as
// permissões explícitas na base). A proposta segue usePodeEnviarPropostaPortal.
export const PERMISSAO_ENVIAR_CONTRATO = "client_contracts.send_signature";
export const SEM_PERMISSAO_CONTRATO_PORTAL = "Sem permissão para enviar o contrato ao portal (requer client_contracts.send_signature ou portal.manage).";
export type DocumentoPortal = "proposal" | "contract";

/** Quem pode mandar ao portal (criar/reenviar o acesso) o documento `tipo`, com o motivo quando não pode. */
export function usePodeEnviarAoPortal(tipo: DocumentoPortal, ativo = true): { pode: boolean; aLer: boolean; motivo: string } {
  const { hasPermission, loading } = usePermissions();
  const proposta = usePodeEnviarPropostaPortal(ativo && tipo === "proposal");
  const motivo = tipo === "contract" ? SEM_PERMISSAO_CONTRATO_PORTAL : SEM_PERMISSAO_PROPOSTA_PORTAL;
  if (!ativo) return { pode: false, aLer: false, motivo };
  if (tipo === "proposal") return { ...proposta, motivo };
  const pode = hasPermission(PERMISSAO_GERIR_PORTAL) || hasPermission(PERMISSAO_ENVIAR_CONTRATO);
  return { pode, aLer: !pode && loading, motivo };
}
