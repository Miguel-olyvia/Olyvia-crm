import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaPortal } from "@/components/utilizadores-perfis/AbaPortal";
import { AbaRoles } from "@/components/utilizadores-perfis/AbaRoles";
import { AbaUtilizadores } from "@/components/utilizadores-perfis/AbaUtilizadores";
import { EDITOR_EXEMPLO, ORGANIZACOES_EXEMPLO, PERMISSOES, ROLES_EXEMPLO } from "@/components/utilizadores-perfis/catalogoExemplo";
import { FichaRole } from "@/components/utilizadores-perfis/FichaRole";
import { useUltimo } from "@/components/utilizadores-perfis/useUltimo";
import { FichaUtilizador } from "@/components/utilizadores-perfis/FichaUtilizador";
import {
  contarPermissoesPorRole, contarUtilizadoresPorRole, filtrarUtilizadores, permissoesVisiveis, utilizadoresDaRole,
} from "@/components/utilizadores-perfis/logica";
import {
  FILTROS_INICIAIS, type Aberto, type FiltrosUtilizadores, type Separador,
} from "@/components/utilizadores-perfis/tipos";
import { CLIENTES_PORTAL_EXEMPLO, UTILIZADORES_EXEMPLO } from "@/components/utilizadores-perfis/utilizadoresExemplo";

const ehSeparador = (v: string): v is Separador => v === "utilizadores" || v === "roles" || v === "portal";

/**
 * "Utilizadores e perfis": utilizadores, roles e clientes do portal num só ecrã. Só dados de exemplo em memória, sem
 * qualquer leitura à base (ver `semBase.test.ts` da pasta). Não substitui /users nem /roles, que continuam a ser as reais.
 */
const UtilizadoresPerfis = () => {
  const { t } = useTranslation();
  const [separador, setSeparador] = useState<Separador>("utilizadores");
  const [filtros, setFiltros] = useState<FiltrosUtilizadores>(FILTROS_INICIAIS);
  const [aberto, setAberto] = useState<Aberto>(null);

  const visiveis = useMemo(() => filtrarUtilizadores(UTILIZADORES_EXEMPLO, filtros), [filtros]);
  const idsVisiveis = useMemo(() => visiveis.map((u) => u.id), [visiveis]);
  const utilizadoresPorRole = useMemo(() => contarUtilizadoresPorRole(UTILIZADORES_EXEMPLO, ROLES_EXEMPLO), []);
  const permissoesPorRole = useMemo(
    () => contarPermissoesPorRole(ROLES_EXEMPLO, permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO)), [],
  );

  const utilizador = useUltimo(aberto?.tipo === "utilizador" ? UTILIZADORES_EXEMPLO.find((u) => u.id === aberto.id) ?? null : null);
  const role = useUltimo(aberto?.tipo === "role" ? ROLES_EXEMPLO.find((r) => r.id === aberto.id) ?? null : null);

  const abrirUtilizador = (id: string) => setAberto({ tipo: "utilizador", id });
  const abrirRole = (id: string) => setAberto({ tipo: "role", id });
  const fechar = () => setAberto(null);
  /** Da aba Roles ou da ficha da role: mostra a lista de utilizadores já filtrada por essa role (todos os estados). */
  const verUtilizadores = (roleId: string) => {
    setFiltros({ ...FILTROS_INICIAIS, estado: "todos", roleId });
    setSeparador("utilizadores");
    fechar();
  };

  const subtitulo = t("usersProfiles.summary", {
    users: UTILIZADORES_EXEMPLO.filter((u) => u.ativo).length, roles: ROLES_EXEMPLO.length, orgs: ORGANIZACOES_EXEMPLO.length,
  });
  const acaoPrimaria = separador === "utilizadores"
    ? { texto: t("usersProfiles.invite"), aviso: t("usersProfiles.example.invite") }
    : separador === "roles" ? { texto: t("usersProfiles.newRole"), aviso: t("usersProfiles.example.newRole") } : null;

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <Tabs value={separador} onValueChange={(v) => { if (ehSeparador(v)) setSeparador(v); }} className="space-y-5">
        <ListaAbas aria-label={t("usersProfiles.tabs.label")}>
          <Aba value="utilizadores" rotulo={t("usersProfiles.tabs.users")} contador={UTILIZADORES_EXEMPLO.length} />
          <Aba value="roles" rotulo={t("usersProfiles.tabs.roles")} contador={ROLES_EXEMPLO.length} />
          <Aba value="portal" rotulo={t("usersProfiles.tabs.portal")} contador={CLIENTES_PORTAL_EXEMPLO.length} />
        </ListaAbas>
        <CabecalhoPagina
          titulo={t("usersProfiles.title")}
          pai={{ to: "/users", texto: t("sidebar.users") }}
          aviso={t("usersProfiles.sample")}
          subtitulo={subtitulo}
          acoes={acaoPrimaria && <Button type="button" className="min-h-11" onClick={() => toast.info(acaoPrimaria.aviso)}>{acaoPrimaria.texto}</Button>}
        />
        <TabsContent value="utilizadores" className="mt-0">
          <AbaUtilizadores
            visiveis={visiveis} total={UTILIZADORES_EXEMPLO.length} roles={ROLES_EXEMPLO} organizacoes={ORGANIZACOES_EXEMPLO}
            filtros={filtros} aoMudarFiltros={setFiltros} aoLimparFiltros={() => setFiltros(FILTROS_INICIAIS)}
            aoAbrir={abrirUtilizador} aoAbrirRole={abrirRole} aoConvidar={() => toast.info(t("usersProfiles.example.invite"))}
          />
        </TabsContent>
        <TabsContent value="roles" className="mt-0">
          <AbaRoles
            roles={ROLES_EXEMPLO} utilizadores={utilizadoresPorRole} permissoes={permissoesPorRole}
            aoAbrirRole={abrirRole} aoVerUtilizadores={verUtilizadores}
          />
        </TabsContent>
        <TabsContent value="portal" className="mt-0">
          <AbaPortal clientes={CLIENTES_PORTAL_EXEMPLO} organizacoes={ORGANIZACOES_EXEMPLO} />
        </TabsContent>
      </Tabs>
      <FichaUtilizador
        utilizador={utilizador} aberto={aberto?.tipo === "utilizador"} roles={ROLES_EXEMPLO} organizacoes={ORGANIZACOES_EXEMPLO}
        idsVisiveis={idsVisiveis} aoFechar={fechar} aoIrPara={abrirUtilizador} aoAbrirRole={abrirRole}
      />
      <FichaRole
        role={role} aberto={aberto?.tipo === "role"} utilizadores={role ? utilizadoresDaRole(UTILIZADORES_EXEMPLO, role.id) : []}
        aoFechar={fechar} aoAbrirUtilizador={abrirUtilizador} aoFiltrarUtilizadores={verUtilizadores}
      />
    </div>
  );
};

export default UtilizadoresPerfis;
