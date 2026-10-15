// O assistente de denúncia: passo 0 (anónima ou identificada) e quatro passos, com progresso e rascunho em memória.
// Enviar guarda a denúncia na loja de exemplo e mostra o código e o PIN; nada sai desta página.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { guardarCodigo } from "../dados/codigosGuardados";
import { guardarRascunho, lerRascunho } from "../dados/rascunho";
import { submeter } from "../dados/loja";
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
  /** Para onde leva «Acompanhar esta denúncia» (por omissão, o acompanhamento público). */
  acompanharTo?: (anonima: boolean) => string;
}

export function FormularioDenuncia({ organizacaoId, pessoa, acompanharTo }: FormularioDenunciaProps) {
  const { t } = useTranslation();
  const chave = chaveRascunho(organizacaoId, pessoa);
  const inicial = lerRascunho(chave);
  const [dados, setDados] = useState<DadosFormulario>(inicial?.dados ?? FORMULARIO_VAZIO);
  const [passo, setPasso] = useState(inicial?.passo ?? 0);
  const [tentou, setTentou] = useState(false);
  const [retorno, setRetorno] = useState<number | null>(null);
  const [enviada, setEnviada] = useState<{ codigo: string; pin: string; anonima: boolean } | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);

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

  const enviar = (): void => {
    const invalido = Array.from({ length: PASSOS }, (_, i) => i).find((i) => !passoValido(dados, i));
    if (invalido !== undefined) {
      if (invalido !== passo) irPara(invalido);
      setTentou(true);
      return;
    }
    const origem = { organizationId: organizacaoId, pessoaId: pessoa?.id ?? null };
    setEnviada({ ...submeter(dados, origem), anonima: dados.anonima !== false });
  };

  const recomecar = (): void => {
    setDados(FORMULARIO_VAZIO);
    setEnviada(null);
    setRetorno(null);
    irPara(0);
  };

  if (enviada) {
    return (
      <Confirmacao
        codigo={enviada.codigo}
        pin={enviada.pin}
        acompanharTo={acompanharTo?.(enviada.anonima)}
        onGuardarCodigo={pessoa && enviada.anonima ? () => guardarCodigo(enviada.codigo) : undefined}
        onNova={recomecar}
      />
    );
  }

  const props: PassoProps = { dados, erros, onChange: mudar };
  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-5 rounded-lg border bg-card p-5" aria-label={t("cd.formulario")}>
      <ProgressoPassos passo={passo} titulo={t(CHAVES_PASSO[passo])} />
      <h2 ref={titulo} tabIndex={-1} className="text-xl font-semibold outline-none">{t(CHAVES_PASSO[passo])}</h2>
      {nErros > 0 && <p role="alert" className="text-sm font-medium text-destructive">{t("cd.erro.resumo", { n: nErros })}</p>}
      {passo === 0 && <PassoModo {...props} />}
      {passo === 1 && <PassoOQue {...props} />}
      {passo === 2 && <PassoQuem {...props} />}
      {passo === 3 && <PassoProvas {...props} />}
      {passo === ULTIMO && <PassoRever {...props} onIrPara={(n) => { setRetorno(ULTIMO); irPara(n); }} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="max-w-xs text-xs text-muted-foreground">{t("cd.rascunho")}</p>
        <div className="flex gap-2">
          {passo > 0 && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => irPara(passo - 1)}>{t("cd.anterior")}</Button>
          )}
          {passo < ULTIMO ? (
            <Button type="button" className="min-h-11" onClick={continuar}>
              {retorno !== null ? t("cd.voltarResumo") : t("cd.continuar")}
            </Button>
          ) : (
            <Button type="button" className="min-h-11" onClick={enviar}>{t("cd.enviar")}</Button>
          )}
        </div>
      </div>
    </form>
  );
}
