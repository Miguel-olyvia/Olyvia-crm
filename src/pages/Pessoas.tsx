import { useEffect, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { ConfirmarResolver } from "@/components/pessoas/ConfirmarResolver";
import { FichaPessoa } from "@/components/pessoas/FichaPessoa";
import { SeparadorPessoas } from "@/components/pessoas/SeparadorPessoas";
import { SeparadorSubmissoes } from "@/components/pessoas/SeparadorSubmissoes";
import { TAB_PESSOAS } from "@/components/pessoas/estilosPessoas";
import { ordenarSubmissoes } from "@/components/pessoas/resolverSubmissao";
import { usePessoasEstado } from "@/components/pessoas/usePessoasEstado";
import { usePessoasUrl, type SeparadorPagina } from "@/components/pessoas/usePessoasUrl";
import { useResolucaoSubmissao } from "@/components/pessoas/useResolucaoSubmissao";

/** A permissão que a página real de submissões pendentes exige (ver a rota em App.tsx). */
const PERMISSAO_SUBMISSOES = "platform.pending_submissions.view";

/**
 * "Pessoas" (CRM): a lista de leads e clientes e, num separador, as submissões pendentes. Só
 * conteúdo de exemplo, sem leitura nem escrita à base: ver `components/pessoas/`. Resolver uma
 * submissão acontece só em memória, e ao recarregar voltam as 6.
 */
const Pessoas = () => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const podeVer = hasPermission(PERMISSAO_SUBMISSOES);
  const estado = usePessoasEstado(podeVer);
  const url = usePessoasUrl(podeVer);
  const ordenadas = useMemo(() => ordenarSubmissoes(estado.submissoes), [estado.submissoes]);
  const pessoas = useMemo(() => new Map(estado.resumos.map((r) => [r.pessoa.id, r.pessoa])), [estado.resumos]);
  const resolucao = useResolucaoSubmissao({ ordenadas, pessoas, resolver: estado.resolver });

  const aberta = estado.resumos.find((r) => r.pessoa.id === url.abertaId) ?? null;
  // Um ?open= que não é de ninguém limpa-se do endereço, sem abrir nada.
  const { abertaId, limpar } = url;
  useEffect(() => { if (abertaId && !aberta) limpar(); }, [abertaId, aberta, limpar]);
  const daAberta = (s: { candidatas: { pessoaId: string }[] }) => s.candidatas.some((c) => c.pessoaId === aberta?.pessoa.id);
  const subtitulo = t("pessoasPagina.summary", {
    total: estado.resumos.length,
    clients: estado.resumos.filter((r) => r.papel === "cliente").length,
    noDeal: estado.resumos.filter((r) => r.semNegocio).length,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <CabecalhoPagina
        subtitulo={subtitulo} titulo={t("pessoasPagina.title")} aviso={t("pessoasPagina.sample")}
        pai={{ to: "/leads", texto: t("sidebar.crm") }}
      />
      <Tabs value={url.separador} onValueChange={(v) => url.mudarSeparador(v as SeparadorPagina)} className="space-y-4">
        <TabsList aria-label={t("pessoasPagina.tabs.label")} className="h-auto">
          <TabsTrigger value="pessoas" className={TAB_PESSOAS}>{t("pessoasPagina.tabs.people")}</TabsTrigger>
          {podeVer && (
            <TabsTrigger value="submissoes" className={TAB_PESSOAS}>
              {t("pessoasPagina.tabs.submissions", { count: ordenadas.length })}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="pessoas" className="mt-0">
          <h2 className="sr-only">{t("pessoasPagina.tabs.people")}</h2>
          <SeparadorPessoas
            resumos={estado.resumos} pendentes={estado.pendentes} hoje={HOJE_EXEMPLO} chip={estado.prefs.chip}
            ordem={estado.prefs.ordem} comVoltou={podeVer} aoMudarChip={estado.mudarChip}
            aoMudarOrdem={estado.mudarOrdem} aoAbrir={url.abrir}
          />
        </TabsContent>
        <TabsContent value="submissoes" className="mt-0">
          <SeparadorSubmissoes
            submissoes={ordenadas} pessoas={pessoas} hoje={HOJE_EXEMPLO} aoAbrirFicha={url.abrir}
            aoPedir={(sid, pid) => resolucao.pedir(sid, pid, "lista")} aoVerPessoas={() => url.mudarSeparador("pessoas")}
          />
        </TabsContent>
      </Tabs>
      <FichaPessoa
        resumo={aberta} hoje={HOJE_EXEMPLO} submissoes={ordenadas.filter(daAberta)} podeVerSubmissoes={podeVer}
        notas={estado.notas.filter((n) => n.pessoaId === aberta?.pessoa.id)} aoFechar={url.fechar}
        aoPedir={(sid, pid) => resolucao.pedir(sid, pid, "ficha")} aoVerTodasSubmissoes={url.irParaSubmissoes}
      />
      <ConfirmarResolver
        pedido={resolucao.pedido} aoConfirmar={resolucao.confirmar} aoCancelar={resolucao.cancelar} aoFechar={resolucao.aoFechar}
      />
      <div role="status" aria-live="polite" className="sr-only">{resolucao.anuncio}</div>
    </div>
  );
};

export default Pessoas;
