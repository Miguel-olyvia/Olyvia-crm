/**
 * O historico de alteracoes ao contrato: o que mudou (campo), o valor antigo e
 * o novo, quem alterou, quando e o motivo. So leitura -- a tabela
 * (`pessoas_vinculos_alteracoes`) e escrita por trigger. Ver
 * `usePessoaVinculoAlteracoes`.
 *
 * Quem o usa muda-lhe a `key` quando o contrato e gravado, para recarregar e
 * mostrar as alteracoes novas (o trigger escreve-as no mesmo UPDATE).
 *
 * O motivo e o documento ficam em branco ("—") nas alteracoes feitas por edicao
 * directa do contrato: a base so os grava quando a alteracao vem com eles. O
 * documento so aparece a quem pode ver documentos.
 */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoaVinculoAlteracoes } from "@/hooks/usePessoaVinculoAlteracoes";
import { rotuloDoCampo, valorLegivel } from "@/lib/hr/alteracoesVinculo";

interface HistoricoAlteracoesCardProps {
  pessoaId: string;
}

function quando(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString();
}

export function HistoricoAlteracoesCard({ pessoaId }: HistoricoAlteracoesCardProps) {
  const { t } = useTranslation();
  const { alteracoes, loading, erro } = usePessoaVinculoAlteracoes(pessoaId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.contrato.alteracoes.titulo")}</CardTitle>
      </CardHeader>
      <CardContent className={alteracoes.length > 0 ? "p-0" : undefined}>
        {loading && alteracoes.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : erro ? (
          <p className="text-sm text-destructive" role="alert">
            {t("hr.contrato.alteracoes.erro")}
          </p>
        ) : alteracoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.contrato.alteracoes.vazio")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("hr.contrato.alteracoes.campo")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.antes")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.depois")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.quem")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.quando")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.motivo")}</TableHead>
                  <TableHead>{t("hr.contrato.alteracoes.documento")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alteracoes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{rotuloDoCampo(a.campo, t)}</TableCell>
                    <TableCell>{valorLegivel(a.campo, a.valor_antes, t)}</TableCell>
                    <TableCell>{valorLegivel(a.campo, a.valor_depois, t)}</TableCell>
                    <TableCell>{a.autor_nome ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {quando(a.created_at)}
                    </TableCell>
                    <TableCell>{a.motivo ?? "—"}</TableCell>
                    <TableCell>{a.documento_titulo ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
