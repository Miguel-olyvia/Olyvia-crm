// O negócio completo (P3) à volta da ficha real: monta os contextos que os ecrãs do negócio leem (`DadosNegocio`, da ficha que a base devolveu, e
// as mutações, que falam com a base), o painel «Novo negócio» e o negócio a abrir logo a seguir a criar. Só se monta quando a ficha tem a
// capacidade `negocios` (ver `useAcoesFichaReal`); sem ela a ficha continua só de leitura. A base só entra por `@/hooks/pessoas/`.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/useTranslation";
import { adaptarDadosNegocio } from "@/hooks/pessoas/adaptarDadosNegocio";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { useComerciaisNegocio } from "@/hooks/pessoas/useComerciaisNegocio";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useLigarAoVoltar } from "@/hooks/pessoas/useLigarAoVoltar";
import { useMutacoesNegocio } from "@/hooks/pessoas/useMutacoesNegocio";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { DadosNegocioContext } from "@/components/negocio-metas/costuraNegocio";
import { MutacoesNegocioContext } from "@/components/negocio-metas/mutacoesNegocio";
import { NovoNegocioReal } from "@/components/pessoas/NovoNegocioReal";
import { DocumentosDoNegocioProvider } from "@/components/pessoas-processo/DocumentosDoNegocioReal";
import { LevantamentoDoNegocioProvider } from "@/components/pessoas-processo/LevantamentoDoNegocioReal";
import { ProcessoProviderReal } from "@/components/pessoas-processo/ProcessoProviderReal";

interface ParaOFilho {
  /** «Criar negócio» do menu da ficha; ausente sem permissão para criar. */
  aoCriarNegocio?: () => void;
  /** O negócio a abrir logo à entrada: o do endereço, ou o que acabou de se criar. */
  negocioInicial: string | null;
}

interface NegociosDaFichaRealProps {
  /** A ficha mostrada (a da pessoa aberta; a última enquanto o painel fecha). */
  ficha: FichaDb | null;
  /** A pessoa aberta (`?open=`); `null` com a ficha fechada. */
  pessoaAberta: string | null;
  /** O negócio do endereço (`?negocio=`). */
  negocioDoEndereco: string | null;
  /** Depois de criar: leva o negócio novo ao endereço. Recebe também a pessoa a que o negócio pertence (quem abre confirma que ainda é a aberta). */
  aoAbrirNegocio?: (negocioId: string, pessoaId: string) => void;
  /** NG003 e NG008 (a pessoa já não está disponível, ou a funcionalidade não está ativa): fecha a ficha e volta à Lista. */
  aoFecharFicha?: () => void;
  children: (p: ParaOFilho) => ReactNode;
}

export function NegociosDaFichaReal({ ficha, pessoaAberta, negocioDoEndereco, aoAbrirNegocio, aoFecharFicha, children }: NegociosDaFichaRealProps) {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const pessoaId = ficha?.pessoa.id ?? "";
  const fecharFicha = useRef(aoFecharFicha);
  useEffect(() => {
    fecharFicha.current = aoFecharFicha;
  });
  // O anúncio para o leitor de ecrã dos avisos que nascem FORA do painel da ficha (criar negócio, ganhar, contrato ligado): o toast vive
  // fora do painel, que o leitor de ecrã não lê; o que está dentro da ficha usa o anúncio da própria ficha.
  const [anuncios, setAnuncios] = useState<{ id: number; texto: string }[]>([]);
  const contador = useRef(0);
  const anunciar = useCallback((texto: string) => {
    contador.current += 1;
    const id = contador.current;
    setAnuncios((antes) => [...antes.slice(-2), { id, texto }]);
  }, []);
  // O que está aberto AGORA (guardado depois de cada render): uma gravação que acaba depois de trocar de pessoa tem de o ver.
  const atual = useRef({ pessoaAberta, negocioDoEndereco });
  useEffect(() => {
    atual.current = { pessoaAberta, negocioDoEndereco };
  });
  const aoIndisponivel = useCallback((chave: string, pessoaDaMutacao: string) => {
    const texto = t(chave);
    toast.error(texto);
    anunciar(texto);
    // Só se fecha a ficha da pessoa a que o erro pertence: se entretanto se abriu outra, essa não se fecha.
    if (atual.current.pessoaAberta === pessoaDaMutacao) fecharFicha.current?.();
  }, [t, anunciar]);
  const mutacoes = useMutacoesNegocio(pessoaId, ficha, { aoIndisponivel });
  const momentoGanho = fonte.modo === "real" ? fonte.momentoGanho : null;
  const podeApagar = fonte.modo === "real" && fonte.podeApagarNegocios === true;
  const permissoes = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  // Os comerciais reais da organização, para o «Feito por» das visitas (a mesma lista e a mesma cache do painel «Nova lead»). Só se leem quando
  // um ecrã os pede (ao montar um «Feito por»): abrir a ficha não paga a leitura.
  const [querComerciais, setQuerComerciais] = useState(false);
  const pedirComerciais = useCallback(() => setQuerComerciais(true), []);
  const { comerciais } = useComerciaisNegocio(fonte.modo === "real" && querComerciais);
  const nomesComerciais = useMemo(() => comerciais.map((c) => c.nome), [comerciais]);
  const dados = useMemo(
    () => (ficha ? adaptarDadosNegocio(ficha, momentoGanho, { podeApagar, permissoes, comerciais: nomesComerciais, pedirComerciais }) : null),
    [ficha, momentoGanho, podeApagar, permissoes, nomesComerciais, pedirComerciais],
  );
  // O painel e o negócio criado guardam a pessoa a que pertencem: trocar de pessoa (ou fechar a ficha) deixa-os de valer.
  const [criandoPara, setCriandoPara] = useState<string | null>(null);
  // O botão que abriu o painel (o «Criar o negócio» do assistente): é para ele que o foco volta se o painel for cancelado.
  const origemCriar = useRef<HTMLElement | null>(null);
  // `endereco` é o `?negocio=` do momento em que se criou: o negócio criado só manda enquanto o endereço não passa para outro negócio.
  const [criado, setCriado] = useState<{ pessoa: string; negocio: string; endereco: string | null } | null>(null);
  useEffect(() => {
    if (criado && criado.pessoa !== pessoaAberta) setCriado(null);
    if (criandoPara && criandoPara !== pessoaAberta) setCriandoPara(null);
    // O endereço já aponta para o negócio criado: passa a ser ele a mandar (voltar à lista não reabre o criado).
    if (criado && negocioDoEndereco === criado.negocio) setCriado(null);
  }, [pessoaAberta, criado, criandoPara, negocioDoEndereco]);
  const criadoValido = criado && criado.pessoa === pessoaAberta ? criado : null;
  const negocioCriado = criadoValido && (negocioDoEndereco === criadoValido.endereco || negocioDoEndereco === criadoValido.negocio) ? criadoValido.negocio : null;
  const aoCriado = (pessoa: string, negocio: string): void => {
    // A pessoa aberta já não é a do negócio (trocou-se a meio da gravação): o negócio fica criado e nada se abre.
    if (atual.current.pessoaAberta !== pessoa) return;
    setCriado({ pessoa, negocio, endereco: atual.current.negocioDoEndereco });
    aoAbrirNegocio?.(negocio, pessoa);
  };
  // Um contrato criado noutro ecrã volta com `?novoContrato=`: liga-se ao negócio e o parâmetro limpa-se.
  useLigarAoVoltar(
    mutacoes, dados?.podeEditar ?? false,
    (chave) => {
      const texto = `${t("pessoasPagina.neg.process.contract.notLinked")} ${t(chave)}`;
      toast.error(texto);
      anunciar(texto);
    },
    () => {
      const texto = t("pessoasPagina.neg.process.contract.linked");
      toast.success(texto);
      anunciar(texto);
    },
    dados !== null,
  );

  return (
    <AnuncioFichaContext.Provider value={anunciar}>
    <DadosNegocioContext.Provider value={dados}>
      <MutacoesNegocioContext.Provider value={mutacoes}>
        <ProcessoProviderReal ficha={ficha}>
          {/* O levantamento de um negócio faz-se aqui dentro (o guia do passo), ligado ao negócio e à pessoa. */}
          <LevantamentoDoNegocioProvider ficha={ficha}>
            {/* Enviar a proposta, a resposta do cliente, criar o contrato e a assinatura também (diálogos por cima do guia, sem sair da ficha). */}
            <DocumentosDoNegocioProvider ficha={ficha}>
              {children({
                aoCriarNegocio: dados?.podeCriar && pessoaAberta
                  ? () => { origemCriar.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setCriandoPara(pessoaAberta); }
                  : undefined,
                negocioInicial: negocioCriado ?? negocioDoEndereco,
              })}
            </DocumentosDoNegocioProvider>
          </LevantamentoDoNegocioProvider>
        </ProcessoProviderReal>
        {ficha && pessoaAberta === pessoaId && (
          <NovoNegocioReal
            pessoaId={pessoaId} pessoaNome={ficha.pessoa.nome ?? ""} ficha={ficha} aberto={criandoPara === pessoaId}
            aoMudarAberto={(aberto) => setCriandoPara(aberto ? pessoaId : null)}
            aoCriado={(negocio) => aoCriado(pessoaId, negocio)} origemFoco={origemCriar}
          />
        )}
        {/* Sempre montada: as regiões live que nascem já com texto não são anunciadas de forma fiável. */}
        <div role="status" aria-live="polite" aria-atomic="false" className="sr-only">
          {anuncios.map((a) => <p key={a.id}>{a.texto}</p>)}
        </div>
      </MutacoesNegocioContext.Provider>
    </DadosNegocioContext.Provider>
    </AnuncioFichaContext.Provider>
  );
}
