/**
 * A faixa «quem o teve», pela ordem do tempo: um bocado por cada vez que esteve com alguém (a largura são os meses que pagou) e, às riscas,
 * os meses da estrutura (ninguém o tinha). É o desenho da lista que vem por baixo, com as mesmas cores, por isso é decorativa
 * (`aria-hidden`): o leitor de ecrã lê a lista. Os nomes só chegam aqui se o RH os deixa ver (quem chama passa «Reservado ao RH»).
 */
import { cn } from "@/lib/utils";
import { RISCAS_ESTRUTURA, corDaPessoa, type SegmentoDePosse } from "./lib/ativosUi";

interface Props {
  segmentos: readonly SegmentoDePosse[];
  /** O nome de cada ocupação (pelo índice) e da estrutura. */
  nomeDe: (dono: number) => string;
}

export function FaixaPosse({ segmentos, nomeDe }: Props) {
  const total = segmentos.reduce((s, x) => s + x.meses, 0);
  if (total === 0) return null;
  return (
    <div aria-hidden="true" className="flex h-9 gap-[3px] overflow-hidden rounded-xl">
      {segmentos.map((s, i) => {
        const estrutura = s.dono < 0;
        return (
          <div
            key={`${s.dono}-${i}`}
            title={nomeDe(s.dono)}
            className={cn(
              "flex min-w-[6px] items-center overflow-hidden whitespace-nowrap px-2.5 text-xs font-semibold",
              estrutura ? "text-muted-foreground" : corDaPessoa(s.dono),
            )}
            style={{ flexGrow: s.meses, flexBasis: 0, ...(estrutura ? RISCAS_ESTRUTURA : {}) }}
          >
            {s.meses / total > 0.14 && <span className="truncate">{nomeDe(s.dono)}</span>}
          </div>
        );
      })}
    </div>
  );
}
