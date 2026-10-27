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
}

export function FecharReabrirMes({ mes, periodo, podeGerir, aGravar, aoAbrir, aoFechar }: Props) {
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

  return (
    <>
      <Button type="button" className="min-h-11" onClick={() => setConfirmarFecho(true)} disabled={aGravar}>
        {aGravar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="mr-2 h-4 w-4" aria-hidden="true" />}
        {t("rhFluxosC.proc.fecho.fechar")}
      </Button>
      <AlertDialog open={confirmarFecho} onOpenChange={setConfirmarFecho}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rhFluxosC.proc.fecho.confirmarTitulo", { mes: nomeDoMes(mes) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("hr.vencimento.visaoGeral.confirmarFechoDescricao")}</AlertDialogDescription>
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
