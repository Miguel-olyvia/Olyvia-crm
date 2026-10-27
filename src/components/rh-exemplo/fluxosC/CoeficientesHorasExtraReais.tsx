/**
 * Processamento salarial > Configuração > «Horas extra» > «Como se pagam as horas extra»: os coeficientes REAIS.
 * Cada linha é o código de processamento ACTIVO da organização com `modo_calculo = percentagem_hora_normal` e aquela
 * `origem_automatica` (`hr_codigos_processamento`, no máximo um activo por origem). Aqui só se edita a percentagem; criar,
 * desactivar ou mudar o modo de um código continua no separador «Códigos». Nada daqui vem de dados de exemplo.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import type { HrCodigoProcessamento, HrCodigoProcessamentoOrigemAutomatica } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

/** As origens de horas extra que a base sabe pagar (as quatro de `percentagem_hora_normal`). */
export const ORIGENS_HORAS_EXTRA: readonly HrCodigoProcessamentoOrigemAutomatica[] = [
  "horas_extra",
  "horas_extra_noturnas",
  "feriado_trabalhado",
  "descanso_trabalhado",
];

const PERCENTAGEM_MAXIMA = 1000;

/** Uma percentagem válida para a base (0 exclusive a 1000 inclusive); vazio nunca passa por zero. */
export function percentagemValida(texto: string): boolean {
  if (texto.trim() === "") return false;
  const n = Number(texto);
  return Number.isFinite(n) && n > 0 && n <= PERCENTAGEM_MAXIMA;
}

/** O código activo, por percentagem da hora normal, que paga aquela origem; `undefined` se não houver. */
export function codigoDaOrigem(
  codigos: readonly HrCodigoProcessamento[],
  origem: HrCodigoProcessamentoOrigemAutomatica,
): HrCodigoProcessamento | undefined {
  return codigos.find((c) => c.activo && c.origem_automatica === origem);
}

interface LinhaProps {
  origem: HrCodigoProcessamentoOrigemAutomatica;
  codigo: HrCodigoProcessamento | undefined;
  podeGerir: boolean;
  aGravar: boolean;
  gravar: (codigo: HrCodigoProcessamento, percentagem: number) => Promise<boolean>;
}

function LinhaCoeficiente({ origem, codigo, podeGerir, aGravar, gravar }: LinhaProps) {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState<string | null>(null);
  const rotulo = t(`hr.vencimento.codigos.origem.${origem}`);
  const id = `he-coef-real-${origem}`;

  if (!codigo) {
    return (
      <div className="space-y-1.5" data-testid={`${id}-sem-codigo`}>
        <p className="text-sm font-medium">{rotulo}</p>
        <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {t("rhHeReal.semCodigo")}
        </p>
      </div>
    );
  }
  if (codigo.modo_calculo !== "percentagem_hora_normal") {
    return (
      <div className="space-y-1.5" data-testid={`${id}-outro-modo`}>
        <p className="text-sm font-medium">{rotulo}</p>
        <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {t("rhHeReal.outroModo", { codigo: codigo.codigo, nome: codigo.nome })}
        </p>
      </div>
    );
  }

  const valor = rascunho ?? String(codigo.percentagem ?? "");
  const valido = percentagemValida(valor);
  const alterado = rascunho !== null && Number(rascunho) !== codigo.percentagem;
  const guardar = async () => {
    if (!valido) return;
    if (await gravar(codigo, Number(valor))) setRascunho(null);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo} (%)</Label>
      <p className="text-xs text-muted-foreground">{codigo.codigo} · {codigo.nome}</p>
      <Input
        id={id}
        type="number"
        min={1}
        max={PERCENTAGEM_MAXIMA}
        step="0.001"
        className="min-h-11"
        value={valor}
        disabled={!podeGerir}
        aria-invalid={!valido}
        onChange={(e) => setRascunho(e.target.value)}
      />
      {!valido && <p role="alert" className="text-sm text-destructive">{t("rhHeReal.invalido")}</p>}
      {podeGerir && (
        <Button type="button" className="min-h-11" disabled={!valido || !alterado || aGravar} onClick={guardar}>
          {t("rhFluxosC.comum.guardar")}
        </Button>
      )}
    </div>
  );
}

export function CoeficientesHorasExtraReais() {
  const { t } = useTranslation();
  const { hasPermission, loading: aCarregarPermissoes } = usePermissions();
  const { codigos, isLoading, isSaving, error, actualizar } = useCodigosProcessamento();
  const podeVer = hasPermission("hr.vencimento.codigos.view");
  const podeGerir = hasPermission("hr.vencimento.codigos.gerir");

  const gravar = async (codigo: HrCodigoProcessamento, percentagem: number): Promise<boolean> => {
    try {
      await actualizar(codigo.id, {
        nome: codigo.nome,
        descricao: codigo.descricao,
        modo_calculo: codigo.modo_calculo,
        percentagem,
        valor_fixo: null,
        origem_automatica: codigo.origem_automatica,
      });
      toast.success(t("rhHeReal.guardado"));
      return true;
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
      return false;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhFluxosD.cfg.coefTitulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhHeReal.ajuda")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {aCarregarPermissoes || isLoading ? (
          <div className="flex justify-center py-8"><OlyviaLoader size={28} /></div>
        ) : !podeVer ? (
          <SemAcessoCard simples />
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">{t("rhHeReal.erroLeitura")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ORIGENS_HORAS_EXTRA.map((origem) => (
              <LinhaCoeficiente
                key={origem}
                origem={origem}
                codigo={codigoDaOrigem(codigos, origem)}
                podeGerir={podeGerir}
                aGravar={isSaving}
                gravar={gravar}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
