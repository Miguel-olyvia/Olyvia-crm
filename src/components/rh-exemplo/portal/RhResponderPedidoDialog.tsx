// «Responder a um pedido da pessoa» (lado do RH), caso se envie o documento pedido: escolhe o ficheiro e o pedido fica
// «Disponível»; o documento aparece em «Recebidos» no portal da pessoa. Para recusar usa-se o diálogo de motivo.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rhResponderPedidoDaPessoa } from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import { chaveErroPortal } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { SeletorFicheiros } from "./SeletorFicheiros";

interface RhResponderPedidoDialogProps {
  aberto: boolean;
  pessoaId: string;
  pedidoId: string;
  /** O título do documento pedido (também o do documento que a pessoa recebe). */
  titulo: string;
  aoFechar: () => void;
}

export function RhResponderPedidoDialog({ aberto, pessoaId, pedidoId, titulo, aoFechar }: RhResponderPedidoDialogProps) {
  const { t } = useTranslation();
  const [ficheiros, setFicheiros] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setFicheiros([]);
    setErro(null);
  }, [aberto]);

  const enviar = () => {
    const r = rhResponderPedidoDaPessoa(pessoaId, pedidoId, ficheiros[0] ?? "", titulo);
    if (r.ok) return aoFechar();
    setErro(t(chaveErroPortal(r.erro)));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.responder.titulo", { titulo })}</DialogTitle>
          <DialogDescription>{t("rhPortal.rh.responder.sub")}</DialogDescription>
        </DialogHeader>
        <SeletorFicheiros nomes={ficheiros} max={1} aoMudar={(n) => { setFicheiros(n); setErro(null); }} />
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhPortal.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={enviar}>{t("rhPortal.rh.responder.confirmar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
