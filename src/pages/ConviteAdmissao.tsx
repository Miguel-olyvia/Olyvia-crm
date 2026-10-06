/**
 * O formulario do convite de admissao -- pagina publica, SEM sessao, aberta
 * pelo link que o e-mail de convite leva. Duas paginas:
 *
 *  1. Dados pessoais, identificacao e morada (`ConvitePagina1`).
 *  2. Dados bancarios, fardamento e assinatura (`ConvitePagina2`).
 *
 * O QUE E OBRIGATORIO AQUI
 * ------------------------
 * So o que a organizacao pediu na posicao "convite": o servidor devolve essa
 * lista em `campos_obrigatorios` e e ela que decide o asterisco e o que trava o
 * avanco. Os campos de posicao "ficha" ou "opcional" nao travam nada -- ficam
 * para o RH completar. A assinatura e a declaracao de veracidade sao sempre
 * obrigatorias.
 *
 * O QUE NAO SE PEDE AQUI
 * ------------------------
 * A filiacao sindical deixou de se pedir neste ecra e na ficha da pessoa
 * (decisao de produto) -- a tabela `pessoas_sindicalizacao` e os dados ja
 * recolhidos antes desta mudanca continuam na base, inertes, sem via de
 * escrita nem de leitura pela aplicacao.
 *
 * A conta bancaria JA e gravada (desde 28/11): o IBAN viaja dentro de `dados`
 * como qualquer outra chave do contrato, e a RPC guarda-o cifrado no Vault. O
 * convite so aceita IBAN -- e o unico formato que a RPC sabe gravar -- e por
 * isso nao ha formato nenhum a escolher aqui.
 *
 * LINGUA E ERROS
 * --------------
 * Quem abre o link nao tem sessao: a lingua escolhe-se pelo navegador (pt, es,
 * fr, de ou en; portugues por omissao), so neste ecra. Todo o erro que o
 * servidor devolve acaba num texto nessa lingua -- nunca o codigo em bruto.
 *
 * TODO O CAMPO TEM ETIQUETA ASSOCIADA, e os obrigatorios sao anunciados a
 * leitor de ecra (nao so a vermelho) -- ver `obrigatorio` em `form/Campos.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { IdiomaForcadoProvider } from "@/contexts/IdiomaForcadoContext";
import {
  useConviteAdmissaoPublico,
  type DadosSubmissaoConvite,
} from "@/hooks/useConviteAdmissaoPublico";
import { CamposTocadosProvider } from "@/components/hr/form/Campos";
import { ConvitePagina1 } from "@/components/hr/convite/ConvitePagina1";
import { ConvitePagina2 } from "@/components/hr/convite/ConvitePagina2";
import { ConviteCartaoLinkInvalido } from "@/components/hr/convite/ConviteCartaoLinkInvalido";
import { ConviteSaudacao } from "@/components/hr/convite/ConviteSaudacao";
import {
  CODIGOS_PAGINA_2,
  campoEhObrigatorio,
  obrigatoriosResolvidos,
  pendenciasDoRascunho,
  type CodigoCampoObrigatorioAdmissao,
} from "@/lib/hr/admissaoObrigatorios";
import {
  RASCUNHO_CONVITE_VAZIO,
  construirPayloadConvite,
  type RascunhoConvite,
} from "@/lib/hr/conviteAdmissaoPayload";
import {
  campoDoErroDeServidor,
  errosDeFormato,
  idiomaDoNavegador,
  type CampoComFormato,
  type IdiomaConvite,
} from "@/lib/hr/conviteAdmissaoEcra";
import { camposDeAdmissaoIncompleta, mensagemErroAdmissao } from "@/lib/hr/errosAdmissao";

/** Um debounce generoso: nao vale a pena gravar a cada tecla. */
const DEBOUNCE_RASCUNHO_MS = 3000;

/**
 * O tipo do rascunho, a forma vazia e a construcao do payload vivem em
 * `conviteAdmissaoPayload.ts` -- e la que o contrato de chaves com a Edge
 * Function e com a RPC esta amarrado por teste.
 */
type Rascunho = RascunhoConvite;
const VAZIO: Rascunho = RASCUNHO_CONVITE_VAZIO;

/** O `id` de cada campo com validacao de formato, para saber se ja foi tocado. */
const ID_DOM_DO_CAMPO: Record<CampoComFormato, string> = {
  nif: "convite-nif",
  niss: "convite-niss",
  conta_numero: "convite-conta-numero",
};

const CAMPOS_COM_FORMATO: readonly string[] = ["nif", "niss", "conta_numero"];

/**
 * Nada preenchido nem herdado: nao ha rascunho a guardar. A declaracao de
 * veracidade (`aceite`) nao conta -- nunca viaja num rascunho.
 */
function rascunhoEstaVazio(r: Rascunho): boolean {
  return (Object.keys(VAZIO) as Array<keyof Rascunho>).every(
    (campo) => campo === "aceite" || r[campo] === VAZIO[campo],
  );
}

export default function ConviteAdmissao() {
  // A lingua deste ecra vem do navegador; o resto da aplicacao nao a muda.
  // O provider faz com que os componentes partilhados da arvore (que chamam
  // useTranslation() sem argumento) usem a mesma lingua.
  const idioma = useMemo(() => idiomaDoNavegador(), []);
  return (
    <IdiomaForcadoProvider idioma={idioma}>
      <ConviteAdmissaoEcra idioma={idioma} />
    </IdiomaForcadoProvider>
  );
}

function ConviteAdmissaoEcra({ idioma }: { idioma: IdiomaConvite }) {
  const { t } = useTranslation(idioma);
  const { token } = useParams<{ token: string }>();
  const {
    estado,
    loading,
    erroInicial,
    motivo,
    submetendo,
    submeter,
    gravarRascunho,
    gravarRascunhoAoFechar,
  } = useConviteAdmissaoPublico(token);

  const [pagina, setPagina] = useState<1 | 2>(1);
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [concluido, setConcluido] = useState<{ avisos: string[] } | null>(null);
  const [erroSubmissao, setErroSubmissao] = useState<string | null>(null);
  const [errosServidor, setErrosServidor] = useState<Partial<Record<CampoComFormato, string>>>({});
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);
  const [erroAceite, setErroAceite] = useState<string | null>(null);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);

  const tocar = (campoId: string) =>
    setTocados((anteriores) => {
      if (anteriores.has(campoId)) return anteriores;
      return new Set(anteriores).add(campoId);
    });

  const definir = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) => {
    setRascunho((anterior) => ({ ...anterior, [campo]: valor }));
    // Mexer num campo tira-lhe o erro que o servidor lhe tinha posto.
    if (CAMPOS_COM_FORMATO.includes(campo)) {
      setErrosServidor((anteriores) => {
        if (!(campo in anteriores)) return anteriores;
        const { [campo as CampoComFormato]: _removido, ...resto } = anteriores;
        return resto;
      });
    }
    if (campo === "assinatura_nome") setErroAssinatura(null);
    if (campo === "aceite") setErroAceite(null);
  };

  // Restaura o rascunho gravado (herdado do convite anterior, se o houve)
  // assim que o token e validado. Uma so vez: depois disso e o utilizador quem
  // manda no estado.
  useEffect(() => {
    if (rascunhoRestaurado || !estado) return;
    const bruto = estado.rascunho;
    if (bruto && typeof bruto === "object") {
      setRascunho((anterior) => {
        const restaurado = { ...anterior };
        (Object.keys(VAZIO) as Array<keyof Rascunho>).forEach((campo) => {
          // A "aceite" (declaracao de veracidade) nunca se restaura: nao se
          // pre-assinala uma declaracao legal a partir de um rascunho.
          if (campo === "aceite") return;
          const valor = (bruto as Record<string, unknown>)[campo];
          if (valor === undefined || valor === null) return;
          if (typeof VAZIO[campo] === "boolean") {
            (restaurado as Record<string, unknown>)[campo] = Boolean(valor);
          } else {
            (restaurado as Record<string, unknown>)[campo] = String(valor);
          }
        });
        return restaurado;
      });
    }
    setRascunhoRestaurado(true);
  }, [estado, rascunhoRestaurado]);

  // O rascunho a gravar: tudo menos a declaracao de veracidade, que e o
  // unico campo que nunca deve sobreviver entre visitas.
  const paraGravar = (r: Rascunho): Record<string, unknown> => {
    const { aceite: _aceite, ...resto } = r;
    return resto;
  };

  // Grava, com debounce, sempre que o rascunho muda -- so depois de o
  // restauro inicial acontecer, para nao gravar de volta o que acabou de
  // ser lido.
  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;
  useEffect(() => {
    if (!rascunhoRestaurado || concluido) return;
    const id = setTimeout(() => {
      void gravarRascunho(paraGravar(rascunhoRef.current));
    }, DEBOUNCE_RASCUNHO_MS);
    return () => clearTimeout(id);
  }, [rascunho, rascunhoRestaurado, concluido, gravarRascunho]);

  // E ao fechar a aba -- o debounce acima pode nunca chegar a disparar.
  //
  // So se regista DEPOIS do restauro do rascunho e com o convite valido. Antes
  // disso o rascunho local e o vazio, e a gravacao substitui o rascunho inteiro
  // na base: fechar a aba a meio do carregamento apagava o rascunho herdado do
  // convite anterior. Pelo mesmo motivo, um rascunho igual ao vazio nunca se
  // envia (nao ha nada de novo a guardar e pode haver algo de real la).
  const conviteValido = Boolean(estado) && !erroInicial;
  useEffect(() => {
    if (concluido || !rascunhoRestaurado || !conviteValido) return;
    const aoFechar = () => {
      if (rascunhoEstaVazio(rascunhoRef.current)) return;
      gravarRascunhoAoFechar(paraGravar(rascunhoRef.current));
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") aoFechar();
    };
    window.addEventListener("pagehide", aoFechar);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.removeEventListener("pagehide", aoFechar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [concluido, rascunhoRestaurado, conviteValido, gravarRascunhoAoFechar]);

  // FOCO. Ao mudar de pagina o botao que tinha o foco desaparece e o foco cairia
  // para o corpo da pagina: leva-se ao topo (saudacao). Declarado ANTES do foco
  // no campo invalido, para este ganhar quando ha os dois pedidos.
  const topoRef = useRef<HTMLDivElement>(null);
  const formularioRef = useRef<HTMLDivElement>(null);
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const pedirFocoNoErro = () => setPedidoFoco((n) => n + 1);
  const primeiraPagina = useRef(true);
  useEffect(() => {
    if (primeiraPagina.current) {
      primeiraPagina.current = false;
      return;
    }
    topoRef.current?.scrollIntoView?.();
    topoRef.current?.focus({ preventScroll: true });
  }, [pagina]);
  // Com erros, o foco vai para o primeiro campo invalido: o erro pode estar
  // fora do ecra (telemovel) e um leitor de ecra nao o anuncia sozinho.
  useEffect(() => {
    if (pedidoFoco === 0) return;
    formularioRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [pedidoFoco]);

  // Os obrigatorios REAIS desta organizacao, cruzados com a lista fixa do
  // ecra: `estado.campos_obrigatorios` traz so os de posicao "convite". Um
  // array VAZIO e uma resposta (a organizacao nao pos nenhum no convite) e vale
  // "nada e obrigatorio"; so a chave ausente (convite antigo, falha) cai na
  // lista estatica de sempre.
  const camposObrigatorios = useMemo(
    () => obrigatoriosResolvidos(estado?.campos_obrigatorios),
    [estado],
  );

  // Os obrigatorios das DUAS paginas -- a lista partilhada com a base (ver
  // `admissaoObrigatorios.ts`). A base aplica a mesma lista no fim da
  // submissao, sobre a ficha ja escrita; isto aqui e so para a pessoa ver o
  // que lhe falta antes de tentar.
  const pendencias = useMemo(
    () => pendenciasDoRascunho(rascunho, camposObrigatorios),
    [rascunho, camposObrigatorios],
  );
  const pendenciasTodas = useMemo(() => new Set<string>(pendencias), [pendencias]);
  const pendencias1 = useMemo(
    () => new Set<string>(pendencias.filter((codigo) => !CODIGOS_PAGINA_2.has(codigo))),
    [pendencias],
  );

  // Formato (digito de controlo do NIF/NISS, IBAN): tambem trava o avanco.
  const errosFormato = useMemo(
    () => errosDeFormato({ nif: rascunho.nif, niss: rascunho.niss, conta_numero: rascunho.conta_numero }),
    [rascunho.nif, rascunho.niss, rascunho.conta_numero],
  );
  const formatoErradoNaPagina1 = Boolean(errosFormato.nif || errosFormato.niss);

  const erroDe = (campoId: keyof Rascunho): string | null => {
    if (CAMPOS_COM_FORMATO.includes(campoId)) {
      const campo = campoId as CampoComFormato;
      if (errosServidor[campo]) return errosServidor[campo] ?? null;
      const chave = errosFormato[campo];
      if (chave && (mostrarTodos || tocados.has(ID_DOM_DO_CAMPO[campo]))) return t(chave);
    }
    if (!mostrarTodos && !tocados.has(campoId)) return null;
    return pendenciasTodas.has(campoId) ? t("hr.convite.erroObrigatorio") : null;
  };

  const obrigatorio = (codigo: CodigoCampoObrigatorioAdmissao): boolean =>
    campoEhObrigatorio(rascunho, codigo, camposObrigatorios);

  const avancar = () => {
    if (pendencias1.size > 0 || formatoErradoNaPagina1) {
      setMostrarTodos(true);
      pedirFocoNoErro();
      return;
    }
    setMostrarTodos(false);
    setErroSubmissao(null);
    void gravarRascunho(paraGravar(rascunho));
    setPagina(2);
  };

  /** Voltar a pagina 1: o erro da recusa pertencia a pagina que se deixa. */
  const voltar = () => {
    setErroSubmissao(null);
    setPagina(1);
  };

  /** Uma recusa do servidor: marca o campo, ou diz o que falta, e leva a pessoa onde ha trabalho. */
  const tratarRecusa = (corpo: { error?: string; campos?: unknown }) => {
    const codigo = corpo.error?.split(":")[0].trim();
    const mensagem = mensagemErroAdmissao(t, corpo);
    const campo = campoDoErroDeServidor(codigo);
    if (campo) {
      setErrosServidor((anteriores) => ({ ...anteriores, [campo]: mensagem }));
      setPagina(campo === "conta_numero" ? 2 : 1);
      pedirFocoNoErro();
      return;
    }
    setErroSubmissao(mensagem);
    if (codigo === "admissao_incompleta") {
      setMostrarTodos(true);
      const primeiro = camposDeAdmissaoIncompleta(corpo)[0];
      if (primeiro) {
        setPagina(CODIGOS_PAGINA_2.has(primeiro as CodigoCampoObrigatorioAdmissao) ? 2 : 1);
      }
      pedirFocoNoErro();
    }
  };

  const submeterFormulario = async () => {
    if (submetendo) return;

    // A assinatura e a declaracao pedem-se sempre; falta-lhes o erro, junto do
    // campo, em vez de um botao que nao carrega e nao diz porque.
    const faltaAssinatura = rascunho.assinatura_nome.trim() === "";
    const faltaAceite = !rascunho.aceite;
    setErroAssinatura(faltaAssinatura ? t("hr.convite.erro.assinatura") : null);
    setErroAceite(faltaAceite ? t("hr.convite.erroObrigatorio") : null);
    if (faltaAssinatura || faltaAceite) {
      pedirFocoNoErro();
      return;
    }

    // Faltar um obrigatorio, ou um numero com formato errado, nao e erro de
    // servidor: mostra-se onde falta e, se for na pagina 1, volta-se la --
    // submeter assim so gastava uma ida a base para ser recusado.
    if (pendenciasTodas.size > 0) {
      setMostrarTodos(true);
      setErroSubmissao(t("hr.convite.erroObrigatorio"));
      if (pendencias1.size > 0) setPagina(1);
      pedirFocoNoErro();
      return;
    }
    if (Object.keys(errosFormato).length > 0) {
      setMostrarTodos(true);
      setErroSubmissao(null);
      setPagina(formatoErradoNaPagina1 ? 1 : 2);
      pedirFocoNoErro();
      return;
    }

    // O payload sai inteiro do contrato partilhado, conta bancaria incluida --
    // ver `conviteAdmissaoPayload.ts`.
    const dados: DadosSubmissaoConvite = construirPayloadConvite(rascunho);

    setErroSubmissao(null);
    const resultado = await submeter(dados, rascunho.assinatura_nome.trim());
    if (!resultado.ok) {
      tratarRecusa(resultado.corpoErro);
      return;
    }
    setConcluido({ avisos: resultado.avisos });
  };

  if (loading) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (erroInicial || !estado) {
    return <ConviteCartaoLinkInvalido t={t} motivo={motivo ?? "inexistente"} />;
  }

  if (concluido) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            {/* Titulo de nivel 1: e a unica coisa desta pagina e o leitor de ecra tem de a anunciar. */}
            <h1 className="text-2xl font-semibold leading-none tracking-tight">
              {t("hr.convite.sucessoTitulo")}
            </h1>
            <CardDescription>{t("hr.convite.sucessoDescricao")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const propsPagina = { t, rascunho, definir, erroDe, obrigatorio };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 py-10">
      {/* tabIndex -1: recebe o foco ao mudar de pagina, sem entrar na ordem de tabulacao. */}
      <div ref={topoRef} id="convite-topo" tabIndex={-1} className="outline-none">
        <ConviteSaudacao t={t} estado={estado} pagina={pagina} />
      </div>

      <CamposTocadosProvider onTocar={tocar} rotuloObrigatorio={t("hr.campos.obrigatorio")}>
        <div ref={formularioRef} className="space-y-6">
          {pagina === 1 && <ConvitePagina1 {...propsPagina} />}
          {pagina === 2 && (
            <ConvitePagina2
              {...propsPagina}
              erroAssinatura={erroAssinatura}
              erroAceite={erroAceite}
            />
          )}

          {erroSubmissao && (
            <p role="alert" className="text-sm text-destructive">
              {erroSubmissao}
            </p>
          )}

          {pagina === 1 ? (
            <div className="flex justify-end">
              <Button onClick={avancar}>{t("hr.convite.seguinte")}</Button>
            </div>
          ) : (
            <div className="flex justify-between">
              <Button variant="ghost" onClick={voltar} disabled={submetendo}>
                {t("hr.convite.anterior")}
              </Button>
              <Button onClick={submeterFormulario} disabled={submetendo}>
                {submetendo && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("hr.convite.submeter")}
              </Button>
            </div>
          )}
        </div>
      </CamposTocadosProvider>
    </div>
  );
}
