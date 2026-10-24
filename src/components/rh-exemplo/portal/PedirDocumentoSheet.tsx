// O painel lateral «Pedir documento», no portal: a pessoa escolhe o tipo (declaração de vínculo, comprovativo de rendimentos,
// cópia do contrato, outro), escreve uma nota e diz a urgência. O pedido fica em «Os meus pedidos» e o RH vê-o na ficha.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { pedirDocumentoPeloLink } from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import {
  TIPOS_PEDIDO_PESSOA, chaveErroPortal, type TipoPedidoPessoa, type Urgencia,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";

interface PedirDocumentoSheetProps {
  aberto: boolean;
  token: string | undefined;
  aoFechar: () => void;
}

const URGENCIAS: readonly Urgencia[] = ["normal", "urgente"];

export function PedirDocumentoSheet({ aberto, token, aoFechar }: PedirDocumentoSheetProps) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<TipoPedidoPessoa>("declaracao_vinculo");
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("");
  const [urgencia, setUrgencia] = useState<Urgencia>("normal");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setTipo("declaracao_vinculo");
    setTitulo("");
    setNota("");
    setUrgencia("normal");
    setErro(null);
  }, [aberto]);

  const enviar = () => {
    const r = pedirDocumentoPeloLink(token, { tipo, titulo, nota, urgencia });
    if (r.ok) return aoFechar();
    setErro(t(chaveErroPortal(r.erro)));
  };

  return (
    <Sheet open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("rhPortal.pedir.titulo")}</SheetTitle>
          <SheetDescription>{t("rhPortal.pedir.sub")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-pedir-tipo">{t("rhPortal.pedir.tipo")}</Label>
            <NativeSelect
              id="portal-pedir-tipo" className="h-11" value={tipo} onValueChange={(v) => { setTipo(v as TipoPedidoPessoa); setErro(null); }}
              options={TIPOS_PEDIDO_PESSOA.map((v) => ({ value: v, label: t(`rhPortal.tipoPessoa.${v}`) }))}
            />
          </div>
          {tipo === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="portal-pedir-titulo">{t("rhPortal.pedir.qualDocumento")}</Label>
              <Input id="portal-pedir-titulo" className="h-11" value={titulo} onChange={(e) => { setTitulo(e.target.value); setErro(null); }} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="portal-pedir-nota">{t("rhPortal.pedir.nota")}</Label>
            <Textarea id="portal-pedir-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t("rhPortal.pedir.urgencia")}</legend>
            {URGENCIAS.map((u) => (
              <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="portal-pedir-urgencia" className="h-5 w-5" checked={urgencia === u} onChange={() => setUrgencia(u)} />
                {t(`rhPortal.urgencia.${u}`)}
              </label>
            ))}
          </fieldset>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <SheetFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhPortal.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={enviar}>{t("rhPortal.pedir.enviar")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
