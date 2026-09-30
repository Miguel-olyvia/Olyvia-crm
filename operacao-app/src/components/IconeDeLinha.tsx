import { cx } from "./ui";
import {
  Building,
  Calendario,
  CheckCircle,
  Clock,
  Layers,
  MapPin,
  Pause,
  Play,
  Inbox,
  X,
} from "./icons";

/**
 * O ícone que abre uma linha de lista.
 *
 * Vem do Infraspeak, e de propósito: quem sai de lá reconhece a lista antes de
 * a ler. Lá, cada linha começa com dois ou três ícones pequenos que dizem *que
 * espécie de coisa é* e *em que estado está* — e é isso que faz uma tabela de
 * setenta e quatro linhas ser percorrida com os olhos em vez de lida.
 *
 * Na instância observada são azuis (#3C5FFF, o azul da marca deles). Aqui são
 * roxos, que é o nosso: a familiaridade está na forma e na posição, não na cor.
 *
 * Só o essencial vai colorido. Se tudo tiver cor, a cor deixa de assinalar
 * seja o que for — por isso o estado "normal" fica cinzento e só os que pedem
 * atenção puxam o olho.
 */

type Tom = "marca" | "neutro" | "espera" | "bom" | "mau";

const TOM: Record<Tom, string> = {
  marca: "bg-brand-50 text-brand-700 ring-brand-100",
  neutro: "bg-slate-100 text-slate-500 ring-slate-200/70",
  espera: "bg-amber-50 text-amber-700 ring-amber-100",
  bom: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  mau: "bg-red-50 text-red-700 ring-red-100",
};

export function IconeDeLinha({
  children,
  tom = "marca",
  titulo,
}: {
  children: React.ReactNode;
  tom?: Tom;
  /** O que o ícone quer dizer. Sem isto é decoração, e decoração não informa. */
  titulo: string;
}) {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      role="img"
      className={cx(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
        TOM[tom]
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────── Por espécie ───────────────────────────────── */

const ORIGEM: Record<string, { Icone: typeof Layers; titulo: string }> = {
  preventiva: { Icone: Calendario, titulo: "Preventiva — nasceu de um plano" },
  corretiva: { Icone: Inbox, titulo: "Corretiva — nasceu de uma avaria ou de uma não conformidade" },
  obra: { Icone: Layers, titulo: "Obra — nasceu de um orçamento" },
};

/** O que a ordem é. Sempre em roxo: é a espécie, não o estado. */
export function IconeDaOrdem({ origem }: { origem: string }) {
  const o = ORIGEM[origem] ?? { Icone: Layers, titulo: origem };
  return (
    <IconeDeLinha titulo={o.titulo}>
      <o.Icone width={13} height={13} />
    </IconeDeLinha>
  );
}

const ESTADO: Record<string, { Icone: typeof Clock; tom: Tom; titulo: string }> = {
  por_aprovar: { Icone: Clock, tom: "espera", titulo: "Por aprovar" },
  agendada: { Icone: Calendario, tom: "neutro", titulo: "Agendada" },
  em_curso: { Icone: Play, tom: "marca", titulo: "Em curso" },
  pausada: { Icone: Pause, tom: "espera", titulo: "Em pausa" },
  fechada: { Icone: CheckCircle, tom: "neutro", titulo: "Fechada — falta confirmar" },
  confirmada: { Icone: CheckCircle, tom: "bom", titulo: "Confirmada" },
  cancelada: { Icone: X, tom: "mau", titulo: "Cancelada" },
};

/** Em que estado está. A cor é a do estado, e não a da marca. */
export function IconeDoEstado({ estado }: { estado: string }) {
  const e = ESTADO[estado];
  if (!e) return null;
  return (
    <IconeDeLinha tom={e.tom} titulo={e.titulo}>
      <e.Icone width={13} height={13} />
    </IconeDeLinha>
  );
}

const LOCAL: Record<string, string> = {
  morada: "Morada",
  edificio: "Edifício",
  piso: "Piso",
  espaco: "Espaço",
};

export function IconeDoLocal({ tipo }: { tipo: string }) {
  return (
    <IconeDeLinha titulo={LOCAL[tipo] ?? tipo}>
      {tipo === "morada" ? (
        <MapPin width={13} height={13} />
      ) : (
        <Building width={13} height={13} />
      )}
    </IconeDeLinha>
  );
}

const CRITICIDADE: Record<string, Tom> = {
  critica: "mau",
  alta: "espera",
  normal: "marca",
  baixa: "neutro",
};

export function IconeDoAtivo({ criticidade }: { criticidade: string }) {
  return (
    <IconeDeLinha
      tom={CRITICIDADE[criticidade] ?? "marca"}
      titulo={`Equipamento · criticidade ${criticidade}`}
    >
      <Layers width={13} height={13} />
    </IconeDeLinha>
  );
}
