/**
 * Os campos do formulário de um ativo que dependem de ele ser COMPRADO ou ALUGADO. Só desenho: quem valida é `validarAtivo.ts`, quem
 * escreve é o painel.
 *  - Comprado: valor, data de compra e a vida útil. A vida define-se de três formas (meses de pagamento, a do equipamento do
 *    catálogo, ou escrita à mão), sem tabela de vida por tipo. O serviço mantém o campo de sempre (vazio usa a vida do modelo).
 *  - Alugado: renda mensal, início e fim do contrato (o fim é opcional: um arrendamento pode renovar-se sem fim). Sem valor de compra
 *    nem amortização. A viatura alugada avisa que a Frota não está ligada.
 * A frase que diz quanto custa por mês com o que já está escrito (`Previa`) mostra-se no painel ao lado dos campos.
 */
import { CampoSelect, CampoTexto, type OpcaoSelect } from "@/components/rh-exemplo/form/Campos";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvisoAtivo } from "./AvisoAtivo";
import { CampoNumero } from "./CampoNumero";
import { vidaDoCatalogoEmMeses, type PreviaConta } from "./lib/previaAtivo";
import { mesPt } from "./lib/resumoAtivo";
import { FORMAS_AQUISICAO, LIMITES_ATIVO, type FormaAquisicao, type OpcaoEquipamento, type OrigemVida } from "./lib/tipos";
import { dataMaximaAtivo, fimMaximoAluguer, inicioMaximoAluguer, origensDeVidaDoGrupo, type CamposAtivo, type ErrosAtivo } from "./lib/validarAtivo";

type Erro = (campo: keyof ErrosAtivo) => string | null;

/** «Comprado» ou «Alugado»: dois cartões de escolha (botões de opção; as setas do teclado mudam de opção). */
export function SeletorForma({ valor, aoMudar }: { valor: FormaAquisicao; aoMudar: (f: FormaAquisicao) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("ativos.forma.pergunta")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {FORMAS_AQUISICAO.map((f) => (
          <label
            key={f}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border-[1.5px] px-3.5 py-3 text-sm transition-colors hover:bg-muted/60 motion-reduce:transition-none",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
            )}
          >
            <input type="radio" name="ativo-forma" value={f} checked={valor === f} onChange={() => aoMudar(f)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
            <span className="flex flex-col">
              <span className="font-medium">{t(`ativos.forma.${f}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`ativos.forma.${f}.desc`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Em edição a forma só se lê: um ativo não muda de comprado para alugado nem ao contrário (a base recusa com ATV19). */
export function FormaFixa({ forma }: { forma: FormaAquisicao }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5">
      <p className="text-sm text-muted-foreground">
        {t("ativos.forma.fixa")}: <span data-testid="forma-do-ativo" className="font-medium text-foreground">{t(`ativos.forma.${forma}`)}</span>
      </p>
      <p className="text-xs text-muted-foreground">{t("ativos.forma.fixaAjuda")}</p>
    </div>
  );
}

/** A frase da conta (quanto custa por mês com o que já está escrito). Vive no painel de pré-visualização ao lado dos campos. */
export function Previa({ previa, className }: { previa: PreviaConta | null; className?: string }) {
  const { t } = useTranslation();
  let texto = t("ativos.preview.vazio");
  if (previa?.tipo === "comprado") texto = t("ativos.preview.comprado", { quota: euros(previa.quota, "—"), n: previa.meses, fim: mesPt(previa.fim) });
  else if (previa?.tipo === "alugadoFim") texto = t("ativos.preview.alugadoFim", { renda: euros(previa.renda, "—"), inicio: dataPt(previa.inicio), fim: dataPt(previa.fim) });
  else if (previa?.tipo === "alugadoSemFim") texto = t("ativos.preview.alugadoSemFim", { renda: euros(previa.renda, "—"), inicio: dataPt(previa.inicio) });
  return <p data-testid="previa-conta" className={cn("text-sm tabular-nums", className)}>{texto}</p>;
}

interface CompradoProps {
  campos: CamposAtivo;
  mudar: (parcial: Partial<CamposAtivo>) => void;
  erro: Erro;
  /** Os equipamentos do catálogo (a vida do catálogo só os que têm vida em anos). */
  equipamentos: readonly OpcaoEquipamento[];
  /** A ajuda da vida de um serviço (diz o que acontece se ficar vazia, conforme o modelo). */
  ajudaVidaServico: string;
  aoTocarVida: () => void;
}

export function CamposComprado({ campos, mudar, erro, equipamentos, ajudaVidaServico, aoTocarVida }: CompradoProps) {
  const { t } = useTranslation();
  const g = campos.grupo;
  const origens = origensDeVidaDoGrupo(g);
  const comVida = equipamentos.filter((e) => vidaDoCatalogoEmMeses(e.vidaAnos) !== null);
  const opcoesOrigem: OpcaoSelect[] = origens.map((o) => ({ value: o, label: t(`ativos.vida.origem.${o}`) }));
  const opcoesCatalogo: OpcaoSelect[] = comVida.map((e) => ({ value: e.id, label: `${e.nome} (${t("ativos.campo.modeloAnos", { n: e.vidaAnos ?? 0 })})` }));
  return (
    <div className="space-y-5">
      <CampoNumero id="ativo-valor" label={t("ativos.campo.valorCompra")} valor={campos.valorCompra} onChange={(v) => mudar({ valorCompra: v })} obrigatorio ajuda={t("ativos.ajuda.valorCompra")} erro={erro("valorCompra")} />
      <CampoTexto
        id="ativo-data" label={t("ativos.campo.dataCompra")} tipo="date" valor={campos.dataCompra} onChange={(v) => mudar({ dataCompra: v })} obrigatorio
        min={LIMITES_ATIVO.dataMinima} max={dataMaximaAtivo()} ajuda={t("ativos.ajuda.data")} erro={erro("data")}
      />
      {g === "servico" ? (
        <CampoNumero id="ativo-vida" label={t("ativos.campo.vida")} valor={campos.vidaMeses} onChange={(v) => { aoTocarVida(); mudar({ vidaMeses: v, vidaOrigem: "manual" }); }} modo="numeric" erro={erro("vida")} ajuda={ajudaVidaServico} />
      ) : (
        <>
          <CampoSelect
            id="ativo-vida-origem" label={t("ativos.campo.vidaPergunta")} valor={campos.vidaOrigem} opcoes={opcoesOrigem}
            onChange={(v) => mudar({ vidaOrigem: v as OrigemVida })} ajuda={t(`ativos.vida.origem.${campos.vidaOrigem}.desc`)}
          />
          {campos.vidaOrigem === "catalogo" ? (
            <div className="space-y-1.5">
              <CampoSelect
                id="ativo-vida-catalogo" label={t("ativos.campo.vidaCatalogo")} valor={campos.catEquipamentoId} opcoes={opcoesCatalogo} obrigatorio
                vazioLabel={t("ativos.campo.vidaCatalogoEscolher")} onChange={(v) => mudar({ catEquipamentoId: v })}
                ajuda={t("ativos.campo.vidaCatalogoAjuda")} erro={erro("modelo") ?? erro("vida")}
              />
              {campos.vidaCatalogoMeses !== null && <p className="text-xs text-muted-foreground">{t("ativos.campo.vidaCatalogoMeses", { n: campos.vidaCatalogoMeses })}</p>}
            </div>
          ) : (
            <CampoNumero
              id="ativo-vida" label={t(campos.vidaOrigem === "pagamento" ? "ativos.campo.vidaPagamento" : "ativos.campo.vida")} valor={campos.vidaMeses}
              onChange={(v) => { aoTocarVida(); mudar({ vidaMeses: v }); }} modo="numeric" obrigatorio erro={erro("vida")} ajuda={t("ativos.campo.vidaAjudaIntervalo")}
            />
          )}
        </>
      )}
    </div>
  );
}

interface AluguerProps {
  campos: CamposAtivo;
  mudar: (parcial: Partial<CamposAtivo>) => void;
  erro: Erro;
}

export function CamposAluguer({ campos, mudar, erro }: AluguerProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <CampoNumero id="ativo-renda" label={t("ativos.campo.renda")} valor={campos.rendaMensal} onChange={(v) => mudar({ rendaMensal: v })} obrigatorio ajuda={t("ativos.ajuda.renda")} erro={erro("renda")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto
          id="ativo-inicio-aluguer" label={t("ativos.campo.inicioAluguer")} tipo="date" valor={campos.inicioAluguer} onChange={(v) => mudar({ inicioAluguer: v })} obrigatorio
          min={LIMITES_ATIVO.dataMinima} max={inicioMaximoAluguer()} ajuda={t("ativos.ajuda.inicioAluguer")} erro={erro("inicioAluguer") ?? erro("data")}
        />
        <CampoTexto
          id="ativo-fim-aluguer" label={t("ativos.campo.fimAluguer")} tipo="date" valor={campos.fimAluguer} onChange={(v) => mudar({ fimAluguer: v })}
          min={campos.inicioAluguer || LIMITES_ATIVO.dataMinima} max={fimMaximoAluguer()} ajuda={t("ativos.ajuda.fimAluguer")} erro={erro("fimAluguer")}
        />
      </div>
      {campos.grupo === "pessoa" && campos.tipo === "viatura" && (
        <AvisoAtivo tom="aviso" role="note" data-testid="aviso-frota" className="text-xs leading-5">{t("ativos.aviso.frota")}</AvisoAtivo>
      )}
    </div>
  );
}
