// O ecrã de confirmação: código de acompanhamento e PIN (a única forma de acompanhar uma denúncia anónima) e os
// prazos de referência de exemplo. O código e o PIN não se recuperam; por isso o aviso fica à vista, não escondido.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { HOJE_EXEMPLO, dataCurta } from "../lib/datas";
import { DIAS_CONFIRMAR, MESES_RESPONDER, prazoConfirmacao, prazoResposta } from "../lib/prazos";

interface ConfirmacaoProps {
  codigo: string;
  pin: string;
  onNova: () => void;
  /** Para onde leva «Acompanhar esta denúncia»; por omissão, o acompanhamento público. */
  acompanharTo?: string;
  /** Só dentro da app, numa denúncia anónima: guarda o CÓDIGO (nunca o PIN) em «As minhas denúncias», só nesta sessão. */
  onGuardarCodigo?: () => void;
}

export function Confirmacao({ codigo, pin, onNova, acompanharTo = "/canal-denuncias/acompanhar", onGuardarCodigo }: ConfirmacaoProps) {
  const { t } = useTranslation();
  const [copiado, setCopiado] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const guardar = (): void => {
    onGuardarCodigo?.();
    setGuardado(true);
  };

  const copiar = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(`${codigo} · ${pin}`);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <section aria-labelledby="den-conf-titulo" className="space-y-5 rounded-lg border bg-card p-5">
      <div className="flex items-start gap-2">
        <CircleCheck className="mt-1 h-5 w-5 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
        <div>
          <h2 id="den-conf-titulo" tabIndex={-1} className="text-xl font-semibold">{t("cd.conf.titulo")}</h2>
          <p className="text-sm text-muted-foreground">{t("cd.conf.texto")}</p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t("cd.conf.codigo")}</dt>
          <dd className="font-mono text-2xl font-semibold tracking-wider">{codigo}</dd>
        </div>
        <div className="rounded-md border bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t("cd.conf.pin")}</dt>
          <dd className="font-mono text-2xl font-semibold tracking-widest">{pin}</dd>
        </div>
      </dl>
      <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("cd.conf.aviso")}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold">{t("cd.conf.prazos")}</h3>
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          <li>{t("cd.conf.prazoConfirmar", { dias: DIAS_CONFIRMAR, data: dataCurta(prazoConfirmacao(HOJE_EXEMPLO), true) })}</li>
          <li>{t("cd.conf.prazoResponder", { meses: MESES_RESPONDER, data: dataCurta(prazoResposta(HOJE_EXEMPLO), true) })}</li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild className="min-h-11">
          <Link to={acompanharTo}>{t("cd.conf.acompanhar")}</Link>
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={copiar}>{t("cd.conf.copiar")}</Button>
        {onGuardarCodigo && (
          <Button type="button" variant="outline" className="min-h-11" disabled={guardado} onClick={guardar}>
            {guardado ? t("cdm.codigoGuardado") : t("cdm.guardarCodigo")}
          </Button>
        )}
        <button type="button" onClick={onNova} className={`min-h-11 rounded-sm px-2 text-sm underline underline-offset-2 ${FOCO}`}>
          {t("cd.conf.outra")}
        </button>
      </div>
      {copiado && <p role="status" className="text-sm text-muted-foreground">{t("cd.conf.copiado")}</p>}
      {guardado && <p role="status" className="text-sm text-muted-foreground">{t("cdm.guardarCodigoNota")}</p>}
    </section>
  );
}
