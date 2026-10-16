/**
 * "Prolongar o acesso": um modal simples para somar dias a validade do link da
 * admissao. 3, 7, 14 ou 30 dias, ou outro valor inteiro entre 1 e 90.
 *
 * O que decide se se pode (estado da admissao, tecto de 90 dias acumulados a
 * partir de hoje) e a base: a recusa volta em portugues claro, DENTRO do modal,
 * que fica aberto. O link e o estado mantem-se; so a validade muda.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAcoesConviteAdmissao } from "@/hooks/useAcoesConviteAdmissao";
import { useDevolverFoco } from "@/components/hr/useDevolverFoco";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import { toast } from "@/lib/toast";

interface ProlongarConviteDialogProps {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  conviteId: string;
  /** A validade actual do link (ISO), quando se sabe. */
  validUntil: string | null;
  /** Chamado quando a base aceitou: quem chama rele o estado. */
  onConcluido: () => void;
}

const OPCOES_DIAS = [3, 7, 14, 30] as const;
const DIAS_POR_OMISSAO = 7;
const DIAS_MIN = 1;
const DIAS_MAX = 90;
type Escolha = (typeof OPCOES_DIAS)[number] | "outro";

const CLASSE_RADIO =
  "h-4 w-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Um inteiro entre 1 e 90, ou `null`. Nada de "1.5", "-3", "abc" nem vazio. */
function diasValidos(texto: string): number | null {
  if (!/^\d+$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return n >= DIAS_MIN && n <= DIAS_MAX ? n : null;
}

export function ProlongarConviteDialog({
  open,
  onOpenChange,
  conviteId,
  validUntil,
  onConcluido,
}: ProlongarConviteDialogProps) {
  const { t } = useTranslation();
  const { prolongar, aExecutar } = useAcoesConviteAdmissao();
  const [escolha, setEscolha] = useState<Escolha>(DIAS_POR_OMISSAO);
  const [outro, setOutro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const campoOutroRef = useRef<HTMLInputElement>(null);
  const aoFechar = useDevolverFoco(open);

  // Cada abertura recomeca limpa.
  useEffect(() => {
    if (!open) return;
    setEscolha(DIAS_POR_OMISSAO);
    setOutro("");
    setErro(null);
  }, [open]);

  useEffect(() => {
    if (escolha === "outro") campoOutroRef.current?.focus();
  }, [escolha]);

  const escolher = (nova: Escolha) => {
    setEscolha(nova);
    setErro(null);
  };

  const confirmar = async () => {
    const dias = escolha === "outro" ? diasValidos(outro) : escolha;
    if (dias === null) {
      setErro(t("hr.convite.erro.diasInvalidos"));
      campoOutroRef.current?.focus();
      return;
    }
    setErro(null);
    const resultado = await prolongar(conviteId, dias);
    if (!resultado.ok) {
      setErro(resultado.erro);
      // A recusa do servidor (por exemplo o tecto dos 90 dias) é sobre os dias escritos: o foco volta a esse campo.
      if (escolha === "outro") campoOutroRef.current?.focus();
      return;
    }
    toast.success(t("hr.convite.prolongar.sucesso"));
    onConcluido();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(aberto) => (aExecutar ? undefined : onOpenChange(aberto))}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={aoFechar}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {t("hr.convite.prolongar.titulo")}
          </DialogTitle>
          <DialogDescription>{t("hr.convite.prolongar.descricao")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {validUntil && (
            <p className="text-sm">{t("hr.convite.prolongar.validoAte", { data: formatarDataHora(validUntil) })}</p>
          )}

          <fieldset className="space-y-1">
            <legend className="sr-only">{t("hr.convite.prolongar.escolha")}</legend>
            {OPCOES_DIAS.map((n) => (
              <label key={n} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="hr-convite-prolongar-dias"
                  className={CLASSE_RADIO}
                  checked={escolha === n}
                  onChange={() => escolher(n)}
                />
                {t("hr.convite.prolongar.dias", { n })}
              </label>
            ))}
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="hr-convite-prolongar-dias"
                className={CLASSE_RADIO}
                checked={escolha === "outro"}
                onChange={() => escolher("outro")}
              />
              {t("hr.convite.prolongar.outro")}
            </label>
          </fieldset>

          {escolha === "outro" && (
            <div className="space-y-1.5">
              <Label htmlFor="hr-convite-prolongar-outro">{t("hr.convite.prolongar.outroDias")}</Label>
              <Input
                id="hr-convite-prolongar-outro"
                ref={campoOutroRef}
                type="number"
                inputMode="numeric"
                min={DIAS_MIN}
                max={DIAS_MAX}
                step={1}
                aria-invalid={erro ? true : undefined}
                className="min-h-11"
                value={outro}
                onChange={(e) => {
                  setOutro(e.target.value);
                  setErro(null);
                }}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t("hr.convite.prolongar.limite")}</p>

          {erro && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} disabled={aExecutar}>
            {t("hr.convite.accao.voltar")}
          </Button>
          <Button type="button" className="min-h-11" onClick={confirmar} disabled={aExecutar}>
            {aExecutar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t("hr.convite.prolongar.confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
