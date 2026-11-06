/**
 * Abrir e fechar o PERIODO de processamento do mes (`hr_periodos_processamento`, por `rpc_hr_processamento_periodo_abrir`
 * e `_fechar`). Um periodo fechado nao se volta a abrir: nao existe RPC de reabertura (a migracao 20261207020400 deixa-a
 * como pendente e um trigger recusa a reabertura), por isso este componente nao oferece «Reabrir». O recibo guardado
 * tambem nao existe ainda: fechar so fecha o periodo. O resultado das RPCs e um texto de erro, mostrado ao utilizador.
 */
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { nomeDoMes } from "./formatosC";

interface Props {
  /** AAAA-MM. */
  mes: string;
  /** `null` = o mes ainda nao tem periodo. */
  periodo: { estado: "aberto" | "fechado" } | null;
  podeGerir: boolean;
  aGravar: boolean;
  /** Devolve o texto do erro, ou `null` se correu bem (o contrato dos hooks reais). */
  aoAbrir: () => Promise<string | null>;
  aoFechar: () => Promise<string | null>;
  /** Porque nao se pode fechar agora (texto ja traduzido); `null`/ausente = pode. O botao fica desactivado e o motivo escrito. */
  motivoBloqueio?: string | null;
}

export function FecharReabrirMes({ mes, periodo, podeGerir, aGravar, aoAbrir, aoFechar, motivoBloqueio = null }: Props) {
  const { t } = useTranslation();
  const [confirmarFecho, setConfirmarFecho] = useState(false);

  if (!podeGerir || periodo?.estado === "fechado") return null;

  const abrir = async () => {
    const erro = await aoAbrir();
    if (erro) toast.error(erro);
    else toast.success(t("hr.vencimento.visaoGeral.periodoAbertoSucesso"));
  };
  const fechar = async () => {
    setConfirmarFecho(false);
    const erro = await aoFechar();
    if (erro) toast.error(erro);
    else toast.success(t("hr.vencimento.visaoGeral.periodoFechadoSucesso"));
  };

  if (!periodo) {
    return (
      <Button type="button" className="min-h-11" onClick={abrir} disabled={aGravar}>
        {aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("hr.vencimento.visaoGeral.abrirPeriodo")}
      </Button>
    );
  }

  const impedido = aGravar || motivoBloqueio !== null;

  return (
    <>
      {/* aria-disabled (e nao `disabled`): o botao continua focavel e o leitor de ecra le o motivo ligado por aria-describedby. */}
      <Button
        type="button" className="min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onClick={() => { if (!impedido) setConfirmarFecho(true); }}
        aria-disabled={impedido}
        aria-busy={aGravar}
        aria-describedby={motivoBloqueio ? "fecho-bloqueio" : undefined}
      >
        {aGravar ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Lock className="mr-2 h-4 w-4" aria-hidden="true" />}
        {t("rhFluxosC.proc.fecho.fechar")}
      </Button>
      {motivoBloqueio && (
        <p id="fecho-bloqueio" role="status" className="w-full text-sm text-amber-800 dark:text-amber-300">{motivoBloqueio}</p>
      )}
      <AlertDialog open={confirmarFecho} onOpenChange={setConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rhFluxosC.proc.fecho.confirmarTitulo", { mes: nomeDoMes(mes) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("rhProcReal.fecho.confirmarDescricao")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("rhFluxosC.comum.cancelar")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={fechar}>{t("rhFluxosC.proc.fecho.fechar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
