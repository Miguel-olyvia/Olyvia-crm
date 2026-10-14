import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaPortal } from "@/components/utilizadores-perfis/AbaPortal";
import { AbaRoles } from "@/components/utilizadores-perfis/AbaRoles";
import { AbaUtilizadores } from "@/components/utilizadores-perfis/AbaUtilizadores";
import { EDITOR_EXEMPLO, ORGANIZACOES_EXEMPLO, PERMISSOES } from "@/components/utilizadores-perfis/catalogoExemplo";
import { FichaRole } from "@/components/utilizadores-perfis/FichaRole";
import { FichaUtilizador } from "@/components/utilizadores-perfis/FichaUtilizador";
import { FormRole } from "@/components/utilizadores-perfis/FormRole";
import { FormUtilizador } from "@/components/utilizadores-perfis/FormUtilizador";
import {
  contarPermissoesPorRole, contarUtilizadoresPorRole, filtrarUtilizadores, permissoesVisiveis, utilizadoresDaRole,
} from "@/components/utilizadores-perfis/logica";
import { useRoles, useUtilizadores } from "@/components/utilizadores-perfis/perfisStore";
import {
  FILTROS_INICIAIS, type Aberto, type FiltrosUtilizadores, type Separador,
} from "@/components/utilizadores-perfis/tipos";
import { useFormulariosPerfis } from "@/components/utilizadores-perfis/useFormulariosPerfis";
import { useUltimo } from "@/components/utilizadores-perfis/useUltimo";
import { CLIENTES_PORTAL_EXEMPLO } from "@/components/utilizadores-perfis/utilizadoresExemplo";

const ehSeparador = (v: string): v is Separador => v === "utilizadores" || v === "roles" || v === "portal";

/**
 * "Utilizadores e perfis": utilizadores, roles e clientes do portal num só ecrã. Só dados de exemplo em memória, sem
 * qualquer leitura à base (ver `semBase.test.ts` da pasta). Os formulários de role e de utilizador, e as ações de
 * desativar e reativar, mudam as listas EM MEMÓRIA (`perfisStore`) e perdem-se ao recarregar. Não substitui /users nem
 * /roles, que continuam a ser as reais.
 */
const UtilizadoresPerfis = () => {
  const { t } = useTranslation();
  const roles = useRoles();
  const utilizadores = useUtilizadores();
  const [separador, setSeparador] = useState<Separador>("utilizadores");
  const [filtros, setFiltros] = useState<FiltrosUtilizadores>(FILTROS_INICIAIS);
  const [aberto, setAberto] = useState<Aberto>(null);
  const fechar = () => setAberto(null);
  const formularios = useFormulariosPerfis(fechar);

  const visiveis = useMemo(() => filtrarUtilizadores(utilizadores, filtros), [utilizadores, filtros]);
  const idsVisiveis = useMemo(() => visiveis.map((u) => u.id), [visiveis]);
  const utilizadoresPorRole = useMemo(() => contarUtilizadoresPorRole(utilizadores, roles), [utilizadores, roles]);
  const permissoesPorRole = useMemo(
    () => contarPermissoesPorRole(roles, permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO)), [roles],
  );

  const utilizador = useUltimo(aberto?.tipo === "utilizador" ? utilizadores.find((u) => u.id === aberto.id) ?? null : null);
  const role = useUltimo(aberto?.tipo === "role" ? roles.find((r) => r.id === aberto.id) ?? null : null);

  const abrirUtilizador = (id: string) => setAberto({ tipo: "utilizador", id });
  const abrirRole = (id: string) => setAberto({ tipo: "role", id });
  const convidar = () => formularios.abrir({ tipo: "utilizador", modo: "criar" });
  const novaRole = () => formularios.abrir({ tipo: "role", modo: "criar" });
  /** Da aba Roles ou da ficha da role: mostra a lista de utilizadores já filtrada por essa role (todos os estados). */
  const verUtilizadores = (roleId: string) => {
    setFiltros({ ...FILTROS_INICIAIS, estado: "todos", roleId });
    setSeparador("utilizadores");
    fechar();
  };

  const subtitulo = t("usersProfiles.summary", {
    users: utilizadores.filter((u) => u.ativo).length, roles: roles.length, orgs: ORGANIZACOES_EXEMPLO.length,
  });
  const acaoPrimaria = separador === "utilizadores"
    ? { texto: t("usersProfiles.invite"), aoClicar: convidar }
    : separador === "roles" ? { texto: t("usersProfiles.newRole"), aoClicar: novaRole } : null;

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <Tabs value={separador} onValueChange={(v) => { if (ehSeparador(v)) setSeparador(v); }} className="space-y-5">
        <ListaAbas aria-label={t("usersProfiles.tabs.label")}>
          <Aba value="utilizadores" rotulo={t("usersProfiles.tabs.users")} contador={utilizadores.length} />
          <Aba value="roles" rotulo={t("usersProfiles.tabs.roles")} contador={roles.length} />
          <Aba value="portal" rotulo={t("usersProfiles.tabs.portal")} contador={CLIENTES_PORTAL_EXEMPLO.length} />
        </ListaAbas>
        <CabecalhoPagina
          titulo={t("usersProfiles.title")}
          pai={{ to: "/users", texto: t("sidebar.users") }}
          aviso={t("usersProfiles.sample")}
          subtitulo={subtitulo}
          acoes={acaoPrimaria && <Button type="button" className="min-h-11" onClick={acaoPrimaria.aoClicar}>{acaoPrimaria.texto}</Button>}
        />
        <TabsContent value="utilizadores" className="mt-0">
          <AbaUtilizadores
            visiveis={visiveis} total={utilizadores.length} roles={roles} organizacoes={ORGANIZACOES_EXEMPLO}
            filtros={filtros} aoMudarFiltros={setFiltros} aoLimparFiltros={() => setFiltros(FILTROS_INICIAIS)}
            aoAbrir={abrirUtilizador} aoAbrirRole={abrirRole} aoConvidar={convidar}
          />
        </TabsContent>
        <TabsContent value="roles" className="mt-0">
          <AbaRoles
            roles={roles} utilizadores={utilizadoresPorRole} permissoes={permissoesPorRole} aoAbrirRole={abrirRole}
            aoVerUtilizadores={verUtilizadores} aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
          />
        </TabsContent>
        <TabsContent value="portal" className="mt-0">
          <AbaPortal clientes={CLIENTES_PORTAL_EXEMPLO} organizacoes={ORGANIZACOES_EXEMPLO} />
        </TabsContent>
      </Tabs>
      <FichaUtilizador
        utilizador={utilizador} aberto={aberto?.tipo === "utilizador"} roles={roles} organizacoes={ORGANIZACOES_EXEMPLO}
        idsVisiveis={idsVisiveis} aoFechar={fechar} aoIrPara={abrirUtilizador} aoAbrirRole={abrirRole}
        aoEditar={(id, aba) => formularios.abrir({ tipo: "utilizador", modo: "editar", id, aba })} aoResultado={formularios.avisar}
      />
      <FichaRole
        role={role} aberto={aberto?.tipo === "role"} utilizadores={role ? utilizadoresDaRole(utilizadores, role.id) : []}
        aoFechar={fechar} aoAbrirUtilizador={abrirUtilizador} aoFiltrarUtilizadores={verUtilizadores}
        aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
        aoDuplicar={(id) => formularios.abrir({ tipo: "role", modo: "duplicar", id })}
      />
      <FormRole form={formularios.form} roles={roles} aoFechar={formularios.fechar} aoConcluir={formularios.concluir} />
      <FormUtilizador
        form={formularios.form} utilizadores={utilizadores} roles={roles} organizacoes={ORGANIZACOES_EXEMPLO}
        aoFechar={formularios.fechar} aoConcluir={formularios.concluir}
      />
      <p role="status" aria-live="polite" className="sr-only">{formularios.anuncio}</p>
    </div>
  );
};

export default UtilizadoresPerfis;
