import { useState } from "react";
import { KeyRound, Lock, UserCheck, UserX } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { BotoesNavegacao } from "@/components/pessoas/BotoesNavegacao";
import { vizinhas } from "@/components/pessoas/navegacaoFicha";
import { useTeclasFicha } from "@/components/pessoas/useTeclasFicha";
import { FichaLateral } from "./FichaLateral";
import { aplicarEscolhas, ehProtegido } from "./logica";
import { SeparadorAtividade, SeparadorResumo } from "./SeparadoresSimples";
import { SeparadorPermissoesUtilizador } from "./SeparadorPermissoesUtilizador";
import { SeparadorVinculos } from "./SeparadorVinculos";
import type { Organizacao, Role, Utilizador } from "./tipos";

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
}

type InteriorProps = Omit<FichaUtilizadorProps, "utilizador" | "aberto" | "aoFechar"> & { utilizador: Utilizador };

/** As três ações (só avisam: é um exemplo). Num super administrador ficam desligadas, com a razão por escrito. */
function Acoes({ u, protegido, aoMudarRole }: { u: Utilizador; protegido: boolean; aoMudarRole: () => void }) {
  const { t } = useTranslation();
  const Estado = u.ativo ? UserX : UserCheck;
  const aviso = (chave: string) => toast.info(t(`usersProfiles.example.${chave}`, { name: u.nome }));
  return (
    <div className="space-y-2 px-6 pb-3">
      <div role="group" aria-label={t("usersProfiles.actions.label")} className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={aoMudarRole}>
          {t("usersProfiles.actions.changeRole")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => aviso(u.ativo ? "deactivate" : "reactivate")}>
          <Estado className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {u.ativo ? t("usersProfiles.actions.deactivate") : t("usersProfiles.actions.reactivate")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={protegido} onClick={() => aviso("resetPassword")}>
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
    </div>
  );
}

function Interior({ utilizador, roles, organizacoes, idsVisiveis, aoIrPara, aoAbrirRole }: InteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("resumo");
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const u = aplicarEscolhas(utilizador, escolhas);
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
      <Acoes u={u} protegido={protegido} aoMudarRole={() => setAba("vinculos")} />
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
              aoEscolher={(org, roleId) => setEscolhas((e) => ({ ...e, [org]: roleId }))}
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
