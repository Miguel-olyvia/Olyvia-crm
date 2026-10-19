import { useMemo, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { FOCO } from "@/components/negocio-metas/estilos";
import { FontePessoasContext, type FontePessoas, type MomentoGanho } from "@/hooks/pessoas/useFontePessoas";
import { useNegociosAtivos, useRepetirNegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";

const MOMENTOS: readonly MomentoGanho[] = ["manual", "proposta_aceite", "contrato_assinado"];

/**
 * A guarda da rota /pessoas: só monta a página (em modo real) nas organizações com o interruptor ligado.
 * A carregar mostra o loader (num contentor status com texto); só bloqueia com erro (role alert, «Tentar de novo»)
 * quando nunca houve resposta válida, e nesse caso NÃO redireciona; com dados antigos a página mantém-se.
 * Sem interruptor (ou sem organização) vai para /leads.
 */
export function PessoasRota({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const negocios = useNegociosAtivos();
  const repetir = useRepetirNegociosAtivos();
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const momentoGanho = MOMENTOS.find((m) => m === negocios.momentoGanho) ?? null;
  const fonte = useMemo<FontePessoas | null>(
    () => (organizationId ? { modo: "real", organizationId, momentoGanho } : null),
    [organizationId, momentoGanho],
  );

  if (negocios.isLoading) {
    // O loader partilhado tem alt fixo em português e anima sem parar: aqui a imagem fica escondida
    // do leitor de ecrã e o texto traduzido é que se anuncia.
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-8">
        <span className="sr-only">{t("pessoasPagina.real.loading")}</span>
        <div aria-hidden="true"><OlyviaLoader size={40} /></div>
      </div>
    );
  }
  if (negocios.erroSemResposta) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 p-8">
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.real.routeError")}</p>
        <Button
          type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={repetir}
          disabled={negocios.aRepetir} aria-busy={negocios.aRepetir}
        >
          {t("pessoasPagina.real.retry")}
        </Button>
      </div>
    );
  }
  if (!negocios.ativo || !fonte) return <Navigate to="/leads" replace />;
  return <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>;
}
