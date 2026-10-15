// O corpo da gestão de denúncias: totais, filtros, lista e painel lateral. Os dados vêm da loja em memória.
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { useDenuncias } from "../dados/loja";
import { HOJE_EXEMPLO } from "../lib/datas";
import { SEM_FILTROS, filtrarDenuncias, totaisDaGestao, type FiltrosGestao } from "../lib/filtros";
import { BarraFiltros } from "./BarraFiltros";
import { ListaDenuncias } from "./ListaDenuncias";
import { PainelDenuncia } from "./PainelDenuncia";
import { FaixaResponsavel, TotaisCabecalho } from "./TotaisCabecalho";

export function PaginaGestao() {
  const { t } = useTranslation();
  const denuncias = useDenuncias();
  const [filtros, setFiltros] = useState<FiltrosGestao>(SEM_FILTROS);
  const [aberta, setAberta] = useState<string | null>(null);
  const visiveis = useMemo(() => filtrarDenuncias(denuncias, filtros, HOJE_EXEMPLO), [denuncias, filtros]);
  const totais = useMemo(() => totaisDaGestao(denuncias, HOJE_EXEMPLO), [denuncias]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina titulo={t("cd.gestao.titulo")} subtitulo={t("cd.gestao.subtitulo", { n: denuncias.length })} />
      <FaixaResponsavel />
      <TotaisCabecalho totais={totais} />
      <BarraFiltros filtros={filtros} onChange={setFiltros} />
      <p role="status" className="text-xs text-muted-foreground">{t("cd.lista.contagem", { n: visiveis.length, total: denuncias.length })}</p>
      <ListaDenuncias denuncias={visiveis} hoje={HOJE_EXEMPLO} onAbrir={setAberta} />
      <PainelDenuncia id={aberta} onFechar={() => setAberta(null)} />
    </div>
  );
}
