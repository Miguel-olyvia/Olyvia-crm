// «Enviar para o portal do cliente» na proposta e no contrato do Negócio da Emylia: o mesmo envio das páginas de Propostas e de Contratos
// (useClientPortalAccess), com o id real da proposta/contrato do negócio. Sem proposta/contrato real diz-se; «Enviada» só depois de o portal ter o documento.
import { Send } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useEnviarParaPortalNegocio, type DocumentoParaPortal } from "@/hooks/pessoas/useEnviarParaPortalNegocio";
import { cn } from "@/lib/utils";

interface EnviarParaPortalProps {
  negocioId: string | null;
  tipo: DocumentoParaPortal;
  /** `pessoas.edit` neste negócio. */
  podeEditar: boolean;
}

const NOME: Record<DocumentoParaPortal, string> = { proposal: "proposta", contract: "contrato" };

export function EnviarParaPortal({ negocioId, tipo, podeEditar }: EnviarParaPortalProps) {
  const p = useEnviarParaPortalNegocio(negocioId, tipo);
  const nome = NOME[tipo];
  const pode = podeEditar && p.podePermissao;
  return (
    <section aria-label={`Portal do cliente: ${nome}`} className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold">Portal do cliente</p>
      {p.aLer && <p role="status" className="text-[15px] text-muted-foreground">A ver se já existe {nome === "proposta" ? "a proposta" : "o contrato"} deste negócio…</p>}
      {p.erro && (
        <div role="alert" className="space-y-2 text-[15px]">
          <p className="text-destructive">Não foi possível ler o estado do envio: {p.erro}</p>
          <button type="button" onClick={p.reler} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>Tentar outra vez</button>
        </div>
      )}
      {!p.aLer && !p.erro && p.estado === "sem-documento" && (
        <p role="status" className="text-[15px] text-muted-foreground">
          Ainda não há {nome === "proposta" ? "uma proposta" : "um contrato"} deste negócio na base de documentos, por isso não há nada para enviar ao portal.
        </p>
      )}
      {!p.aLer && !p.erro && p.estado === "enviado" && <p role="status" className="text-[15px] font-medium text-foreground">Enviado ao portal do cliente.</p>}
      {!p.aLer && !p.erro && p.estado !== "sem-documento" && (
        <>
          <button
            type="button" disabled={!pode || p.aEnviar} onClick={() => p.enviar(false)}
            className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-4 text-[15px] font-medium hover:bg-muted disabled:opacity-50", FOCO)}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {p.aEnviar ? "A enviar…" : p.estado === "enviado" ? "Reenviar para o portal" : "Enviar para o portal do cliente"}
          </button>
          {!pode && <p className="text-sm text-muted-foreground">Não tens permissão para enviar {nome === "proposta" ? "a proposta" : "o contrato"} ao portal.</p>}
        </>
      )}
    </section>
  );
}
