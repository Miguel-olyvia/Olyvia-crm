// Marcar ou remarcar uma visita DENTRO do negócio (pagina de Negócios e ficha do Pipeline): o MESMO agendamento que o CRM tem na ficha da pessoa (quadro, quem vai,
// dia, duração, morada; grava por neg_guardar_visita com p_negocio_id / neg_alterar_visita, por useAcoesVisita), com três diferenças pedidas:
//  1. a hora escolhe-se SÓ entre as horas livres reais de quem vai (get_resource_available_slots), dentro do horário da organização;
//  2. «Quem vai» são só as pessoas com RECURSO de agenda (recurso do tipo utilizador, ativo, da organização);
//  3. o tipo de visita (Levantamento, Medição técnica, Escolha de materiais, Revisita) escolhe-se aqui.
// Não ha ligação board-recurso na base (só `allowed_modules` do quadro): por isso «quem vai» não se filtra por quadro (decisão por confirmar no desenho).
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { minutosDaDuracao } from "@/hooks/pessoas/visitaDb";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { TEXTO_DO_TIPO, TIPOS_DE_VISITA } from "@/hooks/pessoas/tipoVisitaChave";
import { useAcoesVisita } from "@/hooks/pessoas/useAcoesVisita";
import { useHorarioOrganizacao } from "@/hooks/pessoas/useHorarioOrganizacao";
import { useHorasLivresVisita } from "@/hooks/pessoas/useHorasLivresVisita";
import type { VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DURACOES_VISITA, ehErroAgenda, ehErroMorada, entradaDaVisita, intervaloDaVisita, validarFormVisita, type ValorAgenda } from "../agendaVisitaForm";
import { CamposAgendaVisita } from "../CamposAgendaVisita";
import { MensagemErro } from "../CamposDataHora";
import { ErroAcao } from "../ErroAcao";
import { destinoInicial, textoMoradaVisita, MORADA_VISITA_VAZIA, type DestinoVisita } from "../moradaVisita";
import type { MoradaVisita } from "../pessoasTipos";
import { useEnvioVisita } from "../useEnvioVisita";
import { useFormAgendaVisita } from "../useFormAgendaVisita";
import { MAX_NOTA_VISITA } from "../visitaPessoa";
import { DiaDaVisita, HorasLivresVisita } from "./HorasLivresVisita";

const BOTAO = cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO);
const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-[15px] transition-colors motion-reduce:transition-none";

/** O que ficou gravado, para quem chamou atualizar o resto (o espelho do negócio). */
export interface VisitaGravada {
  /** O id da visita do CRM; `null` se a base não o devolveu (o ecrã volta a ler). */
  visitaId: string | null;
  visita: VisitaDoNegocio;
  /** A chave de «quem vai estar» (cliente, casal, familia, outra). */
  presentes: string;
  remarcada: boolean;
}

interface Props {
  entityId: string;
  negocioId: string;
  nome: string;
  moradaLead: MoradaVisita | null;
  tipoInicial: TipoVisitaNegocio;
  /** A visita que se remarca; sem ela marca-se uma nova. */
  visita?: VisitaDoNegocio;
  /** «Quem vai estar» que a visita já tinha (o espelho do negócio o guarda; o CRM aqui não o lê). */
  presentesInicial?: string;
  rotuloGravar: string;
  /** Nome de cada recurso da agenda, para a visita gravada. */
  aoGuardada: (r: VisitaGravada) => void;
  aoFechar?: () => void;
  /** Só leitura (sem permissão): nada se grava. */
  soLeitura?: boolean;
}

const chaveDaDuracao = (minutos: number): Pick<ValorAgenda, "duracao" | "duracaoMinutos"> => {
  const chave = DURACOES_VISITA.find((c) => minutosDaDuracao(c) === minutos);
  return chave ? { duracao: chave } : { duracao: "", duracaoMinutos: minutos };
};

export function MarcarVisitaNegocio({ entityId, negocioId, nome, moradaLead, tipoInicial, visita, presentesInicial, rotuloGravar, aoGuardada, aoFechar, soLeitura = false }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const hoje = hojeLisboa();
  const acoes = useAcoesVisita(entityId, null);
  const horario = useHorarioOrganizacao();
  const [tipo, setTipo] = useState<TipoVisitaNegocio>(visita?.tipo ?? tipoInicial);
  const [nota, setNota] = useState("");
  const [destino, setDestino] = useState<DestinoVisita>(() => {
    if (!visita) return destinoInicial(moradaLead);
    const naLead = moradaLead !== null && visita.local !== null && textoMoradaVisita(moradaLead) === visita.local;
    return { igualALead: naLead, outra: naLead ? MORADA_VISITA_VAZIA : { ...MORADA_VISITA_VAZIA, rua: visita.local ?? "" }, notaAcesso: visita.notas ?? "", notaAcessoDaBase: visita.notas ?? "" };
  });
  const [tentou, setTentou] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const campoData = useRef<HTMLInputElement>(null);
  const grupoRecursos = useRef<HTMLFieldSetElement>(null);
  const form = useFormAgendaVisita({
    responsavelUserId: null, excluirId: visita?.id ?? null,
    inicial: {
      ...(visita ? { boardId: visita.boardId, recursos: visita.recursos, data: visita.dia, hora: visita.hora, ...chaveDaDuracao(visita.minutos) } : {}),
      ...(presentesInicial ? { quemVaiEstar: presentesInicial } : {}),
    },
  });
  const envio = useEnvioVisita({ aoOcupado: () => undefined, aoConflito: (r) => { form.recusar(r); setTimeout(() => grupoRecursos.current?.focus(), 0); } });
  const { valor } = form;
  const minutos = valor.duracaoMinutos ?? minutosDaDuracao(valor.duracao) ?? 60;
  // «Quem vai»: só quem tem recurso de agenda do tipo utilizador (a visita que se remarca mantém os recursos que já tinha).
  const recursos = useMemo(
    () => form.agenda.recursos.filter((r) => (r.resource_type === "user" && r.user_id !== null) || (visita?.recursos.includes(r.id) ?? false)),
    [form.agenda.recursos, visita],
  );
  const agenda = useMemo(() => ({ ...form.agenda, recursos }), [form.agenda, recursos]);
  const horas = useHorasLivresVisita({
    recursos: valor.recursos, dia: valor.data, duracaoMin: minutos, horario: horario.horario, feriados: horario.feriados,
    horarioPronto: !horario.isLoading && !horario.isError, atual: visita ? { dia: visita.dia, hora: visita.hora } : null,
  });
  // mudar o dia, a duração ou quem vai invalida a hora escolhida (as livres são outras)
  const mudar = (parcial: Partial<ValorAgenda>): void => {
    const invalida = ("data" in parcial || "duracao" in parcial || "duracaoMinutos" in parcial || "recursos" in parcial) && !("hora" in parcial);
    form.mudar(invalida ? { ...parcial, hora: "" } : parcial);
  };

  const erroForm = validarFormVisita({ agenda: valor, nota, destino, moradaLead, hoje });
  // O horário da organização e as horas livres só se garantem aqui: sem horas confirmadas (a ler, erro, dia fechado, sem horas) não se grava, nem ao remarcar com a hora antiga.
  const horasNaoConfirmadas = erroForm === null && horas.estado.k !== "pronto";
  const horaForaDasLivres = erroForm === null && (horas.estado.k !== "pronto" || !horas.horas.includes(valor.hora));
  const presentesEmFalta = (valor.quemVaiEstar ?? "") === "";
  const semAgenda = form.agenda.quadros.length === 0 || recursos.length === 0;
  const bloqueado = soLeitura || semAgenda || horario.isError || horario.isLoading;
  const visto = tentou ? erroForm : null;

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (envio.aGuardar || bloqueado) return;
    setTentou(true);
    if (erroForm || horaForaDasLivres || presentesEmFalta) {
      setTimeout(() => (formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-foco-erro], [role="alert"]') ?? campoData.current)?.focus(), 0);
      return;
    }
    const entrada = entradaDaVisita({
      agenda: valor, nome, tipo, tituloTipo: TEXTO_DO_TIPO[tipo], destino, moradaLead, nota, quemVaiEstar: valor.quemVaiEstar ?? "", ...(visita ? {} : { negocioId }),
    });
    const iv = intervaloDaVisita(valor);
    const montar = (visitaId: string | null): VisitaGravada => ({
      visitaId, remarcada: visita !== undefined, presentes: valor.quemVaiEstar ?? "",
      visita: {
        id: visitaId ?? visita?.id ?? "", boardId: valor.boardId, inicio: iv?.inicio ?? "", fim: iv?.fim ?? "", minutos, estado: "marcada", tipo, numeroEmylia: visita?.numeroEmylia ?? null,
        titulo: entrada.titulo, notas: entrada.nota || null, local: textoMoradaVisita(entrada.morada) || null, recursos: [...valor.recursos], dia: valor.data, hora: valor.hora,
      },
    });
    if (visita) envio.enviar(() => acoes.alterar(visita.id, entrada, visita.recursos), () => aoGuardada(montar(visita.id)));
    else envio.enviar(() => acoes.marcar(entrada), (r) => aoGuardada(montar(r.visitaId)));
  };

  const rotuloTipo = `${id}-tipo`;
  const aviso = (texto: string) => <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">{texto}</p>;
  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-5">
      <div className="space-y-2">
        <p id={rotuloTipo} className="text-sm font-semibold text-foreground">Tipo de visita</p>
        <div role="group" aria-labelledby={rotuloTipo} className="flex flex-wrap gap-2">
          {TIPOS_DE_VISITA.map((k) => (
            <button
              key={k} type="button" aria-pressed={tipo === k} aria-disabled={envio.aGuardar || soLeitura || undefined} onClick={() => { if (!envio.aGuardar && !soLeitura) setTipo(k); }}
              className={cn(CHIP, FOCO, tipo === k ? "border-primary bg-primary/10 font-medium ring-1 ring-primary" : "border-input bg-background hover:bg-accent")}
            >
              {tipo === k && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{TEXTO_DO_TIPO[k]}
            </button>
          ))}
        </div>
      </div>
      {horario.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[15px] text-foreground">
          <span>Não foi possível ler o horário da organização (Configurações da Agenda). Sem ele não se marcam horas.</span>
          <Button type="button" variant="outline" className={BOTAO} onClick={horario.refetch}>Tentar outra vez</Button>
        </div>
      )}
      <CamposAgendaVisita
        id={id} hoje={hoje} agenda={agenda} valor={valor} aoMudar={mudar} erro={ehErroAgenda(visto) ? visto : null} conflito={form.conflito} recursoOcupado={form.recusado}
        moradaLead={moradaLead} destino={destino} aoMudarDestino={setDestino} erroMorada={ehErroMorada(visto) ? visto : null} comQuemVaiEstar
        campoData={campoData} grupoRecursos={grupoRecursos} desativado={envio.aGuardar || soLeitura}
        renderDataHora={(p) => (
          <div className="space-y-4">
            <DiaDaVisita
              id={p.id} hoje={p.hoje} dia={p.data} aoMudar={(data) => p.aoMudar({ data })} erro={p.erroData} somenteLeitura={p.somenteLeitura} campoData={p.campoData}
            />
            <HorasLivresVisita
              id={p.id} hora={p.hora} horas={horas.horas} estado={horas.estado} horario={horario.horario} horarioPorOmissao={horario.porOmissao}
              aoEscolher={(hora) => p.aoMudar({ hora })} aoTentarOutraVez={horas.refetch} somenteLeitura={p.somenteLeitura}
              erro={p.erroHora ?? (tentou && horaForaDasLivres ? (horasNaoConfirmadas ? "Não foi possível confirmar as horas livres deste dia. Aguarde ou tente outra vez." : "Escolha uma das horas livres.") : null)}
            />
          </div>
        )}
      />
      {tentou && presentesEmFalta && <MensagemErro id={`${id}-presentes-erro`} texto="Diga quem vai estar na visita." />}
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>Nota da visita</Label>
        <Input
          id={`${id}-nota`} value={nota} autoComplete="off" readOnly={envio.aGuardar || soLeitura} aria-invalid={visto === "notaComprida" ? true : undefined}
          aria-describedby={visto === "notaComprida" ? `${id}-nota-erro` : undefined} className={cn("min-h-11", FOCO)} onChange={(e) => setNota(e.target.value)}
        />
        {visto === "notaComprida" && <MensagemErro id={`${id}-nota-erro`} texto={t("pessoasPagina.visitDialog.error.notaComprida", { max: MAX_NOTA_VISITA })} />}
      </div>
      {!horario.isLoading && form.agenda.quadros.length === 0 && !form.agenda.isLoading && !form.agenda.isError && aviso("A organização não tem nenhum quadro de agenda onde marcar visitas. Crie um em Agenda › Quadros.")}
      {!form.agenda.isLoading && !form.agenda.isError && form.agenda.quadros.length > 0 && recursos.length === 0 && aviso("Nenhuma pessoa desta organização tem um recurso de agenda ligado: sem isso não há a quem marcar a visita. Crie o recurso em Agenda › Recursos.")}
      {soLeitura && aviso("Só leitura: não tem permissão para marcar visitas neste negócio.")}
      <ErroAcao chave={envio.erro} chaveExtra={envio.erroExtra} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={BOTAO} aria-disabled={envio.aGuardar || bloqueado || undefined} aria-busy={envio.aGuardar || undefined}>
          {envio.aGuardar ? "A guardar…" : rotuloGravar}
        </Button>
        {aoFechar && (
          <Button type="button" variant="outline" className={BOTAO} aria-disabled={envio.aGuardar || undefined} onClick={() => { if (!envio.aGuardar) aoFechar(); }}>Cancelar</Button>
        )}
      </div>
    </form>
  );
}
