import { useEffect, useId, useState, type FormEvent, type RefObject } from "react";
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
import { FOCO } from "./estilos";
import { paraLevantamentoNegocio, validarLevantamento, type LevantamentoForm } from "./levantamento";
import type { MoradaObraForm } from "./moradaObra";
import {
  abasComErros, primeiroErro, validarNovoNegocio, type AbaNovoNegocio, type DadosCriarNegocio, type ErrosNovoNegocio, type PessoaOpcao,
  type RascunhoLevantamento, type ValoresIniciaisNegocio,
} from "./novoNegocio";
import type { Respostas } from "./perguntasTipos";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { contarRespostas, contarTotal, respostasEmTexto, visitaEmTexto } from "./respostasVisita";
import {
  useCamposGerais, useLevantamentoForm, useMoradaForm, useRespostasForm, useVisitasForm, type AcoesVisitas, type OrigemMorada,
} from "./useEstadoNovoNegocio";
import type { VisitaNegocio } from "./negocioMetas";
import { SECCOES_VISITA } from "./visitaExemplo";
import { camposDoLevantamento, visitasParaGuardar } from "./visitasNegocio";

const ABAS: readonly AbaNovoNegocio[] = ["geral", "qualificacao", "visita"];
const SECCAO_DO_LEVANTAMENTO = "medidas";
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);

/** Pede o foco para um campo (pelo fim do id). Corre num instante a seguir: a aba de destino acaba de montar. */
function usePedidoFoco(id: string): (campo: string) => void {
  const [pedido, setPedido] = useState<{ campo: string; n: number } | null>(null);
  useEffect(() => {
    if (!pedido) return;
    const espera = setTimeout(() => document.getElementById(`${id}-${pedido.campo}`)?.focus(), 0);
    return () => clearTimeout(espera);
  }, [pedido, id]);
  return (campo) => setPedido((p) => ({ campo, n: (p?.n ?? 0) + 1 }));
}

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
  acoesLevantamento: AcoesLevantamento;
  visitas: readonly VisitaNegocio[];
  visitaAberta: string | null;
  acoesVisitas: AcoesVisitas;
}

/** As três abas sublinhadas e o conteúdo de cada uma (a zona que rola); a aba com erros leva o aviso. */
function CorpoAbas(p: CorpoProps) {
  const { t } = useTranslation();
  const marcas = abasComErros(p.erros);
  const nQualificacao = contarRespostas([BLOCO_QUALIFICACAO], p.respostas).respondidas;
  const nVisita = contarTotal(SECCOES_VISITA, p.respostas).respondidas + p.levantamento.linhas.length;
  const plural = (n: number) => (n === 1 ? ".one" : "");
  return (
    <Tabs
      value={p.aba} className="flex min-h-0 flex-1 flex-col"
      onValueChange={(v) => p.aoMudarAba(ABAS.find((a) => a === v) ?? "geral")}
    >
      <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
        <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={marcas.geral} />
        <AbaNovo
          value="qualificacao" rotulo={t(`${N}tab.qualification`)} contador={nQualificacao} comErros={marcas.qualificacao}
          contadorLeitor={t(`${N}tab.qualification.count${plural(nQualificacao)}`, { n: nQualificacao })}
        />
        <AbaNovo
          value="visita" rotulo={t(`${N}tab.visit`)} contador={nVisita} comErros={marcas.visita}
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
            moradaContacto={p.valores.contacto.morada} acoes={p.acoesQualificacao}
          />
        </TabsContent>
        <TabsContent value="visita" className={CONTEUDO}>
          <AbaVisita
            id={p.id} seccaoAtiva={p.seccao} aoMudarSeccao={p.aoMudarSeccao} respostas={p.respostas}
            aoEscolher={p.acoesQualificacao.escolher} levantamento={p.levantamento} erros={p.erros} acoesLevantamento={p.acoesLevantamento}
            visitas={p.visitas} visitaAberta={p.visitaAberta} acoesVisitas={p.acoesVisitas}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

interface FormularioProps {
  pessoas: readonly PessoaOpcao[];
  /** O dia de hoje (AAAA-MM-DD): a data da visita por omissão. */
  hoje: string;
  /** Recebe o foco quando o painel abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
  /** Avisa que há alterações por gravar. */
  aoSujar: () => void;
  aoConfirmar: (dados: DadosCriarNegocio) => void;
  /** A pessoa já escolhida ao abrir (a da ficha de onde se veio): com ela o seletor fica desativado, a pessoa não se muda. */
  pessoaInicialId?: string;
  /** O que já vem preenchido (por exemplo a visita concluída de uma pessoa); sem isto o formulário abre vazio. */
  valoresIniciais?: ValoresIniciaisNegocio;
  /** A aba com que abre (por omissão a Geral); a Visita abre já na secção das Medidas da área. */
  abaInicial?: AbaNovoNegocio;
  /** A secção da aba Visita com que abre (o id, por exemplo `visitas`); sem isto vale a das Medidas da área. */
  seccaoInicial?: string;
  /** Com isto, o rodapé ganha um botão que guarda o levantamento (sem criar o negócio): o texto do botão e o que fazer. */
  guardarLevantamento?: {
    texto: string;
    /** Recebe o rascunho, as visitas e o comercial escolhido no painel (o da aba Geral), que se guarda com o pedido. */
    aoGuardar: (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string) => void;
    motivo?: string | null;
    /** Cresce a cada recusa: o alerta remonta (volta a ser lido com o mesmo texto) e esconde-se quando o rascunho muda. */
    tentativa?: number;
  };
}

/** Que erros se mostram: nenhuns, só os do levantamento (depois de "Guardar o levantamento") ou os de todas as abas (depois de criar). */
type Tentativa = "nenhuma" | "levantamento" | "tudo";

/**
 * O formulário de "Novo negócio", com o rodapé fixo (Cancelar e Criar negócio) e três abas: Geral (pessoa
 * obrigatória, comercial, contacto, primeiro passo), Qualificação (perguntas e morada da obra) e Visita (secções de
 * perguntas e levantamento), as duas últimas opcionais e só exemplo. Um envio recusado leva para a primeira aba com
 * erros e põe o foco no primeiro campo errado.
 */
export function FormularioNovoNegocio({
  pessoas, hoje, primeiroCampo, aoSujar: aoSujarDeFora, aoConfirmar, pessoaInicialId, valoresIniciais, abaInicial = "geral", seccaoInicial, guardarLevantamento,
}: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const idAlerta = useId();
  // O motivo de uma recusa vale para o rascunho de então: ao mexer-lhe, o alerta esconde-se (até à recusa seguinte).
  const tentativa = guardarLevantamento?.tentativa ?? 0;
  const [limpoEm, setLimpoEm] = useState(-1);
  const aoSujar = () => { aoSujarDeFora(); setLimpoEm(tentativa); };
  const alertaVisivel = !!guardarLevantamento?.motivo && tentativa > limpoEm;
  const [aba, setAba] = useState<AbaNovoNegocio>(abaInicial);
  const [tentou, setTentou] = useState<Tentativa>("nenhuma");
  const pedirFoco = usePedidoFoco(id);
  const { valores, acoes } = useCamposGerais(pessoas, aoSujar, pessoaInicialId ?? valoresIniciais?.pessoaId, valoresIniciais?.comercial);
  const lev = useLevantamentoForm(hoje, aoSujar, valores.comercial, valoresIniciais?.levantamento);
  const vis = useVisitasForm(hoje, aoSujar, valores.comercial, valoresIniciais?.visitas);
  const resp = useRespostasForm(aoSujar, valoresIniciais?.levantamento?.respostas);
  const morada = useMoradaForm(aoSujar, {
    visitas: valoresIniciais?.visitas, moradaObra: valoresIniciais?.moradaObra ?? valoresIniciais?.levantamento?.moradaObra,
  });
  const [seccao, setSeccao] = useState(seccaoInicial ?? (abaInicial === "visita" ? SECCAO_DO_LEVANTAMENTO : SECCOES_VISITA[0].id));
  const pessoa = pessoas.find((p) => p.id === valores.pessoaId);
  // A data, quem fez e o estado do levantamento derivam da lista de visitas; as linhas e as observações são do formulário.
  const levantamento = { ...lev.levantamento, ...camposDoLevantamento(vis.visitas, hoje, valores.comercial) };
  const aValidar = {
    ...valores, pessoaId: pessoa ? valores.pessoaId : "", levantamento, moradaObra: morada.morada,
  };
  const errosVisiveis: ErrosNovoNegocio = tentou === "tudo" ? validarNovoNegocio(aValidar) : tentou === "levantamento" ? validarLevantamento(levantamento) : {};

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou("tudo");
    const primeiro = primeiroErro(validarNovoNegocio(aValidar), lev.levantamento.linhas.map((l) => l.id));
    if (primeiro) {
      setAba(primeiro.aba);
      if (primeiro.aba === "visita") setSeccao(SECCAO_DO_LEVANTAMENTO);
      pedirFoco(primeiro.campo);
    } else if (pessoa) {
      const rotulo = (grupo: "room" | "work" | "unit", chave: string) => t(`${N}${grupo}.${chave}`);
      const texto = (chave: string) => t(`${N}${chave}`);
      aoConfirmar({
        pessoa, comercial: valores.comercial, contacto: valores.contacto,
        levantamento: paraLevantamentoNegocio(levantamento, rotulo),
        qualificacao: respostasEmTexto([BLOCO_QUALIFICACAO], resp.respostas, texto),
        moradaObra: morada.morada,
        visita: visitaEmTexto(SECCOES_VISITA, resp.respostas, texto),
        visitas: visitasParaGuardar(vis.visitas),
      });
    }
  };

  /**
   * Guarda o levantamento sem criar o negócio: as linhas têm de estar certas (e, com a visita feita, haver pelo menos uma). Só
   * mostra os erros do levantamento: os das abas Geral e Qualificação não impedem de guardar e ficam para o "Criar negócio".
   */
  const guardar = () => {
    if (!guardarLevantamento) return;
    setTentou((antes) => (antes === "tudo" ? "tudo" : "levantamento"));
    const primeiro = primeiroErro(validarLevantamento(levantamento), lev.levantamento.linhas.map((l) => l.id));
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
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <CorpoAbas
        id={id} aba={aba} aoMudarAba={setAba} seccao={seccao} aoMudarSeccao={setSeccao} pessoas={pessoas} valores={valores}
        respostas={resp.respostas} morada={morada.morada} origemMorada={morada.origem} levantamento={levantamento}
        erros={errosVisiveis} primeiroCampo={primeiroCampo}
        acoesGeral={acoes} pessoaBloqueada={!!pessoaInicialId && !!pessoa} acoesLevantamento={lev.acoes} visitas={vis.visitas} visitaAberta={vis.aberta} acoesVisitas={vis.acoes}
        acoesQualificacao={{ escolher: resp.escolher, morada: morada.mudar, preencherMorada: morada.preencher }}
      />
      {alertaVisivel && (
        // O passo recusou guardar: o motivo diz-se aqui, dentro do painel, porque o toast e a região live da página ficam fora do modal.
        // A `key` faz o alerta remontar a cada recusa, e por isso voltar a ser lido mesmo com o mesmo texto.
        <p key={tentativa} id={idAlerta} role="alert" className="flex shrink-0 items-start gap-1.5 border-t border-border px-6 py-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {guardarLevantamento.motivo}
        </p>
      )}
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        <SheetClose asChild>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>{t(`${N}cancel`)}</Button>
        </SheetClose>
        {guardarLevantamento && (
          <Button
            type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={guardar}
            aria-describedby={alertaVisivel ? idAlerta : undefined}
          >
            {guardarLevantamento.texto}
          </Button>
        )}
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${N}submit`)}</Button>
      </SheetFooter>
    </form>
  );
}
