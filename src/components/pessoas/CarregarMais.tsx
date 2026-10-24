// «Carregar mais» de uma secção da ficha (contactos, visitas, levantamentos, atividade): o botão, o estado «a carregar» e o erro.
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ErroAcao } from "./ErroAcao";

export type TipoMais = "contactos" | "visitas" | "levantamentos" | "atividade";

/** O estado de «carregar mais» de uma secção: há mais, está a carregar, falhou (a chave do erro) e como pedir. */
export interface MaisItens {
  temMais: boolean;
  aCarregar: boolean;
  /** A chave de tradução do erro da última tentativa; `null` sem erro. */
  erro: string | null;
  aoPedir: () => void;
}

/** Por secção; uma secção sem entrada (o exemplo) não tem botão. */
export type MaisItensFicha = Partial<Record<TipoMais, MaisItens>>;

interface CarregarMaisProps {
  tipo: TipoMais;
  estado: MaisItens | undefined;
}

/** O botão e o erro de uma secção. Sem mais itens e sem erro não desenha nada. */
export function CarregarMais({ tipo, estado }: CarregarMaisProps) {
  const { t } = useTranslation();
  if (!estado || (!estado.temMais && !estado.erro)) return null;
  return (
    <div className="space-y-2 pt-2">
      <Button
        type="button" variant="outline" aria-disabled={estado.aCarregar || undefined} aria-busy={estado.aCarregar || undefined}
        className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
        onClick={() => { if (!estado.aCarregar) estado.aoPedir(); }}
      >
        {estado.aCarregar ? t("pessoasPagina.real.ficha.more.loading") : t(`pessoasPagina.real.ficha.more.${tipo}`)}
      </Button>
      <ErroAcao chave={estado.erro} />
    </div>
  );
}
