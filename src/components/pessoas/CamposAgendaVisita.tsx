// Os campos da agenda de uma visita ligada à base: o quadro, quem vai (chips), o dia e a hora (obrigatória), a duração, o aviso de conflito de
// horário e a morada da visita. É controlado: quem o usa (Marcar e Alterar) guarda os valores, valida e grava. O aviso de conflito é só um
// pré-aviso de leitura (falha aberto e nunca diz «disponível»); a recusa verdadeira vem da base ao gravar.
import type { Ref } from "react";
import type { AgendaVisitaLida } from "@/hooks/pessoas/useAgendaVisita";
import type { ConflitoVisita } from "@/hooks/pessoas/useConflitoVisita";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { DURACAO_DA_BASE, opcoesDeDuracao, type ErroAgenda, type ValorAgenda } from "./agendaVisitaForm";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import type { DestinoVisita, ErroMoradaVisita } from "./moradaVisita";
import type { MoradaVisita } from "./pessoasTipos";
import { SeletorRecursosVisita } from "./SeletorRecursosVisita";

const A = "pessoasPagina.real.visit.agenda.";
const C = "pessoasPagina.real.visit.conflict.";
const E = "pessoasPagina.real.visit.err.";

interface CamposAgendaVisitaProps {
  /** A base dos ids dos campos. */
  id: string;
  hoje: string;
  agenda: Pick<AgendaVisitaLida, "quadros" | "recursos" | "isLoading" | "isError" | "refetch">;
  valor: ValorAgenda;
  aoMudar: (parcial: Partial<ValorAgenda>) => void;
  /** O erro da agenda, depois de tentar gravar. */
  erro: ErroAgenda | null;
  conflito: ConflitoVisita;
  /** O recurso que a base recusou (NG010): fica marcado como ocupado até se mudar o horário ou os recursos. */
  recursoOcupado: string | null;
  moradaLead: MoradaVisita | null;
  destino: DestinoVisita;
  aoMudarDestino: (destino: DestinoVisita) => void;
  erroMorada: ErroMoradaVisita | null;
  campoData?: Ref<HTMLInputElement>;
  grupoRecursos?: Ref<HTMLFieldSetElement>;
  /** A guardar: nada se edita (os campos só se leem; a lista de quadro e a duração desativam-se). */
  desativado?: boolean;
}

function EstadoDaAgenda({ agenda }: { agenda: CamposAgendaVisitaProps["agenda"] }) {
  const { t } = useTranslation();
  if (agenda.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t(`${A}loading`)}</p>;
  if (!agenda.isError) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-foreground">
      <span>{t(`${A}loadError`)}</span>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={agenda.refetch}>{t(`${A}retry`)}</Button>
    </div>
  );
}

function Quadro({ id, agenda, valor, aoMudar, erro, desativado }: Pick<CamposAgendaVisitaProps, "id" | "agenda" | "valor" | "aoMudar" | "erro" | "desativado">) {
  const { t } = useTranslation();
  const { quadros, isLoading, isError } = agenda;
  const campo = `${id}-quadro`;
  const semQuadro = erro === "quadroEmFalta";
  if (quadros.length === 0) {
    if (isLoading || isError) return null;
    // A mensagem é o que o foco procura quando falta o quadro e não há nenhum campo com `aria-invalid` (ver `data-foco-erro` no formulário da chamada).
    return (
      <p
        role={semQuadro ? "alert" : undefined} tabIndex={semQuadro ? -1 : undefined} data-foco-erro={semQuadro ? "" : undefined}
        className="text-sm text-foreground outline-none"
      >
        {t(`${A}boardNone`)}
      </p>
    );
  }
  if (quadros.length === 1) {
    return (
      <p className="space-y-0.5 text-sm">
        <span className="block font-semibold text-foreground">{t(`${A}board`)}</span>
        <span className="block text-foreground">{quadros[0].name}</span>
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={campo}>{t(`${A}board`)}</Label>
      <NativeSelect
        id={campo} value={valor.boardId ?? ""} disabled={desativado} className={cn("min-h-11", FOCO, semQuadro && "border-destructive")}
        placeholder={valor.boardId === null ? t(`${A}boardChoose`) : undefined} aria-invalid={semQuadro ? true : undefined}
        aria-describedby={semQuadro ? `${campo}-erro` : undefined} options={quadros.map((q) => ({ value: q.id, label: q.name }))}
        onValueChange={(boardId) => aoMudar({ boardId })}
      />
      {semQuadro && <MensagemErro id={`${campo}-erro`} texto={t(`${E}noBoard`)} />}
    </div>
  );
}

function Duracao({ id, valor, aoMudar, desativado }: Pick<CamposAgendaVisitaProps, "id" | "valor" | "aoMudar" | "desativado">) {
  const { t } = useTranslation();
  const escolhida = valor.duracaoMinutos !== undefined && valor.duracao === "" ? DURACAO_DA_BASE : valor.duracao;
  const opcoes = opcoesDeDuracao(valor.duracaoMinutos).map((chave) => ({
    value: chave,
    label: chave === DURACAO_DA_BASE ? t(`${A}duration.custom`, { minutes: valor.duracaoMinutos ?? 0 }) : t(`${A}duration.${chave}`),
  }));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-duracao`}>{t(`${A}duration`)}</Label>
      <NativeSelect
        id={`${id}-duracao`} value={escolhida} disabled={desativado} className={cn("min-h-11", FOCO)} options={opcoes}
        onValueChange={(chave) => { if (chave !== DURACAO_DA_BASE) aoMudar({ duracao: chave, duracaoMinutos: undefined }); }}
      />
    </div>
  );
}

/** O aviso de conflito: sempre presente (uma região de estado só se anuncia se já existia), vazia quando não há nada a dizer. */
function AvisoConflito({ conflito, nomes, semVerificar }: { conflito: ConflitoVisita; nomes: string[]; semVerificar: string[] }) {
  const { t } = useTranslation();
  const frases: string[] = [];
  if (nomes.length > 0) frases.push(t(`${C}busy`, { names: nomes.join(", ") }));
  else if (conflito.aVerificar) frases.push(t(`${C}checking`));
  // Um recurso ocupado não esconde o que ficou por verificar: as duas frases dizem-se, cada uma com o seu recurso.
  if (conflito.falharam.length > 0) {
    frases.push(semVerificar.length > 0 ? t(`${C}failedFor`, { names: semVerificar.join(", ") }) : t(`${C}failed`));
  }
  return (
    <div role="status" data-testid="conflito-visita" className="text-sm text-foreground">
      {frases.join(" ")}
    </div>
  );
}

const textoDoErroData = (t: ReturnType<typeof useTranslation>["t"], erro: ErroAgenda | null): [string | null, string | null] => {
  if (erro === "dataVazia" || erro === "dataPassada") return [t(`pessoasPagina.visitDialog.error.${erro}`), null];
  if (erro === "horaInvalida") return [null, t("pessoasPagina.visitDialog.error.horaInvalida")];
  if (erro === "horaVazia") return [null, t(`${A}error.horaVazia`)];
  return [null, null];
};

export function CamposAgendaVisita(p: CamposAgendaVisitaProps) {
  const { t } = useTranslation();
  const [erroData, erroHora] = textoDoErroData(t, p.erro);
  // Os recursos ocupados, pelo nome e sem repetir: o pré-aviso da leitura e o que a base acabou de recusar.
  const ocupados = Array.from(new Set([...p.conflito.emConflito, ...(p.recursoOcupado ? [p.recursoOcupado] : [])]));
  const nomeDe = (r: string): string | undefined => p.agenda.recursos.find((x) => x.id === r)?.name;
  const nomes = ocupados.map(nomeDe).filter((n): n is string => !!n);
  const semVerificar = p.conflito.falharam.map(nomeDe).filter((n): n is string => !!n);
  return (
    <div className="space-y-4">
      <EstadoDaAgenda agenda={p.agenda} />
      <Quadro id={p.id} agenda={p.agenda} valor={p.valor} aoMudar={p.aoMudar} erro={p.erro} desativado={p.desativado} />
      <SeletorRecursosVisita
        id={`${p.id}-recursos`} recursos={p.agenda.recursos} escolhidos={p.valor.recursos} emConflito={ocupados} desativado={p.desativado}
        erro={p.erro === "recursoEmFalta" ? t(`${E}noResource`) : null} grupoRef={p.grupoRecursos}
        aoMudar={(recursos) => p.aoMudar({ recursos })}
      />
      <CamposDataHora
        id={p.id} data={p.valor.data} hora={p.valor.hora} hoje={p.hoje} campoData={p.campoData} rotuloData={t(`${A}date`)} rotuloHora={t(`${A}time`)}
        erroData={erroData} erroHora={erroHora} somenteLeitura={p.desativado} aoMudar={p.aoMudar}
      />
      <Duracao id={p.id} valor={p.valor} aoMudar={p.aoMudar} desativado={p.desativado} />
      <AvisoConflito conflito={p.conflito} nomes={nomes} semVerificar={semVerificar} />
      <MoradaVisitaCampos id={`${p.id}-morada`} moradaLead={p.moradaLead} valor={p.destino} erro={p.erroMorada} aoMudar={p.aoMudarDestino} />
    </div>
  );
}
