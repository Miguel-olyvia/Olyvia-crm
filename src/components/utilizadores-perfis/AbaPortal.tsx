import { useTranslation } from "@/hooks/useTranslation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TagEstado } from "./pecas";
import type { ClientePortal, Organizacao } from "./tipos";

const CABECA = "h-11 px-3 text-xs font-medium text-muted-foreground";
const CELULA = "px-3 py-2 align-middle text-sm";

/** Clientes do portal (utilizadores com o vínculo de cliente): lista simples, só para consulta, como no separador de clientes de /users. */
export function AbaPortal({ clientes, organizacoes }: { clientes: ClientePortal[]; organizacoes: Organizacao[] }) {
  const { t } = useTranslation();
  if (clientes.length === 0) {
    return (
      <p role="status" className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {t("usersProfiles.portal.empty")}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={CABECA}>{t("usersProfiles.portal.col.name")}</TableHead>
            <TableHead className={CABECA}>{t("usersProfiles.portal.col.organization")}</TableHead>
            <TableHead className={CABECA}>{t("usersProfiles.col.state")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className={`${CELULA} font-medium`}>{c.nome}</TableCell>
              <TableCell className={CELULA}>{organizacoes.find((o) => o.id === c.organizacaoId)?.nome ?? c.organizacaoId}</TableCell>
              <TableCell className={CELULA}><TagEstado ativo={c.ativo} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
