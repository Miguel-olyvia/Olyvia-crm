import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/pessoas/AbasSublinhadas";
import { juntarAtividade } from "@/components/pessoas/acoesPessoa";
import { textoPendentes } from "@/components/pessoas/formatoPessoas";
import { ConfirmarResolver } from "@/components/pessoas/ConfirmarResolver";
import { FichaPessoa } from "@/components/pessoas/FichaPessoa";
import { SeparadorPessoas } from "@/components/pessoas/SeparadorPessoas";
import { SeparadorSubmissoes } from "@/components/pessoas/SeparadorSubmissoes";
import { ATIVIDADE_EXEMPLO } from "@/components/pessoas/pessoasExemplo";
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
  // A ordem das pessoas visíveis na lista: a ficha usa-a para passar à anterior e à seguinte.
  const [visiveis, setVisiveis] = useState<string[]>([]);
  const url = usePessoasUrl(podeVer);
  const ordenadas = useMemo(() => ordenarSubmissoes(estado.submissoes), [estado.submissoes]);
  const pessoas = useMemo(() => new Map(estado.resumos.map((r) => [r.pessoa.id, r.pessoa])), [estado.resumos]);
  const resolucao = useResolucaoSubmissao({ ordenadas, pessoas, resolver: estado.resolver });

  const aberta = estado.resumos.find((r) => r.pessoa.id === url.abertaId) ?? null;
  // Um ?open= que não é de ninguém limpa-se do endereço, sem abrir nada.
  const { abertaId, limpar } = url;
  useEffect(() => { if (abertaId && !aberta) limpar(); }, [abertaId, aberta, limpar]);
  // Ao fechar, a ficha guarda a última pessoa para não deslizar vazia enquanto sai.
  const ultimoId = useRef<string | null>(null);
  if (aberta) ultimoId.current = aberta.pessoa.id;
  const daFicha = aberta ?? estado.resumos.find((r) => r.pessoa.id === ultimoId.current) ?? null;
  const idAberta = daFicha?.pessoa.id;
  const atividadeAberta = useMemo(
    () => juntarAtividade(
      ATIVIDADE_EXEMPLO.filter((i) => i.pessoaId === idAberta), estado.atividade.filter((i) => i.pessoaId === idAberta),
    ),
    [idAberta, estado.atividade],
  );
  const daAberta = (s: { candidatas: { pessoaId: string }[] }) => s.candidatas.some((c) => c.pessoaId === idAberta);
  const subtitulo = t("pessoasPagina.summary", {
    total: estado.resumos.length,
    clients: estado.resumos.filter((r) => r.papel === "cliente").length,
    noDeal: estado.resumos.filter((r) => r.semNegocio).length,
  });

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      {/* Como no Inventário: a barra de abas no topo, com a linha fina por baixo, e só depois migalhas e título. */}
      <Tabs value={url.separador} onValueChange={(v) => url.mudarSeparador(v as SeparadorPagina)} className="space-y-5">
        <ListaAbas aria-label={t("pessoasPagina.tabs.label")}>
          <Aba value="pessoas" rotulo={t("pessoasPagina.tabs.people")} />
          {podeVer && (
            <Aba
              value="submissoes" rotulo={t("pessoasPagina.tabs.submissions")} contador={ordenadas.length}
              contadorLeitor={textoPendentes(t, ordenadas.length)} novo={ordenadas.length > 0}
            />
          )}
        </ListaAbas>
        <CabecalhoPagina
          subtitulo={subtitulo} titulo={t("pessoasPagina.title")} aviso={t("pessoasPagina.sample")}
          pai={{ to: "/leads", texto: t("sidebar.crm") }}
          acoes={(
            <Button type="button" className={`min-h-11 gap-2 ${FOCO}`} onClick={() => toast.info(t("pessoasPagina.newLeadToast"))}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("pessoasPagina.newLead")}
            </Button>
          )}
        />
        <TabsContent value="pessoas" className="mt-0">
          <h2 className="sr-only">{t("pessoasPagina.tabs.people")}</h2>
          <SeparadorPessoas
            resumos={estado.resumos} pendentes={estado.pendentes} tipo={estado.prefs.tipo} chip={estado.prefs.chip}
            ordem={estado.prefs.ordem} comVoltou={podeVer} aoMudarTipo={estado.mudarTipo} aoMudarChip={estado.mudarChip}
            aoMudarOrdem={estado.mudarOrdem} aoAbrir={url.abrir} aoMudarVisiveis={setVisiveis}
          />
        </TabsContent>
        <TabsContent value="submissoes" className="mt-0">
          <h2 className="sr-only">{t("pessoasPagina.tabs.submissions")}</h2>
          <SeparadorSubmissoes
            submissoes={ordenadas} pessoas={pessoas} hoje={HOJE_EXEMPLO} aoAbrirFicha={url.abrir}
            aoPedir={(sid, pid) => resolucao.pedir(sid, pid, "lista")} aoVerPessoas={() => url.mudarSeparador("pessoas")}
          />
        </TabsContent>
      </Tabs>
      <FichaPessoa
        resumo={daFicha} aberto={aberta !== null} anuncioExterno={resolucao.anuncio} hoje={HOJE_EXEMPLO} submissoes={ordenadas.filter(daAberta)} podeVerSubmissoes={podeVer}
        notas={estado.notas.filter((n) => n.pessoaId === idAberta)} atividade={atividadeAberta}
        voltou={idAberta !== undefined && estado.pendentes.has(idAberta)} acoes={estado} aoFechar={url.fechar}
        idsVisiveis={url.separador === "pessoas" ? visiveis : []} aoIrPara={url.abrir} pessoas={pessoas}
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
