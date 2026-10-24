// «Anular a perda» na ficha real. A base exige uma razão (1 a 1000 caracteres) que fica no histórico do negócio, por isso pede-se num
// diálogo (o botão do exemplo anulava sem perguntar). Espera pela base; o erro traduz-se pelo código dentro do diálogo; só fecha em sucesso.
// Sem as mutações da ficha real (o exemplo) não desenha nada: o exemplo anula pelo botão, sem diálogo.
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MensagemErro } from "./CamposMotivoPerda";
import { DialogoDeEnvio, ErroDeEnvio } from "./DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { useMutacoesDaFicha, type MutacoesNegocio } from "./mutacoesNegocio";
import type { NegocioMes } from "./negocioMetas";
import type { EnvioAssincrono } from "./useEnvioAssincrono";

const N = "pessoasPagina.neg.undo.";
const MAX_RAZAO = 1000;

type ErroRazao = "empty" | "tooLong";

function erroDaRazao(razao: string): ErroRazao | null {
  const limpa = razao.trim();
  if (limpa === "") return "empty";
  return limpa.length > MAX_RAZAO ? "tooLong" : null;
}

interface FormAnularProps {
  negocio: NegocioMes;
  mutacoes: MutacoesNegocio;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoAnulado?: (anuncio: string) => void;
}

function FormAnular({ negocio, mutacoes, envio, aoFechar, aoAnulado }: FormAnularProps) {
  const { t } = useTranslation();
  const [razao, setRazao] = useState("");
  const [tentou, setTentou] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const erro = tentou ? erroDaRazao(razao) : null;
  const idErro = `anular-${negocio.id}-erro`;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erroDaRazao(razao)) { campo.current?.focus(); return; }
    envio.enviar(
      () => mutacoes.anular(negocio.id, razao.trim()),
      () => {
        aoFechar();
        aoAnulado?.(t(`${N}done`, { name: negocio.pessoa, work: negocio.servico }));
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`anular-${negocio.id}`}>{t(`${N}reason`)}</Label>
        <Textarea
          ref={campo} id={`anular-${negocio.id}`} value={razao} maxLength={MAX_RAZAO} autoFocus rows={4}
          aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
          className={cn(FOCO, erro && "border-destructive")} onChange={(e) => setRazao(e.target.value)}
        />
        {erro && <MensagemErro id={idErro} texto={t(`${N}error.${erro}`)} />}
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
          {t(`${N}confirm`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface AnularPerdaDialogoProps {
  /** O negócio perdido; `null` = fechado. */
  negocio: NegocioMes | null;
  aoFechar: () => void;
  /** Depois de anular: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoAnulado?: (anuncio: string) => void;
}

export function AnularPerdaDialogo({ negocio, aoFechar, aoAnulado }: AnularPerdaDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  if (!mutacoes || !mostrado) return null;
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}title`)}
      descricao={t(`${N}description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <FormAnular key={mostrado.id} negocio={mostrado} mutacoes={mutacoes} envio={envio} aoFechar={aoFechar} aoAnulado={aoAnulado} />}
    </DialogoDeEnvio>
  );
}
