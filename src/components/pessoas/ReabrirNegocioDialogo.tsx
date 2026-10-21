// «Reabrir negócio» (ganho -> aberto), com a bandeira do fecho ligada. A base exige um motivo (1 a 1000 caracteres, NG009) e a permissão
// `pessoas.reopen`; o motivo fica no histórico. Espera pela base, o erro traduz-se pelo código dentro do diálogo e só fecha em sucesso.
// Sem a mutação (o exemplo, ou a base sem a função) não desenha nada.
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MensagemErro } from "@/components/negocio-metas/CamposMotivoPerda";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha, type MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";

const N = "pessoasPagina.neg.close.reopen.";
export const MAX_MOTIVO_REABRIR = 1000;

type ErroMotivo = "empty" | "tooLong";

function erroDoMotivo(motivo: string): ErroMotivo | null {
  const limpo = motivo.trim();
  if (limpo === "") return "empty";
  return limpo.length > MAX_MOTIVO_REABRIR ? "tooLong" : null;
}

interface FormProps {
  negocio: NegocioMes;
  reabrir: NonNullable<MutacoesNegocio["reabrirGanho"]>;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoReaberto: (anuncio: string) => void;
}

function Formulario({ negocio, reabrir, envio, aoFechar, aoReaberto }: FormProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [tentou, setTentou] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const erro = tentou ? erroDoMotivo(motivo) : null;
  const idCampo = `reabrir-${negocio.id}`;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erroDoMotivo(motivo)) { campo.current?.focus(); return; }
    envio.enviar(
      () => reabrir(negocio.id, motivo.trim()),
      () => { aoFechar(); aoReaberto(t(`${N}done`, { name: negocio.pessoa, work: negocio.servico })); },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={idCampo}>{t(`${N}reason`)}</Label>
        <Textarea
          ref={campo} id={idCampo} value={motivo} autoFocus rows={4} aria-invalid={erro ? true : undefined}
          aria-required="true" readOnly={envio.aGuardar} aria-describedby={erro ? `${idCampo}-dica ${idCampo}-erro` : `${idCampo}-dica`}
          className={cn(FOCO, erro && "border-destructive")} onChange={(e) => setMotivo(e.target.value)}
        />
        <p id={`${idCampo}-dica`} className="text-sm text-muted-foreground">{t(`${N}reasonHint`)}</p>
        {erro && <MensagemErro id={`${idCampo}-erro`} texto={t(`${N}error.${erro}`)} />}
      </div>
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}cancel`)}
        </Button>
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${N}button`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ReabrirNegocioDialogoProps {
  /** O negócio ganho; `null` = fechado. */
  negocio: NegocioMes | null;
  aoFechar: () => void;
  /** Depois de reabrir: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoReaberto: (anuncio: string) => void;
}

export function ReabrirNegocioDialogo({ negocio, aoFechar, aoReaberto }: ReabrirNegocioDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const reabrir = mutacoes?.reabrirGanho;
  if (!reabrir || !mostrado) return null;
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}title`)}
      descricao={t(`${N}description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <Formulario key={mostrado.id} negocio={mostrado} reabrir={reabrir} envio={envio} aoFechar={aoFechar} aoReaberto={aoReaberto} />}
    </DialogoDeEnvio>
  );
}
