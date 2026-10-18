import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { FOCO } from "@/components/negocio-metas/estilos";
import { criarNegocioNovo } from "@/components/negocio-metas/negociosNovos";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import type { DadosCriarNegocio } from "@/components/negocio-metas/novoNegocio";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/pessoas/AbasSublinhadas";
import { juntarAtividade } from "@/components/pessoas/acoesPessoa";
import { textoPendentes } from "@/components/pessoas/formatoPessoas";
import { ConfirmarResolver } from "@/components/pessoas/ConfirmarResolver";
import { FichaPessoa } from "@/components/pessoas/FichaPessoa";
import { NovaLeadPainel } from "@/components/pessoas/NovaLeadPainel";
import { useAvisoAlternado } from "@/components/pessoas/processo/avisoAlternado";
import { ProcessoProvider } from "@/components/pessoas/processo/ProcessoProvider";
import type { DadosNovaLead } from "@/components/pessoas/novaLead";
import { paraOpcao } from "@/components/pessoas/pessoaOpcao";
import type { Pessoa } from "@/components/pessoas/pessoasTipos";
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
 * submissão, criar uma lead, registar uma chamada ou criar um negócio acontecem só em memória: ao recarregar volta o exemplo. A chamada, a visita
 * e o levantamento são REGISTOS da pessoa; o negócio cria-se à mão e liga registos que já existem (nada se copia).
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
  const [novaLeadAberta, setNovaLeadAberta] = useState(false);
  // O painel "Novo negócio" aberto a partir da ficha: a pessoa, já escolhida (os registos por ligar são os dela).
  const [negocioPara, setNegocioPara] = useState<Pessoa | null>(null);
  // O aviso da página e dos passos do processo (uma região live) e o da resolução de submissões (outra): cada origem tem a sua, porque
  // o anúncio da resolução fica guardado e, numa região partilhada, calava todos os avisos que viessem depois.
  const [aviso, setAviso] = useState("");
  const alternarAviso = useAvisoAlternado();
  /** Um aviso da própria página: o mesmo texto duas vezes seguidas (a mesma lead criada duas vezes) volta a ser anunciado. */
  const anunciar = (texto: string) => setAviso(alternarAviso(texto));
  // Com a ficha aberta (um painel modal), a região da página fica escondida do leitor de ecrã: o aviso dos passos feitos a partir da
  // ficha vai para a região live DENTRO dela (`anuncioProcesso`); com a ficha fechada vai para a da página. Nunca para as duas.
  const [avisoFicha, setAvisoFicha] = useState("");
  const opcoesPessoa = useMemo(() => estado.resumos.map((r) => paraOpcao(r.pessoa)), [estado.resumos]);

  const aberta = estado.resumos.find((r) => r.pessoa.id === url.abertaId) ?? null;
  // Um ?open= que não é de ninguém limpa-se do endereço, sem abrir nada.
  const { abertaId, limpar } = url;
  useEffect(() => { if (abertaId && !aberta) limpar(); }, [abertaId, aberta, limpar]);
  // Ao fechar, a ficha guarda a última pessoa para não deslizar vazia enquanto sai.
  const ultimoId = useRef<string | null>(null);
  if (aberta) ultimoId.current = aberta.pessoa.id;
  const daFicha = aberta ?? estado.resumos.find((r) => r.pessoa.id === ultimoId.current) ?? null;
  const idAberta = daFicha?.pessoa.id;
  const fichaAberta = aberta !== null;
  /** Um aviso do processo (um passo) ou da ficha: vai para a região que o leitor de ecrã consegue ouvir agora. */
  const anunciarNoSitio = (texto: string) => (fichaAberta ? setAvisoFicha(texto) : setAviso(texto));
  // Ao fechar a ficha esquece-se o aviso dela: ao abrir outra vez não se repete.
  useEffect(() => { if (!fichaAberta) setAvisoFicha(""); }, [fichaAberta]);
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

  /** Cria a lead (Por contactar), abre-lhe a ficha e avisa. */
  const aoCriarLead = (dados: DadosNovaLead) => {
    const criada = estado.criarLead(dados);
    url.abrir(criada.id);
    toast.success(t("pessoasPagina.newLead.created"));
    anunciar(t("pessoasPagina.newLead.announce", { name: criada.nome }));
  };
  /**
   * Cria o negócio da pessoa (o mesmo de "Novo negócio"): aparece na ficha, em Negócios, e no quadro de Negócio e metas, e liga-lhe os registos
   * escolhidos (contactos, visitas e levantamento: nada se copia). Devolve o id.
   */
  const criarNegocio = (dados: DadosCriarNegocio): string => {
    const criado = criarNegocioNovo(dados, HOJE_EXEMPLO);
    toast.success(t("businessGoals.new.created"));
    return criado.id;
  };
  /** O negócio criado a partir da ficha. */
  const aoCriarNegocio = (dados: DadosCriarNegocio) => {
    criarNegocio(dados);
    anunciarNoSitio(alternarAviso(t("pessoasPagina.createDeal.announce", { name: dados.pessoa.nome })));
  };

  /**
   * O painel «Novo negócio» abriu-se a partir do menu «Mais» da ficha: ao fechar, o foco volta ao «Mais» (se se cancelou) ou ao nome da
   * pessoa (se criou: a ficha passou a mostrar o negócio, e o ponto de partida já não é o mesmo).
   */
  const devolverFocoNaFicha = (criou: boolean): boolean => {
    const alvo = document.querySelector<HTMLElement>(criou ? "[data-ficha-nome]" : "[data-ficha-mais]");
    alvo?.focus();
    return alvo !== null;
  };

  /** "Criar negócio" de uma lead e "Novo negócio" de um cliente: abre o painel com a pessoa escolhida e os registos dela por ligar. */
  const abrirNegocio = (pessoa: Pessoa) => setNegocioPara(pessoa);

  return (
    <ProcessoProvider
      hoje={HOJE_EXEMPLO} resumos={estado.resumos} acoes={estado} opcoesPessoa={opcoesPessoa} aoCriarNegocio={criarNegocio}
      aoAnunciar={anunciarNoSitio}
    >
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
              <Button type="button" className={`min-h-11 gap-2 ${FOCO}`} onClick={() => setNovaLeadAberta(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("pessoasPagina.newLead")}
              </Button>
            )}
          />
          <TabsContent value="pessoas" className="mt-0">
            <h2 className="sr-only">{t("pessoasPagina.tabs.people")}</h2>
            <SeparadorPessoas
              resumos={estado.resumos} pendentes={estado.pendentes} tipo={estado.prefs.tipo} chip={estado.prefs.chip}
              ordem={estado.prefs.ordem} vista={estado.prefs.vista} hoje={HOJE_EXEMPLO} comVoltou={podeVer} aoMudarTipo={estado.mudarTipo} aoMudarChip={estado.mudarChip}
              aoMudarOrdem={estado.mudarOrdem} aoMudarVista={estado.mudarVista} aoAbrir={url.abrir} aoMudarVisiveis={setVisiveis}
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
          resumo={daFicha} aberto={aberta !== null} anuncioExterno={resolucao.anuncio} anuncioProcesso={avisoFicha} hoje={HOJE_EXEMPLO} submissoes={ordenadas.filter(daAberta)} podeVerSubmissoes={podeVer}
          notas={estado.notas.filter((n) => n.pessoaId === idAberta)} atividade={atividadeAberta}
          voltou={idAberta !== undefined && estado.pendentes.has(idAberta)} acoes={estado} aoFechar={url.fechar}
          idsVisiveis={url.separador === "pessoas" ? visiveis : []} aoIrPara={url.abrir} pessoas={pessoas}
          aoPedir={(sid, pid) => resolucao.pedir(sid, pid, "ficha")} aoVerTodasSubmissoes={url.irParaSubmissoes}
          aoCriarNegocio={abrirNegocio}
        />
        <NovaLeadPainel aberto={novaLeadAberta} aoMudarAberto={setNovaLeadAberta} aoCriar={aoCriarLead} />
        <NovoNegocioDialogo
          pessoas={opcoesPessoa} aoCriar={aoCriarNegocio} semBotao aberto={negocioPara !== null}
          aoMudarAberto={(aberto) => { if (!aberto) setNegocioPara(null); }} pessoaInicialId={negocioPara?.id}
          valoresIniciais={negocioPara ? { pessoaId: negocioPara.id, comercial: negocioPara.comercial } : undefined} aoDevolverFoco={devolverFocoNaFicha}
        />
        <ConfirmarResolver
          pedido={resolucao.pedido} aoConfirmar={resolucao.confirmar} aoCancelar={resolucao.cancelar} aoFechar={resolucao.aoFechar}
        />
        <div role="status" aria-live="polite" className="sr-only">{aviso}</div>
        <div role="status" aria-live="polite" className="sr-only">{resolucao.anuncio}</div>
      </div>
    </ProcessoProvider>
  );
};

export default Pessoas;
