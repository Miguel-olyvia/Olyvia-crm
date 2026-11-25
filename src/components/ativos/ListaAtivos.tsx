/**
 * A tabela de ativos de um grupo: nome (e código), modelo do catálogo (serviço) ou tipo, data e valor de compra, vida útil, valor
 * atual (calculado aqui, no mês de hoje, por `valorAtivo.ts`), a pessoa que o tem (pessoas), localização e estado, com as ações
 * da linha só para quem pode editar. Cada ação leva o nome do ativo no rótulo (leitor de ecrã). Com poucas colunas em ecrãs
 * pequenos a tabela rola na horizontal dentro do seu contentor.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { Ativo, GrupoAtivo } from "./lib/tipos";
import { valorAtual, vidaEfetivaMeses } from "./lib/valorAtivo";

const CELULA = "px-3 py-2 align-middle text-sm";
const NUMERO = `${CELULA} text-right tabular-nums whitespace-nowrap`;
const SO_GRANDE = "hidden lg:table-cell";
const SO_MEDIO = "hidden md:table-cell";
const BOTAO = cn("min-h-11 px-2", FOCO);

interface Props {
  grupo: GrupoAtivo;
  ativos: readonly Ativo[];
  /** O mês em que se calcula o valor atual («AAAA-MM»). */
  mes: string;
  /** Sem `hr.pessoas.retribuicao.view` os nomes não se mostram, mesmo que venham. */
  rhOculto: boolean;
  podeEditar: boolean;
  /** `ativos.edit` e `hr.pessoas.retribuicao.edit`: só então se liga e desliga. */
  podeLigar: boolean;
  aoEditar: (a: Ativo) => void;
  aoDesativar: (a: Ativo) => void;
  aoReativar: (a: Ativo) => void;
  aoLigar: (a: Ativo) => void;
  aoDesligar: (a: Ativo) => void;
}

function CelulaVida({ a }: { a: Ativo }) {
  const { t } = useTranslation();
  const vida = vidaEfetivaMeses(a);
  if (vida === null) return <>{t("ativos.vida.semVida")}</>;
  return <>{t(a.vidaMeses === null ? "ativos.vida.doModelo" : "ativos.vida.meses", { n: vida })}</>;
}

function CelulaPessoa({ a, rhOculto }: { a: Ativo; rhOculto: boolean }) {
  const { t } = useTranslation();
  if (rhOculto) return <span className="text-muted-foreground">{t("ativos.pessoa.rhOculto")}</span>;
  if (!a.atribuicao) return <span className="text-muted-foreground">{t("ativos.pessoa.semAtribuicao")}</span>;
  return (
    <span className="flex flex-col">
      <span>{a.atribuicao.pessoaNome ?? "—"}</span>
      {a.atribuicao.entrega && <span className="text-xs text-muted-foreground">{t("ativos.pessoa.desde", { data: dataPt(a.atribuicao.entrega) })}</span>}
    </span>
  );
}

function CelulaEstado({ a }: { a: Ativo }) {
  const { t } = useTranslation();
  if (a.estado === "ativo") return <Badge variant="outline">{t("ativos.estado.ativo")}</Badge>;
  const motivo = a.desativadoMotivo ? t(`ativos.desativar.motivo.${a.desativadoMotivo}`) : "";
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant="secondary">{t("ativos.estado.desativado")}</Badge>
      {a.desativadoEm && <span className="text-xs text-muted-foreground">{t("ativos.estado.desativadoEm", { data: dataPt(a.desativadoEm), motivo })}</span>}
    </span>
  );
}

function Acoes({ a, grupo, rhOculto, podeEditar, podeLigar, aoEditar, aoDesativar, aoReativar, aoLigar, aoDesligar }: Omit<Props, "ativos" | "mes"> & { a: Ativo }) {
  const { t } = useTranslation();
  if (!podeEditar) return null;
  const nome = { nome: a.nome };
  if (a.estado === "desativado") {
    return <Button type="button" variant="ghost" size="sm" className={BOTAO} aria-label={t("ativos.acao.reativarNome", nome)} onClick={() => aoReativar(a)}>{t("ativos.acao.reativar")}</Button>;
  }
  const ligacao = grupo === "pessoa" && podeLigar && !rhOculto;
  return (
    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
      <Button type="button" variant="ghost" size="sm" className={BOTAO} aria-label={t("ativos.acao.editarNome", nome)} onClick={() => aoEditar(a)}>{t("ativos.acao.editar")}</Button>
      {ligacao && (a.atribuicao
        ? <Button type="button" variant="ghost" size="sm" className={BOTAO} aria-label={t("ativos.acao.desligarNome", nome)} onClick={() => aoDesligar(a)}>{t("ativos.acao.desligar")}</Button>
        : <Button type="button" variant="ghost" size="sm" className={BOTAO} aria-label={t("ativos.acao.ligarNome", nome)} onClick={() => aoLigar(a)}>{t("ativos.acao.ligar")}</Button>)}
      <Button type="button" variant="ghost" size="sm" className={BOTAO} aria-label={t("ativos.acao.desativarNome", nome)} onClick={() => aoDesativar(a)}>{t("ativos.acao.desativar")}</Button>
    </div>
  );
}

export function ListaAtivos({ grupo, ativos, mes, rhOculto, ...acoes }: Props) {
  const { t } = useTranslation();
  const servico = grupo === "servico";
  const pessoa = grupo === "pessoa";
  return (
      <Table containerClassName="rounded-md border" className="min-w-[44rem]" aria-label={t("ativos.tabela.legenda", { grupo: t(`ativos.grupo.${grupo}`) })}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="px-3">{t("ativos.col.nome")}</TableHead>
            <TableHead scope="col" className={cn("px-3", SO_MEDIO)}>{t(servico ? "ativos.col.modelo" : "ativos.col.tipo")}</TableHead>
            <TableHead scope="col" className={cn("px-3", SO_GRANDE)}>{t("ativos.col.compra")}</TableHead>
            <TableHead scope="col" className="px-3 text-right">{t("ativos.col.valorCompra")}</TableHead>
            <TableHead scope="col" className={cn("px-3", SO_MEDIO)}>{t("ativos.col.vida")}</TableHead>
            <TableHead scope="col" className="px-3 text-right">{t("ativos.col.valorAtual")}</TableHead>
            {pessoa && <TableHead scope="col" className="px-3">{t("ativos.col.pessoa")}</TableHead>}
            <TableHead scope="col" className={cn("px-3", SO_GRANDE)}>{t("ativos.col.localizacao")}</TableHead>
            <TableHead scope="col" className="px-3">{t("ativos.col.estado")}</TableHead>
            {acoes.podeEditar && <TableHead scope="col" className="px-3 text-right">{t("ativos.col.acoes")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ativos.map((a) => {
            const atual = valorAtual(a, mes);
            return (
              <TableRow key={a.id} className={cn(a.estado === "desativado" && "text-muted-foreground")}>
                <TableCell className={cn(CELULA, "font-medium")}>
                  <span className="block">{a.nome}</span>
                  {a.codigo && <span className="block text-xs font-normal text-muted-foreground">{a.codigo}</span>}
                </TableCell>
                <TableCell className={cn(CELULA, SO_MEDIO)}>
                  {servico ? (a.catEquipamento?.nome ?? "—") : (a.tipo ? t(`ativos.tipo.${grupo}.${a.tipo}`) : "—")}
                </TableCell>
                <TableCell className={cn(CELULA, SO_GRANDE, "whitespace-nowrap")}>{dataPt(a.dataCompra)}</TableCell>
                <TableCell className={NUMERO} data-testid="valor-compra">{euros(a.valorCompra, "—")}</TableCell>
                <TableCell className={cn(CELULA, SO_MEDIO, "whitespace-nowrap")}><CelulaVida a={a} /></TableCell>
                <TableCell className={NUMERO} data-testid="valor-atual">{atual === null ? t("ativos.valorAtual.semVida") : euros(atual, "—")}</TableCell>
                {pessoa && <TableCell className={CELULA}><CelulaPessoa a={a} rhOculto={rhOculto} /></TableCell>}
                <TableCell className={cn(CELULA, SO_GRANDE)}>{a.localizacao ?? "—"}</TableCell>
                <TableCell className={CELULA}><CelulaEstado a={a} /></TableCell>
                {acoes.podeEditar && <TableCell className={cn(CELULA, "text-right")}><Acoes a={a} grupo={grupo} rhOculto={rhOculto} {...acoes} /></TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
  );
}
