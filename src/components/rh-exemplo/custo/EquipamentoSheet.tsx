/**
 * «Atribuir equipamento» (painel lateral): tipo, descrição, valor, data de entrega e «Como conta» (pago de uma vez, repartido
 * por N meses — 36 por omissão, o do fluxo 11 — ou todos os meses). Na ficha a pessoa já vem escolhida; no módulo «Custos»
 * escolhe-se aqui. Grava na base e passa a contar no custo da pessoa e nos totais da organização quando a lista se refaz.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeLocal } from "@/components/rh-exemplo/hooks/dataLocal";
import { useEquipamentosCustoAcoes } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { ehErroConta } from "@/components/rh-exemplo/lib/comoConta";
import { TIPOS_EQUIPAMENTO, type ErroEquipamento, type TipoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ComoContaCampos } from "./ComoContaCampos";
import { contaDaEscolha, escolhaDe, type EscolhaConta } from "./escolhaConta";

export interface PessoaEscolhivel {
  id: string;
  nome: string;
}

interface Props {
  aberto: boolean;
  /** A pessoa fixa (ficha) ou `null` para escolher no painel (módulo «Custos»). */
  pessoaId: string | null;
  pessoas: readonly PessoaEscolhivel[];
  /** Ja nao se grava: a base regista quem atribuiu e a lista nao o devolve (revisao de seguranca). Mantem-se para nao mexer nos chamadores. */
  autor?: string;
  aoFechar: () => void;
  /** Depois de atribuir: o id da pessoa a quem foi atribuído. */
  aoAtribuir?: (pessoaId: string) => void;
}

const numero = (texto: string): number => Number(texto.trim().replace(",", "."));

function Formulario({ pessoaId, pessoas, aoFechar, aoAtribuir }: Omit<Props, "aberto">) {
  const { t } = useTranslation();
  const { atribuir } = useEquipamentosCustoAcoes();
  // Um id por formulario aberto: um duplo clique ou um reenvio nao duplica o equipamento (a base reconhece o mesmo id).
  const [idPedido] = useState(() => crypto.randomUUID());
  const [aGuardar, setAGuardar] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [quem, setQuem] = useState(pessoaId ?? "");
  const [tipo, setTipo] = useState<TipoEquipamento>("portatil");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [entrega, setEntrega] = useState(hojeLocal());
  const [escolha, setEscolha] = useState<EscolhaConta>(() => escolhaDe("repartido"));
  const [erro, setErro] = useState<ErroEquipamento | null>(null);

  const euro = numero(valor);
  const guardar = async () => {
    if (aGuardar) return;
    const conta = contaDaEscolha(escolha, entrega);
    setAGuardar(true);
    try {
      const resultado = await atribuir({ pessoaId: quem, tipo, descricao, valor: Number.isFinite(euro) ? euro : 0, entrega, conta, idPedido });
      setErro(resultado.erro as ErroEquipamento | null);
      setMensagem(resultado.mensagem);
      if (resultado.ok) {
        aoAtribuir?.(quem);
        aoFechar();
      }
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <form className="mt-6 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      {pessoaId === null && (
        <CampoSelect
          id="rhCustos-eq-pessoa" label={t("rhCustos.pessoa")} valor={quem} onChange={setQuem} obrigatorio
          placeholder={t("rhCustos.escolherPessoa")} opcoes={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        />
      )}
      <CampoSelect
        id="rhCustos-eq-tipo" label={t("rhCustos.eq.tipo")} valor={tipo} onChange={(v) => setTipo(v as TipoEquipamento)}
        opcoes={TIPOS_EQUIPAMENTO.map((x) => ({ value: x, label: t(`rhCustos.eq.tipo.${x}`) }))}
      />
      <CampoTexto id="rhCustos-eq-descricao" label={t("rhCustos.eq.descricao")} valor={descricao} onChange={setDescricao} obrigatorio />
      <CampoTexto
        id="rhCustos-eq-valor" label={t(escolha.modo === "todosMeses" ? "rhCustos.eq.campoValorMensal" : "rhCustos.eq.campoValor")}
        tipo="number" min={0} step="0.01" valor={valor} onChange={setValor} obrigatorio
      />
      <CampoTexto id="rhCustos-eq-entrega" label={t("rhCustos.eq.campoEntrega")} tipo="date" valor={entrega} onChange={setEntrega} obrigatorio />
      <ComoContaCampos
        idBase="rhCustos-eq-conta" escolha={escolha} aoMudar={(p) => setEscolha((e) => ({ ...e, ...p }))}
        valor={euro} data={entrega} comDevolucao erro={ehErroConta(erro) ? erro : null}
      />
      {erro && !ehErroConta(erro) && <p role="alert" className="text-sm font-medium text-destructive">{t(`rhCustos.eq.erro.${erro}`)}</p>}
      {mensagem && <p role="alert" className="text-sm font-medium text-destructive">{mensagem}</p>}
      <SheetFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhCustos.eq.confirmarAtribuir")}</Button>
      </SheetFooter>
    </form>
  );
}

export function EquipamentoSheet({ aberto, ...resto }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && resto.aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("rhCustos.eq.atribuirTitulo")}</SheetTitle>
          <SheetDescription>{t("rhCustos.eq.atribuirAjuda")}</SheetDescription>
        </SheetHeader>
        <Formulario {...resto} />
      </SheetContent>
    </Sheet>
  );
}
