// «Dar como ganho» na ficha real. A interface oferece; quem decide é a base (NG006). Se as condições da organização não estão cumpridas o
// botão fica aria-disabled (continua alcançável) e o motivo diz-se em texto visível, ligado por aria-describedby. Sem as mutações nem os
// dados da ficha real (o exemplo), sem permissão de editar, ou num negócio que não está em curso, não desenha nada.
import { useId, useState } from "react";
import { Trophy } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { GanharNegocioDialogo } from "@/components/negocio-metas/GanharNegocioDialogo";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { podeGanhar } from "./podeGanhar";

const N = "pessoasPagina.neg.win.";

export function BotaoGanharNegocio({ negocio, className }: { negocio: NegocioMes; className?: string }) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  const dados = useDadosNegocio();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  const idMotivo = useId();
  if (!mutacoes || !dados || !dados.podeEditar || negocio.estadoReal !== "aberto") return null;
  const { pode, motivo } = podeGanhar(negocio, dados.momentoGanho);
  return (
    <div className={cn("space-y-1", className)}>
      <Button
        type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO, PISTA_DESATIVADO)} aria-disabled={!pode || undefined}
        aria-describedby={pode ? undefined : idMotivo} onClick={() => { if (pode) setAberto(true); }}
      >
        <Trophy className="h-4 w-4" aria-hidden="true" />
        {t(`${N}button`)}
      </Button>
      {!pode && motivo && <p id={idMotivo} className="text-sm text-muted-foreground">{t(`${N}blocked.${motivo}`)}</p>}
      <GanharNegocioDialogo negocio={aberto ? negocio : null} aoFechar={() => setAberto(false)} aoGanho={avisar} />
    </div>
  );
}
