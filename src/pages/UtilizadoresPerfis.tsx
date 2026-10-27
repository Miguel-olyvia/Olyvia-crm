import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

// Cada separador carrega só o seu conteúdo: quem tem apenas uma das permissões não descarrega a outra página.
const UsersNew = lazy(() => import("./UsersNew"));
const Roles = lazy(() => import("./Roles"));

const SEPARADORES = [
  { id: "utilizadores", permissao: "users.view", rotulo: "usersProfiles.tabs.users" },
  { id: "roles", permissao: "roles.view", rotulo: "usersProfiles.tabs.roles" },
] as const;

type SeparadorId = (typeof SEPARADORES)[number]["id"];

const aCarregar = (
  <div className="flex items-center justify-center py-12">
    <OlyviaLoader size={32} />
  </div>
);

/**
 * "Utilizadores e perfis": a página de Utilizadores e a de Roles num só ecrã, em separadores.
 * As permissões continuam separadas: cada separador só aparece a quem tem a sua (users.view, roles.view) e as ações
 * dentro de cada um continuam a pedir as suas (users.create, roles.edit...), porque o conteúdo é o das páginas reais.
 * O separador vive no URL (?aba=); um valor inválido ou não permitido cai no primeiro separador permitido.
 * A guarda da rota (users.view OU roles.view) está em App.tsx.
 */
const UtilizadoresPerfis = () => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const [params, setParams] = useSearchParams();

  const permitidos = SEPARADORES.filter((s) => hasPermission(s.permissao));
  if (permitidos.length === 0) return null;

  const pedido = params.get("aba");
  const ativo: SeparadorId = (permitidos.find((s) => s.id === pedido) ?? permitidos[0]).id;

  const mudar = (valor: string) => {
    const novo = permitidos.find((s) => s.id === valor);
    if (!novo) return;
    const proximos = new URLSearchParams(params);
    proximos.set("aba", novo.id);
    setParams(proximos, { replace: true });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{t("usersProfiles.title")}</h1>
      <Tabs value={ativo} onValueChange={mudar} className="space-y-5">
        <ListaAbas aria-label={t("usersProfiles.tabs.label")}>
          {permitidos.map((s) => <Aba key={s.id} value={s.id} rotulo={t(s.rotulo)} />)}
        </ListaAbas>
        {hasPermission("users.view") && (
          <TabsContent value="utilizadores" className="mt-0">
            <Suspense fallback={aCarregar}><UsersNew embedded /></Suspense>
          </TabsContent>
        )}
        {hasPermission("roles.view") && (
          <TabsContent value="roles" className="mt-0">
            <Suspense fallback={aCarregar}><Roles embedded /></Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default UtilizadoresPerfis;
