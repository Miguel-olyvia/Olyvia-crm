import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaPortal } from "@/components/utilizadores-perfis/AbaPortal";
import { AbaRoles } from "@/components/utilizadores-perfis/AbaRoles";
import { AbaUtilizadores } from "@/components/utilizadores-perfis/AbaUtilizadores";
import { EstadoCargaUtilizadores } from "@/components/utilizadores-perfis/EstadoCargaUtilizadores";
import { usePermissoesPerfis } from "@/components/utilizadores-perfis/hooks/usePermissoesPerfis";
import { useRolesPerfis } from "@/components/utilizadores-perfis/hooks/useRolesPerfis";
import { useUtilizadoresPerfis } from "@/components/utilizadores-perfis/hooks/useUtilizadoresPerfis";
import { resolverSeparador } from "@/components/utilizadores-perfis/separadores";
import { FichaRole } from "@/components/utilizadores-perfis/FichaRole";
import { FichaUtilizador } from "@/components/utilizadores-perfis/FichaUtilizador";
import { FormRole } from "@/components/utilizadores-perfis/FormRole";
import { FormUtilizador } from "@/components/utilizadores-perfis/FormUtilizador";
import { filtrarUtilizadores, utilizadoresDaRole } from "@/components/utilizadores-perfis/logica";
import {
  FILTROS_INICIAIS, type Aberto, type FiltrosUtilizadores, type Separador,
} from "@/components/utilizadores-perfis/tipos";
import { useFormulariosPerfis } from "@/components/utilizadores-perfis/useFormulariosPerfis";
import { useUltimo } from "@/components/utilizadores-perfis/useUltimo";

/**
 * "Utilizadores e perfis": utilizadores, roles e clientes do portal numa só página, sem redireccionamentos.
 * Cada separador pede a sua permissão (utilizadores e portal: users.view; roles: roles.view); quem só tem uma vê só
 * essa, e sem nenhuma a página não mostra nada. O separador vem do `?aba=` e, se for inválido ou não permitido, cai no
 * primeiro permitido. A página não importa a base: só os wrappers de `utilizadores-perfis/hooks/` o fazem.
 * ROLES: ligadas à base por `hooks/useRolesPerfis` (listar, matriz, criar, editar, eliminar, restaurar).
 * UTILIZADORES E PORTAL: ligados à base por `hooks/useUtilizadoresPerfis` (lista, organizações, clientes do portal, as
 * guardas de /users, criar, editar, mudar a role, desativar, reativar e a atividade). Sem dados de exemplo.
 */
const UtilizadoresPerfis = () => {
  const { carregando, permitidos, tem } = usePermissoesPerfis();
  if (carregando || permitidos.length === 0) return null;
  return <ConteudoPerfis permitidos={permitidos} tem={tem} />;
};

interface ConteudoPerfisProps {
  permitidos: Separador[];
  tem: (permissao: string) => boolean;
}

const ConteudoPerfis = ({ permitidos, tem }: ConteudoPerfisProps) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const separador = resolverSeparador(params.get("aba"), permitidos) ?? permitidos[0];
  const setSeparador = (s: Separador) => setParams({ aba: s }, { replace: true });
  const rolesPerfis = useRolesPerfis();
  const { roles } = rolesPerfis;
  const [filtros, setFiltros] = useState<FiltrosUtilizadores>(FILTROS_INICIAIS);
  const [aberto, setAberto] = useState<Aberto>(null);
  const dados = useUtilizadoresPerfis(aberto?.tipo === "utilizador" ? aberto.id : null);
  const { utilizadores, organizacoes, atividade } = dados;
  const autU = dados.autorizacoes;
  const acoesU = dados.acoes;
  const fechar = () => setAberto(null);
  const formularios = useFormulariosPerfis(fechar);

  const visiveis = useMemo(() => filtrarUtilizadores(utilizadores, filtros), [utilizadores, filtros]);
  const idsVisiveis = useMemo(() => visiveis.map((u) => u.id), [visiveis]);
  const { autorizacoes, acoes, catalogo, modelos, contagem } = rolesPerfis;

  // As roles dos vínculos: as da lista de roles e, para as que ela não mostra (sistema, outras organizações), as lidas com os utilizadores.
  const rolesU = useMemo(() => {
    const conhecidas = new Set(roles.map((r) => r.id));
    return [...roles, ...dados.rolesDosVinculos.filter((r) => !conhecidas.has(r.id))];
  }, [roles, dados.rolesDosVinculos]);
  const utilizador = useUltimo(aberto?.tipo === "utilizador" ? dados.aberto : null);
  const ambitosEditaveis = autU.podeGerirRoles;
  const role = useUltimo(
    aberto?.tipo === "role" ? rolesPerfis.lista.find((r) => r.id === aberto.id) ?? roles.find((r) => r.id === aberto.id) ?? null : null,
  );

  const abrirUtilizador = (id: string) => setAberto({ tipo: "utilizador", id });
  const abrirRole = (id: string) => setAberto({ tipo: "role", id });
  const convidar = () => formularios.abrir({ tipo: "utilizador", modo: "criar" });
  const novaRole = () => formularios.abrir({ tipo: "role", modo: "criar" });
  /** Da aba Roles ou da ficha da role: mostra a lista de utilizadores já filtrada por essa role (todos os estados). */
  const verUtilizadores = (roleId: string) => {
    if (!permitidos.includes("utilizadores")) return;
    setFiltros({ ...FILTROS_INICIAIS, estado: "todos", roleId });
    setSeparador("utilizadores");
    fechar();
  };

  const subtitulo = t("usersProfiles.summary", {
    users: utilizadores.filter((u) => u.ativo).length, roles: roles.length, orgs: organizacoes.length,
  });
  const listaPronta = !dados.carregando && !dados.erro && !dados.semOrganizacao;
  const acaoPrimaria = separador === "utilizadores" && autU.podeCriar && listaPronta
    ? { texto: t("usersProfiles.invite"), aoClicar: convidar }
    : separador === "roles" && tem("roles.create") ? { texto: t("usersProfiles.newRole"), aoClicar: novaRole } : null;

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <Tabs value={separador} onValueChange={(v) => { const novo = permitidos.find((x) => x === v); if (novo) setSeparador(novo); }} className="space-y-5">
        <ListaAbas aria-label={t("usersProfiles.tabs.label")}>
          {permitidos.includes("utilizadores") && <Aba value="utilizadores" rotulo={t("usersProfiles.tabs.users")} contador={listaPronta ? utilizadores.length : undefined} />}
          {permitidos.includes("roles") && <Aba value="roles" rotulo={t("usersProfiles.tabs.roles")} contador={rolesPerfis.estado.carregando ? undefined : roles.length} />}
          {permitidos.includes("portal") && <Aba value="portal" rotulo={t("usersProfiles.tabs.portal")} contador={listaPronta ? dados.clientes.length : undefined} />}
        </ListaAbas>
        <CabecalhoPagina
          titulo={t("usersProfiles.title")}
          aviso={null}
          subtitulo={subtitulo}
          acoes={acaoPrimaria && <Button type="button" className="min-h-11" onClick={acaoPrimaria.aoClicar}>{acaoPrimaria.texto}</Button>}
        />
        {permitidos.includes("utilizadores") && (
          <TabsContent value="utilizadores" className="mt-0">
            {listaPronta ? (
              <AbaUtilizadores
                visiveis={visiveis} total={utilizadores.length} roles={rolesU} organizacoes={organizacoes}
                catalogo={catalogo.catalogo} protegidoDe={(u) => !autU.podeEditar(u)} podeConvidar={autU.podeCriar}
                filtros={filtros} aoMudarFiltros={setFiltros} aoLimparFiltros={() => setFiltros(FILTROS_INICIAIS)}
                aoAbrir={abrirUtilizador} aoAbrirRole={abrirRole} aoConvidar={convidar}
              />
            ) : (
              <EstadoCargaUtilizadores carregando={dados.carregando} semOrganizacao={dados.semOrganizacao} erro={dados.erro} aoTentarDeNovo={dados.recarregar} />
            )}
          </TabsContent>
        )}
        {permitidos.includes("roles") && (
          <TabsContent value="roles" className="mt-0">
            <AbaRoles
              roles={rolesPerfis.lista} estado={rolesPerfis.estado} utilizadores={contagem.contagem} permissoes={rolesPerfis.permissoesPorRole}
              eliminadas={rolesPerfis.verEliminadas} aoMudarEliminadas={rolesPerfis.mudarVerEliminadas} aoTentarDeNovo={rolesPerfis.recarregar}
              aoAbrirRole={abrirRole} aoVerUtilizadores={verUtilizadores}
              aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
              podeRestaurar={autorizacoes.podeRestaurar} aoRestaurar={(r) => acoes.restaurar(r.id)}
            />
          </TabsContent>
        )}
        {permitidos.includes("portal") && (
          <TabsContent value="portal" className="mt-0">
            {listaPronta ? (
              <AbaPortal clientes={dados.clientes} organizacoes={organizacoes} />
            ) : (
              <EstadoCargaUtilizadores carregando={dados.carregando} semOrganizacao={dados.semOrganizacao} erro={dados.erro} aoTentarDeNovo={dados.recarregar} />
            )}
          </TabsContent>
        )}
      </Tabs>
      <FichaUtilizador
        utilizador={utilizador} aberto={aberto?.tipo === "utilizador"} roles={rolesU} organizacoes={organizacoes}
        catalogo={catalogo.catalogo} editor={catalogo.editor} idsVisiveis={idsVisiveis}
        podeEditar={!!utilizador && autU.podeEditar(utilizador)} podeDesativar={!!utilizador && autU.podeDesativar(utilizador)}
        podeGerirRoles={autU.podeGerirRoles} atividade={atividade}
        aoFechar={fechar} aoIrPara={abrirUtilizador} aoAbrirRole={abrirRole}
        aoEditar={(id, aba) => formularios.abrir({ tipo: "utilizador", modo: "editar", id, aba })}
        aoDesativar={acoesU.desativar} aoReativar={acoesU.reativar}
        aoMudarRole={(u, membershipId, roleId) => acoesU.mudarRole(u, membershipId, roleId, ambitosEditaveis)}
        aoResultado={formularios.avisar}
      />
      <FichaRole
        role={role} aberto={aberto?.tipo === "role"} visiveis={catalogo.visiveis}
        utilizadores={role ? utilizadoresDaRole(utilizadores, role.id) : []}
        utilizadoresNaBase={role && contagem.disponivel ? contagem.contagem[role.id] ?? 0 : null}
        autorizado={{ criar: autorizacoes.podeCriar, eliminar: autorizacoes.podeEliminar, restaurar: autorizacoes.podeRestaurar }}
        aoFechar={fechar} aoAbrirUtilizador={abrirUtilizador} aoFiltrarUtilizadores={verUtilizadores}
        aoEditar={(id) => formularios.abrir({ tipo: "role", modo: "editar", id })}
        aoDuplicar={(id) => formularios.abrir({ tipo: "role", modo: "duplicar", id })}
        aoEliminar={(r) => acoes.eliminar(r.id, contagem.disponivel ? contagem.contagem[r.id] ?? 0 : null)}
        aoRestaurar={(r) => acoes.restaurar(r.id)}
      />
      <FormRole
        form={formularios.form} roles={roles} catalogo={{ visiveis: catalogo.visiveis, carregando: catalogo.carregando, erro: catalogo.erro }}
        modelos={{ lista: modelos.modelos, erro: modelos.erro }} acoes={acoes} podeEditar={autorizacoes.podeEditar}
        aoFechar={formularios.fechar} aoConcluir={formularios.concluir}
      />
      <FormUtilizador
        form={formularios.form} utilizadores={dados.todos} roles={rolesU} organizacoes={organizacoes}
        catalogo={catalogo.catalogo} editor={catalogo.editor} podeEditar={autU.podeEditar} podeGerirRoles={autU.podeGerirRoles}
        aoGravar={(form, valores, original) => {
          const campos = { nome: valores.nome, email: valores.email, telefone: valores.telefone, posicao: valores.posicao, palavraPasse: valores.palavraPasse };
          if (form.modo === "criar") return acoesU.criar(campos, valores.vinculos);
          if (!original) return Promise.resolve({ ok: false as const, erro: t("usersProfiles.loadError", { message: "" }) });
          return acoesU.atualizar(original, campos, valores.vinculos, ambitosEditaveis);
        }}
        aoFechar={formularios.fechar} aoConcluir={formularios.concluir}
      />
      <p role="status" aria-live="polite" className="sr-only">{formularios.anuncio}</p>
    </div>
  );
};

export default UtilizadoresPerfis;
