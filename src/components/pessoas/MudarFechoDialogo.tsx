// Mudar o tipo de fecho de um negócio aberto (neg_mudar_fecho), em dois passos dentro do mesmo diálogo: primeiro escolhe-se mudar (a base é chamada
// SEM confirmação); se a mudança tornar decisivo um documento já ligado (uma proposta aceite, ou um contrato assinado), a base devolve
// `precisa_confirmar` sem mudar nada e o diálogo mostra o aviso e pede a confirmação; só ao confirmar volta a chamar a base, agora com ela.
// O erro diz-se pelo código dentro do diálogo (NG022: o tipo não muda neste estado) e o diálogo só fecha em sucesso. Sem as mutações da ficha
// real nem `mudarFecho` (o exemplo), ou com o tipo desconhecido, não desenha nada.
import { useId, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { FechoNegocio } from "@/components/negocio-metas/fechoNegocio";
import { useMutacoesDaFicha, type MutacoesNegocio, type ResultadoMudarFecho } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";

const N = "pessoasPagina.neg.fecho.";

interface CorpoProps {
  negocio: NegocioMes;
  /** O tipo para que se passa (o outro que não o atual). */
  alvo: FechoNegocio;
  mudar: NonNullable<MutacoesNegocio["mudarFecho"]>;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoConcluido: (anuncio: string) => void;
}

function Corpo({ negocio, alvo, mudar, envio, aoFechar, aoConcluido }: CorpoProps) {
  const { t } = useTranslation();
  // A base pediu confirmação: o diálogo passa ao segundo passo e a próxima chamada leva `confirmar`.
  const [aConfirmar, setAConfirmar] = useState(false);
  const resultado = useRef<ResultadoMudarFecho | null>(null);
  const idAviso = useId();
  const params = { name: negocio.pessoa, work: negocio.servico };

  const seguir = () => {
    if (envio.aGuardar) return;
    envio.enviar(
      async () => { resultado.current = await mudar(negocio.id, alvo, aConfirmar); },
      () => {
        const r = resultado.current;
        if (r?.precisaConfirmar) {
          setAConfirmar(true);
          return;
        }
        aoFechar();
        aoConcluido(r?.mudou ? t(`${N}done.${r.fecho ?? alvo}`, params) : t(`${N}unchanged`, params));
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* A região existe desde o início (vazia): um aviso que aparece já escrito não se anuncia. Liga-se também ao botão, que é onde o foco fica. */}
      <p id={idAviso} role="status" aria-live="polite" className={aConfirmar ? "text-sm text-foreground" : "sr-only"}>
        {aConfirmar ? t(`${N}confirm.${alvo}`) : ""}
      </p>
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}change.cancel`)}
        </Button>
        <Button
          type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}
          aria-describedby={aConfirmar ? idAviso : undefined} onClick={seguir}
        >
          {aConfirmar ? t(`${N}confirm.button`) : t(`${N}change.to.${alvo}`)}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface MudarFechoDialogoProps {
  /** O negócio; `null` = fechado. */
  negocio: NegocioMes | null;
  aoFechar: () => void;
  /** Depois de gravar: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoConcluido: (anuncio: string) => void;
}

export function MudarFechoDialogo({ negocio, aoFechar, aoConcluido }: MudarFechoDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const mudar = mutacoes?.mudarFecho;
  if (!mudar || !mostrado?.fecho) return null;
  const alvo: FechoNegocio = mostrado.fecho === "proposta" ? "contrato" : "proposta";
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}change.title`)}
      descricao={t(`${N}change.description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <Corpo key={`${mostrado.id}:${mostrado.fecho}`} negocio={mostrado} alvo={alvo} mudar={mudar} envio={envio} aoFechar={aoFechar} aoConcluido={aoConcluido} />}
    </DialogoDeEnvio>
  );
}
