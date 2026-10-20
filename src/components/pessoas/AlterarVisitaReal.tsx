// O formulário de «Alterar visita» ligado à base. Parte do que a visita já tem (quadro, recursos, dia, hora, duração, morada e nota) e REENVIA todos os
// campos por `useAcoesVisita`: a base apaga o que vier a NULL, por isso a nota, o tipo, quem vai estar e a morada voltam sempre. Trocar os recursos de uma
// visita futura pode mudar o responsável da lead (e exige `leads.edit`): o aviso diz quem passou a ser. A base recusa a hora em conflito (NG010).
import { useId, useRef, useState, type FormEvent } from "react";
import { useAcoesVisita, type ResultadoAlterar } from "@/hooks/pessoas/useAcoesVisita";
import type { RecursoVisita } from "@/hooks/pessoas/useAgendaVisita";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { DURACAO_POR_OMISSAO, ehErroAgenda, ehErroMorada, entradaDaVisita, validarFormVisita } from "./agendaVisitaForm";
import { CamposAgendaVisita } from "./CamposAgendaVisita";
import { ErroAcao } from "./ErroAcao";
import { destinoDaVisita, moradaDaLead, type DestinoVisita } from "./moradaVisita";
import type { Pessoa } from "./pessoasTipos";
import { useEnvioVisita } from "./useEnvioVisita";
import { useFormAgendaVisita, type EscolhasIniciais } from "./useFormAgendaVisita";

const R = "pessoasPagina.real.visit.";
const V = "pessoasPagina.visitDialog.";
const C = "pessoasPagina.changeVisit.";
const BOTAO = cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO);

interface FormAlterarRealProps {
  pessoa: Pessoa;
  visita: VisitaPessoa;
  hoje: string;
  /** Avisa o diálogo de que começou ou acabou de gravar (para não se deixar fechar a meio). */
  aoOcupado: (ocupado: boolean) => void;
  aoFechar: () => void;
}

/**
 * O que a visita já tem escolhido. Os recursos partem SEMPRE dos da visita, mesmo vazios: assumir o recurso de quem está na sessão trocá-los-ia sem aviso
 * (mudava o responsável da lead e exigia `leads.edit`), por isso uma visita sem recursos lidos pede a escolha. O quadro, que a visita pode não dizer,
 * fica por omissão. Uma duração que a visita não diz parte da omissão do formulário (1 hora), que é a que se vê e a que se grava.
 */
function escolhasDaVisita(v: VisitaPessoa): EscolhasIniciais {
  const ids = v.agenda?.recursos.map((r) => r.id) ?? [];
  const minutos = v.agenda?.duracaoMinutos ?? undefined;
  return {
    ...(v.agenda?.boardId ? { boardId: v.agenda.boardId } : {}),
    recursos: ids,
    data: v.data, hora: v.hora, duracao: v.duracao === "" && minutos === undefined ? DURACAO_POR_OMISSAO : v.duracao,
    ...(minutos !== undefined ? { duracaoMinutos: minutos } : {}),
  };
}

/** Os recursos da agenda mais os da visita que já não estão ativos (continuam visíveis e escolhidos, e podem tirar-se). */
function recursosComOsDaVisita(ativos: readonly RecursoVisita[], v: VisitaPessoa): RecursoVisita[] {
  const extra = (v.agenda?.recursos ?? [])
    .filter((r) => !ativos.some((a) => a.id === r.id))
    .map((r): RecursoVisita => ({ id: r.id, name: r.nome || r.id, resource_type: "", user_id: null }));
  return [...ativos, ...extra];
}

/** O aviso de que o responsável mudou: quem é (se for um dos recursos escolhidos) e quantas visitas futuras o seguiram. */
function textoDoDono(t: ReturnType<typeof useTranslation>["t"], nome: string, r: ResultadoAlterar, recursos: readonly RecursoVisita[]): string {
  const dono = r.novoDono ? recursos.find((x) => x.user_id === r.novoDono)?.name : undefined;
  const frase = dono ? t(`${R}alterar.owner`, { name: nome, owner: dono }) : t(`${R}alterar.ownerUnknown`, { name: nome });
  return r.outrasVisitas.length > 0 ? `${frase} ${t(`${R}alterar.ownerOthers`, { count: r.outrasVisitas.length })}` : frase;
}

export function FormAlterarReal({ pessoa, visita, hoje, aoOcupado, aoFechar }: FormAlterarRealProps) {
  const { t } = useTranslation();
  const id = useId();
  const lead = moradaDaLead(pessoa);
  const acoes = useAcoesVisita(pessoa.id, null);
  const form = useFormAgendaVisita({ responsavelUserId: null, inicial: escolhasDaVisita(visita), excluirId: visita.id });
  const [destino, setDestino] = useState<DestinoVisita>(() => destinoDaVisita(visita, lead !== null));
  const [tentou, setTentou] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const grupoRecursos = useRef<HTMLFieldSetElement>(null);
  const envio = useEnvioVisita({
    aoOcupado,
    aoConflito: (recurso) => {
      form.recusar(recurso);
      setTimeout(() => grupoRecursos.current?.focus(), 0);
    },
  });
  const agenda = { ...form.agenda, recursos: recursosComOsDaVisita(form.agenda.recursos, visita) };
  const erro = validarFormVisita({ agenda: form.valor, nota: "", destino, moradaLead: lead, hoje });
  const visto = tentou ? erro : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    if (erro) {
      setTimeout(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-foco-erro]')?.focus(), 0);
      return;
    }
    // O título vai vazio: a base mantém o atual. O resto reenvia-se sempre (um campo omitido apaga-se).
    const entrada = entradaDaVisita({
      agenda: form.valor, nome: "", tipo: visita.tipo, tituloTipo: "", destino, moradaLead: lead, nota: "", quemVaiEstar: visita.quemVaiEstar,
    });
    const atuais = visita.agenda?.recursos.map((r) => r.id);
    envio.enviar(() => acoes.alterar(visita.id, entrada, atuais), (r) => {
      toast.success(t(`${R}alterar.done`, { name: pessoa.nome }));
      if (r.donoAlterado) toast.info(textoDoDono(t, pessoa.nome, r, agenda.recursos));
      if (r.desconfirmada) toast.info(t(`${R}alterar.unconfirmed`));
      aoFechar();
    });
  };

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-4">
      <CamposAgendaVisita
        id={id} hoje={hoje} agenda={agenda} valor={form.valor} aoMudar={form.mudar} erro={ehErroAgenda(visto) ? visto : null}
        conflito={form.conflito} recursoOcupado={form.recusado} moradaLead={lead} destino={destino} aoMudarDestino={setDestino}
        erroMorada={ehErroMorada(visto) ? visto : null} grupoRecursos={grupoRecursos} desativado={envio.aGuardar}
      />
      <ErroAcao chave={envio.erro} chaveExtra={envio.erroExtra} />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={BOTAO} aria-disabled={envio.aGuardar || undefined} onClick={() => { if (!envio.aGuardar) aoFechar(); }}>
          {t(`${V}cancel`)}
        </Button>
        <Button type="submit" className={BOTAO} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {envio.aGuardar ? t("pessoasPagina.real.ficha.saving") : t(`${C}submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}
