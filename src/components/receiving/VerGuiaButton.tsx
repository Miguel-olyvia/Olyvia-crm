// "Ver guia": abre num separador novo o ficheiro que o fornecedor anexou no portal (bucket 'documents', URL assinado
// de 5 min — createSignedUrl). Sem ficheiro não aparece (quem chama decide o texto "sem ficheiro"). O separador abre-se
// já no clique (senão o bloqueador de pop-ups recusa depois do await) e fecha-se se o URL falhar; o erro fica à vista.
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signedNoteFileUrl, type PortalNoteFile } from "./deliveryNotes";

export function VerGuiaButton({ file, className }: { file: PortalNoteFile | null | undefined; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!file) return null;

  const abrir = async () => {
    if (busy) return;
    setErro(null);
    setBusy(true);
    const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const r = await signedNoteFileUrl(file.path);
      if (!r.url) {
        w?.close();
        setErro(r.error ?? "Não foi possível abrir o ficheiro da guia.");
        return;
      }
      if (w) {
        w.opener = null;
        w.location.href = r.url;
      } else {
        setErro("O navegador bloqueou o separador novo — permita pop-ups para ver a guia.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <Button type="button" variant="link" className="h-auto p-0" disabled={busy} title={file.name} onClick={() => void abrir()}>
        <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />
        {busy ? "A abrir…" : "Ver guia"}
        <span className="sr-only"> (abre {file.name} num separador novo)</span>
      </Button>
      {erro ? (
        <span role="alert" className="text-xs text-destructive">
          {erro}
        </span>
      ) : null}
    </span>
  );
}
