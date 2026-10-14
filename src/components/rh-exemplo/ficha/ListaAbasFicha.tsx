// As oito abas sublinhadas da ficha de RH, fixas por baixo do cabeçalho, com contadores onde dizem alguma coisa: contratos,
// documentos e ausências por decidir (esta só quando há alguma).
//
// No painel lateral (~640 px) as oito não cabem: a barra rola na horizontal com encaixe (scroll-snap), a aba ativa vem
// sempre à vista, e há uma seta (botão de 44 px) de cada lado quando há abas escondidas, para que «Custo», a última,
// nunca fique cortada sem aviso. O teclado não precisa das setas: as setas do teclado já passam de aba em aba.
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Aba, ListaAbas } from "@/components/ficha-comum/AbasSublinhadas";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ABAS_FICHA, type AbaFicha } from "./abas";
import type { ContadoresFicha } from "./contadores";
import { useRolagemAbas } from "./useRolagemAbas";

interface SetaProps {
  lado: "anterior" | "seguinte";
  rotulo: string;
  aoClicar: () => void;
}

function Seta({ lado, rotulo, aoClicar }: SetaProps) {
  const anterior = lado === "anterior";
  const Icone = anterior ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button" aria-label={rotulo} onClick={aoClicar} tabIndex={-1} data-testid={`rh-abas-seta-${lado}`}
      className={cn(
        "absolute top-0 z-10 flex h-11 w-11 items-center justify-center bg-background/95 text-foreground shadow-sm",
        anterior ? "left-0 border-r" : "right-0 border-l", FOCO,
      )}
    >
      <Icone className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

interface Props {
  contadores: ContadoresFicha;
  /** A aba aberta, para a trazer à vista quando muda. */
  abaAtiva: AbaFicha;
}

export function ListaAbasFicha({ contadores, abaAtiva }: Props) {
  const { t } = useTranslation();
  const raiz = useRef<HTMLDivElement>(null);
  const { haAnteriores, haSeguintes, rolar } = useRolagemAbas(raiz, abaAtiva);
  const numero: Partial<Record<AbaFicha, number>> = {
    contratos: contadores.contratos,
    documentos: contadores.documentos,
    ...(contadores.ausenciasPorDecidir > 0 ? { ausencias: contadores.ausenciasPorDecidir } : {}),
  };
  return (
    <div ref={raiz} className="relative shrink-0">
      {haAnteriores && <Seta lado="anterior" rotulo={t("rhAbas.fichaAbas.anteriores")} aoClicar={() => rolar("anterior")} />}
      <ListaAbas aria-label={t("rhForm.ficha.tabs.label")} className="snap-x snap-proximity scroll-px-12 px-6">
        {ABAS_FICHA.map((aba) => (
          <Aba
            key={aba} value={aba} rotulo={t(`hr.pessoa.tabs.${aba}`)} contador={numero[aba]} className="snap-start px-2.5"
            contadorLeitor={t("rhForm.ficha.tabs.contador", { n: numero[aba] ?? 0 })}
          />
        ))}
      </ListaAbas>
      {haSeguintes && <Seta lado="seguinte" rotulo={t("rhAbas.fichaAbas.seguintes")} aoClicar={() => rolar("seguinte")} />}
    </div>
  );
}
