/**
 * O interruptor «pode fazer horas extra» de uma pessoa. Vive UMA vez, no grupo «Tempo de trabalho» da aba Contrato, ao lado dos
 * máximos de horas e da isenção de horário. É independente dos máximos (esses dependem só de quem pode editar o contrato).
 *
 * O valor vem da base e só se lê com `hr.assiduidade.view`. Sem essa permissão, ou se a leitura falhar, o estado é DESCONHECIDO:
 * o interruptor fica desativado e sem «sim» nem «não» (nunca se mostra «não» por não se saber). Escrever pede `hr.assiduidade.gerir`.
 */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useHorasExtraAutorizacoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";

export function InterruptorHorasExtra({ pessoaId, disabled = false }: { pessoaId: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const { permissoes } = usePermissoesAssiduidade();
  const { pode: podeDe, autorizar, aCarregar, aGuardar, erro } = useHorasExtraAutorizacoes(permissoes.view);
  const pode = podeDe(pessoaId);
  const [erroEscrita, setErroEscrita] = useState<string | null>(null);
  // Desconhecido: sem permissão para ler, ou a leitura falhou. Enquanto carrega também ainda não se sabe.
  const desconhecido = !permissoes.view || Boolean(erro);
  const alterar = async (valor: boolean) => {
    setErroEscrita(null);
    const r = await autorizar(pessoaId, valor);
    if (!r.ok) {
      setErroEscrita(r.erro);
      return;
    }
    toast.success(t(valor ? "rhFluxosC.marca.ligada" : "rhFluxosC.marca.desligada"));
  };
  return (
    <div className="space-y-1 self-end pb-2 sm:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2">
        <Switch
          id={`he-marca-${pessoaId}`}
          aria-labelledby={`he-marca-rotulo-${pessoaId}`}
          checked={!desconhecido && pode}
          disabled={disabled || !permissoes.gerir || desconhecido || aCarregar || aGuardar}
          onCheckedChange={(v) => void alterar(v)}
        />
        <Label id={`he-marca-rotulo-${pessoaId}`} htmlFor={`he-marca-${pessoaId}`} className="font-normal">{t("rhFluxosC.marca.titulo")}</Label>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {desconhecido ? t("rhHeReal.marca.desconhecido") : aCarregar ? t("rhHeReal.aCarregar") : t(pode ? "rhFluxosC.marca.estadoSim" : "rhFluxosC.marca.estadoNao")}
      </p>
      {erro && <p role="alert" className="text-xs text-destructive">{t("rhHeReal.marca.erroLeitura", { erro })}</p>}
      {erroEscrita && <p role="alert" className="text-xs text-destructive">{erroEscrita}</p>}
    </div>
  );
}
