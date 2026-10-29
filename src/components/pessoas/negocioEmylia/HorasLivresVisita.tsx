// O dia e a hora de uma visita no passo Visitas do negócio: o dia por atalhos (Hoje, Amanhã, Daqui a 1 semana, Outra data) e a hora SÓ entre as horas livres
// reais (não uma lista fixa), dentro do horário da organização. Cada estado sem horas diz porquê; nada se inventa. Controlado: quem o usa guarda o dia e a hora.
import { useId, type Ref } from "react";
import { Check } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { HorarioOrg } from "@/hooks/pessoas/horasLivresVisita";
import type { EstadoHorasLivres } from "@/hooks/pessoas/useHorasLivresVisita";
import { cn } from "@/lib/utils";
import { MensagemErro } from "../CamposDataHora";

const CHIP = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[15px] transition-colors motion-reduce:transition-none";
const chipClasse = (ligado: boolean): string => cn(
  CHIP, FOCO, ligado ? "border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary" : "border-input bg-background text-foreground hover:bg-accent",
);

/** AAAA-MM-DD mais `n` dias (aritmética em UTC ao meio-dia: sem saltos de hora de verão). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ATALHOS: readonly [string, number][] = [["Hoje", 0], ["Amanhã", 1], ["Daqui a 1 semana", 7]];

interface DiaProps {
  id: string;
  hoje: string;
  dia: string;
  aoMudar: (dia: string) => void;
  erro: string | null;
  somenteLeitura: boolean | undefined;
  campoData: Ref<HTMLInputElement> | undefined;
}

export function DiaDaVisita({ id, hoje, dia, aoMudar, erro, somenteLeitura, campoData }: DiaProps) {
  const rotulo = useId();
  const doAtalho = ATALHOS.find(([, n]) => somarDias(hoje, n) === dia);
  const outra = dia !== "" && !doAtalho;
  return (
    <div className="space-y-2">
      <p id={rotulo} className="text-sm font-semibold text-foreground">Dia</p>
      <div role="group" aria-labelledby={rotulo} className="flex flex-wrap gap-2">
        {ATALHOS.map(([texto, n]) => (
          <button
            key={texto} type="button" aria-pressed={doAtalho?.[1] === n} aria-disabled={somenteLeitura || undefined}
            onClick={() => { if (!somenteLeitura) aoMudar(somarDias(hoje, n)); }} className={chipClasse(doAtalho?.[1] === n)}
          >
            {doAtalho?.[1] === n && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{texto}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-data`}>{outra || dia === "" ? "Outra data" : "Ou escolha outra data"}</Label>
        <Input
          ref={campoData} id={`${id}-data`} type="date" min={hoje} value={dia} readOnly={somenteLeitura} aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-data-erro` : undefined} className={cn("min-h-11 max-w-xs", FOCO, erro && "border-destructive")}
          onChange={(e) => aoMudar(e.target.value)}
        />
        {erro && <MensagemErro id={`${id}-data-erro`} texto={erro} />}
      </div>
    </div>
  );
}

interface HorasProps {
  id: string;
  hora: string;
  horas: readonly string[];
  estado: EstadoHorasLivres;
  horario: HorarioOrg;
  /** O horário da organização é a omissão (nunca foi gravado nas Configurações da Agenda). */
  horarioPorOmissao: boolean;
  aoEscolher: (hora: string) => void;
  aoTentarOutraVez: () => void;
  erro: string | null;
  somenteLeitura: boolean | undefined;
}

const intervalo = (h: HorarioOrg): string => `${h.inicio} às ${h.fim}`;

function textoDoEstado(estado: EstadoHorasLivres, h: HorarioOrg): string | null {
  switch (estado.k) {
    case "sem-recursos": return "Escolha primeiro quem vai: as horas livres são as da agenda de cada pessoa.";
    case "sem-dia": return "Escolha o dia para ver as horas livres.";
    case "dia-fechado": return estado.motivo === "feriado"
      ? "A organização não trabalha nesse dia: é feriado nas Configurações da Agenda. Escolha outro dia."
      : "A organização não trabalha nesse dia da semana (Dias de trabalho nas Configurações da Agenda). Escolha outro dia.";
    case "sem-horas": return `Não há horas livres nesse dia para quem escolheu, dentro do horário da organização (${intervalo(h)}). Escolha outro dia ou outra pessoa.`;
    default: return null;
  }
}

export function HorasLivresVisita({ id, hora, horas, estado, horario, horarioPorOmissao, aoEscolher, aoTentarOutraVez, erro, somenteLeitura }: HorasProps) {
  const rotulo = useId();
  const texto = textoDoEstado(estado, horario);
  return (
    <div className="space-y-2">
      <p id={rotulo} className="text-sm font-semibold text-foreground">Hora</p>
      <p className="text-sm text-muted-foreground">
        Só as horas livres de quem vai, no horário da organização: {intervalo(horario)}
        {horario.almoco ? `, com pausa de almoço (${horario.almoco.inicio} às ${horario.almoco.fim}, ${horario.almoco.minutos} min)` : ""}.
        {horarioPorOmissao ? " A organização ainda não gravou o horário nas Configurações da Agenda: está a valer o de omissão." : ""}
      </p>
      {estado.k === "a-ler" && <p role="status" className="text-sm text-muted-foreground">A ler as horas livres…</p>}
      {estado.k === "erro" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span>Não foi possível ler as horas livres. Não se mostra nenhuma para não marcar a uma hora ocupada.</span>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentarOutraVez}>Tentar outra vez</Button>
        </div>
      )}
      {texto && <p role="status" className="text-sm text-foreground">{texto}</p>}
      {horas.length > 0 && (
        <div role="group" aria-labelledby={rotulo} id={`${id}-hora`} className="flex flex-wrap gap-2">
          {horas.map((h) => (
            <button
              key={h} type="button" aria-pressed={hora === h} aria-disabled={somenteLeitura || undefined}
              onClick={() => { if (!somenteLeitura) aoEscolher(h); }} className={chipClasse(hora === h)}
            >
              {hora === h && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{h}
            </button>
          ))}
        </div>
      )}
      {erro && <MensagemErro id={`${id}-hora-erro`} texto={erro} />}
    </div>
  );
}
