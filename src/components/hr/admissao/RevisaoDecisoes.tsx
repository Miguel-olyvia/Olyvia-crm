/**
 * As decisoes do RH sobre uma admissao: Aprovar e Rejeitar (submetida), Enviar contrato (aprovada) e Reenviar aviso (a aguardar
 * assinaturas). Chamam `rpc_hr_admissao_aprovar` e `rpc_hr_admissao_rejeitar` (permissao `hr.onboarding.approve`) e
 * `rpc_hr_admissao_enviar_contrato` (permissao `hr.pessoas.documentos.emitir`); a base decide a permissao e o estado.
 *
 *  - Aprovar: um clique; a admissao passa a «aprovada» e aparece «Enviar contrato».
 *  - Rejeitar: pede uma mensagem (3 a 2000 caracteres, vai para a pessoa) e, se quiser, um motivo interno que fica so no RH.
 *  - Devolver com comentarios por campo continua DESATIVADO (`aria-disabled`, para continuar focavel e a razao se ouvir): ainda nao
 *    existe `rpc_hr_admissao_devolver`. Clicar nao faz nada.
 *
 * Aprovar e Rejeitar sem permissao, ou fora do estado «submetida», ficam `aria-disabled` com a razao. Erros em `role="alert"` e em
 * portugues, nunca o codigo.
 */
import { useId, useState } from "react";
import { Check, FileSignature, MailPlus, MessageSquarePlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { EnviarContratoDialog } from "@/components/hr/admissao/EnviarContratoDialog";
import { useDecisoesAdmissao } from "@/hooks/hr/useDecisoesAdmissao";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const MENSAGEM_MIN = 3;
const MENSAGEM_MAX = 2000;

interface RevisaoDecisoesProps {
  conviteId: string;
  /** O estado da admissao (o que a base diz agora). */
  estado: string;
  /** O nome da pessoa, para o titulo dos dialogos. */
  nome: string;
  /** Corre depois de uma decisao ou de um envio que correu bem: o ecra volta a ler. */
  aoDecidido?: () => void;
}

interface RejeitarProps {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: (mensagem: string, motivoInterno: string) => Promise<string | null>;
  aExecutar: boolean;
}

function RejeitarDialog({ aberto, aoFechar, aoConfirmar, aExecutar }: RejeitarProps) {
  const { t } = useTranslation();
  const [mensagem, setMensagem] = useState("");
  const [interno, setInterno] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = async () => {
    if (mensagem.trim().length < MENSAGEM_MIN) return setErro(t("rhPortalReal.decisao.rejeitarCurta", { n: MENSAGEM_MIN }));
    const falha = await aoConfirmar(mensagem, interno);
    if (falha) return setErro(falha);
    setMensagem("");
    setInterno("");
    setErro(null);
  };
  const fechar = () => {
    setErro(null);
    aoFechar();
  };
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) fechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhPortalReal.decisao.rejeitarTitulo")}</DialogTitle>
          <DialogDescription>{t("rhPortalReal.decisao.rejeitarSub")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rejeitar-mensagem">{t("rhPortalReal.decisao.rejeitarMensagem")}</Label>
            <Textarea
              id="rejeitar-mensagem" value={mensagem} maxLength={MENSAGEM_MAX} aria-invalid={erro ? true : undefined}
              onChange={(e) => { setMensagem(e.target.value); setErro(null); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rejeitar-interno">{t("rhPortalReal.decisao.rejeitarInterno")}</Label>
            <Textarea id="rejeitar-interno" value={interno} maxLength={MENSAGEM_MAX} onChange={(e) => setInterno(e.target.value)} />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={fechar}>{t("rhPortalReal.cancelar")}</Button>
          <Button type="button" variant="destructive" className={cn("min-h-11", FOCO)} disabled={aExecutar} onClick={() => void confirmar()}>
            {t("rhAdm.acao.rejeitar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevisaoDecisoes({ conviteId, estado, nome, aoDecidido }: RevisaoDecisoesProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { aprovar, rejeitar, avisar, aExecutar } = useDecisoesAdmissao();
  const idRazao = useId();
  const [rejeitando, setRejeitando] = useState(false);
  const [contrato, setContrato] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const podeDecidir = hasPermission("hr.onboarding.approve") && estado === "submetida";
  const podeContrato = hasPermission("hr.pessoas.documentos.emitir");

  const aoAprovar = async () => {
    if (!podeDecidir || aExecutar) return;
    setErro(null);
    setAviso(null);
    const r = await aprovar(conviteId);
    if (!r.ok) return setErro(r.erro);
    setAviso(t("rhPortalReal.decisao.aprovada"));
    aoDecidido?.();
  };
  const aoConfirmarRejeitar = async (mensagem: string, interno: string): Promise<string | null> => {
    const r = await rejeitar(conviteId, mensagem, interno);
    if (!r.ok) return r.erro;
    setRejeitando(false);
    setAviso(t("rhPortalReal.decisao.rejeitada"));
    aoDecidido?.();
    return null;
  };
  const aoReenviarAviso = async () => {
    if (aExecutar) return;
    setErro(null);
    setAviso(null);
    const r = await avisar(conviteId);
    if (!r.ok) return setErro(r.erro);
    setAviso(t("rhPortalReal.decisao.avisoReenviado"));
  };

  const emSubmetida = estado === "submetida";
  const mostrarContrato = estado === "aprovada" && podeContrato;
  const aEsperaAssinatura = estado === "a_aguardar_assinaturas";
  if (!emSubmetida && !mostrarContrato && !aEsperaAssinatura) return null;

  return (
    <div role="group" aria-label={t("rhAdm.acao.grupo")} className="space-y-2">
      {emSubmetida && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" className={cn("min-h-11 gap-2", FOCO, !podeDecidir && "cursor-not-allowed opacity-50")}
              aria-disabled={!podeDecidir || aExecutar ? "true" : undefined} aria-describedby={podeDecidir ? undefined : idRazao}
              onClick={() => void aoAprovar()}
            >
              <Check className="h-4 w-4" aria-hidden="true" />{t("rhAdm.acao.aprovar")}
            </Button>
            {/* Devolver com comentarios por campo: ainda nao existe na base. Continua desenhado e desativado. */}
            <Button
              type="button" variant="outline" className={cn("min-h-11 cursor-not-allowed gap-2 opacity-50", FOCO)}
              aria-disabled="true" aria-describedby={idRazao} onClick={(evento) => evento.preventDefault()}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />{t("rhAdm.acao.devolver")}
            </Button>
            <Button
              type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO, !podeDecidir && "cursor-not-allowed opacity-50")}
              aria-disabled={!podeDecidir ? "true" : undefined} aria-describedby={podeDecidir ? undefined : idRazao}
              onClick={() => { if (podeDecidir) setRejeitando(true); }}
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />{t("rhAdm.acao.rejeitar")}
            </Button>
          </div>
          <p id={idRazao} className="text-xs text-muted-foreground">
            {podeDecidir ? t("rhPortalReal.decisao.devolverFase") : t("rhPortalReal.decisao.semPermissao")}
          </p>
        </>
      )}
      {mostrarContrato && (
        <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setContrato(true)}>
          <FileSignature className="h-4 w-4" aria-hidden="true" />{t("rhPortalReal.decisao.enviarContrato")}
        </Button>
      )}
      {aEsperaAssinatura && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{t("rhPortalReal.decisao.aEsperaAssinatura")}</p>
          {podeContrato && (
            <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} disabled={aExecutar} onClick={() => void aoReenviarAviso()}>
              <MailPlus className="h-4 w-4" aria-hidden="true" />{t("rhPortalReal.decisao.reenviarAviso")}
            </Button>
          )}
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {aviso && <p role="status" className="text-sm">{aviso}</p>}
      <RejeitarDialog aberto={rejeitando} aoFechar={() => setRejeitando(false)} aoConfirmar={aoConfirmarRejeitar} aExecutar={aExecutar} />
      <EnviarContratoDialog
        aberto={contrato} conviteId={conviteId} nome={nome} aoFechar={() => setContrato(false)} aoEnviado={() => aoDecidido?.()}
      />
    </div>
  );
}
