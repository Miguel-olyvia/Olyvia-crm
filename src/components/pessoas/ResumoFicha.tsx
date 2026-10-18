// A aba "Resumo" da ficha, em secções por esta ordem: as visitas da pessoa (uma só secção), próximo passo e prazo, avisos, os registos por
// ligar (chamadas e levantamentos), contacto, origem e sobre a pessoa. A marca "exemplo" vai por secção.
import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ContactoFicha } from "./ContactoFicha";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import { SeccaoOrigem } from "./SeccaoOrigem";
import { SeccaoRegistos } from "./SeccaoRegistos";
import { SeccaoAvisos, SeccaoPasso, SeccaoSobre } from "./SeccoesResumo";
import { SeccaoVisitas } from "./SeccaoVisitas";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
  alterarVisita: AcoesFicha["alterarVisita"];
  /** Abre o diálogo do resultado de uma visita. */
  aoRegistarResultado: (visitaId: string) => void;
}

export function ResumoFicha(p: ResumoFichaProps) {
  const { t } = useTranslation();
  const { resumo } = p;
  const extras = useExtrasProcesso();
  // O nome de cada negócio: os registos ligados dizem a que negócio pertencem.
  const negocios = useMemo(
    () => new Map(resumo.negocios.map((n) => [n.id, n.servico || t("pessoasPagina.board.dealName")])),
    [resumo.negocios, t],
  );
  // Uma perdida não tem visitas à vista; os outros mostram uma só secção com as visitas da pessoa (as canceladas não contam).
  const visitas = resumo.pessoa.perdida ? [] : resumo.registos.visitas;
  const comVisitas = visitas.some((v) => v.estado !== "cancelada");
  const item = itensDaPessoa(resumo, p.hoje, extras).find((i) => i.tipo === "pessoa");
  return (
    <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      <SeccaoVisitas
        pessoa={resumo.pessoa} visitas={visitas} item={item} hoje={p.hoje} negocios={negocios} alterarVisita={p.alterarVisita}
        aoRegistarResultado={p.aoRegistarResultado}
      />
      <SeccaoPasso resumo={resumo} hoje={p.hoje} comVisita={comVisitas} />
      <SeccaoAvisos
        resumo={resumo} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={p.pendentes}
        aoVerSubmissoes={p.aoVerSubmissoes}
      />
      <SeccaoRegistos contactos={resumo.registos.contactos} levantamentos={resumo.registos.levantamentos} negocios={negocios} />
      <ContactoFicha pessoa={resumo.pessoa} />
      <SeccaoOrigem pessoa={resumo.pessoa} />
      <SeccaoSobre resumo={resumo} hoje={p.hoje} />
    </div>
  );
}
