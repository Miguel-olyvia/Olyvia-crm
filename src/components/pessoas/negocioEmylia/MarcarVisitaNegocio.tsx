// Marcar ou remarcar uma visita DENTRO do negócio (pagina de Negócios e ficha do Pipeline): o MESMO agendamento que o CRM tem na ficha da pessoa (quadro, quem vai,
// dia, duração, morada; grava por neg_guardar_visita com p_negocio_id / neg_alterar_visita, por useAcoesVisita), com três diferenças pedidas:
//  1. a hora escolhe-se SÓ entre as horas livres reais de quem vai (get_resource_available_slots), dentro do horário da organização;
//  2. «Quem vai» são só as pessoas com RECURSO de agenda (recurso do tipo utilizador, ativo, da organização);
//  3. o tipo de visita (Levantamento, Medição técnica, Escolha de materiais, Revisita) escolhe-se aqui.
// Não ha ligação board-recurso na base (só `allowed_modules` do quadro): por isso «quem vai» não se filtra por quadro (decisão por confirmar no desenho).
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { TipoVisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { minutosDaDuracao } from "@/hooks/pessoas/visitaDb";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { TEXTO_DO_TIPO, TIPOS_DE_VISITA } from "@/hooks/pessoas/tipoVisitaChave";
import { useAcoesVisita, type ResponsavelDaVisita } from "@/hooks/pessoas/useAcoesVisita";
import { useDestinoVisita } from "@/hooks/pessoas/useDestinoVisita";
import { useHorarioOrganizacao } from "@/hooks/pessoas/useHorarioOrganizacao";
import { useHorasLivresVisita } from "@/hooks/pessoas/useHorasLivresVisita";
import type { VisitaDoNegocio } from "@/hooks/pessoas/useVisitasDoNegocio";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DURACOES_VISITA, ehErroAgenda, ehErroMorada, entradaDaVisita, intervaloDaVisita, validarFormVisita, type ValorAgenda } from "../agendaVisitaForm";
import { CamposAgendaVisita } from "../CamposAgendaVisita";
import { MensagemErro } from "../CamposDataHora";
import { ErroAcao } from "../ErroAcao";
import { cp7DoDestino, destinoInicial, textoMoradaVisita, MORADA_VISITA_VAZIA, type DestinoVisita } from "../moradaVisita";
import type { MoradaVisita } from "../pessoasTipos";
import { useEnvioVisita } from "../useEnvioVisita";
import { useFormAgendaVisita } from "../useFormAgendaVisita";
import { MAX_NOTA_VISITA } from "../visitaPessoa";
import { HorasLivresVisita } from "./HorasLivresVisita";
import { ROTULO_MORADA, type OrigemMoradaVisita } from "./moradaPorOmissaoDaVisita";
import { QuemPodeIrVisita } from "./QuemPodeIrVisita";

const diaPorExtenso = (dia: string): string => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};

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
  /** 11/11: a visita passou a lead e o negócio para este comercial (a base já o gravou; o ecrã junta a linha ao histórico). */
  responsavel: ResponsavelDaVisita | null;
}

interface Props {
  entityId: string;
  negocioId: string;
  nome: string;
  moradaLead: MoradaVisita | null;
  /** De onde vem `moradaLead` (a obra do negócio ou, sem obra, a morada do cliente): o rótulo da opção diz «Na morada da obra» ou «Na morada do cliente». */
  origemMorada?: OrigemMoradaVisita;
  tipoInicial: TipoVisitaNegocio;
  /** A visita que se remarca; sem ela marca-se uma nova. */
  visita?: VisitaDoNegocio;
  /** «Quem vai estar» que a visita já tinha (o espelho do negócio o guarda; o CRM aqui não o lê). */
  presentesInicial?: string;
  /** 4/11: numa visita nova, o que se preparou no passo «Preparar a visita» (a duração em minutos e a nota). */
  duracaoInicialMin?: number;
  notaInicial?: string;
  /** 5/11: numa visita nova, o dia (AAAA-MM-DD) e a hora (HH:MM) combinados na chamada: o dia já vem escolhido e aparecem os comerciais livres. */
  dataInicial?: string;
  horaInicial?: string;
  /** 5/11: marca sozinha, sem clique: escolhe o comercial livre mais perto à hora combinada e grava. Sem ninguém livre, diz e espera. */
  marcarSozinha?: boolean;
  /** Não deu para marcar sozinha (ninguém livre, falta a morada): o pedido acaba e a visita marca-se à mão. */
  aoDesistirSozinha?: () => void;
  rotuloGravar: string;
  /** Nome de cada recurso da agenda, para a visita gravada. */
  aoGuardada: (r: VisitaGravada) => void;
  aoFechar?: () => void;
  /** Só leitura (sem permissão): nada se grava. */
  soLeitura?: boolean;
}

/** O dia e a hora combinados na chamada, se servem: o dia válido e não passado; a hora em HH:MM («11», «11h», «11:30», «11h30»). */
export function combinadaNaChamada(dia: string | undefined, hora: string | undefined, hoje: string): { data?: string; hora?: string } {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia < hoje) return {};
  const m = (hora ?? "").trim().toLowerCase().match(/^(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?)?\s*h?$/);
  const h = m ? Number(m[1]) : NaN, min = m?.[2] ? Number(m[2]) : 0;
  return Number.isInteger(h) && h >= 0 && h <= 23 && min >= 0 && min <= 59
    ? { data: dia, hora: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` } : { data: dia };
}

/** A parte do dia combinada sem hora certa («sábado de manhã»): as horas livres escolhem-se dentro dela. */
export function periodoDaHora(hora: string | undefined): "manha" | "tarde" | null {
  const t = (hora ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /manha/.test(t) ? "manha" : /tarde|noite/.test(t) ? "tarde" : null;
}

const chaveDaDuracao = (minutos: number): Pick<ValorAgenda, "duracao" | "duracaoMinutos"> => {
  const chave = DURACOES_VISITA.find((c) => minutosDaDuracao(c) === minutos);
  return chave ? { duracao: chave } : { duracao: "", duracaoMinutos: minutos };
};

export function MarcarVisitaNegocio({ entityId, negocioId, nome, moradaLead, origemMorada = "obra", tipoInicial, visita, presentesInicial, duracaoInicialMin, notaInicial, dataInicial, horaInicial, marcarSozinha = false, aoDesistirSozinha, rotuloGravar, aoGuardada, aoFechar, soLeitura = false }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const hoje = hojeLisboa();
  const acoes = useAcoesVisita(entityId, null);
  const horario = useHorarioOrganizacao();
  const [tipo, setTipo] = useState<TipoVisitaNegocio>(visita?.tipo ?? tipoInicial);
  const [nota, setNota] = useState(visita ? "" : notaInicial ?? "");
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
      ...(visita ? { boardId: visita.boardId, recursos: visita.recursos, data: visita.dia, hora: visita.hora, ...chaveDaDuracao(visita.minutos) }
        : { ...(duracaoInicialMin ? chaveDaDuracao(duracaoInicialMin) : {}), ...combinadaNaChamada(dataInicial, horaInicial, hoje) }),
      ...(presentesInicial ? { quemVaiEstar: presentesInicial } : {}),
    },
  });
  const envio = useEnvioVisita({ aoOcupado: () => undefined, aoConflito: (r) => { form.recusar(r); setTimeout(() => grupoRecursos.current?.focus(), 0); } });
  const { valor } = form;
  // o ponto da morada da visita (o mesmo pedido e a mesma cache que a escolha de quem vai); sem código postal completo, sem ponto
  const localVisita = useDestinoVisita(cp7DoDestino(destino, moradaLead));
  const minutos = valor.duracaoMinutos ?? minutosDaDuracao(valor.duracao) ?? 60;
  // «Quem vai»: só quem tem recurso de agenda do tipo utilizador (a visita que se remarca mantém os recursos que já tinha).
  const recursos = useMemo(
    () => form.agenda.recursos.filter((r) => (r.resource_type === "user" && r.user_id !== null) || (visita?.recursos.includes(r.id) ?? false)),
    [form.agenda.recursos, visita],
  );
  const agenda = useMemo(() => ({ ...form.agenda, recursos }), [form.agenda, recursos]);
  const horas = useHorasLivresVisita({
    recursos: valor.recursos, dia: valor.data, duracaoMin: minutos, horario: horario.horario, feriados: horario.feriados,
    horarioPronto: !horario.isLoading && !horario.isError, atual: visita ? { dia: visita.dia, hora: visita.hora } : null, excluirId: visita?.id ?? null,
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
  // 4/11 (o levantamento da chamada): «Quem vai estar» e a nota da visita não se perguntam na chamada: saem do formulário
  const semAgenda = form.agenda.quadros.length === 0 || recursos.length === 0;
  // gravar espera pela localização da morada: sem isso a visita ficava sem coordenadas só por se ter clicado cedo demais
  const aLocalizar = localVisita.aLer;
  const bloqueado = soLeitura || semAgenda || horario.isError || horario.isLoading || aLocalizar;
  const visto = tentou ? erroForm : null;

  // 5/11: marcar sozinha. QuemPodeIrVisita escolhe quem vai (o comercial livre mais perto à hora combinada) e diz-o em `sozinha`;
  // com tudo confirmado (horas livres lidas, a hora entre elas, a morada localizada, sem erros) grava-se uma vez, sem clique.
  const [sozinha, setSozinha] = useState<{ quem: string | null; texto: string } | null>(null);
  const jaEnviouSozinha = useRef(false);
  const desistir = (texto: string) => { setSozinha({ quem: null, texto }); aoDesistirSozinha?.(); };
  useEffect(() => {
    if (!marcarSozinha || visita || jaEnviouSozinha.current || sozinha?.quem == null) return;
    if (bloqueado || envio.aGuardar || horas.estado.k !== "pronto" || valor.recursos.length === 0 || !valor.hora) return;
    jaEnviouSozinha.current = true;
    if (erroForm !== null || !horas.horas.includes(valor.hora)) { desistir("Não deu para marcar sozinha: confira o que falta em baixo e use «" + rotuloGravar + "»."); return; }
    formulario.current?.requestSubmit();
  });

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    if (envio.aGuardar || bloqueado) return;
    setTentou(true);
    if (erroForm || horaForaDasLivres) {
      setTimeout(() => (formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-foco-erro], [role="alert"]') ?? campoData.current)?.focus(), 0);
      return;
    }
    const entrada = {
      ...entradaDaVisita({
        agenda: valor, nome, tipo, tituloTipo: TEXTO_DO_TIPO[tipo], destino, moradaLead, nota, quemVaiEstar: valor.quemVaiEstar ?? "", ...(visita ? {} : { negocioId }),
      }),
      // as coordenadas do código postal ficam na visita (location_lat/location_lng): as próximas visitas contam com elas
      ...(localVisita.destino ? { destino: localVisita.destino } : {}),
    };
    const iv = intervaloDaVisita(valor);
    const montar = (visitaId: string | null, responsavel: ResponsavelDaVisita | null): VisitaGravada => ({
      visitaId, remarcada: visita !== undefined, presentes: valor.quemVaiEstar ?? "", responsavel,
      visita: {
        id: visitaId ?? visita?.id ?? "", boardId: valor.boardId, inicio: iv?.inicio ?? "", fim: iv?.fim ?? "", minutos, estado: "marcada", tipo, numeroEmylia: visita?.numeroEmylia ?? null,
        titulo: entrada.titulo, notas: entrada.nota || null, local: textoMoradaVisita(entrada.morada) || null, recursos: [...valor.recursos], dia: valor.data, hora: valor.hora,
      },
    });
    if (visita) envio.enviar(() => acoes.alterar(visita.id, entrada, visita.recursos), (r) => aoGuardada(montar(visita.id, r.responsavel)));
    else envio.enviar(() => acoes.marcar(entrada), (r) => aoGuardada(montar(r.visitaId, r.responsavel)));
  };

  const rotuloTipo = `${id}-tipo`;
  const aviso = (texto: string) => <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">{texto}</p>;
  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-5">
      {/* 4/11 (Rúben, a gravação «Entrevista Completa»): o que se diz ao cliente sobre a visita */}
      <p className="rounded-xl bg-primary/[0.06] px-4 py-3 text-[15px]">
        <b className="font-semibold">Diga ao cliente:</b> o técnico vai a casa ver consigo as alterações que quer fazer, tira medidas e leva os materiais para escolher; depois faz-se o orçamento. A visita não tem custo: é só informativa.
      </p>
      {!visita && dataInicial && combinadaNaChamada(dataInicial, horaInicial, hoje).data && (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/[0.04] px-4 py-3 text-[15px]">
          <b className="font-semibold">Combinado na chamada:</b> {diaPorExtenso(dataInicial)}{combinadaNaChamada(dataInicial, horaInicial, hoje).hora ? ` às ${combinadaNaChamada(dataInicial, horaInicial, hoje).hora}` : periodoDaHora(horaInicial) === "manha" ? " de manhã" : periodoDaHora(horaInicial) === "tarde" ? " à tarde" : ""}.{" "}
          {marcarSozinha && sozinha === null ? "A procurar o comercial livre mais perto a essa hora…"
            : sozinha ? sozinha.texto
            : "Em baixo, os comerciais livres nesse dia; escolha quem vai."}
          {envio.aGuardar && marcarSozinha ? " A marcar…" : ""}
        </p>
      )}
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
        moradaLead={moradaLead} rotuloMoradaLead={ROTULO_MORADA[origemMorada]} destino={destino} aoMudarDestino={setDestino} erroMorada={ehErroMorada(visto) ? visto : null}
        campoData={campoData} grupoRecursos={grupoRecursos} desativado={envio.aGuardar || soLeitura}
        // 4/11 (Rúben): a data da visita primeiro (obrigatória, sem atalhos de dia), depois quem pode ir nesse dia (os comerciais; sem
        // nenhum livre, técnicos e outros dias sugeridos) e a hora. A duração sai: vem de «Preparar a visita» (1 h sem nada).
        semDuracao
        renderQuemEQuando={(p) => (
          <QuemPodeIrVisita
            a={p} recursos={recursos} duracaoMin={minutos} horario={horario.horario} feriados={horario.feriados}
            horarioPronto={!horario.isLoading && !horario.isError} excluirId={visita?.id ?? null}
            escolherSozinho={marcarSozinha && !visita && !jaEnviouSozinha.current} periodoPreferido={periodoDaHora(horaInicial)}
            aoEscolherSozinho={(r) => (r.quem ? setSozinha({ quem: r.quem, texto: r.motivo || `Vai ${r.quem}, o comercial livre mais perto a essa hora.` }) : desistir(r.motivo))}
            hora={(filtrar) => (
              <HorasLivresVisita
                id={p.id} hora={p.hora} horas={filtrar(horas.horas)} estado={horas.estado} horario={horario.horario} horarioPorOmissao={horario.porOmissao}
                aoEscolher={(hora) => p.aoMudar({ hora })} aoTentarOutraVez={horas.refetch} somenteLeitura={p.somenteLeitura} diaTodo={horas.diaTodo}
                erro={p.erroHora ?? (tentou && horaForaDasLivres ? (horasNaoConfirmadas ? "Não foi possível confirmar as horas livres deste dia. Aguarde ou tente outra vez." : "Escolha uma das horas livres.") : null)}
              />
            )}
          />
        )}
      />
      {!horario.isLoading && form.agenda.quadros.length === 0 && !form.agenda.isLoading && !form.agenda.isError && aviso("A organização não tem nenhum quadro de agenda onde marcar visitas. Crie um em Agenda › Quadros.")}
      {!form.agenda.isLoading && !form.agenda.isError && form.agenda.quadros.length > 0 && recursos.length === 0 && aviso("Nenhuma pessoa desta organização tem um recurso de agenda ligado: sem isso não há a quem marcar a visita. Crie o recurso em Agenda › Recursos.")}
      {soLeitura && aviso("Só leitura: não tem permissão para marcar visitas neste negócio.")}
      <ErroAcao chave={envio.erro} chaveExtra={envio.erroExtra} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className={BOTAO} aria-disabled={envio.aGuardar || bloqueado || undefined} aria-busy={envio.aGuardar || undefined}>
          {envio.aGuardar ? "A guardar…" : aLocalizar ? "A localizar a morada…" : rotuloGravar}
        </Button>
        {aoFechar && (
          <Button type="button" variant="outline" className={BOTAO} aria-disabled={envio.aGuardar || undefined} onClick={() => { if (!envio.aGuardar) aoFechar(); }}>Cancelar</Button>
        )}
      </div>
    </form>
  );
}
