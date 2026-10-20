import { useId, useState, type FormEvent, type RefObject } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { AbaGeralNovoNegocio, type AcoesGeral, type ValoresGeral } from "./AbaGeralNovoNegocio";
import { AbaNovo, ListaAbasNovo, Tabs, TabsContent } from "./AbasNovoNegocio";
import { AbaQualificacao, type AcoesQualificacao } from "./AbaQualificacao";
import { AbaVisita } from "./AbaVisita";
import type { AcoesLevantamento } from "./LevantamentoCampos";
import { N } from "./PecasNovoNegocio";
import { useQuestionario } from "./QuestionarioContexto";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import { validarLevantamento, type LevantamentoForm } from "./levantamento";
import { validarCodigoPostal, type MoradaObraForm } from "./moradaObra";
import {
  abasComErros, primeiroErro, type AbaNovoNegocio, type ErrosNovoNegocio, type PessoaOpcao, type RascunhoLevantamento, type ValoresIniciaisNegocio,
} from "./novoNegocio";
import type { Respostas } from "./perguntasTipos";
import { blocosDaQualificacao, seccoesDaVisita } from "./questionarioForm";
import { localizarErrosRespostas, validarRespostas, type ErroResposta } from "./respostasQuestionario";
import { contarRespostas, contarTotal } from "./respostasVisita";
import {
  useCamposGerais, useLevantamentoForm, useMoradaForm, useRespostasForm, useVisitasForm, type AcoesVisitas, type OrigemMorada,
} from "./useEstadoNovoNegocio";
import type { VisitaNegocio } from "./negocioMetas";
import { usePedidoFoco } from "./usePedidoFoco";
import { camposDoLevantamento, visitasComCodigoPostalInvalido, visitasParaGuardar } from "./visitasNegocio";

// O painel «Visita e levantamento» de uma PESSOA (o modo «registos» do painel «Novo negócio»): as mesmas abas, mas guarda no que é da pessoa
// (as visitas e o levantamento ficam nos registos dela) e nunca cria um negócio. O negócio cria-se à mão, noutro painel, e liga estes registos.

const ABAS: readonly AbaNovoNegocio[] = ["geral", "qualificacao", "visita"];
const SECCAO_DO_LEVANTAMENTO = "medidas";
const SECCAO_DAS_VISITAS = "visitas";
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);

interface CorpoProps {
  id: string;
  aba: AbaNovoNegocio;
  aoMudarAba: (aba: AbaNovoNegocio) => void;
  seccao: string;
  aoMudarSeccao: (id: string) => void;
  pessoas: readonly PessoaOpcao[];
  valores: ValoresGeral;
  respostas: Respostas;
  morada: MoradaObraForm;
  origemMorada: OrigemMorada;
  levantamento: LevantamentoForm;
  erros: ErrosNovoNegocio;
  primeiroCampo: RefObject<HTMLButtonElement>;
  acoesGeral: AcoesGeral;
  /** A pessoa já vem escolhida (a ficha de onde se veio) e não se muda. */
  pessoaBloqueada: boolean;
  acoesQualificacao: AcoesQualificacao;
  /** Os erros das respostas de texto e número (ver `validarRespostas`), pela pergunta. */
  errosRespostas: Readonly<Record<string, ErroResposta>>;
  acoesLevantamento: AcoesLevantamento;
  visitas: readonly VisitaNegocio[];
  visitaAberta: string | null;
  acoesVisitas: AcoesVisitas;
  visitasGravadas?: ReadonlySet<string>;
  /** Os ids das visitas com o código postal fora do formato (só depois de tentar guardar). */
  visitasComCodigoPostalInvalido: readonly string[];
}

/** As três abas sublinhadas e o conteúdo de cada uma (a zona que rola); a aba com erros leva o aviso. */
function CorpoAbas(p: CorpoProps) {
  const { t } = useTranslation();
  const { questionario } = useQuestionario();
  const marcas = abasComErros(p.erros);
  const comRespostasErradas = localizarErrosRespostas(questionario, p.errosRespostas).abas;
  const nQualificacao = contarRespostas(blocosDaQualificacao(questionario), p.respostas).respondidas;
  const nVisita = contarTotal(seccoesDaVisita(questionario), p.respostas).respondidas + p.levantamento.linhas.length;
  const plural = (n: number) => (n === 1 ? ".one" : "");
  return (
    <Tabs
      value={p.aba} className="flex min-h-0 flex-1 flex-col"
      onValueChange={(v) => p.aoMudarAba(ABAS.find((a) => a === v) ?? "geral")}
    >
      <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
        <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={marcas.geral} />
        <AbaNovo
          value="qualificacao" rotulo={t(`${N}tab.qualification`)} contador={nQualificacao} comErros={marcas.qualificacao || comRespostasErradas.has("qualificacao")}
          contadorLeitor={t(`${N}tab.qualification.count${plural(nQualificacao)}`, { n: nQualificacao })}
        />
        <AbaNovo
          value="visita" rotulo={t(`${N}tab.visit`)} contador={nVisita} comErros={marcas.visita || comRespostasErradas.has("visita")}
          contadorLeitor={t(`${N}tab.visit.count${plural(nVisita)}`, { n: nVisita })}
        />
      </ListaAbasNovo>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <TabsContent value="geral" className={CONTEUDO}>
          <AbaGeralNovoNegocio
            id={p.id} pessoas={p.pessoas} valores={p.valores} erros={p.erros} primeiroCampo={p.primeiroCampo} acoes={p.acoesGeral}
            pessoaBloqueada={p.pessoaBloqueada}
          />
        </TabsContent>
        <TabsContent value="qualificacao" className={CONTEUDO}>
          <AbaQualificacao
            id={p.id} respostas={p.respostas} morada={p.morada} erroCodigoPostal={!!p.erros.codigoPostal} origemMorada={p.origemMorada}
            moradaContacto={p.valores.contacto.morada} acoes={p.acoesQualificacao} errosRespostas={p.errosRespostas}
          />
        </TabsContent>
        <TabsContent value="visita" className={CONTEUDO}>
          <AbaVisita
            id={p.id} seccaoAtiva={p.seccao} aoMudarSeccao={p.aoMudarSeccao} respostas={p.respostas}
            aoEscolher={p.acoesQualificacao.escolher} aoEscrever={p.acoesQualificacao.escrever} errosRespostas={p.errosRespostas} levantamento={p.levantamento} erros={p.erros} acoesLevantamento={p.acoesLevantamento}
            visitas={p.visitas} visitaAberta={p.visitaAberta} acoesVisitas={p.acoesVisitas} visitasGravadas={p.visitasGravadas}
            visitasComCodigoPostalInvalido={p.visitasComCodigoPostalInvalido}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

interface FormularioRegistosProps {
  pessoas: readonly PessoaOpcao[];
  /** O dia de hoje (AAAA-MM-DD): a data da visita por omissão. */
  hoje: string;
  /** Recebe o foco quando o painel abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
  /** Avisa que há alterações por gravar. */
  aoSujar: () => void;
  /** A pessoa já escolhida ao abrir (a da ficha de onde se veio): com ela o seletor fica desativado, a pessoa não se muda. */
  pessoaInicialId?: string;
  /** O que já vem preenchido (por exemplo a visita concluída de uma pessoa); sem isto o formulário abre vazio. */
  valoresIniciais?: ValoresIniciaisNegocio;
  /** Os ids das visitas que já existem na base (a ficha real): não se removem, cancelam-se, e uma já feita ou cancelada só se lê. */
  visitasGravadas?: ReadonlySet<string>;
  /** A aba com que abre (por omissão a Geral); a Visita abre já na secção das Medidas da área. */
  abaInicial?: AbaNovoNegocio;
  /** A secção da aba Visita com que abre (o id, por exemplo `visitas`); sem isto vale a das Medidas da área. */
  seccaoInicial?: string;
  /** O botão que guarda as visitas e o levantamento (e fecha o painel): o texto do botão e o que fazer. */
  guardarLevantamento: {
    texto: string;
    /** Recebe o rascunho, as visitas e o comercial escolhido no painel (o da aba Geral), que se guarda com o pedido. */
    aoGuardar: (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string) => void;
    motivo?: string | null;
    /** Cresce a cada recusa: o alerta remonta (volta a ser lido com o mesmo texto) e esconde-se quando o rascunho muda. */
    tentativa?: number;
    /** O que se grava está pronto (`useGuardarLevantamento().pronto`: as perguntas da base carregaram). Falso: o botão fica aria-disabled. Sem isto, vale como pronto (o exemplo). */
    pronto?: boolean;
    /** Há uma gravação em curso (a ficha real): o botão fica ocupado (aria-busy, aria-disabled) e um segundo envio não faz nada. */
    aGuardar?: boolean;
  };
}

/**
 * O formulário do painel «Visita e levantamento», com o rodapé fixo (Cancelar e Guardar) e três abas: Geral (a pessoa, que não se muda, e o
 * comercial), Qualificação (perguntas e morada da obra) e Visita (visitas, secções de perguntas e levantamento), todas opcionais. Um envio
 * recusado leva para a aba com erros e põe o foco no primeiro campo errado.
 */
export function FormularioRegistos({
  pessoas, hoje, primeiroCampo, aoSujar: aoSujarDeFora, pessoaInicialId, valoresIniciais, visitasGravadas, abaInicial = "geral", seccaoInicial, guardarLevantamento,
}: FormularioRegistosProps) {
  const { t } = useTranslation();
  const id = useId();
  const idAlerta = useId();
  const idAviso = useId();
  // O motivo de uma recusa vale para o rascunho de então: ao mexer-lhe, o alerta esconde-se (até à recusa seguinte).
  const tentativa = guardarLevantamento.tentativa ?? 0;
  const [limpoEm, setLimpoEm] = useState(-1);
  const aoSujar = () => { aoSujarDeFora(); setLimpoEm(tentativa); };
  const alertaVisivel = !!guardarLevantamento.motivo && tentativa > limpoEm;
  const [aba, setAba] = useState<AbaNovoNegocio>(abaInicial);
  const [tentou, setTentou] = useState(false);
  const [pedirFoco, pedirFocoPergunta] = usePedidoFoco(id);
  const { valores, acoes } = useCamposGerais(pessoas, aoSujar, pessoaInicialId ?? valoresIniciais?.pessoaId, valoresIniciais?.comercial);
  const lev = useLevantamentoForm(hoje, aoSujar, valores.comercial, valoresIniciais?.levantamento);
  const vis = useVisitasForm(hoje, aoSujar, valores.comercial, valoresIniciais?.visitas);
  const resp = useRespostasForm(aoSujar, valoresIniciais?.levantamento?.respostas);
  // A morada da obra sem escrever acompanha as visitas de agora (como em «Novo negócio»): corrigir o código postal da visita corrige-o na obra.
  const morada = useMoradaForm(aoSujar, {
    visitas: vis.visitas, moradaObra: valoresIniciais?.moradaObra ?? valoresIniciais?.levantamento?.moradaObra,
  });
  const [seccao, setSeccao] = useState(seccaoInicial ?? (abaInicial === "visita" ? SECCAO_DO_LEVANTAMENTO : SECCAO_DAS_VISITAS));
  // Guardar só com as perguntas carregadas (as da base) e as respostas certas: o botão diz porquê, e o envio (Enter incluído) recusa.
  const { questionario, podeGuardar } = useQuestionario();
  const errosRespostas = validarRespostas(questionario, resp.respostas);
  const semPerguntas = !podeGuardar || guardarLevantamento.pronto === false;
  const comRespostasErradas = Object.keys(errosRespostas).length > 0;
  const bloqueado = semPerguntas || comRespostasErradas;
  const pessoa = pessoas.find((p) => p.id === valores.pessoaId);
  // A data, quem fez e o estado do levantamento derivam da lista de visitas; as linhas e as observações são do formulário.
  const levantamento = { ...lev.levantamento, ...camposDoLevantamento(vis.visitas, hoje, valores.comercial) };
  // Os erros de agora: as linhas do levantamento e os códigos postais (o da obra e os das visitas, que a base só aceita no formato 0000-000).
  const errosAgora: ErrosNovoNegocio = {
    ...validarLevantamento(levantamento), ...(validarCodigoPostal(morada.morada.codigoPostal) ? { codigoPostal: "invalido" as const } : {}),
  };
  const errosVisiveis: ErrosNovoNegocio = tentou ? errosAgora : {};
  const cpDasVisitas = visitasComCodigoPostalInvalido(vis.visitas, visitasGravadas);

  /** Leva ao primeiro código postal de visita errado: a aba Visita, a secção das Visitas, a visita aberta e o foco no campo. */
  const irParaVisitaComErro = (visitaId: string) => {
    setAba("visita");
    setSeccao("visitas");
    if (vis.aberta !== visitaId) vis.acoes.alternar(visitaId);
    pedirFoco(`${visitaId}-cp`);
  };

  /**
   * Guarda as visitas e o levantamento da pessoa: as linhas têm de estar certas (as que existirem) e os códigos postais, se escritos, no formato
   * 0000-000 (o da obra e os das visitas). As abas Geral e Qualificação não impedem de guardar por outra razão. Enter num campo guarda, como o botão.
   */
  const guardar = () => {
    if (guardarLevantamento.aGuardar) return;
    if (bloqueado) {
      // Recusado: com as perguntas carregadas o erro está numa resposta, e leva-se a pessoa a ela (a aba, a secção e o campo, onde quer que esteja).
      const erro = semPerguntas ? null : localizarErrosRespostas(questionario, errosRespostas).primeiro;
      if (!erro) return;
      setAba(erro.aba);
      if (erro.aba === "visita") setSeccao(erro.seccao);
      pedirFocoPergunta(erro.pergunta);
      return;
    }
    setTentou(true);
    const primeiro = primeiroErro(errosAgora, lev.levantamento.linhas.map((l) => l.id));
    // Os códigos postais (o da obra, depois os das visitas) vêm antes das linhas do levantamento, pela ordem do painel. Uma morada da obra que veio
    // de uma visita com o código errado herda o erro dela: corrige-se na visita (a origem), não na obra.
    const obraVemDaVisita = morada.origem !== null && cpDasVisitas.length > 0;
    if (primeiro && primeiro.aba !== "visita" && !obraVemDaVisita) {
      setAba(primeiro.aba);
      pedirFoco(primeiro.campo);
      return;
    }
    if (cpDasVisitas.length > 0) {
      irParaVisitaComErro(cpDasVisitas[0]);
      return;
    }
    if (primeiro) {
      setAba(primeiro.aba);
      setSeccao(SECCAO_DO_LEVANTAMENTO);
      pedirFoco(primeiro.campo);
      return;
    }
    guardarLevantamento.aoGuardar(
      { linhas: lev.levantamento.linhas, observacoes: lev.levantamento.observacoes, respostas: resp.respostas, moradaObra: morada.morada },
      visitasParaGuardar(vis.visitas), valores.comercial,
    );
  };

  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); guardar(); }} noValidate className="flex min-h-0 flex-1 flex-col">
      <CorpoAbas
        id={id} aba={aba} aoMudarAba={setAba} seccao={seccao} aoMudarSeccao={setSeccao} pessoas={pessoas} valores={valores}
        respostas={resp.respostas} morada={morada.morada} origemMorada={morada.origem} levantamento={levantamento}
        erros={errosVisiveis} primeiroCampo={primeiroCampo}
        acoesGeral={acoes} pessoaBloqueada={!!pessoaInicialId && !!pessoa} acoesLevantamento={lev.acoes} visitas={vis.visitas} visitaAberta={vis.aberta} acoesVisitas={vis.acoes}
        visitasGravadas={visitasGravadas} visitasComCodigoPostalInvalido={tentou ? cpDasVisitas : []}
        acoesQualificacao={{ escolher: resp.escolher, escrever: resp.escrever, morada: morada.mudar, preencherMorada: morada.preencher }}
        errosRespostas={errosRespostas}
      />
      {alertaVisivel && (
        // O passo recusou guardar: o motivo diz-se aqui, dentro do painel, porque o toast e a região live da página ficam fora do modal.
        // A `key` faz o alerta remontar a cada recusa, e por isso voltar a ser lido mesmo com o mesmo texto.
        <p key={tentativa} id={idAlerta} role="alert" className="flex shrink-0 items-start gap-1.5 border-t border-border px-6 py-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {guardarLevantamento.motivo}
        </p>
      )}
      {/* A região live existe sempre (vazia quando está tudo certo): um aviso que aparece já com o texto dentro nem sempre é lido. */}
      <div aria-live="polite" aria-atomic="true" data-testid="aviso-guardar" className="shrink-0">
        {bloqueado && (
          <p id={idAviso} className="flex items-start gap-1.5 border-t border-border px-6 py-3 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            {t(`${N}${semPerguntas ? "qform.error.blocked" : "qform.invalid"}`)}
          </p>
        )}
      </div>
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        <SheetClose asChild>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>{t(`${N}cancel`)}</Button>
        </SheetClose>
        <Button
          type="submit" className={cn("min-h-11", FOCO, (bloqueado || guardarLevantamento.aGuardar) && PISTA_DESATIVADO)}
          aria-disabled={bloqueado || guardarLevantamento.aGuardar || undefined} aria-busy={guardarLevantamento.aGuardar || undefined}
          aria-describedby={[alertaVisivel ? idAlerta : "", bloqueado ? idAviso : ""].filter(Boolean).join(" ") || undefined}
        >
          {guardarLevantamento.texto}
        </Button>
      </SheetFooter>
    </form>
  );
}
