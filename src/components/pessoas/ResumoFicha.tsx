// A aba "Resumo" da ficha, em secções por esta ordem: as visitas por fechar (já passaram e ninguém as marcou como feitas), a próxima visita
// (as outras estão na aba Visitas), próximo passo e prazo, avisos, os registos por
// ligar (chamadas e levantamentos), contacto e a lead (origem e resumo). A marca "exemplo" vai por secção.
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { MaisItensFicha } from "./CarregarMais";
import { ContactoFicha } from "./ContactoFicha";
import type { AcoesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import { SeccaoRecolhivel } from "./SeccaoRecolhivel";
import { SeccaoRegistos } from "./SeccaoRegistos";
import { SeccaoAvisos, SeccaoLead, SeccaoPasso } from "./SeccoesResumo";
import { proximaVisitaDaPessoa, contarVisitasAtivas, visitasDaFicha, visitasPorFechar } from "./proximaVisita";
import { SeccaoProximaVisita } from "./SeccaoProximaVisita";
import { SeccaoVisitasPorFechar } from "./SeccaoVisitasPorFechar";
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
  /** O guia do passo seguinte já tem o botão do passo da pessoa: as secções das visitas não o repetem. */
  semBotaoDoPasso?: boolean;
  /**
   * A ficha com o guia (ecrã único): o Resumo deixa de ser uma aba e fica só o que apoia o guia, sem repetir o que ele já mostra. Em cima, os alertas
   * de ação (visitas por fechar, próxima visita, avisos); depois, em secções recolhíveis e fechadas, os registos, os dados da pessoa e a lead. Não
   * desenha «Próximo passo e prazo» (vive no passo) nem o contacto (é o cartão do cliente do guia).
   */
  modoApoio?: boolean;
}

/** Uma secção recolhível cujo conteúdo já tem o seu título: o título de dentro fica só para o leitor de ecrã (não se repete o botão). */
const SEM_TITULO_REPETIDO = "[&>section]:border-t-0 [&>section]:pt-0 [&>section>div:first-child]:sr-only";

export function ResumoFicha(p: ResumoFichaProps) {
  const { t } = useTranslation();
  const { resumo } = p;
  const extras = useExtrasProcesso();
  // O nome de cada negócio: os registos ligados dizem a que negócio pertencem.
  const negocios = useMemo(
    () => new Map(resumo.negocios.map((n) => [n.id, n.servico || t("pessoasPagina.board.dealName")])),
    [resumo.negocios, t],
  );
  // No exemplo, a visita diz se nela se fez um levantamento (como na aba Visitas); na ficha real a informação não existe.
  const comLevantamento = useMemo(
    () => new Set(resumo.registos.levantamentos.flatMap((l) => (l.visitaId ? [l.visitaId] : []))), [resumo.registos.levantamentos],
  );
  // Uma perdida não tem visitas à vista. O Resumo mostra as visitas por fechar (já passaram e ainda não foram marcadas como feitas) e a próxima
  // visita (as outras estão na aba Visitas); o botão do passo fica num só sítio: nas visitas por fechar, ou, sem elas, junto da próxima visita
  // ou, sem nenhuma das duas (a visita já foi feita, ou não tem dia), no «Próximo passo e prazo».
  const visitas = visitasDaFicha(resumo);
  const comVisitas = contarVisitasAtivas(visitas) > 0;
  const proxima = proximaVisitaDaPessoa(visitas, p.hoje);
  const porFechar = visitasPorFechar(visitas, p.hoje);
  const temPorFechar = porFechar.length > 0;
  const item = p.semBotaoDoPasso ? undefined : itensDaPessoa(resumo, p.hoje, extras).find((i) => i.tipo === "pessoa");
  const acaoDoPasso = item && comVisitas ? <AcaoDoPassoPessoa item={item} nome={resumo.pessoa.nome} feita={temVisitaFeitaPorLigar(visitas)} /> : undefined;
  const alertas = (
    <>
      <SeccaoVisitasPorFechar
        pessoa={resumo.pessoa} porFechar={porFechar} visitas={visitas} item={item} hoje={p.hoje} negocios={negocios}
        alterarVisita={p.alterarVisita} naBase={p.visitasNaBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado}
        comLevantamento={p.visitasNaBase ? undefined : comLevantamento}
      />
      <SeccaoProximaVisita
        pessoa={resumo.pessoa} visita={proxima} visitas={visitas} total={contarVisitasAtivas(visitas)} item={temPorFechar ? undefined : item} hoje={p.hoje} negocios={negocios}
        alterarVisita={p.alterarVisita} naBase={p.visitasNaBase} cancelarVisita={p.cancelarVisita} aoRegistarResultado={p.aoRegistarResultado}
        comLevantamento={p.visitasNaBase ? undefined : comLevantamento} aoVerTodas={p.aoVerVisitas}
      />
    </>
  );
  const avisos = (
    <SeccaoAvisos
      resumo={resumo} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={p.pendentes}
      aoVerSubmissoes={p.aoVerSubmissoes}
    />
  );
  if (p.modoApoio) {
    return (
      <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
        {alertas}
        {avisos}
        <div className="space-y-2">
          <SeccaoRecolhivel titulo={t("pessoasPagina.reg.kind.records")}>
            <div className={SEM_TITULO_REPETIDO}>
              <SeccaoRegistos
                contactos={resumo.registos.contactos} levantamentos={resumo.registos.levantamentos} negocios={negocios}
                maisContactos={p.maisItens?.contactos} maisLevantamentos={p.maisItens?.levantamentos}
              />
            </div>
          </SeccaoRecolhivel>
          {p.identidade && <SeccaoRecolhivel titulo={t("pessoasPagina.guia.secao.dados")}><div className="space-y-4">{p.identidade}</div></SeccaoRecolhivel>}
          <SeccaoRecolhivel titulo={t("pessoasPagina.sum.lead")}>
            <div className={SEM_TITULO_REPETIDO}><SeccaoLead resumo={resumo} hoje={p.hoje} /></div>
          </SeccaoRecolhivel>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-4">
      {alertas}
      <SeccaoPasso
        resumo={resumo} hoje={p.hoje} comVisita={comVisitas} proximaVisitaVisivel={proxima !== undefined} visitaPorFechar={temPorFechar}
        acao={proxima || temPorFechar ? undefined : acaoDoPasso}
      />
      {avisos}
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
