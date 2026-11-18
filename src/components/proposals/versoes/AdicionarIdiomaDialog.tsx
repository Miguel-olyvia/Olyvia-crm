import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { obterIdioma } from "@/lib/idiomaDocumento";
import { useTranslation } from "@/hooks/useTranslation";
import { ID_DIALOGO_ADICIONAR_IDIOMA } from "./modeloVersoes";

interface AdicionarIdiomaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Os idiomas do registo que o template ainda não tem. */
  livres: string[];
  onConfirmar: (codigo: string, copiarPortugues: boolean) => void;
  /** Fechou sem adicionar (cancelar, Esc, X): devolver o foco a quem abriu o diálogo. */
  onCancelado?: () => void;
}

const LINHA = "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted";

export function AdicionarIdiomaDialog({ open, onOpenChange, livres, onConfirmar, onCancelado }: AdicionarIdiomaDialogProps) {
  const { t } = useTranslation();
  const [escolha, setEscolha] = useState<string | null>(null);
  const [copiar, setCopiar] = useState(true);
  const codigo = escolha !== null && livres.includes(escolha) ? escolha : livres[0];

  // Ao confirmar, quem chama põe o foco na aba nova; o Radix não deve devolvê-lo ao botão que abriu o diálogo.
  const confirmado = useRef(false);

  const confirmar = () => {
    if (!codigo) return;
    confirmado.current = true;
    onConfirmar(codigo, copiar);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id={ID_DIALOGO_ADICIONAR_IDIOMA}
        onCloseAutoFocus={(evento) => {
          // Sem DialogTrigger o Radix não sabe para onde devolver o foco: decidimos nós.
          evento.preventDefault();
          if (confirmado.current) confirmado.current = false;
          else onCancelado?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("proposalTemplateEditor.versions.dialog.title")}</DialogTitle>
          <DialogDescription>{t("proposalTemplateEditor.versions.dialog.description")}</DialogDescription>
        </DialogHeader>

        {codigo ? (
          <div className="space-y-4">
            <RadioGroup
              value={codigo}
              onValueChange={setEscolha}
              aria-label={t("proposalTemplateEditor.versions.dialog.language")}
              className="gap-1"
            >
              {livres.map((c) => (
                <Label key={c} htmlFor={`idioma-novo-${c}`} className={LINHA}>
                  <RadioGroupItem id={`idioma-novo-${c}`} value={c} />
                  {obterIdioma(c)?.nomeNativo ?? c}
                </Label>
              ))}
            </RadioGroup>

            <div className="space-y-1">
              <Label htmlFor="idioma-novo-copiar" className={LINHA}>
                <Checkbox id="idioma-novo-copiar" checked={copiar} onCheckedChange={(v) => setCopiar(v === true)} />
                {t("proposalTemplateEditor.versions.dialog.copy")}
              </Label>
              <p className="px-2 text-xs text-muted-foreground">{t("proposalTemplateEditor.versions.dialog.copyHint")}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("proposalTemplateEditor.versions.dialog.noneLeft")}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t("proposalTemplateEditor.versions.dialog.cancel")}
          </Button>
          <Button type="button" className="min-h-11" disabled={!codigo} onClick={confirmar}>
            {t("proposalTemplateEditor.versions.dialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
