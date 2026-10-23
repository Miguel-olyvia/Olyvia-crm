// «Pedir documento à pessoa» (lado do RH): tipo (cartão de cidadão, comprovativo de IBAN, fotografia, outro), prazo e nota. O
// pedido aparece em «Pedidos do RH» no portal da pessoa, por enviar. Só memória.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { rhPedirDocumento } from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { TIPOS_PEDIDO_RH, chaveErroPortal, type TipoPedidoRh } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";

/** O prazo por omissão: uma semana. */
const DIAS_PRAZO = 7;

interface RhPedirDocumentoDialogProps {
  aberto: boolean;
  pessoaId: string;
  aoFechar: () => void;
}

export function RhPedirDocumentoDialog({ aberto, pessoaId, aoFechar }: RhPedirDocumentoDialogProps) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<TipoPedidoRh>("cartao_cidadao");
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState(diaIso(DIAS_PRAZO));
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTipo("cartao_cidadao");
    setTitulo("");
    setPrazo(diaIso(DIAS_PRAZO));
    setNota("");
    setErro(null);
  }, [aberto]);

  const pedir = () => {
    const r = rhPedirDocumento(pessoaId, { tipo, titulo, nota, prazo });
    if (r.ok) return aoFechar();
    setErro(t(chaveErroPortal(r.erro)));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.pedir.titulo")}</DialogTitle>
          <DialogDescription>{t("rhPortal.rh.pedir.sub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-tipo">{t("rhPortal.pedir.tipo")}</Label>
            <NativeSelect
              id="rh-portal-pedir-tipo" className="h-11" value={tipo} onValueChange={(v) => { setTipo(v as TipoPedidoRh); setErro(null); }}
              options={TIPOS_PEDIDO_RH.map((v) => ({ value: v, label: t(`rhPortal.tipoRh.${v}`) }))}
            />
          </div>
          {tipo === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-portal-pedir-titulo">{t("rhPortal.pedir.qualDocumento")}</Label>
              <Input id="rh-portal-pedir-titulo" className="h-11" value={titulo} onChange={(e) => { setTitulo(e.target.value); setErro(null); }} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-prazo">{t("rhPortal.rh.pedir.prazo")}</Label>
            <Input id="rh-portal-pedir-prazo" type="date" className="h-11" value={prazo} onChange={(e) => { setPrazo(e.target.value); setErro(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-pedir-nota">{t("rhPortal.pedir.nota")}</Label>
            <Textarea id="rh-portal-pedir-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhPortal.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={pedir}>{t("rhPortal.rh.pedir.confirmar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
