// O painel «Visita e levantamento» da ficha REAL: o mesmo painel lateral de «Novo negócio» no modo `registos`, mas a gravar na base (visitas e
// levantamento da pessoa, por `useGuardarRegistos`). As perguntas vêm da base (o fornecedor do questionário) e o levantamento livre já gravado abre
// preenchido. Guardar espera pela base: o painel fica ocupado, fecha só quando tudo correu bem, e um erro diz-se DENTRO do painel (o toast e a região
// live ficam fora do modal) sem fechar nem perder o que se escreveu. Se o questionário mudou entretanto, o levantamento ficou gravado mas o painel
// fica aberto para conferir as respostas. Marcar uma visita aqui NÃO grava nota nem conta como contacto.
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptarPessoa } from "@/hooks/pessoas/adaptarFichaPessoa";
import { adaptarRegistos } from "@/hooks/pessoas/adaptarRegistos";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { levantamentoLivreDaFicha } from "@/hooks/pessoas/livreDaFicha";
import { QuestionarioFormularioProvider } from "@/hooks/pessoas/QuestionarioFormularioProvider";
import { hojeLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useGuardarRegistos } from "@/hooks/pessoas/useGuardarRegistos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import type { PessoaOpcao, RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { paraOpcao } from "@/components/pessoas/pessoaOpcao";
import { valoresIniciaisDosRegistos } from "@/components/pessoas/valoresRegistos";
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
    return {
      opcao: [paraOpcao(pessoa)] as readonly PessoaOpcao[], nome: pessoa.nome, id: pessoa.id,
      // Para um negócio o levantamento é novo: não se abre sobre o que a pessoa já tinha por ligar.
      valores: negocioId ? { pessoaId: valores.pessoaId, comercial: valores.comercial, visitas: valores.visitas } : valores,
    };
  });
  // As visitas da ficha de agora: as que já existem na base (não se removem, cancelam-se).
  const gravadas = useMemo(() => new Set((ficha.visitas?.itens ?? []).map((v) => v.id)), [ficha]);

  const guardar = (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string): Promise<boolean> => {
    if (emCurso.current) return emCurso.current;
    setMotivo(null);
    const pedido = registos.guardar(visitas, rascunho, comercial).then(
      (r) => {
        // O levantamento ficou gravado, mas as perguntas mudaram: o painel fica aberto, com as respostas escritas, para as conferir.
        if (r.levantamento?.questionarioMudou) return recusar(t(AVISO_QUESTIONARIO_MUDOU));
        toast.success(r.feitos.length > 0 ? t(`${R}saved`, { name: aoAbrir.nome }) : t(`${R}nothing`));
        return true;
      },
      (erro: unknown) => recusar(textoDoErroGravar(erro, t)),
    ).finally(() => { emCurso.current = null; });
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
        texto: t("pessoasPagina.process.visitSurvey.save"), aoGuardar: guardar, motivo, tentativa, pronto: registos.pronto,
      }}
    />
  );
}

export function PainelVisitaLevantamentoReal({ ficha, aberto, abertura, aoMudarAberto, aoDevolverFoco, negocioId = null }: PainelProps) {
  const livre = useMemo(() => levantamentoLivreDaFicha(ficha), [ficha]);
  return (
    <QuestionarioFormularioProvider gravadas={negocioId ? undefined : livre?.rascunho.gravadas}>
      <PainelInterior
        key={`${abertura}-${ficha.pessoa.id}-${negocioId ?? ""}`} ficha={ficha} aberto={aberto} aoMudarAberto={aoMudarAberto}
        aoDevolverFoco={aoDevolverFoco} negocioId={negocioId}
      />
    </QuestionarioFormularioProvider>
  );
}
