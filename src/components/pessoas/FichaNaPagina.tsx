// A ficha da pessoa NA PÁGINA (a ficha real): sem Sheet nem diálogo por cima, dentro da área de conteúdo do layout, com a barra lateral e o topo sempre
// à vista. Faz o que o Sheet fazia: o foco entra no nome ao abrir, volta ao cartão que abriu ao fechar, o Esc fecha (primeiro o painel em linha) e as
// teclas [ e ] passam à pessoa anterior e à seguinte. `aberto` quer dizer «há uma pessoa aberta» e `resumo` «a ficha dela já chegou»: assim a troca com
// [ e ] não fecha nem reabre a ficha (mostra-se um bloco de espera) e o foco só regressa quando se volta ao quadro.
import { useEffect, useRef, type MutableRefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { FichaInterior, type FichaInteriorProps } from "./FichaInterior";
import { focoDeRegresso } from "./focoDeRegresso";
import { ALTURA_DO_PAI } from "./layoutGuia";
import { vizinhas } from "./navegacaoFicha";
import { LigacaoVoltarFicha, ProvedorFichaNaPagina } from "./pecasFicha";
import type { ResumoPessoa } from "./pessoasTipos";
import { useEscFicha } from "./useEscFicha";
import { useTeclasFicha } from "./useTeclasFicha";

export interface FichaNaPaginaProps extends Omit<FichaInteriorProps, "resumo" | "fecharPainel" | "vizinhas" | "aoIr" | "naPagina"> {
  resumo: ResumoPessoa | null;
  aberto: boolean;
  aoFechar: () => void;
  idsVisiveis: string[];
  aoIrPara: (id: string) => void;
  origemFoco?: MutableRefObject<HTMLElement | null>;
}

function EsperaFicha({ voltaPara }: { voltaPara?: "pipeline" | "pessoas" }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-muted/30 pb-6">
      {voltaPara && <LigacaoVoltarFicha voltaPara={voltaPara} />}
      <p role="status" aria-busy="true" className="px-4 py-6 text-sm text-muted-foreground sm:px-6">{t("pessoasPagina.real.ficha.opening")}</p>
    </div>
  );
}

export function FichaNaPagina({ resumo, aberto, aoFechar, idsVisiveis, aoIrPara, origemFoco, ...resto }: FichaNaPaginaProps) {
  const fecharPainel = useRef<(() => boolean) | null>(null);
  const viz = vizinhas(idsVisiveis, resumo?.pessoa.id ?? "");
  const mostra = aberto && resumo !== null;
  const ir = useTeclasFicha(mostra, viz, resumo?.pessoa.id, aoIrPara);
  useEscFicha(mostra, fecharPainel, aoFechar);

  // Ao abrir guarda-se a origem do foco; ao voltar ao quadro (nunca ao desmontar) o foco regressa a ela. O quadro já está visível nesse momento.
  const origem = useRef<HTMLElement | null>(null);
  const estavaAberto = useRef(false);
  const focouNome = useRef(false);
  useEffect(() => {
    if (aberto) {
      if (estavaAberto.current) return;
      estavaAberto.current = true;
      focouNome.current = false;
      origem.current = origemFoco?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      return;
    }
    if (!estavaAberto.current) return;
    estavaAberto.current = false;
    const alvo = focoDeRegresso(origem.current);
    if (origemFoco) origemFoco.current = null; // gasta-se: a próxima abertura guarda a sua
    alvo?.focus();
  }, [aberto, origemFoco]);

  // O foco entra no nome uma vez por abertura, quando a ficha chega (nas trocas com [ e ] o foco é da seta usada).
  useEffect(() => {
    if (!mostra || focouNome.current) return;
    focouNome.current = true;
    document.querySelector<HTMLElement>("[data-ficha-raiz] [data-ficha-nome]")?.focus();
  }, [mostra]);

  if (!aberto) return null;
  return (
    <ProvedorFichaNaPagina aoFechar={aoFechar}>
      <section data-ficha-raiz="" aria-label={resumo?.pessoa.nome} className={ALTURA_DO_PAI}>
        {resumo ? (
          <FichaInterior key={resumo.pessoa.id} {...resto} naPagina resumo={resumo} fecharPainel={fecharPainel} vizinhas={viz} aoIr={ir} />
        ) : (
          <EsperaFicha voltaPara={resto.voltaPara} />
        )}
      </section>
    </ProvedorFichaNaPagina>
  );
}
