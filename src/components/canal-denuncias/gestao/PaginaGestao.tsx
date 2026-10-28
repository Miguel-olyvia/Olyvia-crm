// O corpo da gestão de denúncias da ORGANIZAÇÃO ativa: totais, abas por origem, filtros, lista e painel lateral. Mostra as
// denúncias anónimas e as identificadas, nunca as de outra organização e nunca a identidade de uma anónima.
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AvisoLeitura } from "../comum/AvisoLeitura";
import { CabecalhoPagina } from "../comum/CabecalhoPagina";
import { useFonte, type EstadoLeitura } from "../dados/fonte";
import { SEM_FILTROS, filtrarDenuncias, totaisDaGestao, type FiltrosGestao } from "../lib/filtros";
import { contarPorOrigem } from "../lib/organizacao";
import { AbasOrigem } from "./AbasOrigem";
import { BarraFiltros } from "./BarraFiltros";
import { ConfigurarCanal } from "./ConfigurarCanal";
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
  const fonte = useFonte();
  const leitura = fonte.useDenuncias(organizacaoId);
  const responsaveis = fonte.useResponsaveis(organizacaoId);
  const configuracao = fonte.useConfiguracao(organizacaoId);
  const denuncias = leitura.dados;
  const hoje = fonte.hoje();
  const [filtros, setFiltros] = useState<FiltrosGestao>(SEM_FILTROS);
  const [aberta, setAberta] = useState<string | null>(null);
  const visiveis = useMemo(() => filtrarDenuncias(denuncias, filtros, hoje), [denuncias, filtros, hoje]);
  const totais = useMemo(() => totaisDaGestao(denuncias, hoje), [denuncias, hoje]);
  const contagem = useMemo(() => contarPorOrigem(denuncias), [denuncias]);
  // Sem a lista de responsáveis os nomes da tabela ficariam todos «Sem responsável»: conta como leitura falhada.
  const estado: EstadoLeitura = [leitura.estado, responsaveis.estado].includes("erro")
    ? "erro"
    : [leitura.estado, responsaveis.estado].includes("a_carregar") ? "a_carregar" : "ok";
  const recarregar = (): void => { leitura.recarregar(); responsaveis.recarregar(); };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <CabecalhoPagina
        titulo={t("cd.gestao.titulo")}
        subtitulo={t("cd.gestao.subtitulo", { n: denuncias.length })}
        raiz={{ rotulo: t("sidebar.rhExemploModulo"), to: "/rh-exemplo/pessoas" }}
        organizacao={organizacaoNome}
      />
      <FaixaResponsavel />
      {configuracao.dados && <ConfigurarCanal organizationId={organizacaoId} config={configuracao.dados} />}
      {estado !== "ok" ? (
        <AvisoLeitura estado={estado} onTentar={recarregar} />
      ) : (
        <>
          <TotaisCabecalho totais={totais} />
          <AbasOrigem origem={filtros.origem} contagem={contagem} onChange={(origem) => setFiltros({ ...filtros, origem })}>
            <BarraFiltros filtros={filtros} onChange={setFiltros} responsaveis={responsaveis.dados.lista} />
            <p role="status" className="text-xs text-muted-foreground">{t("cd.lista.contagem", { n: visiveis.length, total: denuncias.length })}</p>
            <ListaDenuncias denuncias={visiveis} hoje={hoje} responsaveis={responsaveis.dados.lista} onAbrir={setAberta} />
          </AbasOrigem>
        </>
      )}
      <PainelDenuncia id={aberta} onFechar={() => setAberta(null)} />
    </div>
  );
}
