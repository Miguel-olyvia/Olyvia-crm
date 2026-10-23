import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { FilePlus2, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import type { AcoesNegocio } from "./AcoesNegocio";
import { CabecalhoPainel } from "./CabecalhoPainel";
import { ContratoPainel } from "./ContratoPainel";
import { BotaoPerderNegocio } from "./BotoesPerda";
import { aceitaOrcamentos } from "./negocioAcoes";
import { OrcamentosPainel } from "./OrcamentosPainel";
import { PercursoNegocio } from "./PercursoPainel";
import { PessoaPainel } from "./PessoaPainel";
import { PropostaPainel } from "./PropostaPainel";
import { ResumoPainel } from "./ResumoPainel";
import { FOCO } from "./estilos";
import { isNegocioGanho, type NegocioMes } from "./negocioMetas";
import { abasDoNegocio, ehAba } from "./negocioPainel";
import { enderecoDaPessoa } from "./useAcoesNegocio";
import { useDadosPainel } from "./useDadosPainel";

interface PainelNegocioProps {
  negocio: NegocioMes | null;
  hoje: string;
  acoes: AcoesNegocio;
  aoFechar: () => void;
  /** Ao abrir, o foco vai para o título (um negócio acabado de criar) em vez do comportamento por omissão. */
  focarTitulo?: boolean;
}

/**
 * A barra de ações, fixa: Abrir pessoa (uma ligação real a /pessoas?open=, que abre a ficha dela) e Criar orçamento
 * (abre o diálogo da página, que acrescenta o orçamento ao negócio em memória; um negócio já ganho não o mostra) e Perder negócio (em
 * qualquer fase, com motivo; um negócio já ganho não o mostra).
 */
function BarraAcoes({ negocio, acoes, hoje }: { negocio: NegocioMes; acoes: AcoesNegocio; hoje: string }) {
  const { t } = useTranslation();
  const botao = cn("min-h-11 gap-2", FOCO);
  return (
    <div role="group" aria-label={t("businessGoals.panel.actions")} className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
      <Button asChild variant="outline" className={botao}>
        <Link to={enderecoDaPessoa(negocio.pessoaId)}>
          <UserRound className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.panel.openPerson")}
        </Link>
      </Button>
      {aceitaOrcamentos(negocio) && (
        <Button type="button" className={botao} onClick={() => acoes.criarOrcamento(negocio)}>
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          {t("businessGoals.actions.createQuote")}
        </Button>
      )}
      {!isNegocioGanho(negocio) && <BotaoPerderNegocio negocio={negocio} hoje={hoje} />}
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
        <TabsContent value="resumo" className={conteudo}>
          <ResumoPainel negocio={negocio} hoje={hoje} />
          <PercursoNegocio negocio={negocio} detalhe={detalhe} />
        </TabsContent>
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
export function PainelNegocio({ negocio, hoje, acoes, aoFechar, focarTitulo = false }: PainelNegocioProps) {
  const conteudo = useRef<HTMLDivElement>(null);
  const ultimo = useRef<NegocioMes | null>(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  return (
    <Sheet open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent
        ref={conteudo}
        onOpenAutoFocus={(e) => {
          const titulo = focarTitulo ? conteudo.current?.querySelector<HTMLElement>("[data-titulo-painel]") : null;
          if (!titulo) return;
          e.preventDefault();
          titulo.focus();
        }}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl motion-reduce:!animate-none [@media(max-height:480px)]:overflow-y-auto [@media(max-height:480px)]:[&>*]:shrink-0"
      >
        {mostrado && (
          <>
            <CabecalhoPainel negocio={mostrado} />
            <BarraAcoes negocio={mostrado} acoes={acoes} hoje={hoje} />
            <SeparadoresPainel key={mostrado.id} negocio={mostrado} hoje={hoje} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
