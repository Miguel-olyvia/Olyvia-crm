// O corpo da gestão de denúncias da ORGANIZAÇÃO ativa: totais, abas por origem, filtros, lista e painel lateral. Mostra as
// denúncias anónimas e as identificadas, nunca as de outra organização e nunca a identidade de uma anónima.
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { useDenunciasDaOrganizacao } from "../dados/loja";
import { HOJE_EXEMPLO } from "../lib/datas";
import { SEM_FILTROS, filtrarDenuncias, totaisDaGestao, type FiltrosGestao } from "../lib/filtros";
import { contarPorOrigem } from "../lib/organizacao";
import { AbasOrigem } from "./AbasOrigem";
import { BarraFiltros } from "./BarraFiltros";
import { ListaDenuncias } from "./ListaDenuncias";
import { PainelDenuncia } from "./PainelDenuncia";
import { FaixaResponsavel, TotaisCabecalho } from "./TotaisCabecalho";

interface PaginaGestaoProps {
  /** A organização ativa: a gestão só mostra as denúncias desta. */
  organizacaoId: string;
  /** O nome da organização ativa, só para o cabeçalho. */
  organizacaoNome: string;
}

export function PaginaGestao({ organizacaoId, organizacaoNome }: PaginaGestaoProps) {
  const { t } = useTranslation();
  const denuncias = useDenunciasDaOrganizacao(organizacaoId);
  const [filtros, setFiltros] = useState<FiltrosGestao>(SEM_FILTROS);
  const [aberta, setAberta] = useState<string | null>(null);
  const visiveis = useMemo(() => filtrarDenuncias(denuncias, filtros, HOJE_EXEMPLO), [denuncias, filtros]);
  const totais = useMemo(() => totaisDaGestao(denuncias, HOJE_EXEMPLO), [denuncias]);
  const contagem = useMemo(() => contarPorOrigem(denuncias), [denuncias]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina
        titulo={t("cd.gestao.titulo")}
        subtitulo={t("cd.gestao.subtitulo", { n: denuncias.length })}
        raiz={{ rotulo: t("sidebar.rhExemploModulo"), to: "/rh-exemplo/pessoas" }}
        organizacao={organizacaoNome}
      />
      <FaixaResponsavel />
      <TotaisCabecalho totais={totais} />
      <AbasOrigem origem={filtros.origem} contagem={contagem} onChange={(origem) => setFiltros({ ...filtros, origem })}>
        <BarraFiltros filtros={filtros} onChange={setFiltros} />
        <p role="status" className="text-xs text-muted-foreground">{t("cd.lista.contagem", { n: visiveis.length, total: denuncias.length })}</p>
        <ListaDenuncias denuncias={visiveis} hoje={HOJE_EXEMPLO} onAbrir={setAberta} />
      </AbasOrigem>
      <PainelDenuncia id={aberta} onFechar={() => setAberta(null)} />
    </div>
  );
}
