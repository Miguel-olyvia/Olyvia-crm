// O painel «Visita e levantamento» da ficha REAL: o mesmo painel lateral de «Novo negócio» no modo `registos`, mas a gravar na base (visitas e
// levantamento da pessoa, por `useGuardarRegistos`). As perguntas vêm da base (o fornecedor do questionário) e o levantamento livre já gravado abre
// preenchido. Guardar espera pela base: o painel fica ocupado, fecha só quando tudo correu bem, e um erro diz-se DENTRO do painel (o toast e a região
// live ficam fora do modal) sem fechar nem perder o que se escreveu. Se o questionário mudou entretanto, o levantamento ficou gravado mas o painel
// fica aberto para conferir as respostas. Marcar uma visita aqui NÃO grava nota nem conta como contacto.
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptarPessoa } from "@/hooks/pessoas/adaptarFichaPessoa";
import { adaptarNegocios } from "@/hooks/pessoas/adaptarNegociosFicha";
import { adaptarRegistos } from "@/hooks/pessoas/adaptarRegistos";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { levantamentoLivreDaFicha } from "@/hooks/pessoas/livreDaFicha";
import { QuestionarioFormularioProvider } from "@/hooks/pessoas/QuestionarioFormularioProvider";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useGuardarQualificacao } from "@/hooks/pessoas/useGuardarQualificacao";
import { useGuardarRegistos } from "@/hooks/pessoas/useGuardarRegistos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { chavesDaAba, respostasDeGravadas } from "@/components/negocio-metas/respostasQuestionario";
import type { PessoaOpcao, RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { paraOpcao } from "@/components/pessoas/pessoaOpcao";
import { valoresIniciaisDosRegistos } from "@/components/pessoas/valoresRegistos";
import { entradaQualificacao } from "./entradaQualificacao";
import { textoDoErroGravar } from "./textoDoErroGravar";

const R = "pessoasPagina.real.records.";
const AVISO_QUESTIONARIO_MUDOU = "businessGoals.new.qform.changed";

interface PainelProps {
  ficha: FichaDb;
  aberto: boolean;
  /** Cresce a cada abertura: o interior remonta (as visitas e o levantamento com que abre são os de agora, e a sessão de gravação recomeça). */
  abertura: number;
  aoMudarAberto: (aberto: boolean) => void;
  /** Devolve o foco a quem abriu o painel; diz se o fez. */
  aoDevolverFoco: () => boolean;
  /**
   * O negócio a que o painel grava (o «Fazer o levantamento» de um negócio): as visitas novas e o levantamento ficam ligados a ele, o levantamento é
   * sempre um novo (o que a pessoa já tinha por ligar não se reescreve) e o painel abre sem ele. Sem isto (o menu «Mais») grava na pessoa.
   */
  negocioId?: string | null;
}

function PainelInterior({ ficha, aberto, aoMudarAberto, aoDevolverFoco, negocioId = null }: Omit<PainelProps, "abertura">) {
  const { t } = useTranslation();
  const registos = useGuardarRegistos(ficha, negocioId ? { negocioId, ignorarLevantamentoLivre: true } : { negocioId: null });
  const qualificacao = useGuardarQualificacao();
  const { questionario } = useQuestionario();
  const [motivo, setMotivo] = useState<string | null>(null);
  // O painel está à vista? Trocar de pessoa a meio da gravação fecha-o (por prop, ou desmonta-o), e uma falha de depois já não tem onde se dizer
  // dentro dele: diz-se num toast.
  const aVer = useRef(aberto);
  aVer.current = aberto;
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);
  // A gravação em curso: um segundo pedido devolve-a (e não repete o aviso).
  const emCurso = useRef<Promise<boolean> | null>(null);
  // Cada recusa conta uma tentativa: o alerta remonta (e o leitor de ecrã volta a lê-lo) mesmo com o mesmo texto.
  const [tentativa, setTentativa] = useState(0);
  const recusar = (texto: string): boolean => {
    setMotivo(texto);
    setTentativa((n) => n + 1);
    if (!aVer.current || !montado.current) toast.error(texto);
    return false;
  };
  // O que o painel mostra ao abrir é o retrato de agora (as visitas e o levantamento da pessoa), e não muda enquanto está aberto.
  const [aoAbrir] = useState(() => {
    const pessoa = adaptarPessoa(ficha, hojeLisboa());
    const valores = valoresIniciaisDosRegistos(pessoa, adaptarRegistos(ficha));
    const moradaEntidade = pessoa.moradaCampos ? { ...pessoa.moradaCampos } : null;
    // A Qualificação vive no negócio: abre com o pedido e as respostas que ele já tem (um negócio que a ficha não traz abre vazio).
    const negocio = negocioId ? adaptarNegocios(ficha, hojeLisboa()).find((n) => n.id === negocioId) : undefined;
    const gravadas = negocio?.qualificacaoGravada ?? [];
    const inicial = { respostas: respostasDeGravadas(gravadas), pedido: negocio?.pedidoCliente ?? "" };
    return {
      opcao: [paraOpcao(pessoa)] as readonly PessoaOpcao[], nome: pessoa.nome, id: pessoa.id, inicial, gravadas,
      // Para um negócio o levantamento é novo: não se abre sobre o que a pessoa já tinha por ligar (só sobre a qualificação do negócio).
      valores: negocioId
        ? {
          pessoaId: valores.pessoaId, comercial: valores.comercial, visitas: valores.visitas,
          levantamento: { linhas: [], observacoes: "", respostas: inicial.respostas }, real: { moradaEntidade, negocio: { pedidoCliente: inicial.pedido } },
        }
        : { ...valores, real: { moradaEntidade } },
    };
  });
  // As visitas da ficha de agora: as que já existem na base (não se removem, cancelam-se).
  const gravadas = useMemo(() => new Set((ficha.visitas?.itens ?? []).map((v) => v.id)), [ficha]);

  const guardar = (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string): Promise<boolean> => {
    if (emCurso.current) return emCurso.current;
    setMotivo(null);
    // A Qualificação grava-se primeiro: é a que se repete sem criar nada (substitui); se falhar, o levantamento nem começa.
    let qualificacaoGravada = false;
    const gravar = async (): Promise<boolean> => {
      const entrada = negocioId
        ? entradaQualificacao({
          negocioId, entityId: ficha.pessoa.id, chavesQualificacao: chavesDaAba(questionario, "qualificacao"), inicial: aoAbrir.inicial, rascunho,
        })
        : null;
      const q = entrada ? await qualificacao.guardar(entrada) : null;
      qualificacaoGravada = q !== null;
      const r = await registos.guardar(visitas, rascunho, comercial);
      // Gravou, mas as perguntas mudaram: o painel fica aberto, com as respostas escritas, para as conferir.
      if (r.levantamento?.questionarioMudou || q?.questionarioMudou) return recusar(t(AVISO_QUESTIONARIO_MUDOU));
      toast.success(r.feitos.length > 0 || q?.mudou ? t(`${R}saved`, { name: aoAbrir.nome }) : t(`${R}nothing`));
      return true;
    };
    const pedido = gravar().catch((erro: unknown) => {
      // Se a Qualificação já gravou e o resto falhou, diz-se: quem lê o erro não deve achar que se perdeu tudo.
      const texto = textoDoErroGravar(erro, t);
      return recusar(qualificacaoGravada ? `${t(`${R}qualSavedNote`)} ${texto}` : texto);
    }).finally(() => { emCurso.current = null; });
    emCurso.current = pedido;
    return pedido;
  };

  return (
    <NovoNegocioDialogo
      pessoas={aoAbrir.opcao} modo="registos" semBotao aberto={aberto} abaInicial="visita" seccaoInicial="visitas" pessoaInicialId={aoAbrir.id}
      valoresIniciais={aoAbrir.valores} visitasGravadas={gravadas} hoje={hojeLisboa()} selo={null} aGuardar={registos.aGuardar}
      titulo={t("pessoasPagina.process.visitSurvey.title", { name: aoAbrir.nome })} descricao={t("pessoasPagina.process.visitSurvey.description")}
      aoDevolverFoco={aoDevolverFoco}
      // A guardar não se fecha (nem por Esc nem ao clicar fora): fechar a meio escondia o resultado da gravação.
      aoMudarAberto={(abre) => {
        if (!abre && registos.aGuardar) return;
        if (!abre) setMotivo(null);
        aoMudarAberto(abre);
      }}
      guardarLevantamento={{
        texto: t("pessoasPagina.process.visitSurvey.save"), aoGuardar: guardar, motivo, tentativa, pronto: registos.pronto && (!negocioId || qualificacao.pronto),
      }}
    />
  );
}

export function PainelVisitaLevantamentoReal({ ficha, aberto, abertura, aoMudarAberto, aoDevolverFoco, negocioId = null }: PainelProps) {
  const livre = useMemo(() => levantamentoLivreDaFicha(ficha), [ficha]);
  const gravadasDoNegocio = useMemo(
    () => (negocioId ? adaptarNegocios(ficha, hojeLisboa()).find((n) => n.id === negocioId)?.qualificacaoGravada : undefined),
    [ficha, negocioId],
  );
  return (
    <QuestionarioFormularioProvider gravadas={negocioId ? gravadasDoNegocio : livre?.rascunho.gravadas}>
      <PainelInterior
        key={`${abertura}-${ficha.pessoa.id}-${negocioId ?? ""}`} ficha={ficha} aberto={aberto} aoMudarAberto={aoMudarAberto}
        aoDevolverFoco={aoDevolverFoco} negocioId={negocioId}
      />
    </QuestionarioFormularioProvider>
  );
}
