/**
 * «Atribuir equipamento» (painel lateral). O equipamento passa a ser um ativo, COMPRADO (valor, data de compra e vida útil, que se
 * amortiza) ou ALUGADO (renda mensal e datas do contrato), ou um que JÁ EXISTE e está livre. A farda é a exceção e continua só no RH, com
 * o «Como conta» de sempre (pago de uma vez, repartido por N meses ou todos os meses). Na ficha a pessoa já vem escolhida; no módulo
 * «Custos» escolhe-se aqui. Grava na base e passa a contar no custo da pessoa e nos totais da organização quando a lista se refaz.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { hojeLocal } from "@/components/rh-exemplo/hooks/dataLocal";
import { useEquipamentosCustoAcoes, type NovoEquipamentoBase } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { ehErroConta } from "@/components/rh-exemplo/lib/comoConta";
import { TIPOS_EQUIPAMENTO, type ErroEquipamento, type TipoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";
import { usePermissionsOpcional } from "@/contexts/PermissionsContext";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ComoContaCampos } from "./ComoContaCampos";
import {
  CamposAlugado, CamposComprado, EscolhaOrigem, EscolherExistente, vidaDoEstado, type EstadoComprado, type OrigemEquipamento,
} from "./EquipamentoCampos";
import { contaDaEscolha, escolhaDe, type EscolhaConta } from "./escolhaConta";

export const PERMISSAO_EDITAR_ATIVOS = "ativos.edit";

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

const COMPRADO_INICIAL: EstadoComprado = { dataCompra: "", vidaModo: "pagamento", vidaTexto: "36", catId: "", catMeses: null };

/** O que se envia, pela forma escolhida. A farda manda o que sempre mandou (sem `forma`). */
function novoDoFormulario(f: {
  quem: string; tipo: TipoEquipamento; origem: OrigemEquipamento; descricao: string; euro: number; entrega: string; idPedido: string;
  comprado: EstadoComprado; inicioAluguer: string; fimAluguer: string; ativoId: string; escolha: EscolhaConta;
}): NovoEquipamentoBase {
  const base = { pessoaId: f.quem, entrega: f.entrega, idPedido: f.idPedido };
  const valor = Number.isFinite(f.euro) ? f.euro : 0;
  if (f.tipo === "fardamento") return { ...base, tipo: f.tipo, descricao: f.descricao, valor, conta: contaDaEscolha(f.escolha, f.entrega) };
  if (f.origem === "existente") return { ...base, forma: "existente", ativoId: f.ativoId };
  if (f.origem === "alugado") {
    return { ...base, forma: "alugado", tipo: f.tipo, descricao: f.descricao, rendaMensal: valor, inicioAluguer: f.inicioAluguer || f.entrega, fimAluguer: f.fimAluguer || null };
  }
  return {
    ...base, forma: "comprado", tipo: f.tipo, descricao: f.descricao, valor, dataCompra: f.comprado.dataCompra || null,
    vidaMeses: vidaDoEstado(f.comprado), vidaOrigem: f.comprado.vidaModo, catEquipamentoId: f.comprado.vidaModo === "catalogo" ? f.comprado.catId || null : null,
  };
}

function Formulario({ pessoaId, pessoas, aoFechar, aoAtribuir }: Omit<Props, "aberto">) {
  const { t } = useTranslation();
  const { atribuir } = useEquipamentosCustoAcoes();
  const podeCatalogo = usePermissionsOpcional()?.hasPermission(PERMISSAO_EDITAR_ATIVOS) ?? false;
  // Um id por formulario aberto: um duplo clique ou um reenvio nao duplica o equipamento (a base reconhece o mesmo id).
  const [idPedido] = useState(() => crypto.randomUUID());
  const [aGuardar, setAGuardar] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [quem, setQuem] = useState(pessoaId ?? "");
  const [tipo, setTipo] = useState<TipoEquipamento>("portatil");
  const [origem, setOrigem] = useState<OrigemEquipamento>("comprado");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [entrega, setEntrega] = useState(hojeLocal());
  const [comprado, setComprado] = useState<EstadoComprado>(COMPRADO_INICIAL);
  const [inicioAluguer, setInicioAluguer] = useState("");
  const [fimAluguer, setFimAluguer] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [escolha, setEscolha] = useState<EscolhaConta>(() => escolhaDe("repartido"));
  const [erro, setErro] = useState<ErroEquipamento | null>(null);

  const farda = tipo === "fardamento";
  const euro = numero(valor);
  const guardar = async () => {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const novo = novoDoFormulario({ quem, tipo, origem, descricao, euro, entrega, idPedido, comprado, inicioAluguer, fimAluguer, ativoId, escolha });
      const resultado = await atribuir(novo);
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
      {!farda && <EscolhaOrigem valor={origem} aoMudar={setOrigem} />}
      {!farda && origem === "existente" ? (
        <EscolherExistente tipo={tipo} ativoId={ativoId} entrega={entrega} aoEscolher={setAtivoId} />
      ) : (
        <>
          <CampoTexto id="rhCustos-eq-descricao" label={t("rhCustos.eq.descricao")} valor={descricao} onChange={setDescricao} obrigatorio />
          <CampoTexto
            id="rhCustos-eq-valor" label={t(!farda && origem === "alugado" ? "rhCustos.eq.campoRenda" : farda && escolha.modo === "todosMeses" ? "rhCustos.eq.campoValorMensal" : "rhCustos.eq.campoValor")}
            tipo="number" min={0} step="0.01" valor={valor} onChange={setValor} obrigatorio
          />
        </>
      )}
      <CampoTexto id="rhCustos-eq-entrega" label={t("rhCustos.eq.campoEntrega")} tipo="date" valor={entrega} onChange={setEntrega} obrigatorio />
      {farda && (
        <ComoContaCampos
          idBase="rhCustos-eq-conta" escolha={escolha} aoMudar={(p) => setEscolha((e) => ({ ...e, ...p }))}
          valor={euro} data={entrega} comDevolucao erro={ehErroConta(erro) ? erro : null}
        />
      )}
      {!farda && origem === "comprado" && (
        <CamposComprado estado={comprado} aoMudar={(p) => setComprado((c) => ({ ...c, ...p }))} valor={euro} entrega={entrega} podeCatalogo={podeCatalogo} />
      )}
      {!farda && origem === "alugado" && (
        <CamposAlugado
          inicio={inicioAluguer || entrega} fim={fimAluguer} tipo={tipo}
          aoMudar={(p) => { if (p.inicio !== undefined) setInicioAluguer(p.inicio); if (p.fim !== undefined) setFimAluguer(p.fim); }}
        />
      )}
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
