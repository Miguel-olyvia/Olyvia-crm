import { useState } from "react";
import { Lock, Pencil, UserCheck, UserX } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { BotoesNavegacao } from "@/components/pessoas/BotoesNavegacao";
import { vizinhas } from "@/components/pessoas/navegacaoFicha";
import { useTeclasFicha } from "@/components/pessoas/useTeclasFicha";
import { ConfirmarAcao } from "./ConfirmarAcao";
import { FichaLateral } from "./FichaLateral";
import type { ResultadoForm } from "./FormRole";
import type { EstadoAtividade } from "./historicoUtilizador";
import type { Editor } from "./logica";
import { SeparadorAtividade, SeparadorResumo } from "./SeparadoresSimples";
import { SeparadorPermissoesUtilizador } from "./SeparadorPermissoesUtilizador";
import { SeparadorVinculos } from "./SeparadorVinculos";
import type { AbaFormUtilizador, Organizacao, Permissao, ResultadoMutacao, Role, Utilizador } from "./tipos";

type AbaFicha = "resumo" | "vinculos" | "permissoes" | "atividade";

interface FichaUtilizadorProps {
  utilizador: Utilizador | null;
  aberto: boolean;
  roles: Role[];
  organizacoes: Organizacao[];
  catalogo: Permissao[];
  editor: Editor;
  /** Os ids dos utilizadores visíveis na lista, pela ordem da lista. */
  idsVisiveis: string[];
  /** users.edit com âmbito (ou o próprio) e sem as proteções de /users. */
  podeEditar: boolean;
  /** users.delete com âmbito, nunca o próprio nem as contas protegidas. */
  podeDesativar: boolean;
  /** users.manage_roles: sem ele a role dos vínculos só se vê. */
  podeGerirRoles: boolean;
  atividade: EstadoAtividade;
  aoFechar: () => void;
  aoIrPara: (id: string) => void;
  aoAbrirRole: (id: string) => void;
  /** Abre o formulário de edição, opcionalmente já numa aba. */
  aoEditar: (id: string, aba?: AbaFormUtilizador) => void;
  aoDesativar: (u: Utilizador) => Promise<ResultadoMutacao>;
  aoReativar: (u: Utilizador) => Promise<ResultadoMutacao>;
  aoMudarRole: (u: Utilizador, membershipId: string, roleId: string) => Promise<ResultadoMutacao>;
  /** Aviso e anúncio de uma ação que acabou bem (desativar, reativar, mudar a role). */
  aoResultado: (r: ResultadoForm) => void;
}

type InteriorProps = Omit<FichaUtilizadorProps, "utilizador" | "aberto" | "aoFechar"> & { utilizador: Utilizador };

interface AcoesProps {
  u: Utilizador;
  podeEditar: boolean;
  podeDesativar: boolean;
  podeGerirRoles: boolean;
  aoEditar: (aba?: AbaFormUtilizador) => void;
  aoDesativar: FichaUtilizadorProps["aoDesativar"];
  aoReativar: FichaUtilizadorProps["aoReativar"];
  aoResultado: (r: ResultadoForm) => void;
}

/** Editar e Mudar role abrem o formulário; Desativar/Reativar pedem confirmação e mudam mesmo o estado na base (revogam e repõem o login). O erro nunca se engole: aparece num aviso. */
function Acoes({ u, podeEditar, podeDesativar, podeGerirRoles, aoEditar, aoDesativar, aoReativar, aoResultado }: AcoesProps) {
  const { t } = useTranslation();
  const [confirmar, setConfirmar] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const Estado = u.ativo ? UserX : UserCheck;
  const chave = u.ativo ? "deactivate" : "reactivate";
  const mudarEstado = async () => {
    setAGravar(true);
    const r = await (u.ativo ? aoDesativar(u) : aoReativar(u));
    setAGravar(false);
    setConfirmar(false);
    if (!r.ok) { toast.error(r.erro); return; }
    aoResultado({
      aviso: t(`usersProfiles.form.toast.${u.ativo ? "deactivated" : "reactivated"}`, { name: u.nome }),
      anuncio: t(`usersProfiles.form.announce.${u.ativo ? "deactivated" : "reactivated"}`, { name: u.nome }),
    });
  };
  return (
    <div className="space-y-2 px-6 pb-3">
      <div role="group" aria-label={t("usersProfiles.actions.label")} className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={!podeEditar} onClick={() => aoEditar()}>
          <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.actions.editUser")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!podeEditar || !podeGerirRoles} onClick={() => aoEditar("vinculos")}>
          {t("usersProfiles.actions.changeRole")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!podeDesativar} onClick={() => setConfirmar(true)}>
          <Estado className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {u.ativo ? t("usersProfiles.actions.deactivate") : t("usersProfiles.actions.reactivate")}
        </Button>
      </div>
      {!podeEditar && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("usersProfiles.protectedNote")}
        </p>
      )}
      <ConfirmarAcao
        aberto={confirmar} titulo={t(`usersProfiles.form.confirm.${chave}.title`, { name: u.nome })}
        texto={t(`usersProfiles.form.confirm.${chave}.text`)} confirmar={t(`usersProfiles.form.confirm.${chave}.yes`)}
        aoConfirmar={() => { if (!aGravar) void mudarEstado(); }} aoCancelar={() => setConfirmar(false)}
      />
    </div>
  );
}

function Interior(p: InteriorProps) {
  const { utilizador, roles, organizacoes, catalogo, editor, idsVisiveis, aoIrPara, aoAbrirRole, aoEditar, aoResultado, aoMudarRole } = p;
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const u = utilizador;
  const viz = vizinhas(idsVisiveis, utilizador.id);
  const ir = useTeclasFicha(true, viz, utilizador.id, aoIrPara);
  const mudarRole = async (membershipId: string, roleId: string) => {
    const r = await aoMudarRole(u, membershipId, roleId);
    if (!r.ok) { toast.error(r.erro); return; }
    const nome = roles.find((x) => x.id === roleId)?.nome ?? "";
    const org = organizacoes.find((o) => o.id === u.vinculos.find((v) => v.membershipId === membershipId)?.organizacaoId)?.nome ?? "";
    aoResultado({
      aviso: t("usersProfiles.form.toast.roleChanged", { name: u.nome, role: nome, org }),
      anuncio: t("usersProfiles.form.announce.roleChanged", { name: u.nome, role: nome, org }),
    });
  };
  return (
    <>
      <SheetHeader className="flex-row flex-wrap items-start gap-x-3 gap-y-2 space-y-0 p-6 pb-4 text-left">
        <AvatarPessoa nome={u.nome} />
        <div className="min-w-40 flex-1 space-y-1">
          <SheetTitle tabIndex={-1} className="text-xl outline-none">{u.nome}</SheetTitle>
          <SheetDescription className="text-[15px]">{u.email}</SheetDescription>
        </div>
        <BotoesNavegacao vizinhas={viz} aoIr={(id, qual) => ir(id, qual)} />
      </SheetHeader>
      <Acoes
        u={u} podeEditar={p.podeEditar} podeDesativar={p.podeDesativar} podeGerirRoles={p.podeGerirRoles}
        aoEditar={(a) => aoEditar(u.id, a)} aoDesativar={p.aoDesativar} aoReativar={p.aoReativar} aoResultado={aoResultado}
      />
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFicha)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbas aria-label={t("usersProfiles.sheet.tabs")} className="px-6">
          <Aba value="resumo" rotulo={t("usersProfiles.sheet.summary")} />
          <Aba value="vinculos" rotulo={t("usersProfiles.sheet.links")} contador={u.vinculos.length} />
          <Aba value="permissoes" rotulo={t("usersProfiles.sheet.permissions")} />
          <Aba value="atividade" rotulo={t("usersProfiles.sheet.activity")} />
        </ListaAbas>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0">
            <SeparadorResumo utilizador={u} roles={roles} organizacoes={organizacoes} catalogo={catalogo} aoAbrirRole={aoAbrirRole} />
          </TabsContent>
          <TabsContent value="vinculos" className="mt-0">
            <SeparadorVinculos
              utilizador={u} roles={roles} organizacoes={organizacoes} catalogo={catalogo} editor={editor}
              somenteLeitura={!p.podeEditar || !p.podeGerirRoles} aoEscolher={mudarRole}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0">
            <SeparadorPermissoesUtilizador utilizador={u} roles={roles} catalogo={catalogo} editor={editor} aoAbrirRole={aoAbrirRole} />
          </TabsContent>
          <TabsContent value="atividade" className="mt-0"><SeparadorAtividade atividade={p.atividade} /></TabsContent>
        </div>
      </Tabs>
    </>
  );
}

/** A ficha do utilizador, num painel lateral com navegação anterior/seguinte, ações e quatro abas. */
export function FichaUtilizador({ utilizador, aberto, aoFechar, ...resto }: FichaUtilizadorProps) {
  return (
    <FichaLateral aberto={aberto && utilizador !== null} aoFechar={aoFechar}>
      {utilizador && <Interior key={utilizador.id} utilizador={utilizador} {...resto} />}
    </FichaLateral>
  );
}
