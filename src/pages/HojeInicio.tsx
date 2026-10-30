// A primeira página (/home), 28/10: numa organização com o Negócio da Emylia ligado (negocio_workflow_config) e para quem vê Pessoas, é o
// Hoje do protótipo V1 (o /negocios aberto no Hoje: o de cada papel, o do técnico, a agenda); nas outras, o Hoje do CRM de sempre.
import { lazy, Suspense } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";
import { useTemPapelNegocio } from "@/hooks/pessoas/useTemPapelNegocio";

const Home = lazy(() => import("./Home"));
const NegociosEmylia = lazy(() => import("./NegociosEmylia"));
const aCarregar = <div className="p-6 text-muted-foreground">A carregar…</div>;

export default function HojeInicio() {
  const { hasPermission, loading } = usePermissions();
  const negocios = useNegociosAtivos({ habilitado: !loading && hasPermission("pessoas.view") });
  // 30/10 (20270101340000): quem tem um papel no Negócio pelo RH (o técnico, o Financeiro…) também abre no Hoje, sem pessoas.view
  const papel = useTemPapelNegocio({ habilitado: !loading && !hasPermission("pessoas.view") });
  if (loading || negocios.isLoading || papel.loading) return aCarregar;
  const hojeV1 = (negocios.ativo && hasPermission("pessoas.view")) || papel.tem;
  return <Suspense fallback={aCarregar}>{hojeV1 ? <NegociosEmylia vistaInicial="hoje" /> : <Home />}</Suspense>;
}
