// «Editar negócio» na ficha real: título, notas e comercial (o comercial só se escolhe aqui: criar um negócio não tem seletor). Valida no ecrã os
// limites da base (título de 1 a 200, notas até 5000), lê os comerciais como a página de Leads, só envia o que mudou, espera pela base (estado
// ocupado, duplo clique), diz o erro traduzido DENTRO do diálogo e só fecha em sucesso. Estado, fase e motivo de perda não se mudam aqui.
// Sem as mutações de editar (o exemplo) não desenha nada.
import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useComerciaisNegocio } from "@/hooks/pessoas/useComerciaisNegocio";
import { MAX_NOTAS_NEGOCIO, validarEdicao } from "@/hooks/pessoas/escritasNegocio";
import { DialogoDeEnvio, ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha, type MutacoesNegocio, type ValoresNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { EnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { MensagemErro } from "./CamposDataHora";
import { MarcaObrigatorio } from "./processo/MarcaObrigatorio";

const N = "pessoasPagina.neg.";
const SEM_COMERCIAL = "";

/** Os valores com que o diálogo abre, lidos do negócio da base. */
const valoresDe = (n: NegocioMes): ValoresNegocio => ({ titulo: n.servico, notas: n.notas ?? "", comercialId: n.comercialId ?? null });

interface ComercialProps {
  id: string;
  negocio: NegocioMes;
  valor: string;
  aoMudar: (comercialId: string) => void;
}

/** O seletor de comercial: os da organização, «Sem comercial» e o atual (mesmo que já não esteja na lista, para não o perder sem querer). */
function SeletorComercial({ id, negocio, valor, aoMudar }: ComercialProps) {
  const { t } = useTranslation();
  const { comerciais, isLoading, isError, repetir } = useComerciaisNegocio(true);
  const atual = negocio.comercialId ?? null;
  const naLista = atual !== null && comerciais.some((c) => c.id === atual);
  const opcoes = [
    { value: SEM_COMERCIAL, label: t(`${N}edit.rep.none`) },
    ...(atual !== null && !naLista ? [{ value: atual, label: negocio.comercial || atual }] : []),
    ...comerciais.map((c) => ({ value: c.id, label: c.nome })),
  ];
  const ajuda = isLoading ? t(`${N}edit.rep.loading`) : isError ? t(`${N}edit.rep.error`) : null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(`${N}edit.rep`)}</Label>
      <NativeSelect
        id={id} value={valor} options={opcoes} disabled={isLoading || isError} className={cn("h-11", FOCO)}
        aria-describedby={ajuda ? `${id}-ajuda` : undefined} onValueChange={aoMudar}
      />
      {ajuda && (
        <p id={`${id}-ajuda`} role={isError ? "alert" : "status"} className="text-sm text-muted-foreground">{ajuda}</p>
      )}
      {isError && (
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={repetir}>{t(`${N}edit.rep.retry`)}</Button>
      )}
    </div>
  );
}

interface FormProps {
  negocio: NegocioMes;
  mutacoes: Required<Pick<MutacoesNegocio, "editar">>;
  envio: EnvioAssincrono;
  aoFechar: () => void;
  aoEditado?: (anuncio: string) => void;
}

function Formulario({ negocio, mutacoes, envio, aoFechar, aoEditado }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const antes = useRef(valoresDe(negocio)).current;
  const [titulo, setTitulo] = useState(antes.titulo);
  const [notas, setNotas] = useState(antes.notas);
  const [comercial, setComercial] = useState(antes.comercialId ?? SEM_COMERCIAL);
  const [tentou, setTentou] = useState(false);
  const campoTitulo = useRef<HTMLInputElement>(null);
  const campoNotas = useRef<HTMLTextAreaElement>(null);
  const erros = validarEdicao({ titulo, notas });
  const erroTitulo = tentou ? erros.titulo : undefined;
  const erroNotas = tentou ? erros.notas : undefined;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erros.titulo) { campoTitulo.current?.focus(); return; }
    if (erros.notas) { campoNotas.current?.focus(); return; }
    let mudou = true;
    envio.enviar(
      async () => { mudou = (await mutacoes.editar({ negocioId: negocio.id, antes, depois: { titulo, notas, comercialId: comercial === SEM_COMERCIAL ? null : comercial } })).mudou; },
      () => {
        aoFechar();
        aoEditado?.(t(mudou ? `${N}edit.done` : `${N}edit.unchanged`, { name: negocio.pessoa, work: negocio.servico }));
      },
    );
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline">
          <Label htmlFor={`${id}-titulo`}>{t(`${N}edit.name`)}</Label>
          <MarcaObrigatorio />
        </div>
        <Input
          ref={campoTitulo} id={`${id}-titulo`} value={titulo} autoComplete="off" aria-required="true" aria-invalid={erroTitulo ? true : undefined}
          aria-describedby={erroTitulo ? `${id}-titulo-erro` : undefined} className={cn("min-h-11", FOCO, erroTitulo && "border-destructive")}
          onChange={(e) => setTitulo(e.target.value)}
        />
        {erroTitulo && <MensagemErro id={`${id}-titulo-erro`} texto={t(`${N}edit.name.error.${erroTitulo}`)} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notas`}>{t(`${N}edit.notes`)}</Label>
        <Textarea
          ref={campoNotas} id={`${id}-notas`} value={notas} rows={4} aria-invalid={erroNotas ? true : undefined}
          aria-describedby={`${id}-contagem${erroNotas ? ` ${id}-notas-erro` : ""}`} className={cn(FOCO, erroNotas && "border-destructive")}
          onChange={(e) => setNotas(e.target.value)}
        />
        <p id={`${id}-contagem`} className="text-right text-xs tabular-nums text-muted-foreground">
          {t(`${N}edit.notes.count`, { count: Array.from(notas).length, max: MAX_NOTAS_NEGOCIO })}
        </p>
        {erroNotas && <MensagemErro id={`${id}-notas-erro`} texto={t(`${N}edit.notes.error.${erroNotas}`)} />}
      </div>
      <SeletorComercial id={`${id}-comercial`} negocio={negocio} valor={comercial} aoMudar={setComercial} />
      <ErroDeEnvio chave={envio.erro} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button
          type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
          onClick={() => { if (!envio.aGuardar) aoFechar(); }}
        >
          {t(`${N}edit.cancel`)}
        </Button>
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${N}edit.submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface EditarNegocioDialogoProps {
  /** O negócio a editar; `null` = fechado. */
  negocio: NegocioMes | null;
  aoFechar: () => void;
  /** Depois de gravar: o texto para o leitor de ecrã (o diálogo já pediu para fechar). */
  aoEditado?: (anuncio: string) => void;
}

export function EditarNegocioDialogo({ negocio, aoFechar, aoEditado }: EditarNegocioDialogoProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  // Ao fechar, o diálogo sai com o texto que tinha (não esvazia durante a animação).
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const editar = mutacoes?.editar;
  if (!editar || !mostrado) return null;
  return (
    <DialogoDeEnvio
      aberto={negocio !== null} aoFechar={aoFechar} titulo={t(`${N}edit.title`)}
      descricao={t(`${N}edit.description`, { name: mostrado.pessoa, work: mostrado.servico })}
    >
      {(envio) => <Formulario key={mostrado.id} negocio={mostrado} mutacoes={{ editar }} envio={envio} aoFechar={aoFechar} aoEditado={aoEditado} />}
    </DialogoDeEnvio>
  );
}
