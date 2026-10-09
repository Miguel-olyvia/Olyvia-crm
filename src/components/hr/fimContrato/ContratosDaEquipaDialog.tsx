/**
 * A janela do RESPONSAVEL DIRECTO: os contratos da sua equipa que estao a
 * terminar, e a indicacao de cada um -- "Pretendo continuar", "Nao pretendo
 * continuar" ou "Ainda por decidir".
 *
 * A chefia NAO ve a ficha. Esta janela mostra so o nome, o tipo de contrato, a
 * data de fim e a resposta ja dada, que e tudo o que `rpc_hr_contratos_do_
 * responsavel` devolve. A indicacao e uma OPINIAO para o RH: nao renova nem
 * termina nada. Abre-se pela notificacao de fim de contrato (sino); quem nao e
 * responsavel de ninguem recebe uma lista vazia da base e ve so o aviso de que
 * nao ha nada para indicar.
 */
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContratosDoResponsavel } from "@/hooks/useContratosDoResponsavel";
import { useTranslation } from "@/hooks/useTranslation";
import { RESPOSTAS_INDICACAO } from "@/lib/hr/fimContrato";
import { toast } from "@/lib/toast";

interface ContratosDaEquipaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
}

export function ContratosDaEquipaDialog({
  open,
  onOpenChange,
  organizationId,
}: ContratosDaEquipaDialogProps) {
  const { t } = useTranslation();
  const { contratos, loading, erroLeitura, aGuardar, indicar } = useContratosDoResponsavel(
    organizationId,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("hr.fimContrato.equipa.titulo")}</DialogTitle>
          <DialogDescription>{t("hr.fimContrato.equipa.descricao")}</DialogDescription>
        </DialogHeader>

        {loading && contratos.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : erroLeitura ? (
          <p className="text-sm text-destructive" role="alert">
            {t("hr.fimContrato.equipa.erro")}
          </p>
        ) : contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hr.fimContrato.equipa.vazio")}</p>
        ) : (
          <ul className="space-y-4">
            {contratos.map((c) => (
              <li key={c.vinculo_id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{c.pessoa_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`hr.tipoContrato.${c.tipo_contrato}`)} · {t("hr.fimContrato.card.terminaA")}{" "}
                    <span className="tabular-nums">{c.data_fim}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={c.pessoa_nome}>
                  {RESPOSTAS_INDICACAO.map((resposta) => (
                    <Button
                      key={resposta}
                      size="sm"
                      variant={c.resposta === resposta ? "default" : "outline"}
                      aria-pressed={c.resposta === resposta}
                      disabled={aGuardar === c.vinculo_id}
                      onClick={async () => {
                        const erro = await indicar(c.vinculo_id, resposta);
                        if (erro) toast.error(erro);
                        else toast.success(t("hr.fimContrato.equipa.guardado"));
                      }}
                    >
                      {t(`hr.fimContrato.resposta.${resposta}`)}
                    </Button>
                  ))}
                  {aGuardar === c.vinculo_id && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {c.resposta === null && (
                  <Badge variant="outline" className="font-normal">
                    {t("hr.fimContrato.lista.semResposta")}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
