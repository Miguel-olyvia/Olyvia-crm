import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { ExternalLink, FilePlus2, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import type { AcoesNegocio } from "./AcoesNegocio";
import { CabecalhoPainel } from "./CabecalhoPainel";
import { ContratoPainel } from "./ContratoPainel";
import { OrcamentosPainel } from "./OrcamentosPainel";
import { PessoaPainel } from "./PessoaPainel";
import { PropostaPainel } from "./PropostaPainel";
import { ResumoPainel } from "./ResumoPainel";
import { FOCO } from "./estilos";
import type { NegocioMes } from "./negocioMetas";
import { abasDoNegocio, ehAba } from "./negocioPainel";
import { useDadosPainel } from "./useDadosPainel";

interface PainelNegocioProps {
  negocio: NegocioMes | null;
  hoje: string;
  acoes: AcoesNegocio;
  aoFechar: () => void;
}

/**
 * A barra de ações, fixa: Abrir negócio (a única principal), Abrir pessoa e Criar orçamento. Os dois primeiros são
 * ligações reais (/deals?open=, /pessoas?open=); "Criar orçamento" e as ações dos cartões e das linhas da Lista
 * ainda só mostram um aviso de exemplo (ver `acoesExemplo.ts`).
 */
function BarraAcoes({ negocio, acoes }: { negocio: NegocioMes; acoes: AcoesNegocio }) {
  const { t } = useTranslation();
  const botao = cn("min-h-11 gap-2", FOCO);
  return (
    <div role="group" aria-label={t("businessGoals.panel.actions")} className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
      <Button asChild className={botao}>
        <Link to={`/deals?open=${encodeURIComponent(negocio.id)}`}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.panel.open")}
        </Link>
      </Button>
      <Button asChild variant="outline" className={botao}>
        <Link to={`/pessoas?open=${encodeURIComponent(negocio.pessoaId)}`}>
          <UserRound className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.panel.openPerson")}
        </Link>
      </Button>
      <Button type="button" variant="outline" className={botao} onClick={() => acoes.criarOrcamento(negocio)}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        {t("businessGoals.actions.createQuote")}
      </Button>
    </div>
  );
}

/** Os separadores do painel: Resumo (por defeito), Pessoa, Orçamentos, e Proposta e Contrato só se o negócio os tem. */
function SeparadoresPainel({ negocio, hoje }: { negocio: NegocioMes; hoje: string }) {
  const { t } = useTranslation();
  const { pessoaDe, detalheDe } = useDadosPainel();
  const [aba, setAba] = useState("resumo");
  const abas = abasDoNegocio(negocio);
  // Se a aba escolhida deixar de existir, volta ao Resumo em vez de ficar em branco.
  const ativa = ehAba(aba, negocio) ? aba : "resumo";
  const detalhe = detalheDe(negocio.id);
  const conteudo = cn("mt-0 rounded-sm", FOCO);
  return (
    <Tabs value={ativa} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col [@media(max-height:480px)]:flex-none">
      <ListaAbas aria-label={t("businessGoals.painel.tabs.label")} className="shrink-0 px-6">
        {abas.map((a) => (
          <Aba key={a.id} value={a.id} rotulo={t(`businessGoals.painel.tabs.${a.id}`)} contador={a.contador} />
        ))}
      </ListaAbas>
      {/* Com pouca altura (zoom a 400 %) a zona dos separadores deixa de rolar sozinha: o painel inteiro rola. */}
      <div className="flex-1 overflow-y-auto p-6 [@media(max-height:480px)]:flex-none [@media(max-height:480px)]:overflow-visible">
        <TabsContent value="resumo" className={conteudo}><ResumoPainel negocio={negocio} hoje={hoje} /></TabsContent>
        <TabsContent value="pessoa" className={conteudo}><PessoaPainel pessoa={pessoaDe(negocio.pessoaId)} /></TabsContent>
        <TabsContent value="orcamentos" className={conteudo}><OrcamentosPainel negocio={negocio} detalhe={detalhe} /></TabsContent>
        <TabsContent value="proposta" className={conteudo}><PropostaPainel negocio={negocio} detalhe={detalhe} hoje={hoje} /></TabsContent>
        <TabsContent value="contrato" className={conteudo}><ContratoPainel negocio={negocio} detalhe={detalhe} /></TabsContent>
      </div>
    </Tabs>
  );
}

/**
 * O painel lateral de um negócio: cabeçalho e barra de ações fixos e, por baixo, os separadores. Cada negócio abre
 * no Resumo (a `key` repõe o separador ao trocar de negócio). Guarda o último negócio enquanto o painel fecha, para o
 * conteúdo (e o título) não desaparecerem durante a animação de saída. */
export function PainelNegocio({ negocio, hoje, acoes, aoFechar }: PainelNegocioProps) {
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Sheet open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl motion-reduce:!animate-none [@media(max-height:480px)]:overflow-y-auto [@media(max-height:480px)]:[&>*]:shrink-0"
      >
        {mostrado && (
          <>
            <CabecalhoPainel negocio={mostrado} />
            <BarraAcoes negocio={mostrado} acoes={acoes} />
            <SeparadoresPainel key={mostrado.id} negocio={mostrado} hoje={hoje} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
