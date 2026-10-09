/**
 * A excepcao de UM contrato as regras da organizacao: cada campo herda da
 * organizacao (vazio) ou e personalizado neste contrato. "Voltar a herdar tudo"
 * grava todos os campos a NULL (`rpc_hr_vinculo_regra_guardar`).
 *
 * O PONTO DE PARTIDA: a base devolve a regra EFECTIVA e a sua fonte, nao campo
 * a campo qual e personalizado. Num contrato que herda tudo os campos abrem
 * vazios (herda); num contrato personalizado abrem com os valores efectivos --
 * guardar sem mexer mantem exactamente o que ja se aplicava.
 *
 * Exige `hr.pessoas.vinculos.edit` (quem abre esta janela ja o verificou; a
 * base volta a verificar). `onGuardar` devolve o erro traduzido ou `null`.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CamposRegraFimContrato } from "@/components/hr/fimContrato/CamposRegraFimContrato";
import { useTranslation } from "@/hooks/useTranslation";
import type { ExcepcaoContrato } from "@/hooks/usePessoaContratoFim";
import {
  inteiroOuNull,
  problemasDaRegra,
  type ErroRegra,
  type FormRegraFimContrato,
  type RegraDoContrato,
} from "@/lib/hr/fimContrato";

interface ExcepcaoContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra: RegraDoContrato;
  saving: boolean;
  onGuardar: (excepcao: ExcepcaoContrato) => Promise<string | null>;
}

const TUDO_HERDA: ExcepcaoContrato = {
  renovacaoAutomatica: null,
  diasAviso: null,
  maxRenovacoes: null,
  duracaoValor: null,
  duracaoUnidade: null,
  aoAtingirLimite: null,
  motivo: null,
};

function formInicial(regra: RegraDoContrato): FormRegraFimContrato {
  if (regra.fonte !== "personalizado") {
    return {
      ativo: regra.ativo,
      dias_aviso: "",
      renovacao_automatica: "",
      max_renovacoes: "",
      duracao_valor: "",
      duracao_unidade: "",
      ao_atingir_limite: "",
    };
  }
  return {
    ativo: regra.ativo,
    dias_aviso: String(regra.dias_aviso),
    renovacao_automatica: regra.renovacao_automatica ? "sim" : "nao",
    max_renovacoes: String(regra.max_renovacoes),
    duracao_valor: regra.duracao_valor === null ? "" : String(regra.duracao_valor),
    duracao_unidade: regra.duracao_unidade ?? "",
    ao_atingir_limite: regra.ao_atingir_limite,
  };
}

export function ExcepcaoContratoDialog({
  open,
  onOpenChange,
  regra,
  saving,
  onGuardar,
}: ExcepcaoContratoDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormRegraFimContrato>(() => formInicial(regra));
  const [motivo, setMotivo] = useState("");
  const [erros, setErros] = useState<readonly ErroRegra[]>([]);
  const [erroBase, setErroBase] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(formInicial(regra));
      setMotivo("");
      setErros([]);
      setErroBase(null);
    }
  }, [open, regra]);

  const enviar = async (excepcao: ExcepcaoContrato) => {
    const resultado = await onGuardar(excepcao);
    if (resultado === null) {
      onOpenChange(false);
      return;
    }
    setErroBase(resultado);
  };

  const guardar = async () => {
    const problemas = problemasDaRegra(form, true);
    setErros(problemas);
    if (problemas.length > 0) return;
    const texto = motivo.trim();
    await enviar({
      renovacaoAutomatica: form.renovacao_automatica === "" ? null : form.renovacao_automatica === "sim",
      diasAviso: inteiroOuNull(form.dias_aviso),
      maxRenovacoes: inteiroOuNull(form.max_renovacoes),
      duracaoValor: inteiroOuNull(form.duracao_valor),
      duracaoUnidade: form.duracao_unidade === "" ? null : form.duracao_unidade,
      aoAtingirLimite: form.ao_atingir_limite === "" ? null : form.ao_atingir_limite,
      motivo: texto === "" ? null : texto,
    });
  };

  const voltarAHerdar = async () => {
    const texto = motivo.trim();
    await enviar({ ...TUDO_HERDA, motivo: texto === "" ? null : texto });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("hr.fimContrato.excepcao.titulo")}</DialogTitle>
          <DialogDescription>{t("hr.fimContrato.excepcao.descricao")}</DialogDescription>
        </DialogHeader>

        <CamposRegraFimContrato
          idPrefixo="hr-fim-contrato-excepcao"
          valor={form}
          erros={erros}
          herdavel
          onChange={(patch) => setForm((anterior) => ({ ...anterior, ...patch }))}
        />

        <div className="space-y-1.5">
          <Label htmlFor="hr-fim-contrato-excepcao-motivo">{t("hr.fimContrato.motivo")}</Label>
          <Input
            id="hr-fim-contrato-excepcao-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {erroBase && (
          <p className="text-sm text-destructive" role="alert">
            {erroBase}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {regra.fonte === "personalizado" ? (
            <Button variant="outline" onClick={() => void voltarAHerdar()} disabled={saving}>
              {t("hr.fimContrato.excepcao.voltarAHerdar")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void guardar()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
