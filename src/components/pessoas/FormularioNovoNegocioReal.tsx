// O corpo do painel «Novo negócio» na ficha real: abas Geral e, com permissão de editar, Visita e Levantamento; o rodapé fixo (Cancelar e Criar o
// negócio) e a gravação contra a base. Em Visita e em Levantamento liga-se o que a pessoa já tem (só dela e sem negócio) ou cria-se de novo. Grava-se
// por esta ordem: 1) valida-se tudo e corre-se o plano das visitas e do levantamento novos em seco, para um erro previsível aparecer antes de criar
// nada; 2) neg_criar_negocio, que cria o negócio e liga o que já existia; 3) as visitas e o levantamento novos, já ligados ao negócio. O id do
// negócio gera-se ao abrir (o painel desmonta ao fechar) e é o mesmo entre reenvios: é o que torna o criar idempotente. Não é atómico: se o passo 3
// falha o negócio já existe, o painel diz-o e repetir só grava o que falta (o passo 2 não se repete). O comercial fica por escolher: a base usa quem cria.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { useGuardarRegistos } from "@/hooks/pessoas/useGuardarRegistos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { textoDoErroGravar } from "@/components/pessoas-processo/textoDoErroGravar";
import { registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { ListaContactosPorLigar } from "@/components/negocio-metas/AbaLigarRegistos";
import { AbaNovo, ListaAbasNovo, Tabs, TabsContent } from "@/components/negocio-metas/AbasNovoNegocio";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { FECHO_POR_OMISSAO, type FechoNegocio } from "@/components/negocio-metas/fechoNegocio";
import type { MutacoesNegocio, ResultadoCriar } from "@/components/negocio-metas/mutacoesNegocio";
import { useComercialDaSessao } from "@/hooks/pessoas/useComercialDaSessao";
import { localizarErrosRespostas } from "@/components/negocio-metas/respostasQuestionario";
import { leadMaisRecente } from "@/components/negocio-metas/SeletorLead";
import { useAoNegocioIndisponivel } from "@/components/negocio-metas/useAoNegocioIndisponivel";
import { useEnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { usePedidoFoco } from "@/components/negocio-metas/usePedidoFoco";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { AbaGeralNovoNegocioReal, type ErrosGeralReal } from "./AbaGeralNovoNegocioReal";
import { AbaLevantamentoNovoNegocio, AbaVisitaNovoNegocio } from "./AbasRegistosNovoNegocio";
import { useRegistosNovoNegocio } from "./useRegistosNovoNegocio";

const N = "businessGoals.new.";
const C = "pessoasPagina.neg.create.";
const AVISO_QUESTIONARIO_MUDOU = `${N}qform.changed`;
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);
const SECCAO_DAS_MEDIDAS = "medidas";

type Aba = "geral" | "visita" | "levantamento";
const ABAS: readonly Aba[] = ["geral", "visita", "levantamento"];

interface FormularioProps {
  pessoaId: string;
  pessoaNome: string;
  /** A ficha da pessoa: as visitas e o levantamento novos gravam-se nela (nunca sobre o levantamento sem negócio que ela já tenha). */
  ficha: FichaDb;
  mutacoes: MutacoesNegocio;
  dados: DadosNegocio;
  /** O painel diz a quem o controla se há uma gravação em curso (o Esc e o clique fora não fecham enquanto guarda). */
  aoMudarOcupado: (ocupado: boolean) => void;
  aoSujar: () => void;
  aoCriado: (resultado: ResultadoCriar, titulo: string) => void;
  /** Fecha o painel (NG001: o negócio já não está disponível). */
  aoFechar: () => void;
}

export function FormularioNovoNegocioReal({ pessoaId, ficha, mutacoes, dados, aoMudarOcupado, aoSujar, aoCriado, aoFechar }: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const [idNegocio] = useState(() => crypto.randomUUID());
  const envio = useEnvioAssincrono(useAoNegocioIndisponivel(aoFechar));
  const gravar = useGuardarRegistos(ficha, { negocioId: idNegocio, ignorarLevantamentoLivre: true });
  const { questionario } = useQuestionario();
  const resultado = useRef<ResultadoCriar | null>(null);
  const questionarioMudou = useRef(false);
  /** O negócio criado já foi entregue a quem monta (abre-se): daí em diante fechar o painel não perde nada. */
  const entregue = useRef(false);
  const tituloRef = useRef<HTMLInputElement>(null);
  const reabrirRef = useRef<HTMLInputElement>(null);
  const [pedirFoco, pedirFocoPergunta] = usePedidoFoco(id);
  const [aba, setAba] = useState<Aba>("geral");
  const [seccao, setSeccao] = useState(SECCAO_DAS_MEDIDAS);
  const [tentou, setTentou] = useState(false);
  /** O negócio já existe mas o resto não gravou todo: o que ficou e o que falhou. */
  const [parcial, setParcial] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [lead, setLead] = useState(() => leadMaisRecente(dados.leadsAbertas)?.id ?? "");
  const [reabrir, setReabrir] = useState(false);
  const [fecho, setFecho] = useState<FechoNegocio>(FECHO_POR_OMISSAO);
  const porLigar = useMemo(() => registosPorLigar(dados.registos, pessoaId), [dados.registos, pessoaId]);
  const comercialDaSessao = useComercialDaSessao();
  const registos = useRegistosNovoNegocio({ porLigar, levantamentosCompletos: dados.levantamentosCompletos, hoje: hojeLisboa(), aoSujar });
  useEffect(() => {
    aoMudarOcupado(envio.aGuardar);
  }, [aoMudarOcupado, envio.aGuardar]);
  // Ao desmontar (o painel fechou) já não há gravação a bloquear nada.
  useEffect(() => () => aoMudarOcupado(false), [aoMudarOcupado]);
  // O painel fechou (Esc, X, clique fora) com o negócio criado e os registos novos por gravar: sem este aviso, quem fecha julga que nada se criou.
  const traduzir = useRef(t);
  useEffect(() => { traduzir.current = t; });
  useEffect(() => () => {
    if (resultado.current && !entregue.current) toast.info(traduzir.current(`${C}partial.closed`));
  }, []);

  const podeLigar = dados.podeEditar;
  const escolhida = dados.leadsAbertas.find((l) => l.id === lead);
  const erros: ErrosGeralReal = tentou ? { titulo: titulo.trim() === "", reabrir: escolhida?.encerrada === true && !reabrir } : {};
  const tituloLimpo = titulo.trim();
  const errosLevantamento = tentou ? registos.errosLevantamento : {};
  const comErrosLevantamento = tentou && (!!registos.errosLevantamento.linhas || !!registos.errosLevantamento.data || Object.keys(registos.errosRespostas).length > 0);

  const mudarGeral = (p: { titulo?: string; notas?: string; lead?: string; reabrir?: boolean; fecho?: FechoNegocio }) => {
    aoSujar();
    if (p.titulo !== undefined) setTitulo(p.titulo);
    if (p.notas !== undefined) setNotas(p.notas);
    if (p.lead !== undefined) setLead(p.lead);
    if (p.reabrir !== undefined) setReabrir(p.reabrir);
    if (p.fecho !== undefined) setFecho(p.fecho);
  };

  /** Leva à primeira coisa errada nas abas Visita e Levantamento; devolve `true` se havia algo errado (então não se envia). */
  const irParaErroDosRegistos = (): boolean => {
    const [visitaErrada] = registos.visitasComCodigoPostal;
    if (visitaErrada) {
      setAba("visita");
      if (registos.vis.aberta !== visitaErrada) registos.vis.acoes.alternar(visitaErrada);
      pedirFoco(`${visitaErrada}-cp`);
      return true;
    }
    const resposta = localizarErrosRespostas(questionario, registos.errosRespostas).primeiro;
    if (resposta) {
      setAba("levantamento");
      if (resposta.aba === "visita") setSeccao(resposta.seccao);
      pedirFocoPergunta(resposta.pergunta);
      return true;
    }
    if (registos.errosLevantamento.data) {
      setAba("levantamento");
      setSeccao(SECCAO_DAS_MEDIDAS);
      pedirFoco("lev-data");
      return true;
    }
    const linhas = registos.errosLevantamento.linhas ?? {};
    const linha = registos.levantamento.linhas.find((l) => linhas[l.id]);
    if (!linha) return false;
    setAba("levantamento");
    setSeccao(SECCAO_DAS_MEDIDAS);
    const campo = (["divisao", "trabalho", "trabalhoOutro", "medida"] as const).find((c) => linhas[linha.id]?.[c]);
    pedirFoco(`linha-${linha.id}-${campo ?? "divisao"}`);
    return true;
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    const semTitulo = tituloLimpo === "";
    const semReabrir = escolhida?.encerrada === true && !reabrir;
    if (semTitulo || semReabrir) {
      const alvo = semTitulo ? tituloRef : reabrirRef;
      if (aba === "geral") {
        alvo.current?.focus();
      } else {
        // A aba de destino acaba de montar: o foco vai num instante a seguir.
        setAba("geral");
        setTimeout(() => alvo.current?.focus(), 0);
      }
      return;
    }
    if (podeLigar && irParaErroDosRegistos()) return;
    const novos = podeLigar && registos.temNovos;
    const pedido = {
      id: idNegocio, titulo: tituloLimpo, notas, comercialId: null, leadId: escolhida?.id ?? null, reabrirAbordagem: reabrir && escolhida?.encerrada === true, fecho,
      registos: podeLigar ? [...registos.ligar.registos] : [],
      levantamentoId: podeLigar && registos.ligar.levantamento.tipo === "existente" ? registos.ligar.levantamento.id : null,
    };
    envio.enviar(
      async () => {
        setParcial(null);
        // O que a gravação das visitas e do levantamento recusaria diz-se ANTES de criar o negócio. Num reenvio o negócio já existe: não há
        // nada a evitar, e uma recusa aqui esconderia o aviso de que ele foi criado (a gravação recusa o mesmo, já dentro do aviso).
        if (novos && resultado.current === null) gravar.verificar(registos.visitasNovas, registos.rascunho, comercialDaSessao);
        // Um reenvio depois de uma falha a meio já tem o negócio criado: não se repete.
        resultado.current ??= await mutacoes.criar(pedido);
        if (!novos) return;
        try {
          const gravado = await gravar.guardar(registos.visitasNovas, registos.rascunho, comercialDaSessao);
          questionarioMudou.current = gravado.levantamento?.questionarioMudou === true;
        } catch (erro) {
          setParcial(`${t(`${C}partial`)} ${textoDoErroGravar(erro, t)}`);
          // Erro sem chave de base: um NG001 do passo 3 não pode fechar o painel e levar o aviso consigo (o negócio já existe).
          throw new Error("negocio criado, registos por gravar", { cause: erro });
        }
      },
      () => {
        if (!resultado.current) return;
        entregue.current = true;
        // O levantamento ficou gravado mas as perguntas mudaram: o negócio existe e o levantamento também, por isso diz-se e segue-se.
        if (questionarioMudou.current) toast.info(t(AVISO_QUESTIONARIO_MUDOU));
        aoCriado(resultado.current, tituloLimpo);
      },
    );
  };

  const geral = (
    // Com o negócio já criado o reenvio não regrava o separador Geral: deixa de se poder editar (o aviso diz-o).
    <fieldset disabled={parcial !== null} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <AbaGeralNovoNegocioReal
        id={id} titulo={titulo} notas={notas} lead={lead} reabrir={reabrir} fecho={fecho} leads={dados.leadsAbertas} erros={erros} tituloRef={tituloRef}
        reabrirRef={reabrirRef} aoMudar={mudarGeral}
      />
      {podeLigar && porLigar.contactos.length > 0 && (
        <section aria-labelledby={`${id}-ligar-chamadas`} className="space-y-3">
          <h3 id={`${id}-ligar-chamadas`} className="text-base font-semibold text-foreground">{t(`${C}calls.title`)}</h3>
          <p className="text-sm text-muted-foreground">{t(`${C}calls.hint`)}</p>
          <ListaContactosPorLigar id={id} porLigar={porLigar} valor={registos.ligar} aoMudar={registos.mudarLigar} />
        </section>
      )}
    </fieldset>
  );
  const nVisitas = registos.ligar.registos.filter((r) => r.tipo === "visita").length + registos.vis.visitas.length;
  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      {podeLigar ? (
        <Tabs value={aba} className="flex min-h-0 flex-1 flex-col" onValueChange={(v) => setAba(ABAS.find((a) => a === v) ?? "geral")}>
          <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
            <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={tentou && (!!erros.titulo || !!erros.reabrir)} />
            <AbaNovo
              value="visita" rotulo={t(`${C}tab.visit`)} contador={nVisitas} comErros={tentou && registos.visitasComCodigoPostal.length > 0}
              contadorLeitor={t(`${C}tab.visit.count${nVisitas === 1 ? ".one" : ""}`, { n: nVisitas })}
            />
            <AbaNovo value="levantamento" rotulo={t(`${C}tab.survey`)} comErros={comErrosLevantamento} />
          </ListaAbasNovo>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <TabsContent value="geral" className={CONTEUDO}>{geral}</TabsContent>
            <TabsContent value="visita" className={CONTEUDO}>
              <AbaVisitaNovoNegocio id={id} porLigar={porLigar} registos={registos} tentou={tentou} />
            </TabsContent>
            <TabsContent value="levantamento" className={CONTEUDO}>
              <AbaLevantamentoNovoNegocio
                id={id} porLigar={porLigar} registos={registos} tentou={tentou} seccao={seccao} aoMudarSeccao={setSeccao} erros={errosLevantamento}
              />
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {geral}
          <p className="text-sm text-muted-foreground">{t(`${C}records.noPermission`)}</p>
        </div>
      )}
      <div className="shrink-0 px-6">
        {parcial !== null ? <p role="alert" className="text-sm font-medium text-destructive">{parcial}</p> : <ErroDeEnvio chave={envio.erro} />}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{envio.aGuardar ? t("pessoasPagina.neg.saving") : ""}</p>
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        {parcial !== null ? (
          // O negócio já existe: em vez de «Cancelar» (que parece desfazer), fecha-se e abre-se o negócio criado.
          <Button
            type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}
            onClick={() => {
              if (envio.aGuardar || !resultado.current) return;
              entregue.current = true;
              aoCriado(resultado.current, tituloLimpo);
            }}
          >
            {t(`${C}closeCreated`)}
          </Button>
        ) : (
          <SheetClose asChild onClick={(e) => { if (envio.aGuardar) e.preventDefault(); }}>
            <Button type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}>{t(`${C}cancel`)}</Button>
          </SheetClose>
        )}
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${C}submit`)}
        </Button>
      </SheetFooter>
    </form>
  );
}
