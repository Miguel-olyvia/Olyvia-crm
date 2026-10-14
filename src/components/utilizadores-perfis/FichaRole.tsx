import { useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { FichaLateral } from "./FichaLateral";
import { EDITOR_EXEMPLO, PERMISSOES } from "./catalogoExemplo";
import { contarPermissoesPorRole, permissoesVisiveis, podeEliminarRole } from "./logica";
import { SimNao } from "./AbaRoles";
import { Linha } from "./SeparadoresSimples";
import { MatrizPermissoes } from "./MatrizPermissoes";
import { TagEstado } from "./pecas";
import type { Role, Utilizador } from "./tipos";

type AbaRole = "resumo" | "permissoes" | "utilizadores";

interface FichaRoleProps {
  role: Role | null;
  aberto: boolean;
  /** Os utilizadores que têm a role (já calculado pela página). */
  utilizadores: Utilizador[];
  aoFechar: () => void;
  aoAbrirUtilizador: (id: string) => void;
  aoFiltrarUtilizadores: (roleId: string) => void;
}

function SeparadorUtilizadores({ role, utilizadores, aoAbrirUtilizador, aoFiltrarUtilizadores }: Omit<InteriorProps, "aoFechar">) {
  const { t } = useTranslation();
  if (utilizadores.length === 0) return <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.roles.noUsers")}</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/60">
        {utilizadores.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => aoAbrirUtilizador(u.id)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-sm text-left", FOCO)}>
              <AvatarPessoa nome={u.nome} pequeno />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{u.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
              <TagEstado ativo={u.ativo} />
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => aoFiltrarUtilizadores(role.id)}>
        {t("usersProfiles.roles.filterList")}
      </Button>
    </div>
  );
}

type InteriorProps = Omit<FichaRoleProps, "role" | "aberto"> & { role: Role };

function Interior(p: InteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaRole>("resumo");
  const { role } = p;
  const eliminavel = podeEliminarRole(role);
  const nPermissoes = contarPermissoesPorRole([role], permissoesVisiveis(PERMISSOES, EDITOR_EXEMPLO))[role.id];
  const aviso = (chave: string) => toast.info(t(`usersProfiles.example.${chave}`, { name: role.nome }));
  return (
    <>
      <SheetHeader className="flex-row flex-wrap items-start gap-x-3 gap-y-2 space-y-0 p-6 pb-4 text-left">
        <div className="min-w-40 flex-1 space-y-1">
          <SheetTitle tabIndex={-1} className="text-xl outline-none">{role.nome}</SheetTitle>
          <SheetDescription className="text-[15px]">
            {role.sistema ? t("usersProfiles.roles.system") : t("usersProfiles.roles.custom")} · {role.codigo}
          </SheetDescription>
        </div>
        <SheetClose asChild>
          <Button type="button" variant="ghost" className={cn("h-11 w-11 shrink-0 p-0", FOCO)} aria-label={t("usersProfiles.close")}>
            <X aria-hidden="true" />
          </Button>
        </SheetClose>
      </SheetHeader>
      <div className="space-y-2 px-6 pb-3">
        <div role="group" aria-label={t("usersProfiles.actions.label")} className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => aviso("duplicate")}>
            <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("usersProfiles.actions.duplicate")}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={!eliminavel} onClick={() => aviso("delete")}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("usersProfiles.actions.delete")}
          </Button>
        </div>
        {!eliminavel && <p className="text-sm text-muted-foreground">{t("usersProfiles.roles.systemNote")}</p>}
      </div>
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaRole)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbas aria-label={t("usersProfiles.sheet.tabs")} className="px-6">
          <Aba value="resumo" rotulo={t("usersProfiles.sheet.summary")} />
          <Aba value="permissoes" rotulo={t("usersProfiles.sheet.permissions")} contador={nPermissoes} />
          <Aba value="utilizadores" rotulo={t("usersProfiles.sheet.users")} contador={p.utilizadores.length} />
        </ListaAbas>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0">
            <dl>
              <Linha rotulo={t("usersProfiles.roles.col.code")}><span className="font-mono text-xs">{role.codigo}</span></Linha>
              <Linha rotulo={t("usersProfiles.roles.description")}>{role.descricao}</Linha>
              <Linha rotulo={t("usersProfiles.roles.col.signs")}><SimNao sim={role.podeAssinar} /></Linha>
              <Linha rotulo={t("usersProfiles.roles.col.users")}>{p.utilizadores.length}</Linha>
              <Linha rotulo={t("usersProfiles.roles.col.permissions")}>{nPermissoes}</Linha>
            </dl>
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0"><MatrizPermissoes role={role} /></TabsContent>
          <TabsContent value="utilizadores" className="mt-0"><SeparadorUtilizadores {...p} /></TabsContent>
        </div>
      </Tabs>
    </>
  );
}

/** A ficha da role, num painel lateral: resumo, matriz de permissões por módulo e os utilizadores que a têm. */
export function FichaRole({ role, aberto, ...resto }: FichaRoleProps) {
  return (
    <FichaLateral aberto={aberto && role !== null} aoFechar={resto.aoFechar}>
      {role && <Interior key={role.id} role={role} {...resto} />}
    </FichaLateral>
  );
}
