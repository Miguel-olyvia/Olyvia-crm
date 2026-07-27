import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

// Friendly mapping for backend error codes returned by create-client-portal-access
const PORTAL_ERROR_MESSAGES: Record<string, string> = {
  portal_email_is_crm_user:
    "Este email pertence a um utilizador da plataforma. Use outro email para o acesso ao portal.",
  portal_email_used_by_other_entity:
    "Este email já está associado a outro cliente nesta organização. Use outro email para manter os acessos separados.",
};

interface UseClientPortalAccessOptions {
  onSuccess?: () => void;
}


export function useClientPortalAccess(options?: UseClientPortalAccessOptions) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { activeCompany } = useCompany();

  const generatePortalAccess = async (
    documentType: "proposal" | "contract",
    documentId: string,
    forceNewPassword?: boolean
  ) => {
    if (!activeCompany) {
      toast({ title: "Erro", description: "Nenhuma organização ativa.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const loginUrl = `${window.location.origin}/auth`;

      const { data, error } = await supabase.functions.invoke("create-client-portal-access", {
        body: {
          document_type: documentType,
          document_id: documentId,
          organization_id: activeCompany.id,
          login_url: loginUrl,
          force_new_password: forceNewPassword || false,
        },
      });

      if (error) {
        // supabase.functions.invoke devolve um FunctionsHttpError genérico em status não-2xx.
        // A mensagem real do backend está no body da resposta (error.context).
        let backendMessage: string | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            backendMessage = body?.error || body?.message;
          } else if (ctx && typeof ctx.text === "function") {
            const text = await ctx.text();
            try {
              const parsed = JSON.parse(text);
              backendMessage = parsed?.error || parsed?.message || text;
            } catch {
              backendMessage = text;
            }
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(backendMessage || error.message || "Erro ao gerar acesso");
      }
      if (data?.error) throw new Error(data.error);

      // M10: copy ONLY the login URL — never put credentials in the clipboard
      try {
        await navigator.clipboard.writeText(loginUrl);
      } catch {
        // clipboard may fail in some contexts
      }

      const docLabel = documentType === "contract" ? "Contrato" : "Proposta";

      // BASE-USR-012: backend suppresses temp_password when SMTP succeeds.
      // Cases after the security fix:
      //   A) temp_password + smtp_warning=true  -> SMTP failed; show credentials for manual delivery
      //   B) smtp_warning=true, no temp_password -> SMTP failed; prompt out-of-band
      //   C) no temp_password, no smtp_warning   -> normal success
      if (data.temp_password && data.smtp_warning) {
        // Case A: SMTP failure with credentials available
        sonnerToast.warning(`Falha no envio de email — entrega manual necessária`, {
          description: `Email: ${data.email}
Password: ${data.temp_password}

O email não foi enviado (erro SMTP). Entregue as credenciais ao cliente por um canal seguro (ex: telefone ou mensagem cifrada).

Apenas o link de login foi copiado para a área de transferência.`,
          duration: 15000,
        });
      } else if (data.smtp_warning) {
        // Case B: SMTP failure without credentials in response
        sonnerToast.warning(`Falha no envio de email`, {
          description: `O email não foi enviado (erro SMTP). Contacte o cliente (${data.email ?? "email desconhecido"}) por outro canal para lhe fornecer as credenciais de acesso ao portal.`,
          duration: 12000,
        });
      } else {
        // Case C: normal success
        sonnerToast.success(
          data.is_new_account ? `Conta criada e ${docLabel.toLowerCase()} enviado para o portal` : `${docLabel} enviado para o Portal Cliente`,
          {
            description: data.message || `O cliente foi notificado por email com o link de acesso ao portal.`,
            duration: 6000,
          }
        );
      }
      options?.onSuccess?.();
    } catch (err: any) {
      const rawCode = (err?.message || "").trim();
      const friendly = PORTAL_ERROR_MESSAGES[rawCode] || err?.message || "Erro ao gerar acesso ao portal.";
      toast({
        title: "Erro",
        description: friendly,
        variant: "destructive",
      });
    } finally {

      setLoading(false);
    }
  };

  return { generatePortalAccess, loading };
}
