// A aba "Resumo" da ficha, em secções por esta ordem: a próxima visita (as outras estão na aba Visitas), próximo passo e prazo, avisos, os registos por
// ligar (chamadas e levantamentos), contacto e a lead (origem e resumo). A marca "exemplo" vai por secção.
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { MaisItensFicha } from "./CarregarMais";
import { ContactoFicha } from "./ContactoFicha";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import { SeccaoRegistos } from "./SeccaoRegistos";
import { SeccaoAvisos, SeccaoLead, SeccaoPasso } from "./SeccoesResumo";
import { proximaVisitaDaPessoa, contarVisitasAtivas, visitasDaFicha } from "./proximaVisita";
import { SeccaoProximaVisita } from "./SeccaoProximaVisita";
import { AcaoDoPassoPessoa, temVisitaFeitaPorLigar } from "./SeccaoVisitas";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
  /** «Ver todas» da próxima visita: abre a aba Visitas. */
  aoVerVisitas: () => void;
  /** O exemplo: sem isto (e sem `visitasNaBase`) as visitas não têm o botão «Alterar». */
  alterarVisita?: AcoesFicha["alterarVisita"];
  /** A ficha real: alterar e cancelar visitas grava na base pelos próprios diálogos. */
  visitasNaBase?: boolean;
  cancelarVisita?: AcoesFicha["cancelarVisita"];
  /** Abre o diálogo do resultado de uma visita. */
  aoRegistarResultado: (visitaId: string) => void;
  /** «Carregar mais» das visitas, contactos e levantamentos (a ficha real). */
  maisItens?: MaisItensFicha;
  /** A identidade da pessoa (a ficha real), logo antes do contacto. */
  identidade?: ReactNode;
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
  // Uma perdida não tem visitas à vista. O Resumo só mostra a próxima visita (as outras estão na aba Visitas); o botão do passo fica aqui:
  // junto da próxima visita ou, sem ela (a visita já passou, ou já foi feita), no «Próximo passo e prazo».
  const visitas = visitasDaFicha(resumo);
  const comVisitas = contarVisitasAtivas(visitas) > 0;
  const proxima = proximaVisitaDaPessoa(visitas, p.hoje);
  const item = itensDaPessoa(resumo, p.hoje, extras).find((i) => i.tipo === "pessoa");
  const acaoDoPasso = item && comVisitas ? <AcaoDoPassoPessoa item={item} nome={resumo.pessoa.nome} feita={temVisitaFeitaPorLigar(visitas)} /> : undefined;
  return (
    <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      <SeccaoProximaVisita
        pessoa={resumo.pessoa} visita={proxima} visitas={visitas} total={contarVisitasAtivas(visitas)} item={item} hoje={p.hoje} negocios={negocios}
        alterarVisita={p.alterarVisita} naBase={p.visitasNaBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado}
        aoVerTodas={p.aoVerVisitas}
      />
      <SeccaoPasso resumo={resumo} hoje={p.hoje} comVisita={comVisitas} proximaVisitaVisivel={proxima !== undefined} acao={proxima ? undefined : acaoDoPasso} />
      <SeccaoAvisos
        resumo={resumo} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={p.pendentes}
        aoVerSubmissoes={p.aoVerSubmissoes}
      />
      <SeccaoRegistos
        contactos={resumo.registos.contactos} levantamentos={resumo.registos.levantamentos} negocios={negocios}
        maisContactos={p.maisItens?.contactos} maisLevantamentos={p.maisItens?.levantamentos}
      />
      {p.identidade}
      <ContactoFicha pessoa={resumo.pessoa} />
      <SeccaoLead resumo={resumo} hoje={p.hoje} />
    </div>
  );
}
