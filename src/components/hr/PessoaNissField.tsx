/**
 * O NISS: mascarado por omissao, revelado uma vez, e nunca guardado.
 *
 * PORQUE ESTE CAMPO E DIFERENTE DE TODOS OS OUTROS
 * -----------------------------------------------
 * A coluna `niss` esta revogada a `authenticated` AO NIVEL DA COLUNA
 * (migration 20261120040000): nenhum select do cliente a consegue pedir. O que
 * a ficha le e `niss_ultimos4`, uma coluna gerada. O valor completo so existe
 * do outro lado de `rpc_hr_revelar_niss`, que exige
 * `hr.pessoas.identificacao.reveal` NA ORGANIZACAO da pessoa e escreve uma
 * linha em `pessoas_acessos_sensiveis` antes de responder.
 *
 * Aqui, em consequencia:
 *  - o botao "Mostrar" so aparece a quem tem a permissao de revelar;
 *  - o valor revelado vive 30 segundos em estado local e desaparece;
 *  - nunca vai para `localStorage`, `sessionStorage` nem para o URL;
 *  - o temporizador e limpo ao desmontar, para o valor nao sobreviver a
 *    navegacao para outra ficha.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

/** Quanto tempo o valor em claro fica no ecra antes de voltar a mascara. */
export const SEGUNDOS_VISIVEL = 30;

interface PessoaNissFieldProps {
  /** Ultimos quatro digitos, lidos da coluna gerada. `null` = nao preenchido. */
  ultimos4: string | null;
  /** `hr.pessoas.identificacao.reveal` na organizacao da pessoa. */
  podeRevelar: boolean;
  /** Chama `rpc_hr_revelar_niss`. Lanca quando a base recusa. */
  onRevelar: () => Promise<string | null>;
}

export function PessoaNissField({ ultimos4, podeRevelar, onRevelar }: PessoaNissFieldProps) {
  const { t } = useTranslation();
  const [valor, setValor] = useState<string | null>(null);
  const [aRevelar, setARevelar] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limparTemporizador = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  // O valor em claro nao sobrevive ao desmontar do componente.
  useEffect(() => limparTemporizador, [limparTemporizador]);

  const ocultar = useCallback(() => {
    limparTemporizador();
    setValor(null);
  }, [limparTemporizador]);

  const revelar = useCallback(async () => {
    setARevelar(true);
    try {
      const claro = await onRevelar();
      if (!claro) {
        toast.error(t("hr.campos.semValor"));
        return;
      }
      setValor(claro);
      limparTemporizador();
      temporizador.current = setTimeout(() => setValor(null), SEGUNDOS_VISIVEL * 1000);
    } catch (e) {
      toast.error(await getFriendlyErrorMessage(e, t("hr.niss.semPermissao")));
    } finally {
      setARevelar(false);
    }
  }, [onRevelar, limparTemporizador, t]);

  const mascara = ultimos4 ? `•••••••${ultimos4}` : null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("hr.campos.niss")}
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm tabular-nums">
          {valor ?? mascara ?? (
            <span className="font-sans text-muted-foreground">{t("hr.campos.semValor")}</span>
          )}
        </span>
        {mascara && podeRevelar && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={valor ? ocultar : revelar}
            disabled={aRevelar}
          >
            {aRevelar ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : valor ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {valor ? t("hr.niss.ocultar") : t("hr.niss.mostrar")}
          </Button>
        )}
      </div>
      {mascara && podeRevelar && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.niss.registado")}
        </p>
      )}
    </div>
  );
}
