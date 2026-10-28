// O envio da proposta e do contrato de um negócio para o portal do cliente, pelo MESMO caminho das páginas de Propostas e de Contratos:
// useClientPortalAccess → create-client-portal-access, com o id REAL da linha de proposals / client_contracts (a ligação é negocio_id).
// Sem essa linha (a proposta/contrato da Emylia ainda só existe no estado do negócio) não há nada para enviar e diz-se; nunca se envia com um id inventado.
// «Enviada» só aparece quando o portal já tem o documento visível (client_portal_documents), isto é, depois do sucesso; o erro da função aparece
// no aviso do próprio useClientPortalAccess (destrutivo, visível).
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientPortalAccess } from "@/hooks/useClientPortalAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { faltaAFuncao, lerTemplates, lerTemplatesDoNegocio } from "./useTemplatesDoNegocio";

export type DocumentoParaPortal = "proposal" | "contract";

export interface DocumentoReal { id: string; status: string | null }
export type EstadoPortalDocumento = "sem-documento" | "por-enviar" | "enviado";

interface Linhas { data: unknown; error: { message: string } | null }
interface Q { select: (c: string) => Q; eq: (c: string, v: unknown) => Q; order: (c: string, o: { ascending: boolean }) => Q; limit: (n: number) => Q; then: PromiseLike<Linhas>["then"] }
const de = (t: string): Q => (supabase as unknown as { from: (n: string) => Q }).from(t);

export function useEnviarParaPortalNegocio(negocioId: string | null, tipo: DocumentoParaPortal) {
  const qc = useQueryClient();
  const { hasPermission, isSystemAdmin } = usePermissions();
  const tabela = tipo === "proposal" ? "proposals" : "client_contracts";
  const chave = ["pessoas-portal-documento", negocioId, tipo];
  const consulta = useQuery({
    queryKey: chave,
    enabled: negocioId !== null,
    queryFn: async (): Promise<{ doc: DocumentoReal | null; noPortal: boolean }> => {
      // O MESMO documento que a base usa para o template: os ids de proposta e contrato vêm de neg_ler_templates_negocio. Só se a função ainda
      // não existe na base (rascunho por aplicar) se cai na consulta antiga, a mais recente por data.
      const lido = await lerTemplatesDoNegocio(negocioId!);
      const idDaBase = lido.error ? undefined : lerTemplates(lido.data)[tipo === "proposal" ? "proposta_id" : "contrato_id"];
      if (lido.error && !faltaAFuncao(lido.error)) throw new Error(lido.error.message ?? "Não foi possível ler o documento do negócio.");
      const a = idDaBase !== undefined
        ? (idDaBase ? await de(tabela).select("id, status").eq("id", idDaBase).limit(1) : { data: [], error: null })
        : await de(tabela).select("id, status").eq("negocio_id", negocioId).order("created_at", { ascending: false }).limit(1);
      if (a.error) throw new Error(a.error.message);
      const doc = ((a.data ?? []) as DocumentoReal[])[0] ?? null;
      if (!doc) return { doc: null, noPortal: false };
      const b = await de("client_portal_documents").select("id").eq("document_id", doc.id).eq("document_type", tipo).eq("is_visible", true).limit(1);
      if (b.error) throw new Error(b.error.message);
      return { doc, noPortal: ((b.data ?? []) as unknown[]).length > 0 };
    },
  });
  const { generatePortalAccess, loading } = useClientPortalAccess({ onSuccess: () => { void qc.invalidateQueries({ queryKey: chave }); } });
  // as mesmas permissões das páginas: o contrato pede «enviar para assinatura»; a proposta não tem permissão própria, vale a de editar a ficha (feita por quem chama)
  const podePermissao = tipo === "contract" ? isSystemAdmin || hasPermission("client_contracts.send_signature") : true;
  const enviar = useCallback((novaPassword = false) => {
    const id = consulta.data?.doc?.id;
    if (!id) return;
    void generatePortalAccess(tipo, id, novaPassword);
  }, [consulta.data?.doc?.id, generatePortalAccess, tipo]);
  const estado: EstadoPortalDocumento = !consulta.data?.doc ? "sem-documento" : consulta.data.noPortal ? "enviado" : "por-enviar";
  return {
    estado, aLer: consulta.isLoading, erro: consulta.error instanceof Error ? consulta.error.message : null, reler: () => { void consulta.refetch(); },
    aEnviar: loading, podePermissao, enviar,
  };
}
