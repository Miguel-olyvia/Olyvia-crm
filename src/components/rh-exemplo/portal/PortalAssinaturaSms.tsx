// O painel de assinar (ou recusar assinar) um documento no portal REAL, com o codigo por SMS, como nos contratos do CRM: «Enviar o
// codigo por SMS» para o telemovel da ficha (so mascarado), campo de 6 digitos (valido 5 min, 5 tentativas), «Li o documento e
// aceito» e «Assinar»; reenviar so ao fim de 60 s. Sem telemovel valido na ficha o erro `sem_telemovel` diz-se em texto. O codigo
// escrito passa para a Edge e nao fica em lado nenhum. Ligado a Edge `convite-admissao` (doc_codigo, doc_assinar, doc_recusar).
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { mensagemErroPortal } from "@/components/rh-exemplo/hooks/portalAdmissaoReal";
import type { ResultadoAccaoSessao, ResultadoCodigoSms } from "@/components/rh-exemplo/hooks/portalDocumentosPublicoReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Iguais as da base: espera entre codigos e minimo do motivo de recusa. */
const ESPERA_SMS_S = 60;
const MIN_MOTIVO = 3;
const DIGITOS = 6;

interface PortalAssinaturaSmsProps {
  /** Distingue os ids quando ha varios paineis na mesma pagina. */
  idBase: string;
  pedirCodigo: () => Promise<ResultadoCodigoSms>;
  assinar: (codigo: string, aceite: boolean) => Promise<ResultadoAccaoSessao>;
  recusar: (motivo: string) => Promise<ResultadoAccaoSessao>;
  /** O telemovel mascarado que a leitura ja trouxe, para dizer para onde vai o SMS antes de o pedir. */
  telemovelMascarado: string | null;
}

/** Os segundos que faltam ate `quando` (ISO); sem data valida, o tempo de espera por omissao. */
function segundosAte(quando: string | null): number {
  const alvo = quando ? Date.parse(quando) : NaN;
  if (Number.isNaN(alvo)) return ESPERA_SMS_S;
  return Math.max(0, Math.ceil((alvo - Date.now()) / 1000));
}

export function PortalAssinaturaSms({ idBase, pedirCodigo, assinar, recusar, telemovelMascarado }: PortalAssinaturaSmsProps) {
  const { t } = useTranslation();
  const [enviado, setEnviado] = useState(false);
  const [telefone, setTelefone] = useState<string | null>(telemovelMascarado);
  const [espera, setEspera] = useState(0);
  const [codigo, setCodigo] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [aPedir, setAPedir] = useState(false);
  const [aAssinar, setAAssinar] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erroRecusa, setErroRecusa] = useState<string | null>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (enviado && !bloqueado) codigoRef.current?.focus();
  }, [enviado, bloqueado]);
  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  const pedir = async () => {
    if (aPedir || espera > 0) return;
    setAPedir(true);
    setErro(null);
    const r = await pedirCodigo();
    setAPedir(false);
    if (r.ok) {
      setEnviado(true);
      setBloqueado(false);
      setCodigo("");
      if (r.telemovelMascarado) setTelefone(r.telemovelMascarado);
      setEspera(segundosAte(r.reenviarEm));
      return;
    }
    // `otp_espera`: ja ha um codigo a caminho, escreve-se esse; so se espera para pedir outro.
    if (r.codigo === "otp_espera") {
      setEnviado(true);
      setEspera(ESPERA_SMS_S);
    }
    setErro(mensagemErroPortal(t, r.codigo));
  };

  const confirmar = async () => {
    if (aAssinar) return;
    if (codigo.length !== DIGITOS) return setErro(t("rhPortalReal.sms.codigoCurto", { n: DIGITOS }));
    if (!aceite) return setErro(mensagemErroPortal(t, "aceite_obrigatorio"));
    setAAssinar(true);
    setErro(null);
    const r = await assinar(codigo, aceite);
    setAAssinar(false);
    if (r.ok) return;
    setCodigo("");
    // Sem tentativas (ou bloqueado), so um codigo novo serve.
    if (r.codigo === "otp_bloqueado" || r.codigo === "otp_expirado" || (r.codigo === "otp_invalido" && r.restantes === 0)) setBloqueado(true);
    setErro(mensagemErroPortal(t, r.codigo, { restantes: r.restantes }));
  };

  const confirmarRecusa = async () => {
    if (motivo.trim().length < MIN_MOTIVO) return setErroRecusa(t("rhPortalReal.sms.motivoCurto", { n: MIN_MOTIVO }));
    setErroRecusa(null);
    const r = await recusar(motivo);
    if (!r.ok) setErroRecusa(mensagemErroPortal(t, r.codigo));
  };

  return (
    <div className="space-y-4" data-testid={`assinatura-sms-${idBase}`}>
      {!enviado ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {telefone ? t("rhPortalReal.sms.explicacaoComNumero", { telemovel: telefone }) : t("rhPortalReal.sms.explicacao")}
          </p>
          <Button type="button" className={cn("min-h-11", FOCO)} disabled={aPedir} onClick={() => void pedir()}>
            {aPedir ? t("rhPortalReal.sms.aEnviar") : t("rhPortalReal.sms.enviar")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground" role="status">
            {telefone ? t("rhPortalReal.sms.enviadoPara", { telemovel: telefone }) : t("rhPortalReal.sms.enviado")}
          </p>
          {!bloqueado && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${idBase}-codigo`}>{t("rhPortalReal.sms.codigo", { n: DIGITOS })}</Label>
                <input
                  id={`${idBase}-codigo`} ref={codigoRef} inputMode="numeric" autoComplete="one-time-code" maxLength={DIGITOS}
                  value={codigo} placeholder="000000" aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${idBase}-erro` : undefined}
                  onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, DIGITOS)); setErro(null); }}
                  className={cn("h-11 w-full rounded-md border bg-background px-3 text-center text-xl tracking-[0.4em]", FOCO)}
                />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={aceite} onChange={(e) => { setAceite(e.target.checked); setErro(null); }} />
                {t("rhPortalReal.sms.aceito")}
              </label>
            </>
          )}
        </div>
      )}
      {erro && <p id={`${idBase}-erro`} role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {enviado && !bloqueado && (
          <Button type="button" className={cn("min-h-11 gap-2", FOCO)} disabled={aAssinar || codigo.length !== DIGITOS} onClick={() => void confirmar()}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {aAssinar ? t("rhPortalReal.sms.aAssinar") : t("rhPortalReal.sms.assinar")}
          </Button>
        )}
        {enviado && (
          <button
            type="button" onClick={() => void pedir()} disabled={espera > 0 || aPedir}
            className={cn("min-h-11 rounded-md px-2 text-sm font-medium underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline", FOCO)}
          >
            {espera > 0 ? t("rhPortalReal.sms.reenviarEm", { n: espera }) : t("rhPortalReal.sms.reenviar")}
          </button>
        )}
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-expanded={recusando} onClick={() => setRecusando((r) => !r)}>
          {t("rhPortalReal.sms.recusar")}
        </Button>
      </div>
      {recusando && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor={`${idBase}-recusa`}>{t("rhPortalReal.sms.recusaMotivo")}</Label>
          <Textarea
            id={`${idBase}-recusa`} value={motivo} aria-invalid={erroRecusa ? true : undefined}
            onChange={(e) => { setMotivo(e.target.value); setErroRecusa(null); }}
          />
          {erroRecusa && <p role="alert" className="text-xs text-destructive">{erroRecusa}</p>}
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => void confirmarRecusa()}>
            {t("rhPortalReal.sms.recusaEnviar")}
          </Button>
        </div>
      )}
    </div>
  );
}
