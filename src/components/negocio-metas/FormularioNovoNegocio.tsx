import { useId, useState, type FormEvent, type RefObject } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { AbaGeralNovoNegocio } from "./AbaGeralNovoNegocio";
import { AbaLigarRegistos } from "./AbaLigarRegistos";
import { AbaNovo, ListaAbasNovo, Tabs, TabsContent } from "./AbasNovoNegocio";
import { AbaQualificacao } from "./AbaQualificacao";
import { N } from "./PecasNovoNegocio";
import { FOCO, PISTA_DESATIVADO } from "./estilos";
import {
  abasComErros, primeiroErro, validarNovoNegocio, type AbaNovoNegocio, type DadosCriarNegocio, type ErrosNovoNegocio, type PessoaOpcao,
  type ValoresIniciaisNegocio,
} from "./novoNegocio";
import { useQuestionario } from "./QuestionarioContexto";
import { blocosDaQualificacao } from "./questionarioForm";
import { localizarErrosRespostas, validarRespostas } from "./respostasQuestionario";
import { contarRespostas, respostasEmTexto } from "./respostasVisita";
import { useCamposGerais, useLigarRegistosForm, useMoradaForm, useRespostasForm } from "./useEstadoNovoNegocio";
import { usePedidoFoco } from "./usePedidoFoco";

const ABAS: readonly Exclude<AbaNovoNegocio, "visita">[] = ["geral", "qualificacao", "registos"];
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);

interface FormularioProps {
  pessoas: readonly PessoaOpcao[];
  /** Recebe o foco quando o painel abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
  /** Avisa que há alterações por gravar. */
  aoSujar: () => void;
  aoConfirmar: (dados: DadosCriarNegocio) => void;
  /** A pessoa já escolhida ao abrir (a da ficha de onde se veio): com ela o seletor fica desativado, a pessoa não se muda. */
  pessoaInicialId?: string;
  /** O que já vem preenchido (a pessoa e o comercial); sem isto o formulário abre vazio. */
  valoresIniciais?: ValoresIniciaisNegocio;
}

/**
 * O formulário de "Novo negócio" (o negócio cria-se à mão), com o rodapé fixo (Cancelar e Criar negócio) e três abas: Geral (pessoa
 * obrigatória, comercial, contacto, primeiro passo), Qualificação (perguntas e morada da obra) e Registos (ligar registos da pessoa e
 * escolher o levantamento). Só a pessoa é obrigatória. Um envio recusado leva para a primeira aba com erros e põe o foco no primeiro campo errado.
 */
export function FormularioNovoNegocio({ pessoas, primeiroCampo, aoSujar, aoConfirmar, pessoaInicialId, valoresIniciais }: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const idAviso = useId();
  const [aba, setAba] = useState<AbaNovoNegocio>("geral");
  const [tentou, setTentou] = useState(false);
  const [pedirFoco, pedirFocoPergunta] = usePedidoFoco(id);
  const { valores, acoes } = useCamposGerais(pessoas, aoSujar, pessoaInicialId ?? valoresIniciais?.pessoaId, valoresIniciais?.comercial);
  const resp = useRespostasForm(aoSujar);
  const { questionario, podeGuardar } = useQuestionario();
  const blocosQualificacao = blocosDaQualificacao(questionario);
  // Respostas de número ou texto por corrigir impedem criar o negócio (o botão diz porquê; o envio, Enter incluído, recusa), e as perguntas por
  // carregar também: a qualificação vai com o negócio, e criá-lo sem elas seria criá-lo sem respostas, em silêncio.
  const errosRespostas = validarRespostas(questionario, resp.respostas);
  const respostasErradas = Object.keys(errosRespostas).length > 0;
  const semPerguntas = !podeGuardar;
  const bloqueado = semPerguntas || respostasErradas;
  const comRespostasErradas = localizarErrosRespostas(questionario, errosRespostas).abas;
  const registos = useLigarRegistosForm(valores.pessoaId, aoSujar);
  // A morada da obra parte da visita que se marcou (a mais representativa), enquanto ninguém a escreve.
  const visitasMarcadas = registos.porLigar.visitas.filter((v) => registos.valor.registos.some((r) => r.tipo === "visita" && r.id === v.id));
  const morada = useMoradaForm(aoSujar, { visitas: visitasMarcadas });
  const pessoa = pessoas.find((p) => p.id === valores.pessoaId);
  const aValidar = { ...valores, pessoaId: pessoa ? valores.pessoaId : "", moradaObra: morada.morada };
  const erros: ErrosNovoNegocio = tentou ? validarNovoNegocio(aValidar) : {};
  const marcas = abasComErros(erros);
  const nQualificacao = contarRespostas(blocosQualificacao, resp.respostas).respondidas;
  const nRegistos = registos.valor.registos.length;
  const plural = (n: number) => (n === 1 ? ".one" : "");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (bloqueado) {
      // Recusado: com as perguntas carregadas o erro está numa resposta, e leva-se a pessoa a ela (a aba e o campo).
      const erro = semPerguntas ? null : localizarErrosRespostas(questionario, errosRespostas).primeiro;
      if (!erro) return;
      setAba("qualificacao");
      pedirFocoPergunta(erro.pergunta);
      return;
    }
    setTentou(true);
    const primeiro = primeiroErro(validarNovoNegocio(aValidar), []);
    if (primeiro) {
      setAba(primeiro.aba);
      pedirFoco(primeiro.campo);
    } else if (pessoa) {
      const texto = (chave: string) => t(`${N}${chave}`);
      aoConfirmar({
        pessoa, comercial: valores.comercial, contacto: valores.contacto,
        qualificacao: respostasEmTexto(blocosQualificacao, resp.respostas, texto),
        moradaObra: morada.morada, ligar: registos.valor,
      });
    }
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={aba} className="flex min-h-0 flex-1 flex-col" onValueChange={(v) => setAba(ABAS.find((a) => a === v) ?? "geral")}
      >
        <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
          <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={marcas.geral} />
          <AbaNovo
            value="qualificacao" rotulo={t(`${N}tab.qualification`)} contador={nQualificacao} comErros={marcas.qualificacao || comRespostasErradas.has("qualificacao")}
            contadorLeitor={t(`${N}tab.qualification.count${plural(nQualificacao)}`, { n: nQualificacao })}
          />
          <AbaNovo
            value="registos" rotulo={t(`${N}tab.records`)} contador={nRegistos}
            contadorLeitor={t(`${N}tab.records.count${plural(nRegistos)}`, { n: nRegistos })}
          />
        </ListaAbasNovo>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="geral" className={CONTEUDO}>
            <AbaGeralNovoNegocio
              id={id} pessoas={pessoas} valores={valores} erros={erros} primeiroCampo={primeiroCampo} acoes={acoes} pessoaBloqueada={!!pessoaInicialId && !!pessoa}
            />
          </TabsContent>
          <TabsContent value="qualificacao" className={CONTEUDO}>
            <AbaQualificacao
              id={id} respostas={resp.respostas} morada={morada.morada} erroCodigoPostal={!!erros.codigoPostal} origemMorada={morada.origem}
              moradaContacto={valores.contacto.morada} acoes={{ escolher: resp.escolher, escrever: resp.escrever, morada: morada.mudar, preencherMorada: morada.preencher }}
              errosRespostas={errosRespostas}
            />
          </TabsContent>
          <TabsContent value="registos" className={CONTEUDO}>
            <AbaLigarRegistos id={id} pessoaEscolhida={!!pessoa} porLigar={registos.porLigar} valor={registos.valor} aoMudar={registos.mudar} />
          </TabsContent>
        </div>
      </Tabs>
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
          type="submit" className={cn("min-h-11", FOCO, bloqueado && PISTA_DESATIVADO)} aria-disabled={bloqueado || undefined}
          aria-describedby={bloqueado ? idAviso : undefined}
        >
          {t(`${N}submit`)}
        </Button>
      </SheetFooter>
    </form>
  );
}
