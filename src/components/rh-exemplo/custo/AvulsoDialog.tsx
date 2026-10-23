/**
 * Registar um valor avulso (fluxo 11): quilómetros ou ajuda de custo. O valor sai da quantidade x valor unitário (sugerido
 * pela empresa e editável). Recusa descrição em branco, valor 0 e data em falta, com o motivo à vista. A data é obrigatória (por
 * omissão no mês que está a ser visto) e o valor conta no mês dela, nunca noutro. Tem «Como conta» (por omissão, pago de uma
 * vez). Os equipamentos já não são valores avulsos: têm lista própria (`CustoEquipamentos`).
 * Na ficha a pessoa já vem escolhida; no módulo «Custos» escolhe-se aqui (`pessoas`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { lerCusto, registarAvulso, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { ehErroConta, primeiroMes, type ErroConta } from "@/components/rh-exemplo/lib/comoConta";
import type { ErroAvulso } from "@/components/rh-exemplo/lib/custo";
import { itemDoAvulso, type TipoAvulso } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ComoContaCampos } from "./ComoContaCampos";
import { contaDaEscolha, escolhaDe, type EscolhaConta } from "./escolhaConta";
import { euros } from "./formato";
import type { PessoaEscolhivel } from "./EquipamentoSheet";

const TIPOS: readonly TipoAvulso[] = ["km", "ajuda"];
const numero = (texto: string): number => Number(texto.trim().replace(",", "."));

/** A data por omissão: hoje, se hoje cai no mês que está a ser visto; senão o dia 1 desse mês. */
const dataPorOmissao = (mesVisto: string): string => (hojeIso().startsWith(mesVisto) ? hojeIso() : `${mesVisto}-01`);

type ErroFormulario = ErroAvulso | ErroConta | "semPessoa";

const chaveDoErro = (erro: ErroFormulario): string =>
  erro === "semPessoa" ? "rhCustos.erro.semPessoa" : erro === "semData" ? "rhCustos.avulso.erro.semData" : `rhA.custo.erro.${erro}`;

interface FormularioProps {
  /** A pessoa fixa (ficha); `null` para escolher no formulário. */
  pessoaId: string | null;
  pessoas?: readonly PessoaEscolhivel[];
  autor: string;
  aoFechar: () => void;
  /** Depois de registar: o primeiro mês em que o valor conta. */
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
  return (
    <>
      <CampoSelect
        id="rhA-avulso-tipo" label={t("rhA.custo.tipo")} valor={tipo} onChange={aoEscolherTipo}
        opcoes={TIPOS.map((x) => ({ value: x, label: t(`rhA.custo.tipo.${x}`) }))}
      />
      <CampoTexto id="rhA-avulso-data" label={t("rhA.custo.data")} tipo="date" valor={v.data} onChange={(data) => aoMudar({ data })} ajuda={t("rhCustos.avulso.dataAjuda")} obrigatorio />
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
  const mesVisto = useCusto((e) => e.mes);
  const [quem, setQuem] = useState(pessoaId ?? "");
  const [v, setV] = useState<Valores>({ tipo: "km", data: dataPorOmissao(mesVisto), descricao: "", quantidade: "", valorUnitario: String(definicoes.valorPorKm) });
  const [escolha, setEscolha] = useState<EscolhaConta>(() => escolhaDe("umaVez"));
  const [erro, setErro] = useState<ErroFormulario | null>(null);
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
      autor, podeProcessar: true, conta: contaDaEscolha(escolha, v.data),
    });
    setErro(recusa);
    if (!recusa) {
      const registado = lerCusto().avulsos.at(-1);
      aoRegistar?.(registado ? primeiroMes(itemDoAvulso(registado)) : v.data.slice(0, 7));
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
      <p className="rounded-md bg-muted/50 p-3 text-sm tabular-nums">
        {t("rhA.custo.previaValor", { valor: euros(Number.isFinite(previa) ? previa : 0, "—") })}
      </p>
      <ComoContaCampos
        idBase="rhA-avulso-conta" escolha={escolha} aoMudar={(p) => setEscolha((e) => ({ ...e, ...p }))}
        valor={previa} data={v.data} comDevolucao={false} erro={ehErroConta(erro) ? erro : null}
      />
      {erro && !ehErroConta(erro) && <p role="alert" className="text-sm font-medium text-destructive">{t(chaveDoErro(erro))}</p>}
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
