/**
 * Os campos de «Atribuir equipamento» que dependem de o equipamento ser COMPRADO, ALUGADO ou um que JÁ EXISTE e está livre (a farda
 * continua com o «Como conta» de sempre, em `ComoContaCampos`). Só desenho e contas puras: quem escreve na base é o painel.
 *  - Comprado: valor, data de compra (opcional) e a vida útil, definida ao criar de três formas (meses de pagamento, a do equipamento
 *    do catálogo, ou escrita à mão). Sem tabela de vida por tipo.
 *  - Alugado: renda mensal e datas do contrato; sem valor de compra nem amortização. A viatura alugada avisa que a Frota não está ligada.
 *  - Já existe: escolhe-se um ativo livre; mostra o que já se amortizou e o que falta (quem o recebe herda o que falta).
 */
import { useEffect, useMemo } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { amortizadoAte, mesesDecorridos } from "@/components/ativos/lib/contaAtivo";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { quotaMensal, somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar, mesDaData } from "@/components/rh-exemplo/lib/custo";
import type { TipoEquipamento, VidaOrigem } from "@/components/rh-exemplo/lib/equipamentos";
import { useAtivosOpcoes } from "@/hooks/ativos/useAtivosOpcoes";
import { useEquipamentosLivres, type EquipamentoLivre } from "@/hooks/hr/useEquipamentosLivres";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { dataPt, euros, nomeDoMes } from "./formato";

export type OrigemEquipamento = "comprado" | "alugado" | "existente";
export const ORIGENS_EQUIPAMENTO: readonly OrigemEquipamento[] = ["comprado", "alugado", "existente"];

/** A vida em meses de um equipamento do catálogo (anos x 12, de 1 a 600); `null` se não tem vida em anos. */
export function vidaDoCatalogoEmMeses(vidaAnos: number | null): number | null {
  return vidaAnos && vidaAnos > 0 ? Math.min(600, Math.max(1, Math.round(vidaAnos * 12))) : null;
}

/** O que já se amortizou de um ativo comprado quando alguém o recebe em `entrega` (o mês da entrega já é de quem o recebe). */
export function herancaDoLivre(l: EquipamentoLivre, entrega: string): { amortizado: number; falta: number; mesesFalta: number } | null {
  const a = l.ativo;
  if (a.forma !== "comprado" || !a.vidaMeses || !/^\d{4}-\d{2}-\d{2}$/.test(entrega)) return null;
  const anterior = somarMesesAoMes(mesDaData(entrega), -1);
  const amortizado = amortizadoAte(a, anterior);
  return {
    amortizado,
    falta: Math.max(0, arredondar(a.valorCompra - a.valorResidual - amortizado)),
    mesesFalta: Math.max(0, a.vidaMeses - mesesDecorridos(a, anterior)),
  };
}

function OpcaoRadio({ id, valor, escolhido, titulo, descricao }: { id: string; valor: string; escolhido: boolean; titulo: string; descricao?: string }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors motion-reduce:transition-none",
        escolhido ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50",
      )}
    >
      <RadioGroupItem id={id} value={valor} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block font-medium">{titulo}</span>
        {descricao && <span className="block text-xs text-muted-foreground">{descricao}</span>}
      </span>
    </label>
  );
}

/** «Comprado», «Alugado» ou «Já existe e está livre». */
export function EscolhaOrigem({ valor, aoMudar }: { valor: OrigemEquipamento; aoMudar: (o: OrigemEquipamento) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <span id="rhCustos-eq-origem-legenda" className="text-sm font-medium leading-none">{t("rhCustos.eq.origem")}</span>
      <RadioGroup value={valor} onValueChange={(v) => aoMudar(v as OrigemEquipamento)} aria-labelledby="rhCustos-eq-origem-legenda">
        {ORIGENS_EQUIPAMENTO.map((o) => (
          <OpcaoRadio key={o} id={`rhCustos-eq-origem-${o}`} valor={o} escolhido={valor === o} titulo={t(`rhCustos.eq.origem.${o}`)} descricao={t(`rhCustos.eq.origem.${o}.desc`)} />
        ))}
      </RadioGroup>
    </div>
  );
}

export interface EstadoComprado {
  dataCompra: string;
  vidaModo: VidaOrigem;
  /** A vida escrita (meses de pagamento ou à mão). */
  vidaTexto: string;
  catId: string;
  /** A vida do equipamento do catálogo escolhido, em meses. */
  catMeses: number | null;
}

/** A vida útil em meses de um comprado, pela forma escolhida; `NaN` se não se sabe. */
export function vidaDoEstado(e: EstadoComprado): number {
  if (e.vidaModo === "catalogo") return e.catMeses ?? Number.NaN;
  return Number(e.vidaTexto.trim().replace(",", "."));
}

/** O seletor do catálogo: só se monta (e só pede à base) para quem tem `ativos.edit`, porque `rpc_ativos_opcoes` exige essa permissão. */
function VidaDoCatalogo({ catId, aoEscolher }: { catId: string; aoEscolher: (id: string, meses: number | null) => void }) {
  const { t } = useTranslation();
  const { opcoes, aCarregar, erro } = useAtivosOpcoes(true);
  const comVida = useMemo(() => (opcoes?.equipamentos ?? []).filter((o) => vidaDoCatalogoEmMeses(o.vidaAnos) !== null), [opcoes]);
  return (
    <div className="space-y-1.5">
      <CampoSelect
        id="rhCustos-eq-catalogo" label={t("rhCustos.eq.vida.catalogo")} valor={catId} obrigatorio disabled={aCarregar}
        placeholder={aCarregar ? t("rhCustos.eq.vida.catalogoACarregar") : t("rhCustos.eq.vida.catalogoEscolher")}
        onChange={(id) => aoEscolher(id, vidaDoCatalogoEmMeses(comVida.find((o) => o.id === id)?.vidaAnos ?? null))}
        opcoes={comVida.map((o) => ({ value: o.id, label: `${o.nome} (${t("rhCustos.eq.vida.anos", { n: o.vidaAnos ?? 0 })})` }))}
        ajuda={t("rhCustos.eq.vida.catalogoAjuda")}
      />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

interface CompradoProps {
  estado: EstadoComprado;
  aoMudar: (parcial: Partial<EstadoComprado>) => void;
  valor: number;
  entrega: string;
  /** Tem `ativos.edit`: só então se oferece a vida do equipamento do catálogo. */
  podeCatalogo: boolean;
}

export function CamposComprado({ estado, aoMudar, valor, entrega, podeCatalogo }: CompradoProps) {
  const { t, language } = useTranslation();
  const vida = vidaDoEstado(estado);
  const valida = Number.isInteger(vida) && vida >= 1 && vida <= 600 && Number.isFinite(valor) && valor > 0;
  const inicio = estado.dataCompra || entrega;
  return (
    <div className="space-y-4">
      <CampoTexto
        id="rhCustos-eq-compra" label={t("rhCustos.eq.dataCompra")} tipo="date" valor={estado.dataCompra} onChange={(dataCompra) => aoMudar({ dataCompra })}
        ajuda={t("rhCustos.eq.dataCompraAjuda")}
      />
      <div className="space-y-2">
        <span id="rhCustos-eq-vida-legenda" className="text-sm font-medium leading-none">{t("rhCustos.eq.vida")}</span>
        <RadioGroup value={estado.vidaModo} onValueChange={(v) => aoMudar({ vidaModo: v as VidaOrigem })} aria-labelledby="rhCustos-eq-vida-legenda">
          <OpcaoRadio id="rhCustos-eq-vida-pagamento" valor="pagamento" escolhido={estado.vidaModo === "pagamento"} titulo={t("rhCustos.eq.vida.pagamento")} descricao={t("rhCustos.eq.vida.pagamento.desc")} />
          {podeCatalogo && (
            <OpcaoRadio id="rhCustos-eq-vida-catalogo" valor="catalogo" escolhido={estado.vidaModo === "catalogo"} titulo={t("rhCustos.eq.vida.catalogo")} descricao={t("rhCustos.eq.vida.catalogo.desc")} />
          )}
          <OpcaoRadio id="rhCustos-eq-vida-manual" valor="manual" escolhido={estado.vidaModo === "manual"} titulo={t("rhCustos.eq.vida.manual")} descricao={t("rhCustos.eq.vida.manual.desc")} />
        </RadioGroup>
      </div>
      {estado.vidaModo === "catalogo" ? (
        <VidaDoCatalogo catId={estado.catId} aoEscolher={(catId, catMeses) => aoMudar({ catId, catMeses })} />
      ) : (
        <CampoTexto
          id="rhCustos-eq-vida-meses" label={t(estado.vidaModo === "pagamento" ? "rhCustos.eq.vida.mesesPagamento" : "rhCustos.eq.vida.mesesManual")}
          tipo="number" min={1} max={estado.vidaModo === "pagamento" ? 120 : 600} step="1" valor={estado.vidaTexto} onChange={(vidaTexto) => aoMudar({ vidaTexto })} obrigatorio
        />
      )}
      <p role="status" className="rounded-md bg-muted/50 p-3 text-sm tabular-nums">
        {valida
          ? t("rhCustos.eq.frase.comprado", { valor: euros(valor, "—"), n: vida, quota: euros(quotaMensal(valor, vida), "—"), mes: /^\d{4}-\d{2}/.test(inicio) ? nomeDoMes(mesDaData(inicio), language) : "" })
          : t("rhCustos.eq.frase.compradoVazia")}
      </p>
    </div>
  );
}

interface AlugadoProps {
  inicio: string;
  fim: string;
  aoMudar: (parcial: { inicio?: string; fim?: string }) => void;
  tipo: TipoEquipamento;
}

export function CamposAlugado({ inicio, fim, aoMudar, tipo }: AlugadoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto id="rhCustos-eq-inicio-aluguer" label={t("rhCustos.eq.inicioAluguer")} tipo="date" valor={inicio} onChange={(v) => aoMudar({ inicio: v })} obrigatorio />
        <CampoTexto id="rhCustos-eq-fim-aluguer" label={t("rhCustos.eq.fimAluguer")} tipo="date" valor={fim} onChange={(v) => aoMudar({ fim: v })} ajuda={t("rhCustos.eq.fimAluguerAjuda")} />
      </div>
      <p className="rounded-md bg-muted/50 p-3 text-xs leading-5">{t("rhCustos.eq.frase.alugado")}</p>
      {tipo === "viatura" && <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{t("rhCustos.eq.avisoFrota")}</p>}
    </div>
  );
}

interface ExistenteProps {
  tipo: TipoEquipamento;
  ativoId: string;
  entrega: string;
  aoEscolher: (id: string) => void;
}

/** A lista dos que já existem e estão livres (as permissões do RH); só se monta quando se escolhe «Já existe», por isso só então pede. */
export function EscolherExistente({ tipo, ativoId, entrega, aoEscolher }: ExistenteProps) {
  const { t } = useTranslation();
  const { livres, aCarregar, erro } = useEquipamentosLivres(true, tipo);
  const escolhido = livres?.find((l) => l.id === ativoId) ?? null;
  // Se o tipo mudou e o escolhido já não está na lista, limpa-se a escolha.
  useEffect(() => {
    if (livres && ativoId !== "" && !livres.some((l) => l.id === ativoId)) aoEscolher("");
  }, [livres, ativoId, aoEscolher]);
  const heranca = escolhido ? herancaDoLivre(escolhido, entrega) : null;
  const rotulo = (l: EquipamentoLivre): string => {
    const forma = l.ativo.forma === "alugado" ? t("rhCustos.eq.origem.alugadoCurto", { valor: euros(l.ativo.rendaMensal, "—") }) : t("rhCustos.eq.origem.compradoCurto");
    return `${l.codigo ? `${l.codigo} · ` : ""}${l.nome} · ${forma}`;
  };
  return (
    <div className="space-y-3">
      <CampoSelect
        id="rhCustos-eq-livre" label={t("rhCustos.eq.livre")} valor={ativoId} onChange={aoEscolher} obrigatorio disabled={aCarregar}
        placeholder={aCarregar ? t("rhCustos.eq.livreACarregar") : t("rhCustos.eq.livreEscolher")}
        opcoes={(livres ?? []).map((l) => ({ value: l.id, label: rotulo(l) }))}
      />
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      {livres && livres.length === 0 && !aCarregar && <p className="text-sm text-muted-foreground">{t("rhCustos.eq.livreNenhum")}</p>}
      {escolhido && (
        <div role="status" className="space-y-1 rounded-md bg-muted/50 p-3 text-sm tabular-nums">
          {escolhido.ativo.forma === "comprado" ? (
            heranca ? (
              <p>{t("rhCustos.eq.livre.heranca", { amortizado: euros(heranca.amortizado, "—"), falta: euros(heranca.falta, "—"), n: heranca.mesesFalta })}</p>
            ) : (
              <p>{t("rhCustos.eq.livre.compradoSemData", { valor: euros(escolhido.ativo.valorCompra, "—") })}</p>
            )
          ) : (
            <p>{t(escolhido.ativo.fimAluguer ? "rhCustos.eq.livre.alugadoFim" : "rhCustos.eq.livre.alugado", {
              valor: euros(escolhido.ativo.rendaMensal, "—"), inicio: dataPt(escolhido.ativo.inicioAluguer), fim: escolhido.ativo.fimAluguer ? dataPt(escolhido.ativo.fimAluguer) : "",
            })}</p>
          )}
          {escolhido.ultimaDevolucao && <p className="text-xs text-muted-foreground">{t("rhCustos.eq.livre.devolvidoEm", { data: dataPt(escolhido.ultimaDevolucao) })}</p>}
          <p className="text-xs text-muted-foreground">{t("rhCustos.eq.livre.estrutura")}</p>
          {escolhido.ativo.forma === "alugado" && escolhido.tipo === "viatura" && (
            <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{t("rhCustos.eq.avisoFrota")}</p>
          )}
        </div>
      )}
    </div>
  );
}
