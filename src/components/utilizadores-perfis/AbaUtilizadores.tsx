import { SearchX, UserX } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarraFiltros } from "./BarraFiltros";
import { LinhaUtilizador } from "./LinhaUtilizador";
import type { FiltrosUtilizadores, Organizacao, Permissao, Role, Utilizador } from "./tipos";

interface AbaUtilizadoresProps {
  visiveis: Utilizador[];
  total: number;
  roles: Role[];
  organizacoes: Organizacao[];
  catalogo: Permissao[];
  /** Quem vê não pode alterar este utilizador (mostra o cadeado). */
  protegidoDe: (u: Utilizador) => boolean;
  /** Pode convidar (users.create): sem isto o vazio não oferece o botão. */
  podeConvidar: boolean;
  filtros: FiltrosUtilizadores;
  aoMudarFiltros: (f: FiltrosUtilizadores) => void;
  aoLimparFiltros: () => void;
  aoAbrir: (id: string) => void;
  aoAbrirRole: (id: string) => void;
  aoConvidar: () => void;
}

const CABECA = "h-11 px-3 text-xs font-medium text-muted-foreground";

function SemResultados({ total, podeConvidar, aoLimpar, aoConvidar }: { total: number; podeConvidar: boolean; aoLimpar: () => void; aoConvidar: () => void }) {
  const { t } = useTranslation();
  const Icone = total === 0 ? UserX : SearchX;
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
      <Icone className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium text-foreground">{total === 0 ? t("usersProfiles.empty.title") : t("usersProfiles.noResults.title")}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {total === 0 ? t("usersProfiles.empty.text") : t("usersProfiles.noResults.text")}
      </p>
      {(total > 0 || podeConvidar) && (
        <Button type="button" variant="outline" className="min-h-11" onClick={total === 0 ? aoConvidar : aoLimpar}>
          {total === 0 ? t("usersProfiles.invite") : t("usersProfiles.filters.clear")}
        </Button>
      )}
    </div>
  );
}

/** A lista: filtros por cima, tabela compacta por baixo (Âmbito e Último acesso saem em ecrãs estreitos). */
export function AbaUtilizadores(p: AbaUtilizadoresProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <BarraFiltros filtros={p.filtros} roles={p.roles} organizacoes={p.organizacoes} aoMudar={p.aoMudarFiltros} aoLimpar={p.aoLimparFiltros} />
      <p role="status" className="text-sm text-muted-foreground">
        {t("usersProfiles.count", { shown: p.visiveis.length, total: p.total })}
      </p>
      {p.visiveis.length === 0 ? (
        <SemResultados total={p.total} podeConvidar={p.podeConvidar} aoLimpar={p.aoLimparFiltros} aoConvidar={p.aoConvidar} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={CABECA}>{t("usersProfiles.col.user")}</TableHead>
                <TableHead className={CABECA}>{t("usersProfiles.col.links")}</TableHead>
                <TableHead className={`${CABECA} hidden md:table-cell`}>{t("usersProfiles.col.scope")}</TableHead>
                <TableHead className={CABECA}>{t("usersProfiles.col.state")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.visiveis.map((u) => (
                <LinhaUtilizador key={u.id} utilizador={u} roles={p.roles} organizacoes={p.organizacoes} catalogo={p.catalogo} protegido={p.protegidoDe(u)} aoAbrir={p.aoAbrir} aoAbrirRole={p.aoAbrirRole} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
