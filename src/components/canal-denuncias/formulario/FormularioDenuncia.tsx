// O assistente de denúncia: passo 0 (anónima ou identificada) e quatro passos, com progresso e rascunho em memória.
// Enviar guarda a denúncia na loja de exemplo e mostra o código e o PIN; nada sai desta página.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { guardarCodigo } from "../dados/codigosGuardados";
import { guardarRascunho, lerRascunho, limparRascunho } from "../dados/rascunho";
import { useExecutar } from "../comum/useExecutar";
import { useFonte } from "../dados/fonte";
import type { ErroAcao } from "../lib/acoes";
import { FORMULARIO_VAZIO, PASSOS, passoValido, validarPasso, type DadosFormulario } from "../lib/formulario";
import { aplicarAlteracao, chaveRascunho, type PessoaLigada } from "../lib/pessoaLigada";
import { Confirmacao } from "./Confirmacao";
import { PassoModo, type PassoProps } from "./PassoModo";
import { PassoOQue } from "./PassoOQue";
import { PassoProvas } from "./PassoProvas";
import { PassoQuem } from "./PassoQuem";
import { PassoRever } from "./PassoRever";
import { ProgressoPassos } from "./ProgressoPassos";

const ULTIMO = PASSOS - 1;
const CHAVES_PASSO = ["cd.passo0", "cd.passo1", "cd.passo2", "cd.passo3", "cd.passo4"];

interface FormularioDenunciaProps {
  /** A organização a que a denúncia pertence: a ativa, dentro da app; a da página, na pública. */
  organizacaoId: string;
  /** Dentro da app: quem tem a sessão. Identificada, o nome e o email vêm daqui e a denúncia fica ligada à pessoa. */
  pessoa?: PessoaLigada;
  /** Página pública: o `?org=` do canal. Dentro da app não se passa (a organização ativa decide). */
  slugPublico?: string;
  /** Para onde leva «Acompanhar esta denúncia» (por omissão, o acompanhamento público). */
  acompanharTo?: (anonima: boolean) => string;
  /**
   * Num painel lateral: o corpo rola, o rodapé fica fixo e «Acompanhar» faz isto em vez de navegar. Sem isto, é a página
   * inteira. `onBloquear(true)` pede ao painel que NÃO se feche (Esc, clique fora, X): enquanto o envio está pendente (a
   * denúncia pode já estar criada e o código e o PIN ainda não chegaram) e, numa anónima, até a pessoa confirmar que
   * guardou o código e o PIN (aparecem uma só vez e não se recuperam).
   */
  painel?: { onCancelar: () => void; onAcompanhar: (anonima: boolean) => void; onBloquear?: (bloqueado: boolean) => void };
}

/** A confirmação dentro do painel: o corpo rola e o rodapé fixo só tem «Fechar» (bloqueado até guardar o código e o PIN). */
function ConfirmacaoNoPainel({ onFechar, bloqueado, children }: { onFechar: () => void; bloqueado: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
      <div className="flex justify-end border-t bg-background px-6 py-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={bloqueado}
          aria-describedby={bloqueado ? "den-conf-guardar-antes" : undefined}
          onClick={onFechar}
        >
          {t("cdm.painel.fechar")}
        </Button>
      </div>
    </div>
  );
}

export function FormularioDenuncia({ organizacaoId, pessoa, slugPublico, acompanharTo, painel }: FormularioDenunciaProps) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  const [erroEnvio, setErroEnvio] = useState<ErroAcao | null>(null);
  const chave = chaveRascunho(organizacaoId, pessoa);
  const inicial = lerRascunho(chave);
  const [dados, setDados] = useState<DadosFormulario>(inicial?.dados ?? FORMULARIO_VAZIO);
  const [passo, setPasso] = useState(inicial?.passo ?? 0);
  const [tentou, setTentou] = useState(false);
  const [retorno, setRetorno] = useState<number | null>(null);
  const [enviada, setEnviada] = useState<{ codigo: string; pin: string; anonima: boolean } | null>(null);
  const [guardouCodigoEPin, setGuardouCodigoEPin] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  // Num painel, uma anónima enviada só se larga depois de a pessoa dizer que guardou o código e o PIN.
  const exigeGuardar = painel !== undefined && enviada !== null && enviada.anonima;
  const bloqueado = pendente || (exigeGuardar && !guardouCodigoEPin);
  const onBloquear = painel?.onBloquear;

  useEffect(() => {
    onBloquear?.(bloqueado);
  }, [bloqueado, onBloquear]);

  useEffect(() => {
    if (!enviada) guardarRascunho({ dados, passo, chave });
  }, [dados, passo, enviada, chave]);

  useEffect(() => {
    if (primeira.current) primeira.current = false;
    else titulo.current?.focus();
  }, [passo]);

  const erros = tentou ? validarPasso(dados, passo) : {};
  const nErros = Object.keys(erros).length;
  const mudar = (parcial: Partial<DadosFormulario>): void => setDados((d) => aplicarAlteracao(d, parcial, pessoa));

  const irPara = (n: number): void => {
    setTentou(false);
    setPasso(n);
  };

  const continuar = (): void => {
    if (!passoValido(dados, passo)) return setTentou(true);
    irPara(retorno ?? passo + 1);
    setRetorno(null);
  };

  const enviar = async (): Promise<void> => {
    const invalido = Array.from({ length: PASSOS }, (_, i) => i).find((i) => !passoValido(dados, i));
    if (invalido !== undefined) {
      if (invalido !== passo) irPara(invalido);
      setTentou(true);
      return;
    }
    setErroEnvio(null);
    // Sem anexos reais (D7 do desenho) nada se anexa: o que ficou no rascunho em memória não segue como se fosse enviado.
    const f = fonte.anexosReais ? dados : { ...dados, anexos: [] };
    const origem = { organizationId: organizacaoId, pessoaId: pessoa?.id ?? null, slug: slugPublico };
    const r = await executar(() => fonte.submeter(f, origem));
    // O código e o PIN só existem na resposta: se falhou, o formulário fica como estava, para tentar de novo sem perder nada.
    if (r.ok && "codigo" in r) {
      limparRascunho();
      setEnviada({ codigo: r.codigo, pin: r.pin, anonima: dados.anonima !== false });
    } else setErroEnvio("erro" in r ? r.erro : "indisponivel");
  };

  const recomecar = (): void => {
    setDados(FORMULARIO_VAZIO);
    setEnviada(null);
    setGuardouCodigoEPin(false);
    setRetorno(null);
    irPara(0);
  };

  if (enviada) {
    const confirmacao = (
      <Confirmacao
        codigo={enviada.codigo}
        pin={enviada.pin}
        acompanharTo={acompanharTo?.(enviada.anonima)}
        onGuardarCodigo={pessoa && enviada.anonima ? () => guardarCodigo(enviada.codigo) : undefined}
        onAcompanhar={painel ? () => painel.onAcompanhar(enviada.anonima) : undefined}
        ligadaAConta={pessoa !== undefined && !enviada.anonima}
        onConfirmarGuardado={exigeGuardar ? setGuardouCodigoEPin : undefined}
        onNova={recomecar}
      />
    );
    return painel
      ? <ConfirmacaoNoPainel onFechar={painel.onCancelar} bloqueado={bloqueado}>{confirmacao}</ConfirmacaoNoPainel>
      : confirmacao;
  }

  const props: PassoProps = { dados, erros, onChange: mudar };
  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      className={painel ? "flex min-h-0 flex-1 flex-col" : "space-y-5 rounded-lg border bg-card p-5"}
      aria-label={t("cd.formulario")}
    >
      <div className={painel ? "flex-1 space-y-5 overflow-y-auto p-6" : "space-y-5"}>
        <ProgressoPassos passo={passo} titulo={t(CHAVES_PASSO[passo])} />
        <h2 ref={titulo} tabIndex={-1} className="text-xl font-semibold outline-none">{t(CHAVES_PASSO[passo])}</h2>
        {nErros > 0 && <p role="alert" className="text-sm font-medium text-destructive">{t("cd.erro.resumo", { n: nErros })}</p>}
        {erroEnvio && <p role="alert" className="text-sm font-medium text-destructive">{t("cd.erro.envio", { motivo: t(`cd.erroAcao.${erroEnvio}`) })}</p>}
        {pendente && <p role="status" className="text-sm font-medium">{t("cd.aEnviar")}</p>}
        {passo === 0 && <PassoModo {...props} />}
        {passo === 1 && <PassoOQue {...props} />}
        {passo === 2 && <PassoQuem {...props} />}
        {passo === 3 && <PassoProvas {...props} />}
        {passo === ULTIMO && <PassoRever {...props} onIrPara={(n) => { setRetorno(ULTIMO); irPara(n); }} />}
      </div>
      <div className={painel ? "flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-4" : "flex flex-wrap items-center justify-between gap-3 border-t pt-4"}>
        <p className="max-w-xs text-xs text-muted-foreground">{t("cd.rascunho")}</p>
        <div className="flex gap-2">
          {painel && (
            <Button type="button" variant="ghost" className="min-h-11" disabled={pendente} onClick={painel.onCancelar}>{t("cdm.painel.cancelar")}</Button>
          )}
          {passo > 0 && (
            <Button type="button" variant="outline" className="min-h-11" disabled={pendente} onClick={() => irPara(passo - 1)}>{t("cd.anterior")}</Button>
          )}
          {passo < ULTIMO ? (
            <Button type="button" className="min-h-11" onClick={continuar}>
              {retorno !== null ? t("cd.voltarResumo") : t("cd.continuar")}
            </Button>
          ) : (
            <Button type="button" className="min-h-11" disabled={pendente} onClick={enviar}>{t("cd.enviar")}</Button>
          )}
        </div>
      </div>
    </form>
  );
}
