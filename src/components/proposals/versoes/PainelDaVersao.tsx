import { useState } from "react";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/hooks/useTranslation";
import { useIrParaCampo } from "@/components/templates/versoes/irParaCampo";
import { nomeNaFrase } from "./nomeNaFrase";
import { ConteudoPorIdioma, type BaseDoConteudo } from "./ConteudoPorIdioma";
import { ListaDeVerificacao } from "./ListaDeVerificacao";
import { SeccoesPorIdioma, type SeccaoParaTraduzir } from "./SeccoesPorIdioma";
import type { VersoesDaProposta } from "./useVersoesDaProposta";

interface PainelDaVersaoProps {
  versoes: VersoesDaProposta;
  /** O português: dá os textos de comparação e as secções. */
  config: BaseDoConteudo & { sections: SeccaoParaTraduzir[] };
}

/**
 * O painel esquerdo do editor quando se edita um idioma que não é o base: só os separadores de texto.
 * Cores, tipografia, layout e restantes opções são partilhados com o português e não se repetem aqui.
 */
export function PainelDaVersao({ versoes, config }: PainelDaVersaoProps) {
  const { t } = useTranslation();
  const codigo = versoes.idiomaAtivo;
  const idioma = nomeNaFrase(t, codigo);
  const [separador, setSeparador] = useState("sections");
  const [verificacaoVisivel, setVerificacaoVisivel] = useState(false);
  // Os campos das secções vivem em «Secções» (chave sections.<id>.<campo>); os restantes textos em «Conteúdo».
  const campo = useIrParaCampo({
    abrirSeparador: (chave) => {
      setSeparador(chave.startsWith("sections.") ? "sections" : "content");
      if (chave.startsWith("verification_email_")) setVerificacaoVisivel(true);
    },
  });

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("proposalTemplateEditor.versions.panelNote", { language: idioma })}
      </p>

      <ListaDeVerificacao
        codigo={codigo}
        campos={versoes.campos}
        seccoes={config.sections}
        desatualizado={versoes.resumoAtivo?.desatualizado ?? false}
        onMarcarAtualizada={versoes.marcarAtualizada}
        onRemover={versoes.remover}
        onIrPara={campo.irPara}
        naoEncontrado={campo.naoEncontrado}
      />

      <Tabs value={separador} onValueChange={setSeparador} className="w-full">
        <TabsList className="grid h-11 w-full grid-cols-2" aria-label={t("proposalTemplateEditor.versions.tabsLabel", { language: idioma })}>
          <TabsTrigger value="sections" className="min-h-9 px-2 text-xs">{t("proposalTemplateEditor.versions.tab.sections")}</TabsTrigger>
          <TabsTrigger value="content" className="min-h-9 px-2 text-xs">{t("proposalTemplateEditor.versions.tab.content")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sections" className="mt-4">
          <SeccoesPorIdioma codigo={codigo} seccoes={config.sections} valorDaSeccao={versoes.valorDaSeccao} onEscrever={versoes.escreverSeccao} registar={campo.registar} />
        </TabsContent>
        <TabsContent value="content" className="mt-4">
          <ConteudoPorIdioma codigo={codigo} base={config} valorDoTexto={versoes.valorDoTexto} onEscrever={versoes.escreverTexto} registar={campo.registar} mostrarVerificacao={verificacaoVisivel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
