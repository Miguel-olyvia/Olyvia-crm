import { useState } from "react";
import { KeyRound, Lock, Pencil, UserCheck, UserX } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
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
import { ehProtegido } from "./logica";
import { definirAtivo, mudarRoleVinculo, pedirReposicaoPalavraPasse } from "./perfisStore";
import { SeparadorAtividade, SeparadorResumo } from "./SeparadoresSimples";
import { SeparadorPermissoesUtilizador } from "./SeparadorPermissoesUtilizador";
import { SeparadorVinculos } from "./SeparadorVinculos";
import type { AbaFormUtilizador, Organizacao, Role, Utilizador } from "./tipos";

type AbaFicha = "resumo" | "vinculos" | "permissoes" | "atividade";

interface FichaUtilizadorProps {
  utilizador: Utilizador | null;
  aberto: boolean;
  roles: Role[];
  organizacoes: Organizacao[];
  /** Os ids dos utilizadores visíveis na lista, pela ordem da lista. */
  idsVisiveis: string[];
  aoFechar: () => void;
  aoIrPara: (id: string) => void;
  aoAbrirRole: (id: string) => void;
  /** Abre o formulário de edição, opcionalmente já numa aba. */
  aoEditar: (id: string, aba?: AbaFormUtilizador) => void;
  /** Aviso e anúncio de uma ação que acabou (desativar, reativar). */
  aoResultado: (r: ResultadoForm) => void;
}

type InteriorProps = Omit<FichaUtilizadorProps, "utilizador" | "aberto" | "aoFechar"> & { utilizador: Utilizador };

interface AcoesProps {
  u: Utilizador;
  protegido: boolean;
  aoEditar: (aba?: AbaFormUtilizador) => void;
  aoResultado: (r: ResultadoForm) => void;
}

/** Editar e Mudar role abrem o formulário; Desativar/Reativar pedem confirmação e mudam mesmo o estado (em memória). Repor a palavra-passe pede confirmação e fica registado na atividade (não se envia email). Num super administrador ficam desligadas. */
function Acoes({ u, protegido, aoEditar, aoResultado }: AcoesProps) {
  const { t } = useTranslation();
  const [confirmar, setConfirmar] = useState(false);
  const Estado = u.ativo ? UserX : UserCheck;
  const [reposicao, setReposicao] = useState(false);
  const chave = u.ativo ? "deactivate" : "reactivate";
  const mudarEstado = () => {
    setConfirmar(false);
    definirAtivo(u.id, !u.ativo);
    aoResultado({
      aviso: t(`usersProfiles.form.toast.${u.ativo ? "deactivated" : "reactivated"}`, { name: u.nome }),
      anuncio: t(`usersProfiles.form.announce.${u.ativo ? "deactivated" : "reactivated"}`, { name: u.nome }),
    });
  };
  const pedirReposicao = () => {
    setReposicao(false);
    if (!pedirReposicaoPalavraPasse(u.id)) return;
    aoResultado({
      aviso: t("usersProfiles.form.toast.resetPassword", { name: u.nome }),
      anuncio: t("usersProfiles.form.announce.resetPassword", { name: u.nome }),
    });
  };
  return (
    <div className="space-y-2 px-6 pb-3">
      <div role="group" aria-label={t("usersProfiles.actions.label")} className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => aoEditar()}>
          <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.actions.editUser")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => aoEditar("vinculos")}>
          {t("usersProfiles.actions.changeRole")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => setConfirmar(true)}>
          <Estado className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {u.ativo ? t("usersProfiles.actions.deactivate") : t("usersProfiles.actions.reactivate")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => setReposicao(true)}>
          <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.actions.resetPassword")}
        </Button>
      </div>
      {protegido && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("usersProfiles.protectedNote")}
        </p>
      )}
      <ConfirmarAcao
        aberto={confirmar} titulo={t(`usersProfiles.form.confirm.${chave}.title`, { name: u.nome })}
        texto={t(`usersProfiles.form.confirm.${chave}.text`)} confirmar={t(`usersProfiles.form.confirm.${chave}.yes`)}
        aoConfirmar={mudarEstado} aoCancelar={() => setConfirmar(false)}
      />
      <ConfirmarAcao
        aberto={reposicao} titulo={t("usersProfiles.form.confirm.resetPassword.title", { name: u.nome })}
        texto={t("usersProfiles.form.confirm.resetPassword.text")} confirmar={t("usersProfiles.form.confirm.resetPassword.yes")}
        aoConfirmar={pedirReposicao} aoCancelar={() => setReposicao(false)}
      />
    </div>
  );
}

function Interior({ utilizador, roles, organizacoes, idsVisiveis, aoIrPara, aoAbrirRole, aoEditar, aoResultado }: InteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const u = utilizador;
  const protegido = ehProtegido(utilizador, roles);
  const viz = vizinhas(idsVisiveis, utilizador.id);
  const ir = useTeclasFicha(true, viz, utilizador.id, aoIrPara);
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
      <Acoes u={u} protegido={protegido} aoEditar={(aba) => aoEditar(u.id, aba)} aoResultado={aoResultado} />
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFicha)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbas aria-label={t("usersProfiles.sheet.tabs")} className="px-6">
          <Aba value="resumo" rotulo={t("usersProfiles.sheet.summary")} />
          <Aba value="vinculos" rotulo={t("usersProfiles.sheet.links")} contador={u.vinculos.length} />
          <Aba value="permissoes" rotulo={t("usersProfiles.sheet.permissions")} />
          <Aba value="atividade" rotulo={t("usersProfiles.sheet.activity")} />
        </ListaAbas>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0"><SeparadorResumo utilizador={u} roles={roles} organizacoes={organizacoes} aoAbrirRole={aoAbrirRole} /></TabsContent>
          <TabsContent value="vinculos" className="mt-0">
            <SeparadorVinculos
              utilizador={u} roles={roles} organizacoes={organizacoes} protegido={protegido}
              aoEscolher={(org, roleId) => mudarRoleVinculo(u.id, org, roleId)}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0"><SeparadorPermissoesUtilizador utilizador={u} roles={roles} aoAbrirRole={aoAbrirRole} /></TabsContent>
          <TabsContent value="atividade" className="mt-0"><SeparadorAtividade utilizador={u} /></TabsContent>
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
