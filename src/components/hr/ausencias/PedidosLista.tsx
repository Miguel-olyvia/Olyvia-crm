/**
 * A lista de pedidos -- a mesma tabela na fila de quem decide, no historico e
 * na ficha da pessoa.
 *
 * O QUE A LINHA DIZ SEM SE ABRIR
 * ------------------------------
 * Quem, que tipo, que datas, quantos dias, EM QUE PASSO esta, e ha quanto
 * tempo espera. O passo escreve-se por extenso ("a aguardar a chefia"), nunca
 * por um codigo de estado -- e a resposta directa ao pedido de tornar os dois
 * passos legiveis.
 *
 * Os dias mostrados sao `dias_solicitados`, que a base GRAVOU no momento do
 * pedido. Nao se recalcula aqui: o calendario de hoje pode ja nao ser o de
 * entao, e o numero que conta e o que ficou gravado.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TipoEtiqueta } from "@/components/hr/ausencias/TipoEtiqueta";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDias } from "@/lib/hr/ausencias";
import type { AusenciaPedido, AusenciaTipo, EstadoPedido } from "@/types/hrAusencias";

const VARIANTE: Record<EstadoPedido, "default" | "secondary" | "outline" | "destructive"> = {
  pendente_chefia: "secondary",
  pendente_rh: "secondary",
  aprovado: "default",
  recusado: "destructive",
  cancelado: "outline",
};

interface PedidosListaProps {
  pedidos: AusenciaPedido[];
  tiposPorId: Map<string, AusenciaTipo>;
  /** Sem isto a coluna da pessoa nao se mostra (ficha de uma so pessoa). */
  nomePorPessoaId?: Map<string, string>;
  vazioTexto: string;
  onAbrir: (pedidoId: string) => void;
}

export function PedidosLista({
  pedidos,
  tiposPorId,
  nomePorPessoaId,
  vazioTexto,
  onAbrir,
}: PedidosListaProps) {
  const { t } = useTranslation();

  if (pedidos.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{vazioTexto}</p>;
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {t("hr.ausencias.lista.contagem", { total: pedidos.length })}
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {nomePorPessoaId && <TableHead>{t("hr.ausencias.lista.pessoa")}</TableHead>}
              <TableHead>{t("hr.ausencias.lista.tipo")}</TableHead>
              <TableHead>{t("hr.ausencias.lista.datas")}</TableHead>
              <TableHead className="text-right">{t("hr.ausencias.lista.dias")}</TableHead>
              <TableHead>{t("hr.ausencias.lista.estado")}</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedidos.map((pedido) => (
              <TableRow key={pedido.id}>
                {nomePorPessoaId && (
                  <TableCell className="font-medium">
                    {nomePorPessoaId.get(pedido.pessoa_id) ?? "—"}
                  </TableCell>
                )}
                <TableCell>
                  <TipoEtiqueta
                    tipo={tiposPorId.get(pedido.tipo_id) ?? null}
                    nomeAlternativo={t("hr.ausencias.tipoDesconhecido")}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {pedido.data_inicio === pedido.data_fim
                    ? pedido.data_inicio
                    : `${pedido.data_inicio} → ${pedido.data_fim}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarDias(Number(pedido.dias_solicitados))}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE[pedido.estado]} className="font-normal">
                    {t(`hr.ausencias.estado.${pedido.estado}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => onAbrir(pedido.id)}>
                    {t("hr.ausencias.lista.abrir")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
