/**
 * O motivo escrito, obrigatorio, antes de recusar, devolver, ajustar,
 * cancelar ou corrigir.
 *
 * PORQUE E QUE O MOTIVO NAO E OPCIONAL
 * ------------------------------------
 * Porque a base tambem nao o deixa ser: `rpc_hr_ausencia_cancelar` responde
 * `ausencia_cancelamento_sem_motivo`, e as decisoes de recusa, ajuste e
 * devolucao tem o motivo como NOT NULL na tabela de decisoes. Pedi-lo aqui e
 * so evitar que a pessoa descubra a regra por um toast de erro depois de ter
 * carregado no botao.
 *
 * `role="alertdialog"` e proposital: sao accoes que mudam a vida de um pedido
 * de outra pessoa, e o foco entra na area de texto.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";

export interface ResultadoMotivo {
  motivo: string;
  dataInicio?: string;
  dataFim?: string;
}

interface MotivoDialogProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Acrescenta os dois selectores de data da contraproposta. */
  comDatas?: boolean;
  datasIniciais?: { inicio: string; fim: string };
  destrutivo?: boolean;
  aGravar?: boolean;
  onFechar: () => void;
  onConfirmar: (resultado: ResultadoMotivo) => void;
  idPrefixo?: string;
}

export function MotivoDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  comDatas,
  datasIniciais,
  destrutivo,
  aGravar,
  onFechar,
  onConfirmar,
  idPrefixo = "hr-motivo",
}: MotivoDialogProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [inicio, setInicio] = useState(datasIniciais?.inicio ?? "");
  const [fim, setFim] = useState(datasIniciais?.fim ?? "");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setInicio(datasIniciais?.inicio ?? "");
    setFim(datasIniciais?.fim ?? "");
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [aberto, datasIniciais?.inicio, datasIniciais?.fim]);

  const motivoLimpo = motivo.trim();
  const datasValidas = !comDatas || (inicio !== "" && fim !== "" && fim >= inicio);
  const podeConfirmar = motivoLimpo !== "" && datasValidas && !aGravar;

  const idMotivo = `${idPrefixo}-texto`;
  const idInicio = `${idPrefixo}-inicio`;
  const idFim = `${idPrefixo}-fim`;

  return (
    <AlertDialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {comDatas && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={idInicio}>{t("hr.ausencias.campo.dataInicio")}</Label>
                <Input
                  id={idInicio}
                  type="date"
                  value={inicio}
                  onChange={(evento) => setInicio(evento.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={idFim}>{t("hr.ausencias.campo.dataFim")}</Label>
                <Input
                  id={idFim}
                  type="date"
                  value={fim}
                  onChange={(evento) => setFim(evento.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={idMotivo}>{t("hr.ausencias.campo.motivoObrigatorio")}</Label>
            <Textarea
              id={idMotivo}
              ref={areaRef}
              rows={3}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={aGravar}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!podeConfirmar}
            className={destrutivo ? "bg-destructive text-destructive-foreground" : undefined}
            onClick={(evento) => {
              evento.preventDefault();
              if (!podeConfirmar) return;
              onConfirmar(
                comDatas
                  ? { motivo: motivoLimpo, dataInicio: inicio, dataFim: fim }
                  : { motivo: motivoLimpo },
              );
            }}
          >
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
