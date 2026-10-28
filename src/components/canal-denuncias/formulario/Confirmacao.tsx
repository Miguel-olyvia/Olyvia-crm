// O ecrã de confirmação: código de acompanhamento e PIN (a única forma de acompanhar uma denúncia anónima) e os
// prazos de referência de exemplo. O código e o PIN não se recuperam; por isso o aviso fica à vista, não escondido.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { useFonte } from "../dados/fonte";
import { dataCurta } from "../lib/datas";
import { DIAS_CONFIRMAR, MESES_RESPONDER, prazoConfirmacao, prazoResposta } from "../lib/prazos";

interface ConfirmacaoProps {
  codigo: string;
  pin: string;
  onNova: () => void;
  /** Para onde leva «Acompanhar esta denúncia»; por omissão, o acompanhamento público. */
  acompanharTo?: string;
  /** Só dentro da app, numa denúncia anónima: guarda o CÓDIGO (nunca o PIN) em «As minhas denúncias», só nesta sessão. */
  onGuardarCodigo?: () => void;
  /** Dentro de um painel: «Acompanhar esta denúncia» é um botão que faz isto (p.ex. fechar o painel), em vez de uma ligação. */
  onAcompanhar?: () => void;
  /** Dentro da app, numa denúncia identificada: em vez do aviso das anónimas, diz que ficou ligada à conta da pessoa. */
  ligadaAConta?: boolean;
  /**
   * Num painel, numa anónima: o código e o PIN só aparecem esta vez. «Acompanhar» fica bloqueado até a pessoa marcar
   * «Já guardei o código e o PIN»; `onConfirmarGuardado` diz a quem monta (o painel) que já pode deixar fechar.
   */
  onConfirmarGuardado?: (guardou: boolean) => void;
}

type EstadoCopia = "copiado" | "falhou" | null;

export function Confirmacao({
  codigo, pin, onNova, acompanharTo = "/canal-denuncias/acompanhar", onGuardarCodigo, onAcompanhar, ligadaAConta, onConfirmarGuardado,
}: ConfirmacaoProps) {
  const { t } = useTranslation();
  const hoje = useFonte().hoje();
  const [copia, setCopia] = useState<EstadoCopia>(null);
  const [guardado, setGuardado] = useState(false);
  const [jaGuardou, setJaGuardou] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const exigeGuardar = onConfirmarGuardado !== undefined;
  const acompanharBloqueado = exigeGuardar && !jaGuardou;

  // O formulário desmontou-se ao enviar: o foco vai para o título, para o leitor de ecrã anunciar o resultado.
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  const guardar = (): void => {
    onGuardarCodigo?.();
    setGuardado(true);
  };

  const marcarGuardado = (v: boolean): void => {
    setJaGuardou(v);
    onConfirmarGuardado?.(v);
  };

  // Sem a API da área de transferência (http, iframe, permissão) diz-se que falhou; nunca «copiado» sem ter copiado.
  const copiar = async (): Promise<void> => {
    const area = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!area || typeof area.writeText !== "function") {
      setCopia("falhou");
      return;
    }
    try {
      await area.writeText(`${codigo} · ${pin}`);
      setCopia("copiado");
    } catch {
      setCopia("falhou");
    }
  };

  return (
    <section aria-labelledby="den-conf-titulo" className="space-y-5 rounded-lg border bg-card p-5">
      <div className="flex items-start gap-2">
        <CircleCheck className="mt-1 h-5 w-5 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
        <div>
          <h2 ref={titulo} id="den-conf-titulo" tabIndex={-1} className="text-xl font-semibold outline-none">{t("cd.conf.titulo")}</h2>
          <p className="text-sm text-muted-foreground">{t("cd.conf.texto")}</p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t("cd.conf.codigo")}</dt>
          <dd className="select-all font-mono text-2xl font-semibold tracking-wider">{codigo}</dd>
        </div>
        <div className="rounded-md border bg-muted p-3">
          <dt className="text-xs text-muted-foreground">{t("cd.conf.pin")}</dt>
          <dd className="select-all font-mono text-2xl font-semibold tracking-widest">{pin}</dd>
        </div>
      </dl>
      <div role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{ligadaAConta ? t("cdm.conf.ligada") : t("cd.conf.aviso")}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold">{t("cd.conf.prazos")}</h3>
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          <li>{t("cd.conf.prazoConfirmar", { dias: DIAS_CONFIRMAR, data: dataCurta(prazoConfirmacao(hoje), true) })}</li>
          <li>{t("cd.conf.prazoResponder", { meses: MESES_RESPONDER, data: dataCurta(prazoResposta(hoje), true) })}</li>
        </ul>
      </div>
      {exigeGuardar && (
        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input type="checkbox" className={`h-4 w-4 ${FOCO}`} checked={jaGuardou} onChange={(e) => marcarGuardado(e.target.checked)} />
            {t("cd.conf.jaGuardei")}
          </label>
          {!jaGuardou && <p id="den-conf-guardar-antes" className="text-xs text-muted-foreground">{t("cd.conf.guardarAntes")}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {onAcompanhar ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={acompanharBloqueado}
            aria-describedby={acompanharBloqueado ? "den-conf-guardar-antes" : undefined}
            onClick={onAcompanhar}
          >
            {t("cd.conf.acompanhar")}
          </Button>
        ) : (
          <Button asChild className="min-h-11">
            <Link to={acompanharTo}>{t("cd.conf.acompanhar")}</Link>
          </Button>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={copiar}>{t("cd.conf.copiar")}</Button>
        {onGuardarCodigo && (
          <Button type="button" variant="outline" className="min-h-11" disabled={guardado} onClick={guardar}>
            {guardado ? t("cdm.codigoGuardado") : t("cdm.guardarCodigo")}
          </Button>
        )}
        <button
          type="button"
          onClick={onNova}
          disabled={acompanharBloqueado}
          className={`min-h-11 rounded-sm px-2 text-sm underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCO}`}
        >
          {t("cd.conf.outra")}
        </button>
      </div>
      {copia === "copiado" && <p role="status" className="text-sm text-muted-foreground">{t("cd.conf.copiado")}</p>}
      {copia === "falhou" && <p role="alert" className="text-sm font-medium text-destructive">{t("cd.conf.copiarFalhou")}</p>}
      {guardado && <p role="status" className="text-sm text-muted-foreground">{t("cdm.guardarCodigoNota")}</p>}
    </section>
  );
}
