// «Enviar documento à pessoa» (lado do RH): escolhe um modelo de documento (ou um ficheiro) e se precisa de assinatura. O
// documento aparece logo em «Recebidos» no portal da pessoa. O contrato NÃO se envia por aqui: continua a gerar-se no fluxo
// de admissão. Só memória.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { rhEnviarDocumento } from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import { useModelosDocumentosRH } from "@/components/rh-exemplo/hooks/useModelosDocumentosRH";
import { chaveErroPortal } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { SeletorFicheiros } from "./SeletorFicheiros";

const OUTRO_FICHEIRO = "__ficheiro";

interface RhEnviarDocumentoDialogProps {
  aberto: boolean;
  pessoaId: string;
  aoFechar: () => void;
}

export function RhEnviarDocumentoDialog({ aberto, pessoaId, aoFechar }: RhEnviarDocumentoDialogProps) {
  const { t } = useTranslation();
  const { modelos } = useModelosDocumentosRH();
  const disponiveis = modelos.filter((m) => m.activo !== false && m.tipo !== "contrato");
  const [escolha, setEscolha] = useState(OUTRO_FICHEIRO);
  const [ficheiros, setFicheiros] = useState<string[]>([]);
  const [assinatura, setAssinatura] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setEscolha(disponiveis[0]?.id ?? OUTRO_FICHEIRO);
    setFicheiros([]);
    setAssinatura(false);
    setErro(null);
    // Só ao abrir: a lista de modelos não muda enquanto o diálogo está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const modelo = disponiveis.find((m) => m.id === escolha);
  const enviar = () => {
    const titulo = modelo ? modelo.nome : (ficheiros[0] ?? "").replace(/\.[a-z0-9]{2,4}$/i, "");
    if (!modelo && ficheiros.length === 0) return setErro(t("rhPortal.erro.sem_ficheiro"));
    const r = rhEnviarDocumento(pessoaId, { titulo, nomeFicheiro: modelo ? `${modelo.nome}.pdf` : ficheiros[0], precisaAssinatura: assinatura });
    if (r.ok) return aoFechar();
    setErro(t(chaveErroPortal(r.erro)));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortal.rh.enviar.titulo")}</DialogTitle>
          <DialogDescription>{t("rhPortal.rh.enviar.sub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rh-portal-enviar-doc">{t("rhPortal.rh.enviar.documento")}</Label>
            <NativeSelect
              id="rh-portal-enviar-doc" className="h-11" value={escolha} onValueChange={(v) => { setEscolha(v); setErro(null); }}
              options={[
                ...disponiveis.map((m) => ({ value: m.id, label: m.nome })),
                { value: OUTRO_FICHEIRO, label: t("rhPortal.rh.enviar.outroFicheiro") },
              ]}
            />
          </div>
          {!modelo && <SeletorFicheiros nomes={ficheiros} max={1} aoMudar={(n) => { setFicheiros(n); setErro(null); }} />}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={assinatura} onChange={(e) => setAssinatura(e.target.checked)} />
            {t("rhPortal.rh.enviar.precisaAssinatura")}
          </label>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhPortal.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={enviar}>{t("rhPortal.rh.enviar.confirmar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
