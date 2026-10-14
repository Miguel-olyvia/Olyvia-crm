/**
 * Registar um valor avulso (fluxo 11): quilómetros ou ajuda de custo. O valor sai da quantidade x valor unitário (sugerido
 * pela empresa e editável). Recusa descrição em branco e valor 0, com o motivo à vista. Uma data num mês já fechado conta no
 * primeiro mês aberto. Os equipamentos já não são valores avulsos: têm lista própria (`CustoEquipamentos`).
 * Na ficha a pessoa já vem escolhida; no módulo «Custos» escolhe-se aqui (`pessoas`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { lerCusto, mesAbertoDoCusto, registarAvulso, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { mesDaData, type ErroAvulso } from "@/components/rh-exemplo/lib/custo";
import type { TipoAvulso } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { euros } from "./formato";
import type { PessoaEscolhivel } from "./EquipamentoSheet";

const TIPOS: readonly TipoAvulso[] = ["km", "ajuda"];
const numero = (texto: string): number => Number(texto.trim().replace(",", "."));

interface FormularioProps {
  /** A pessoa fixa (ficha); `null` para escolher no formulário. */
  pessoaId: string | null;
  pessoas?: readonly PessoaEscolhivel[];
  autor: string;
  aoFechar: () => void;
  /** Depois de registar: o mês em que o valor conta. */
  aoRegistar?: (mesContagem: string) => void;
}

interface Valores {
  tipo: TipoAvulso;
  data: string;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
}

interface CamposProps {
  v: Valores;
  aoMudar: (parcial: Partial<Valores>) => void;
  aoEscolherTipo: (tipo: string) => void;
}

function CamposAvulso({ v, aoMudar, aoEscolherTipo }: CamposProps) {
  const { t } = useTranslation();
  const { tipo } = v;
  const mesFechado = v.data !== "" && mesDaData(v.data) < mesAbertoDoCusto();
  return (
    <>
      <CampoSelect
        id="rhA-avulso-tipo" label={t("rhA.custo.tipo")} valor={tipo} onChange={aoEscolherTipo}
        opcoes={TIPOS.map((x) => ({ value: x, label: t(`rhA.custo.tipo.${x}`) }))}
      />
      <CampoTexto id="rhA-avulso-data" label={t("rhA.custo.data")} tipo="date" valor={v.data} onChange={(data) => aoMudar({ data })} />
      {mesFechado && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{t("rhA.custo.mesFechadoAviso")}</p>}
      <CampoTexto id="rhA-avulso-descricao" label={t("rhA.custo.descricao")} valor={v.descricao} onChange={(descricao) => aoMudar({ descricao })} />
      <CampoTexto id="rhA-avulso-quantidade" label={t(tipo === "km" ? "rhA.custo.quilometros" : "rhA.custo.dias")} tipo="number" min={0} step="0.5" valor={v.quantidade} onChange={(quantidade) => aoMudar({ quantidade })} />
      <CampoTexto
        id="rhA-avulso-valor" label={t(tipo === "km" ? "rhA.custo.valorPorKm" : "rhA.custo.valorPorDia")}
        tipo="number" min={0} step="0.01" valor={v.valorUnitario} onChange={(valorUnitario) => aoMudar({ valorUnitario })}
        ajuda={tipo === "ajuda" ? t("rhA.custo.valorUnicoAjuda") : undefined}
      />
    </>
  );
}

function Formulario({ pessoaId, pessoas = [], autor, aoFechar, aoRegistar }: FormularioProps) {
  const { t } = useTranslation();
  const definicoes = useCusto((e) => e.definicoes);
  const [quem, setQuem] = useState(pessoaId ?? "");
  const [v, setV] = useState<Valores>({ tipo: "km", data: hojeIso(), descricao: "", quantidade: "", valorUnitario: String(definicoes.valorPorKm) });
  const [erro, setErro] = useState<ErroAvulso | "semPessoa" | null>(null);
  const mudar = (parcial: Partial<Valores>) => setV((atual) => ({ ...atual, ...parcial }));

  const escolherTipo = (novo: string) => {
    const tipo = novo as TipoAvulso;
    setErro(null);
    mudar({ tipo, valorUnitario: String(tipo === "km" ? definicoes.valorPorKm : definicoes.ajudaPorDia) });
  };

  const unitario = numero(v.valorUnitario);
  const qtd = numero(v.quantidade);
  const previa = Math.round((qtd * unitario + Number.EPSILON) * 100) / 100;

  const guardar = () => {
    if (quem === "") return setErro("semPessoa");
    const { erro: recusa } = registarAvulso({
      pessoaId: quem, tipo: v.tipo, data: v.data, descricao: v.descricao,
      quantidade: Number.isFinite(qtd) ? qtd : 0,
      valorUnitario: Number.isFinite(unitario) ? unitario : 0,
      autor, podeProcessar: true,
    });
    setErro(recusa);
    if (!recusa) {
      aoRegistar?.(lerCusto().avulsos.at(-1)?.mesContagem ?? mesDaData(v.data));
      aoFechar();
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar(); }} noValidate>
      {pessoaId === null && (
        <CampoSelect
          id="rhA-avulso-pessoa" label={t("rhCustos.pessoa")} valor={quem} onChange={setQuem} obrigatorio
          placeholder={t("rhCustos.escolherPessoa")} opcoes={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        />
      )}
      <CamposAvulso v={v} aoMudar={mudar} aoEscolherTipo={escolherTipo} />
      <p className="rounded-md bg-muted/50 p-3 text-sm tabular-nums" role="status">
        {t("rhA.custo.previaValor", { valor: euros(Number.isFinite(previa) ? previa : 0, "—") })}
      </p>
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{t(erro === "semPessoa" ? "rhCustos.erro.semPessoa" : `rhA.custo.erro.${erro}`)}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t("rhA.custo.registar")}</Button>
      </DialogFooter>
    </form>
  );
}

interface AvulsoDialogProps extends FormularioProps {
  open: boolean;
}

export function AvulsoDialog({ open, ...resto }: AvulsoDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && resto.aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhA.custo.registarTitulo")}</DialogTitle>
          <DialogDescription>{t("rhA.custo.registarAjuda")}</DialogDescription>
        </DialogHeader>
        <Formulario {...resto} />
      </DialogContent>
    </Dialog>
  );
}
