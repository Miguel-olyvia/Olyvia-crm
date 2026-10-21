// A aba «Visitas» da ficha da pessoa: a secção de visitas (`SeccaoVisitas`) tal como está, com todas as visitas. O botão do passo fica no Resumo,
// junto da próxima visita, por isso aqui a secção recebe `item` vazio. Sem visitas (ou só canceladas) diz que não há.
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { CarregarMais, type MaisItensFicha } from "./CarregarMais";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { contarVisitasAtivas, visitasDaFicha } from "./proximaVisita";
import { SeccaoVisitas } from "./SeccaoVisitas";

interface AbaVisitasFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  alterarVisita?: AcoesFicha["alterarVisita"];
  visitasNaBase?: boolean;
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  aoRegistarResultado: (visitaId: string) => void;
  maisItens?: MaisItensFicha;
}

export function AbaVisitasFicha(p: AbaVisitasFichaProps) {
  const { t } = useTranslation();
  const { resumo } = p;
  const negocios = useMemo(
    () => new Map(resumo.negocios.map((n) => [n.id, n.servico || t("pessoasPagina.board.dealName")])),
    [resumo.negocios, t],
  );
  const visitas = visitasDaFicha(resumo);
  if (contarVisitasAtivas(visitas) === 0) {
    // A primeira página pode ter só canceladas: se há mais por carregar, o botão tem de estar à vista junto do texto de vazio.
    return (
      <div className="space-y-2">
        <p className="text-[15px] text-muted-foreground">{t("pessoasPagina.visitsTab.empty")}</p>
        <CarregarMais tipo="visitas" estado={p.maisItens?.visitas} />
      </div>
    );
  }
  return (
    <div className="[&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
      <SeccaoVisitas
        pessoa={resumo.pessoa} visitas={visitas} item={undefined} hoje={p.hoje} negocios={negocios} alterarVisita={p.alterarVisita}
        naBase={p.visitasNaBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado} mais={p.maisItens?.visitas}
      />
    </div>
  );
}
