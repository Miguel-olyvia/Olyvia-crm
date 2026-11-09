/**
 * Processamento salarial > Configuração > «Horas extra» > «Como se pagam as horas extra»: os códigos REAIS que pagam cada origem.
 * Cada linha é o código de processamento ACTIVO da organização com `modo_calculo = percentagem_hora_normal` e aquela
 * `origem_automatica` (`hr_codigos_processamento`, no máximo um activo por origem). A percentagem já NÃO se edita nem se mostra:
 * o cálculo paga ao valor da regra salarial da origem (`percentagemDaRegra`), pelo que aqui só se vê qual o código que paga.
 * Criar, desactivar ou mudar o modo de um código continua no separador «Códigos». Nada daqui vem de dados de exemplo.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import type { HrCodigoProcessamento, HrCodigoProcessamentoOrigemAutomatica } from "@/components/rh-exemplo/tipos";
import { useTranslation } from "@/hooks/useTranslation";

/** As origens de horas extra que se podem escolher num código (as nocturnas já não: o valor vem da regra salarial). */
export const ORIGENS_HORAS_EXTRA: readonly HrCodigoProcessamentoOrigemAutomatica[] = [
  "horas_extra",
  "feriado_trabalhado",
  "descanso_trabalhado",
];

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
}

function LinhaCoeficiente({ origem, codigo }: LinhaProps) {
  const { t } = useTranslation();
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

  return (
    <div className="space-y-1.5" data-testid={id}>
      <p className="text-sm font-medium">{rotulo}</p>
      <p className="text-xs text-muted-foreground">{codigo.codigo} · {codigo.nome}</p>
      <p role="note" className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{t("rhHeReal.valorDaRegra")}</p>
    </div>
  );
}

export function CoeficientesHorasExtraReais() {
  const { t } = useTranslation();
  const { hasPermission, loading: aCarregarPermissoes } = usePermissions();
  const { codigos, isLoading, error } = useCodigosProcessamento();
  const podeVer = hasPermission("hr.vencimento.codigos.view");

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ORIGENS_HORAS_EXTRA.map((origem) => (
              <LinhaCoeficiente key={origem} origem={origem} codigo={codigoDaOrigem(codigos, origem)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
