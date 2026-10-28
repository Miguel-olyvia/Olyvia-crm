import { useTranslation } from "@/hooks/useTranslation";
import type { CartaoPosContrato } from "@/hooks/pessoas/adaptarCartaoPosContrato";
import type { EstadoColunaPosContrato, QuadroPosContratoEstado } from "@/hooks/pessoas/useQuadroPosContrato";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { LINHA_PESSOA } from "../useAtalhosPessoas";
import { COLUNAS_POS_CONTRATO, type DefColunaPosContrato } from "./colunasPosContrato";
import { ATRIBUTO_NEGOCIO } from "./cartoesQuadroPessoas";
import { RodapeColuna } from "./RodapeColuna";

const R = "pessoasPagina.real.board.";

interface QuadroPosContratoProps {
  estado: QuadroPosContratoEstado;
  /** Abre a pessoa já no negócio do cartão (o mesmo `aoAbrirQuadro` do resto do quadro). */
  aoAbrir: (pessoaId: string, negocioId: string) => void;
}

function CartaoPos({ cartao, aoAbrir }: { cartao: CartaoPosContrato; aoAbrir: QuadroPosContratoProps["aoAbrir"] }) {
  const { t } = useTranslation();
  const nome = cartao.nome || t("pessoasPagina.real.noName");
  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <button
          type="button" {...{ [LINHA_PESSOA]: cartao.pessoaId, [ATRIBUTO_NEGOCIO]: cartao.id }} aria-label={t("pessoasPagina.board.open", { name: nome })}
          onClick={() => aoAbrir(cartao.pessoaId, cartao.id)}
          className={cn("min-h-11 min-w-11 cursor-pointer rounded-md text-left font-medium text-foreground hover:underline motion-reduce:transition-none", FOCO)}
        >
          {nome}
        </button>
        <Badge variant="outline" className="shrink-0">{t(`pessoasPagina.role.${cartao.papel}`)}</Badge>
      </div>
      {cartao.trabalho && <p className="text-muted-foreground">{cartao.trabalho}</p>}
      {cartao.valor !== null && <p className="font-medium tabular-nums text-foreground">{formatarMeta("euro", cartao.valor)}</p>}
      {/* O passo seguinte, como a Emylia o diz no seu cartão. Só texto: não se arrasta nem se faz a ação daqui; abre-se a ficha. */}
      <p className="text-xs text-muted-foreground">{cartao.passo}</p>
    </li>
  );
}

interface CorpoProps extends QuadroPosContratoProps {
  def: DefColunaPosContrato;
  dados: EstadoColunaPosContrato;
  rotulo: string;
}

function CorpoColuna({ estado, aoAbrir, def, dados, rotulo }: CorpoProps) {
  const { t } = useTranslation();
  const { id } = def;
  const semCartoes = dados.cartoes.length === 0;
  let aviso: string | null = null;
  if (estado.isLoading) aviso = t(`${R}pos.loading`);
  else if (semCartoes && !estado.isError) aviso = t("pessoasPagina.board.empty");
  return (
    <div className="flex flex-1 flex-col">
      <ul role="list" className="min-h-[120px] flex-1 space-y-2 p-2">
        {dados.cartoes.map((c) => <CartaoPos key={c.id} cartao={c} aoAbrir={aoAbrir} />)}
        {aviso && <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{aviso}</li>}
      </ul>
      {estado.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-border p-2 text-xs">
          <p>{t(`${R}pos.error`)}</p>
          <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={estado.recarregar}>{t(`${R}retry`)}</Button>
        </div>
      )}
      <RodapeColuna
        coluna={rotulo} carregados={dados.cartoes.length} total={dados.total} aCarregar={estado.aCarregarMais.has(id)}
        comErro={estado.errosAoCarregarMais[id] !== undefined} aoCarregarMais={() => estado.carregarMais(id)}
      />
    </div>
  );
}

function Coluna(props: QuadroPosContratoProps & { def: DefColunaPosContrato }) {
  const { t } = useTranslation();
  const { estado, def } = props;
  const dados = estado.colunas[def.id];
  const rotulo = t(`pessoasPagina.board.col.${def.id}`);
  // A contagem só se diz quando se sabe: a carregar, em erro ou sem a coluna na base não se mostra «0».
  const conhecida = !estado.isLoading && !estado.isError;
  const contagem = dados.total;
  const valor = formatarMeta("euro", dados.valor);
  return (
    <section
      aria-labelledby={`quadro-pessoas-${def.id}`} aria-busy={estado.isLoading}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[240px] lg:flex-1"
    >
      <div aria-hidden="true" className={cn("h-1", def.cor)} />
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={`quadro-pessoas-${def.id}`} className="break-words text-sm font-semibold">
            {rotulo}
            {conhecida && (
              <span className="sr-only">
                {t("pessoasPagina.board.count.sep")}{contagem === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: contagem })}
              </span>
            )}
          </h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{conhecida ? contagem : "–"}</Badge>
        </div>
        {conhecida && dados.valor > 0 && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            <span aria-hidden="true">{valor}</span>
            <span className="sr-only">{t("pessoasPagina.board.total", { value: valor })}</span>
          </span>
        )}
      </div>
      <CorpoColuna {...props} dados={dados} rotulo={rotulo} />
    </section>
  );
}

/**
 * As colunas Financeiro e Obra, para ficarem ao lado das do Quadro (dentro do mesmo grupo). Só leitura: o cartão abre a ficha; o estado
 * que se mostra é o que a coluna prova, e quando a base ainda não tem estas colunas diz-se em vez de mostrar uma coluna vazia sem explicação.
 */
export function QuadroPosContrato({ estado, aoAbrir }: QuadroPosContratoProps) {
  return (
    <>
      {COLUNAS_POS_CONTRATO.map((def) => <Coluna key={def.id} def={def} estado={estado} aoAbrir={aoAbrir} />)}
    </>
  );
}
