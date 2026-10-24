// Mandar um negócio para o lixo e restaurá-lo, os dois com confirmação. O diálogo diz o que vai acontecer, espera pela base, diz o erro traduzido
// DENTRO do diálogo (o toast e a região live ficam fora do modal) e só fecha em sucesso. O foco abre no «Cancelar» (o primeiro elemento focável: sem `autoFocus`, que
// esconderia ao diálogo quem o abriu e perderia o foco ao cancelar): a ação confirma-se de propósito. Sem as mutações da ficha real (o exemplo) não desenha nada. A permissão (pessoas.delete) decide-a quem monta o botão; a base
// decide o âmbito e um «não» dela vem traduzido (42501).
import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha, type MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";

const N = "pessoasPagina.neg.";

export type ModoLixo = "apagar" | "restaurar";

/** O que o diálogo precisa de saber do negócio (o da ficha ou o do lixo). */
export interface NegocioDoLixo {
  id: string;
  pessoa: string;
  servico: string;
}

interface CorpoProps {
  modo: ModoLixo;
  negocio: NegocioDoLixo;
  acao: (negocioId: string) => Promise<void>;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoConcluido: (anuncio: string) => void;
}

function Corpo({ modo, negocio, acao, envio, aoFechar, aoConcluido }: CorpoProps) {
  const { t } = useTranslation();
  const prefixo = modo === "apagar" ? "trash" : "restore";
  const confirmar = () => {
    if (envio.aGuardar) return;
    envio.enviar(() => acao(negocio.id), () => {
      aoFechar();
      aoConcluido(t(`${N}${prefixo}.done`, { name: negocio.pessoa, work: negocio.servico }));
    });
  };
  return (
    <div className="space-y-4">
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}${prefixo}.cancel`)}
        </Button>
        <Button
          type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}
          variant={modo === "apagar" ? "destructive" : "default"} onClick={confirmar}
        >
          {t(`${N}${prefixo}.confirm`)}
        </Button>
      </DialogFooter>
    </div>
  );
}

const acaoDoModo = (modo: ModoLixo, m: MutacoesNegocio): ((negocioId: string) => Promise<void>) | undefined =>
  (modo === "apagar" ? m.enviarParaLixo : m.restaurar);

interface ConfirmarLixoNegocioDialogoProps {
  modo: ModoLixo;
  /** O negócio; `null` = fechado. */
  negocio: NegocioDoLixo | null;
  aoFechar: () => void;
  /** Depois de gravar: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoConcluido: (anuncio: string) => void;
}

export function ConfirmarLixoNegocioDialogo({ modo, negocio, aoFechar, aoConcluido }: ConfirmarLixoNegocioDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef<NegocioDoLixo | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const acao = mutacoes ? acaoDoModo(modo, mutacoes) : undefined;
  if (!acao || !mostrado) return null;
  const prefixo = modo === "apagar" ? "trash" : "restore";
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}${prefixo}.title`)}
      descricao={t(`${N}${prefixo}.description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <Corpo key={mostrado.id} modo={modo} negocio={mostrado} acao={acao} envio={envio} aoFechar={aoFechar} aoConcluido={aoConcluido} />}
    </DialogoDeEnvio>
  );
}
