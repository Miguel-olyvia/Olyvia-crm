// A primeira página (/home), 28/10: numa organização com o Negócio da Emylia ligado (negocio_workflow_config) e para quem vê Pessoas, é o
// Hoje do protótipo V1 (o /negocios aberto no Hoje: o de cada papel, o do técnico, a agenda); nas outras, o Hoje do CRM de sempre.
import { lazy, Suspense } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";

const Home = lazy(() => import("./Home"));
const NegociosEmylia = lazy(() => import("./NegociosEmylia"));
const aCarregar = <div className="p-6 text-muted-foreground">A carregar…</div>;

export default function HojeInicio() {
  const { hasPermission, loading } = usePermissions();
  const negocios = useNegociosAtivos({ habilitado: !loading && hasPermission("pessoas.view") });
  if (loading || negocios.isLoading) return aCarregar;
  return <Suspense fallback={aCarregar}>{negocios.ativo && hasPermission("pessoas.view") ? <NegociosEmylia vistaInicial="hoje" /> : <Home />}</Suspense>;
}
