// O formulário de «Marcar visita» ligado à base: quadro, recursos, dia, hora (obrigatória), duração e morada. Grava por `useAcoesVisita` (nunca
// pelo store de exemplo), uma vez de cada vez, e só fecha quando a base respondeu bem; um erro fica dentro do diálogo, traduzido. Marcar uma visita
// NÃO conta como contacto: a pessoa fica só com uma visita marcada.
import { useId, useRef, useState, type FormEvent } from "react";
import { useAcoesVisita } from "@/hooks/pessoas/useAcoesVisita";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ehErroAgenda, ehErroMorada, entradaDaVisita, validarFormVisita } from "./agendaVisitaForm";
import { CamposAgendaVisita } from "./CamposAgendaVisita";
import { MensagemErro } from "./CamposDataHora";
import { ErroAcao } from "./ErroAcao";
import type { AberturaVisita } from "./marcarVisitaContexto";
import { destinoInicial, type DestinoVisita } from "./moradaVisita";
import { useEnvioVisita } from "./useEnvioVisita";
import { useFormAgendaVisita } from "./useFormAgendaVisita";
import { MAX_NOTA_VISITA } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";
const R = "pessoasPagina.real.visit.";
const BOTAO = cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO);

interface FormVisitaRealProps {
  pessoa: AberturaVisita;
  hoje: string;
  /** A pessoa já tem uma visita que não está cancelada: esta é uma revisita. */
  revisita: boolean;
  /** Avisa o diálogo de que começou ou acabou de gravar (para não se deixar fechar a meio). */
  aoOcupado: (ocupado: boolean) => void;
  /** A visita ficou marcada (a pessoa passa às «já com visita» deste ecrã). */
  aoMarcada: () => void;
  aoFechar: () => void;
}

export function FormVisitaReal({ pessoa, hoje, revisita, aoOcupado, aoMarcada, aoFechar }: FormVisitaRealProps) {
  const { t } = useTranslation();
  const id = useId();
  const acoes = useAcoesVisita(pessoa.pessoaId, null);
  const form = useFormAgendaVisita({ responsavelUserId: pessoa.responsavelUserId ?? null });
  const [nota, setNota] = useState("");
  const [destino, setDestino] = useState<DestinoVisita>(() => destinoInicial(pessoa.moradaLead));
  const [tentou, setTentou] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const campoData = useRef<HTMLInputElement>(null);
  const grupoRecursos = useRef<HTMLFieldSetElement>(null);
  const envio = useEnvioVisita({
    aoOcupado,
    aoConflito: (recurso) => {
      form.recusar(recurso);
      setTimeout(() => grupoRecursos.current?.focus(), 0);
    },
  });
  const erro = validarFormVisita({ agenda: form.valor, nota, destino, moradaLead: pessoa.moradaLead, hoje });
  const visto = tentou ? erro : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erro) {
      // O foco vai para o primeiro campo com erro, depois de o erro aparecer (a ordem do ecrã é a da validação).
      setTimeout(() => (formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? campoData.current)?.focus(), 0);
      return;
    }
    const tipo = revisita ? "revisita" : "levantamento";
    const entrada = entradaDaVisita({
      agenda: form.valor, nome: pessoa.nome, tipo, tituloTipo: t(`${R}kind.${tipo}`), destino, moradaLead: pessoa.moradaLead, nota, quemVaiEstar: "",
      ...(pessoa.negocioId ? { negocioId: pessoa.negocioId } : {}),
    });
    envio.enviar(() => acoes.marcar(entrada), () => {
      toast.success(t(`${R}marcar.done`, { name: pessoa.nome }));
      aoMarcada();
      aoFechar();
    });
  };

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-4">
      <CamposAgendaVisita
        id={id} hoje={hoje} agenda={form.agenda} valor={form.valor} aoMudar={form.mudar} erro={ehErroAgenda(visto) ? visto : null}
        conflito={form.conflito} recursoOcupado={form.recusado} moradaLead={pessoa.moradaLead} destino={destino} aoMudarDestino={setDestino}
        erroMorada={ehErroMorada(visto) ? visto : null} campoData={campoData} grupoRecursos={grupoRecursos} desativado={envio.aGuardar}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{t(`${V}note`)}</Label>
        <Input
          id={`${id}-nota`} value={nota} autoComplete="off" readOnly={envio.aGuardar} aria-invalid={visto === "notaComprida" ? true : undefined}
          aria-describedby={visto === "notaComprida" ? `${id}-nota-erro` : undefined} className={cn("min-h-11", FOCO)}
          onChange={(e) => setNota(e.target.value)}
        />
        {visto === "notaComprida" && <MensagemErro id={`${id}-nota-erro`} texto={t(`${V}error.notaComprida`, { max: MAX_NOTA_VISITA })} />}
      </div>
      <ErroAcao chave={envio.erro} chaveExtra={envio.erroExtra} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={BOTAO} aria-disabled={envio.aGuardar || undefined} onClick={() => { if (!envio.aGuardar) aoFechar(); }}>
          {t(`${V}cancel`)}
        </Button>
        <Button type="submit" className={BOTAO} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {envio.aGuardar ? t("pessoasPagina.real.ficha.saving") : t(`${V}submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}
