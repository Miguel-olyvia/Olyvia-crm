// As abas da ficha da pessoa: Resumo (ou, na ficha real, Registos e dados), Visitas, Negócios, Submissões, Notas e Atividade. No exemplo vivem por baixo do
// cabeçalho; na ficha real (com o guia) já não estão à vista: são o corpo do diálogo de apoio (`FichaApoioDialogo`), que se abre a pedido.
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import type { AbaApoio } from "./apoioTipos";
import { AbaVisitasFicha } from "./AbaVisitasFicha";
import { AtividadeFicha } from "./AtividadeFicha";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { FichaNegocios } from "./FichaNegocios";
import { FichaNotas, FichaSubmissoes } from "./FichaSubmissoesNotas";
import type { FichaInteriorProps } from "./FichaInterior";
import { textoPendentes } from "./formatoPessoas";
import { itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import { ListaNegociosComLixo } from "./ListaNegociosComLixo";
import { contarVisitasAtivas, visitasDaFicha } from "./proximaVisita";
import { ResumoFicha } from "./ResumoFicha";

export type AbaFicha = "resumo" | "notas" | AbaApoio;

export interface AbasProps extends FichaInteriorProps {
  aba: AbaFicha;
  aoMudar: (a: AbaFicha) => void;
  negocioAberto: string | null;
  aoAbrirNegocio: (id: string) => void;
  aoVoltarNegocio: () => void;
  /** Abre o diálogo do resultado de uma visita. */
  aoRegistarResultado: (visitaId: string) => void;
  /** O guia do passo seguinte da pessoa em abordagem abre daqui o formulário «Registar chamada» da ficha. */
  aoRegistarChamada: (origem: HTMLElement | null) => void;
  /** O «Marcar como perdido» do guia (encerrar a abordagem de uma lead); ausente quando a pessoa não se encerra. */
  aoEncerrar?: (origem: HTMLElement | null) => void;
}

/**
 * A aba Negócios: a lista, ou o negócio aberto (com "Voltar aos negócios"). Com o guia o negócio aberto vive no topo da ficha: a aba lista só os
 * OUTROS e diz qual está aberto em cima (nunca o repete).
 */
export function ConteudoNegocios(p: AbasProps) {
  const { t } = useTranslation();
  const aberto = p.resumo.negocios.find((n) => n.id === p.negocioAberto);
  const abertoEmCima = p.comGuia && aberto ? aberto : undefined;
  // Depois de mandar um negócio para o lixo o detalhe fecha-se e o foco perde-se: a lista que aparece leva-o para o filtro (só nesse caso).
  const [focarFiltro, setFocarFiltro] = useState(false);
  const focado = useCallback(() => setFocarFiltro(false), []);
  // O item do processo do negócio aberto (o mesmo do Quadro): dá ao passo seguinte o botão que o executa.
  const extras = useExtrasProcesso();
  const item = useMemo(
    () => itensDaPessoa(p.resumo, p.hoje, extras).find((i) => i.id === p.negocioAberto),
    [p.resumo, p.hoje, extras, p.negocioAberto],
  );
  // Sem a capacidade «negocios» (a ficha real, até ao P3) a lista só se lê: o detalhe e as ações do negócio ainda não existem na base.
  if (!aberto || abertoEmCima) {
    const outros = abertoEmCima ? p.resumo.negocios.filter((n) => n.id !== abertoEmCima.id) : p.resumo.negocios;
    // A lista normal, com o filtro «Lixo» para quem pode restaurar (na ficha real; no exemplo é só a lista).
    return (
      <ListaNegociosComLixo
        pessoaId={p.resumo.pessoa.id} pessoaNome={p.resumo.pessoa.nome} focarAoEntrar={focarFiltro} aoFocado={focado}
        lista={(
          <>
            {abertoEmCima && <p className="mb-3 text-sm text-muted-foreground">{t("pessoasPagina.dealsList.openOnTop", { service: abertoEmCima.servico })}</p>}
            {(!abertoEmCima || outros.length > 0) && (
              <FichaNegocios negocios={outros} hoje={p.hoje} aoAbrir={p.acoes.capacidades?.negocios === false ? undefined : p.aoAbrirNegocio} />
            )}
          </>
        )}
      />
    );
  }
  return (
    <DetalheNegocioFicha
      negocio={aberto} hoje={p.hoje} aoVoltar={p.aoVoltarNegocio} item={item} pessoa={p.resumo.pessoa} atividade={p.atividade}
      aoApagado={() => { setFocarFiltro(true); p.aoVoltarNegocio(); }}
    />
  );
}

/**
 * As abas por esta ordem: Resumo (na ficha real, «Registos e dados»: só as secções recolhíveis), Visitas, Negócios, Submissões, Notas e Atividade. A lista
 * de abas fica fixa no topo ao rolar.
 */
export function AbasFicha(p: AbasProps) {
  const { t } = useTranslation();
  const { resumo, submissoes, notas, atividade } = p;
  const comNotas = p.comNotas ?? true;
  const verSubmissoes = () => p.aoMudar("submissoes");
  const real = p.separadorSubmissoes;
  const pendentes = real ? real.pendentes : submissoes.length;
  const nVisitas = contarVisitasAtivas(visitasDaFicha(resumo));
  const maisVisitas = p.maisItens?.visitas?.temMais === true;
  const resumoFicha = (
    <ResumoFicha
      resumo={resumo} hoje={p.hoje} voltou={p.voltou} podeVerSubmissoes={p.podeVerSubmissoes} pendentes={pendentes}
      aoVerSubmissoes={verSubmissoes} aoVerVisitas={() => p.aoMudar("visitas")} alterarVisita={p.acoes.capacidades?.visita === false ? undefined : p.acoes.alterarVisita}
      visitasNaBase={p.acoes.capacidades?.gerirVisitas === true} cancelarVisita={p.acoes.capacidades?.gerirVisitas === true ? p.acoes.cancelarVisita : undefined}
      aoRegistarResultado={p.aoRegistarResultado} maisItens={p.maisItens} identidade={p.identidade} semBotaoDoPasso={p.comGuia === true}
      modoApoio={p.comGuia ? "detalhes" : undefined}
    />
  );
  const primeira: AbaFicha = p.comGuia ? "registos" : "resumo";
  return (
    <Tabs value={p.aba} onValueChange={(v) => p.aoMudar(v as AbaFicha)} className={p.comGuia ? "flex flex-col" : "mt-2 flex flex-col"}>
      <ListaAbas aria-label={t("pessoasPagina.fichaTabs.label")} className={cn("sticky top-0 z-10 shrink-0 bg-background", p.comGuia ? "px-4 sm:px-6" : "px-6")}>
        <Aba value={primeira} rotulo={p.comGuia ? t("pessoasPagina.apoio.aba.registos") : t("pessoasPagina.fichaTabs.summary")} />
        <Aba
          value="visitas" rotulo={t("pessoasPagina.fichaTabs.visits")} contador={nVisitas} contadorMais={maisVisitas}
          contadorLeitor={maisVisitas ? t("pessoasPagina.fichaTabs.visits.more", { n: nVisitas }) : undefined}
        />
        <Aba value="negocios" rotulo={t("pessoasPagina.fichaTabs.deals")} contador={resumo.negocios.length} />
        {p.podeVerSubmissoes && (
          <Aba
            value="submissoes" rotulo={t("pessoasPagina.fichaTabs.subs")} contador={real ? real.total ?? undefined : submissoes.length}
            contadorLeitor={!real && submissoes.length > 0 ? textoPendentes(t, submissoes.length) : undefined}
            novo={pendentes > 0}
          />
        )}
        {comNotas && <Aba value="notas" rotulo={t("pessoasPagina.fichaTabs.notes")} contador={notas.length} />}
        <Aba value="atividade" rotulo={t("pessoasPagina.fichaTabs.activity")} contador={atividade.length} />
      </ListaAbas>
      <div data-foco-ficha tabIndex={-1} className={cn("pb-6 outline-none", p.comGuia ? "px-4 sm:px-6" : "px-6")}>
        <TabsContent value={primeira} className={p.comGuia ? "mt-0 pt-4" : "mt-0"}>{resumoFicha}</TabsContent>
        <TabsContent value="visitas" className="mt-0 pt-4">
          <AbaVisitasFicha
            resumo={resumo} hoje={p.hoje} alterarVisita={p.acoes.capacidades?.visita === false ? undefined : p.acoes.alterarVisita}
            visitasNaBase={p.acoes.capacidades?.gerirVisitas === true} cancelarVisita={p.acoes.capacidades?.gerirVisitas === true ? p.acoes.cancelarVisita : undefined}
            aoRegistarResultado={p.aoRegistarResultado} maisItens={p.maisItens}
          />
        </TabsContent>
        <TabsContent value="negocios" className="mt-0 pt-4"><ConteudoNegocios {...p} /></TabsContent>
        <TabsContent value="submissoes" className="mt-0 pt-4">
          {real ? real.conteudo : (
            <FichaSubmissoes
              submissoes={submissoes} hoje={p.hoje} pessoas={p.pessoas} aoPedir={(id) => p.aoPedir(id, resumo.pessoa.id)} aoVerTodas={p.aoVerTodasSubmissoes}
            />
          )}
        </TabsContent>
        {comNotas && (
          <TabsContent value="notas" className="mt-0 pt-4">
            <FichaNotas notas={notas} hoje={p.hoje} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
          </TabsContent>
        )}
        <TabsContent value="atividade" className="mt-0 pt-4"><AtividadeFicha itens={atividade} hoje={p.hoje} mais={p.maisItens?.atividade} /></TabsContent>
      </div>
    </Tabs>
  );
}
