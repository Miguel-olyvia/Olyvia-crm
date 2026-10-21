// As abas Visita e Levantamento do «Novo negócio» da ficha real. Em cada uma há duas vias: ligar o que a pessoa já tem (só dela, e só o que ainda não
// tem negócio) ou criar de novo, com os mesmos formulários do painel «Visita e levantamento». Nada se grava aqui: o formulário grava tudo, ligado ao
// negócio, quando se carrega em «Criar o negócio».
import { useTranslation } from "@/hooks/useTranslation";
import type { registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { AbaVisita } from "@/components/negocio-metas/AbaVisita";
import { EscolhaDoLevantamento, ListaVisitasPorLigar } from "@/components/negocio-metas/AbaLigarRegistos";
import { ListaVisitas } from "@/components/negocio-metas/ListaVisitas";
import type { LigarRegistos } from "@/components/negocio-metas/ligarNegocio";
import type { ErrosNovoNegocio } from "@/components/negocio-metas/novoNegocio";
import type { useRegistosNovoNegocio } from "./useRegistosNovoNegocio";

const C = "pessoasPagina.neg.create.";

type Registos = ReturnType<typeof useRegistosNovoNegocio>;

interface PropsAba {
  id: string;
  porLigar: ReturnType<typeof registosPorLigar>;
  registos: Registos;
  /** Já se tentou criar: os erros passam a ver-se. */
  tentou: boolean;
}

/** A aba Visita: as visitas da pessoa por ligar (caixas) e a lista das visitas novas. */
export function AbaVisitaNovoNegocio({ id, porLigar, registos, tentou }: PropsAba) {
  const { t } = useTranslation();
  const { ligar, mudarLigar, vis, visitasComCodigoPostal } = registos;
  return (
    <div className="space-y-6">
      <section aria-labelledby={`${id}-ligar-visitas`} className="space-y-3">
        <h3 id={`${id}-ligar-visitas`} className="text-base font-semibold text-foreground">{t(`${C}visits.link.title`)}</h3>
        <p className="text-sm text-muted-foreground">{t(`${C}visits.link.hint`)}</p>
        {porLigar.visitas.length === 0
          ? <p className="text-sm text-foreground">{t(`${C}visits.link.none`)}</p>
          : <ListaVisitasPorLigar id={id} porLigar={porLigar} valor={ligar} aoMudar={mudarLigar} />}
      </section>
      <section aria-labelledby={`${id}-novas-visitas`} className="space-y-3">
        <h3 id={`${id}-novas-visitas`} className="text-base font-semibold text-foreground">{t(`${C}visits.new.title`)}</h3>
        <ListaVisitas
          id={id} visitas={vis.visitas} aberta={vis.aberta} acoes={vis.acoes} comCodigoPostalInvalido={tentou ? visitasComCodigoPostal : []}
        />
      </section>
    </div>
  );
}

interface PropsLevantamento extends PropsAba {
  seccao: string;
  aoMudarSeccao: (id: string) => void;
  erros: ErrosNovoNegocio;
}

/** A aba Levantamento: escolher um que já existe, fazer um novo (com o formulário do painel) ou dispensar. */
export function AbaLevantamentoNovoNegocio({ id, porLigar, registos, seccao, aoMudarSeccao, erros }: PropsLevantamento) {
  const { t } = useTranslation();
  const { ligar, mudarLigar, vis, lev, resp, levantamento, levantamentoNovo } = registos;
  const escolher = (valor: LigarRegistos) => mudarLigar(valor);
  return (
    <div className="space-y-6">
      <section aria-labelledby={`${id}-levantamento`} className="space-y-3">
        <h3 id={`${id}-levantamento`} className="text-base font-semibold text-foreground">{t(`${C}survey.title`)}</h3>
        <EscolhaDoLevantamento id={id} porLigar={porLigar} valor={ligar} aoMudar={escolher} />
      </section>
      {levantamentoNovo && (
        <AbaVisita
          id={id} seccaoAtiva={seccao} aoMudarSeccao={aoMudarSeccao} respostas={resp.respostas} aoEscolher={resp.escolher} aoEscrever={resp.escrever}
          errosRespostas={registos.errosRespostas} levantamento={levantamento} erros={erros} acoesLevantamento={lev.acoes}
          visitas={vis.visitas} visitaAberta={vis.aberta} acoesVisitas={vis.acoes} semVisitas
        />
      )}
    </div>
  );
}
