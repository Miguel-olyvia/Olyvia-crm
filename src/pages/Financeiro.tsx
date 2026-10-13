import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { PorFaturar, chaveDaTranche } from "@/components/financeiro/PorFaturar";
import { PorValidar } from "@/components/financeiro/PorValidar";
import { formatarData } from "@/components/financeiro/formatar";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/lib/toast";
import { abrirPdf, mensagemDeErro } from "@/hooks/financeiro/financeiro";
import {
  useAnularFatura,
  useFilaFinanceiro,
  useRegistarFatura,
  useValidarPagamento,
} from "@/hooks/financeiro/useFinanceiro";

/**
 * Financeiro (/financeiro) — registar as faturas emitidas no programa
 * certificado e validar os pagamentos. Duas listas:
 *   · Por faturar: as tranches dos contratos assinados sem fatura;
 *   · Por validar pagamento: as faturas registadas à espera do dinheiro.
 * O 1.º pagamento validado de um contrato avisa as Operações (criar a obra,
 * com o plano por aprovar) e o Armazém (os materiais).
 */
export default function Financeiro() {
  const { activeCompany, isLoading: aCarregarEmpresa } = useCompany();
  const { hasPermission } = usePermissions();
  const orgId = activeCompany?.id ?? null;

  const fila = useFilaFinanceiro(orgId);
  const registar = useRegistarFatura(orgId);
  const validar = useValidarPagamento(orgId);
  const anular = useAnularFatura(orgId);
  const [aGravar, setAGravar] = useState<string | null>(null);

  if (aCarregarEmpresa) {
    return (
      <div className="flex justify-center py-16">
        <OlyviaLoader size={36} />
      </div>
    );
  }
  if (!activeCompany) return <NoOrganizationState inline />;

  const dados = fila.data;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet className="h-6 w-6 text-primary" /> Financeiro
        </h1>
        <p className="text-sm text-muted-foreground">
          A Olyvia não emite faturas: emita-as no programa certificado e registe-as aqui. Depois valide o pagamento.
        </p>
      </header>

      {fila.isLoading ? (
        <div className="flex justify-center py-16">
          <OlyviaLoader size={36} />
        </div>
      ) : fila.isError ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">
              {mensagemDeErro(fila.error, "Não foi possível carregar o Financeiro.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void fila.refetch()}>
              Tentar outra vez
            </Button>
          </CardContent>
        </Card>
      ) : dados ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Por faturar <span className="text-muted-foreground">({dados.por_faturar.length})</span>
              </CardTitle>
              <CardDescription>
                Uma linha por tranche do plano de pagamento do contrato.
                {dados.faturar_desde && <> Só contratos assinados desde {formatarData(dados.faturar_desde)}.</>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PorFaturar
                lista={dados.por_faturar}
                podeRegistar={hasPermission("finance.register")}
                aGravar={aGravar}
                aoRegistar={async (tranche, d, pdf) => {
                  setAGravar(chaveDaTranche(tranche));
                  try {
                    await registar.mutateAsync({ tranche, dados: d, pdf });
                    toast.success(`Fatura ${d.numero.trim()} registada`);
                    return true;
                  } catch (e) {
                    toast.error(mensagemDeErro(e, "Não foi possível registar a fatura."));
                    return false;
                  } finally {
                    setAGravar(null);
                  }
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                Por validar pagamento <span className="text-muted-foreground">({dados.por_validar.length})</span>
              </CardTitle>
              <CardDescription>Faturas registadas à espera de o pagamento entrar.</CardDescription>
            </CardHeader>
            <CardContent>
              <PorValidar
                lista={dados.por_validar}
                podeValidar={hasPermission("finance.validate")}
                podeAnular={hasPermission("finance.register")}
                aGravar={aGravar}
                aoValidar={async (f, data) => {
                  setAGravar(f.invoice_id);
                  try {
                    const r = await validar.mutateAsync({ invoiceId: f.invoice_id, data });
                    toast.success(
                      r?.primeiro_pagamento
                        ? `Pagamento validado. As Operações foram avisadas para criar a obra de ${f.cliente_nome}.`
                        : "Pagamento validado."
                    );
                    return true;
                  } catch (e) {
                    toast.error(mensagemDeErro(e, "Não foi possível validar o pagamento."));
                    return false;
                  } finally {
                    setAGravar(null);
                  }
                }}
                aoAnular={async (f, motivo) => {
                  setAGravar(f.invoice_id);
                  try {
                    await anular.mutateAsync({ invoiceId: f.invoice_id, motivo });
                    toast.success(`Registo da fatura ${f.numero} anulado. A tranche volta a ficar por faturar.`);
                    return true;
                  } catch (e) {
                    toast.error(mensagemDeErro(e, "Não foi possível anular."));
                    return false;
                  } finally {
                    setAGravar(null);
                  }
                }}
                aoAbrirPdf={(caminho) => {
                  abrirPdf(caminho).catch((e) => toast.error(mensagemDeErro(e, "Não foi possível abrir o PDF.")));
                }}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
