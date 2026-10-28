import { useState } from "react";
import { Copy, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { ConfirmarAcao } from "./ConfirmarAcao";
import { FichaLateral } from "./FichaLateral";
import { contarPermissoesPorRole } from "./logica";
import { SimNao } from "./AbaRoles";
import { Linha } from "./SeparadoresSimples";
import { MatrizPermissoes } from "./MatrizPermissoes";
import { TagEstado } from "./pecas";
import type { Permissao, ResultadoMutacao, Role, Utilizador } from "./tipos";

type AbaRole = "resumo" | "permissoes" | "utilizadores";

/** O que quem está ligado pode fazer a esta role (decidido pelos hooks de autorização, com as regras de Roles.tsx). */
export interface PermissoesDaRole {
  criar: boolean;
  eliminar: (r: Role) => boolean;
  restaurar: (r: Role) => boolean;
}

interface FichaRoleProps {
  role: Role | null;
  aberto: boolean;
  /** As permissões que quem edita pode ver (da base). */
  visiveis: Permissao[];
  /** Os utilizadores que têm a role (já calculado pela página). */
  utilizadores: Utilizador[];
  /** Quantos utilizadores ativos tem a role, lido da base; `null` se não foi possível (então não se elimina). */
  utilizadoresNaBase: number | null;
  autorizado: PermissoesDaRole;
  aoFechar: () => void;
  aoAbrirUtilizador: (id: string) => void;
  aoFiltrarUtilizadores: (roleId: string) => void;
  /** Abre o formulário de edição (uma role de sistema, ou sem permissão, abre só para ver). */
  aoEditar: (roleId: string) => void;
  /** Abre o formulário com os dados desta role e "(cópia)" no nome. */
  aoDuplicar: (roleId: string) => void;
  /** Elimina (soft delete) na base; devolve o erro real se falhar. */
  aoEliminar: (role: Role) => Promise<ResultadoMutacao>;
  aoRestaurar: (role: Role) => Promise<ResultadoMutacao>;
}

function SeparadorUtilizadores({ role, utilizadores, aoAbrirUtilizador, aoFiltrarUtilizadores }: Pick<InteriorProps, "role" | "utilizadores" | "aoAbrirUtilizador" | "aoFiltrarUtilizadores">) {
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
              <TagEstado ativo={u.ativo} convidado={u.convidado} />
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

function Acoes({ p, aOcupar, aoPedirEliminar, aoRestaurar }: { p: InteriorProps; aOcupar: boolean; aoPedirEliminar: () => void; aoRestaurar: () => void }) {
  const { t } = useTranslation();
  const { role, autorizado } = p;
  if (role.eliminada) {
    return autorizado.restaurar(role) ? (
      <Button type="button" variant="outline" className="min-h-11" disabled={aOcupar} onClick={aoRestaurar}>
        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t("usersProfiles.roles.restore")}
      </Button>
    ) : null;
  }
  const eliminavel = autorizado.eliminar(role);
  const bloqueadoPorUso = p.utilizadoresNaBase === null || p.utilizadoresNaBase > 0;
  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => p.aoEditar(role.id)}>
        <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t("usersProfiles.actions.edit")}
      </Button>
      {autorizado.criar && (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => p.aoDuplicar(role.id)}>
          <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.actions.duplicate")}
        </Button>
      )}
      {(role.sistema || eliminavel) && (
        <Button type="button" variant="outline" className="min-h-11" disabled={!eliminavel || bloqueadoPorUso || aOcupar} onClick={aoPedirEliminar}>
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.actions.delete")}
        </Button>
      )}
    </>
  );
}

function Interior(p: InteriorProps) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaRole>("resumo");
  const [confirmar, setConfirmar] = useState(false);
  const [aOcupar, setAOcupar] = useState(false);
  const { role } = p;
  const nPermissoes = contarPermissoesPorRole([role], p.visiveis)[role.id];
  const nUtilizadores = p.utilizadoresNaBase ?? p.utilizadores.length;
  const eliminavel = p.autorizado.eliminar(role);

  const correr = async (acao: () => Promise<ResultadoMutacao>, aviso: string) => {
    setAOcupar(true);
    const r = await acao();
    setAOcupar(false);
    if (!r.ok) { toast.error(r.erro); return; }
    toast.success(aviso);
    p.aoFechar();
  };
  const eliminar = () => { setConfirmar(false); void correr(() => p.aoEliminar(role), t("usersProfiles.roles.deleteConfirm.done", { name: role.nome })); };
  const restaurar = () => void correr(() => p.aoRestaurar(role), t("usersProfiles.roles.restore.done", { name: role.nome }));

  return (
    <>
      <SheetHeader className="flex-row flex-wrap items-start gap-x-3 gap-y-2 space-y-0 p-6 pb-4 text-left">
        <div className="min-w-40 flex-1 space-y-1">
          <SheetTitle tabIndex={-1} className="text-xl outline-none">{role.nome}</SheetTitle>
          <SheetDescription className="text-[15px]">
            {role.sistema ? t("usersProfiles.roles.system") : t("usersProfiles.roles.custom")} · {role.codigo}
            {role.eliminada && ` · ${t("usersProfiles.roles.deletedTag")}`}
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
          <Acoes p={p} aOcupar={aOcupar} aoPedirEliminar={() => setConfirmar(true)} aoRestaurar={restaurar} />
        </div>
        {!role.eliminada && role.sistema && <p className="text-sm text-muted-foreground">{t("usersProfiles.roles.systemNote")}</p>}
        {!role.eliminada && eliminavel && p.utilizadoresNaBase === null && <p role="alert" className="text-sm text-destructive">{t("usersProfiles.roles.countUnavailable")}</p>}
        {!role.eliminada && eliminavel && (p.utilizadoresNaBase ?? 0) > 0 && <p className="text-sm text-muted-foreground">{t("usersProfiles.roles.inUseNote")}</p>}
        <ConfirmarAcao
          aberto={confirmar} titulo={t("usersProfiles.roles.deleteConfirm.title", { name: role.nome })}
          texto={t("usersProfiles.roles.deleteConfirm.text")} confirmar={t("usersProfiles.roles.deleteConfirm.yes")}
          aoConfirmar={eliminar} aoCancelar={() => setConfirmar(false)}
        />
      </div>
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaRole)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbas aria-label={t("usersProfiles.sheet.tabs")} className="px-6">
          <Aba value="resumo" rotulo={t("usersProfiles.sheet.summary")} />
          <Aba value="permissoes" rotulo={t("usersProfiles.sheet.permissions")} contador={nPermissoes} />
          <Aba value="utilizadores" rotulo={t("usersProfiles.sheet.users")} contador={nUtilizadores} />
        </ListaAbas>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="resumo" className="mt-0">
            <dl>
              <Linha rotulo={t("usersProfiles.roles.col.code")}><span className="font-mono text-xs">{role.codigo}</span></Linha>
              <Linha rotulo={t("usersProfiles.roles.description")}>{role.descricao}</Linha>
              <Linha rotulo={t("usersProfiles.roles.col.signs")}><SimNao sim={role.podeAssinar} /></Linha>
              <Linha rotulo={t("usersProfiles.roles.col.users")}>{nUtilizadores}</Linha>
              <Linha rotulo={t("usersProfiles.roles.col.permissions")}>{nPermissoes}</Linha>
            </dl>
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0"><MatrizPermissoes role={role} visiveis={p.visiveis} /></TabsContent>
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
