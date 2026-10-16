// O editor do orçamento: linhas (serviço, quantidade e preço unitário), juntar linhas do catálogo, desconto, venda direta e os totais e a
// margem em tempo real. Abre com as linhas do levantamento da visita (se houver) e guarda o orçamento do negócio, em memória. Montado
// uma vez, ao nível da página, pelo `ProcessoProvider`.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ITEM } from "@/components/negocio-metas/PecasNovoNegocio";
import { MensagemErro } from "../CamposDataHora";
import { useAvisoAlternado } from "./avisoAlternado";
import { CHAVES_CATALOGO, novaLinhaDoCatalogo, type ChaveTrabalho } from "./catalogoTrabalhos";
import { LinhaDoOrcamento } from "./LinhaDoOrcamento";
import { nomeDaLinha, rotuloDoTrabalho } from "./nomesOrcamento";
import { totaisDoOrcamento, type LinhaTrabalho } from "./orcamentoCalculo";
import {
  entradaDoCalculo, erroDoDesconto, errosDaLinha, idsDaLinha, paraDados, paraEditavel, type LinhaEditavel,
} from "./orcamentoForm";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";
import { TotaisDoOrcamento } from "./TotaisDoOrcamento";
import type { DadosDoOrcamento } from "./transicoes";

const P = "pessoasPagina.quote.";

/** O orçamento com que o editor abre. */
export interface OrcamentoInicial {
  linhas: readonly LinhaTrabalho[];
  desconto: number;
  vendaDireta: boolean;
  /** Aparece no título a partir da segunda. */
  versao: number;
}

interface FormProps {
  inicial: OrcamentoInicial;
  aoGuardar: (dados: DadosDoOrcamento) => FaltaProcesso[];
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
}

function Formulario({ inicial, aoGuardar, explicar, aoFechar }: FormProps) {
  const { t } = useTranslation();
  const id = useId();
  const alternar = useAvisoAlternado();
  const [linhas, setLinhas] = useState<LinhaEditavel[]>(() => inicial.linhas.map(paraEditavel));
  const [desconto, setDesconto] = useState(() => String(inicial.desconto).replace(".", ","));
  const [vendaDireta, setVendaDireta] = useState(inicial.vendaDireta);
  const [tentou, setTentou] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  // O que "Tirar" acabou de fazer, dito ao leitor de ecrã (a região de estado já existe vazia, por isso o texto novo é anunciado).
  const [aviso, setAviso] = useState("");
  // O campo a que o foco vai depois de juntar ou tirar uma linha (o botão que o tinha acaba de desaparecer ou de mudar).
  const [foco, setFoco] = useState<string | null>(null);
  const contador = useRef(0);
  // Acabou de se juntar uma linha: ao fechar, a lista não devolve o foco ao seu botão (vai para a linha nova, ver o efeito).
  const juntouAgora = useRef(false);
  const idJuntar = `${id}-juntar`;
  const idGuardar = `${id}-guardar`;
  const idDesconto = `${id}-desconto`;
  const usados = new Set(linhas.filter((l) => l.nome === undefined).map((l) => l.trabalho));
  const disponiveis = CHAVES_CATALOGO.filter((c) => !usados.has(c));
  const totais = totaisDoOrcamento(entradaDoCalculo(linhas, desconto));
  const erroDesconto = tentou && erroDoDesconto(desconto);

  useEffect(() => {
    if (foco === null) return;
    (document.getElementById(foco) ?? document.getElementById(idGuardar))?.focus();
    setFoco(null);
  }, [foco, idGuardar]);

  // Quem volta a editar já respondeu ao motivo de bloqueio: deixa de valer (voltar a guardar di-lo de novo, se ainda for o caso).
  const mudarLinha = (linhaId: string, parcial: Partial<LinhaEditavel>) => {
    setMotivo(null);
    setLinhas((atuais) => atuais.map((l) => (l.id === linhaId ? { ...l, ...parcial } : l)));
  };
  const juntar = (chave: ChaveTrabalho) => {
    setMotivo(null);
    contador.current += 1;
    juntouAgora.current = true;
    const nova = paraEditavel(novaLinhaDoCatalogo(chave, `nova-${contador.current}`));
    setLinhas((atuais) => [...atuais, nova]);
    setFoco(idsDaLinha(id, nova).quantidade);
  };
  /** Tira a linha, diz quantas ficam e leva o foco à linha vizinha (a seguinte, ou a anterior se era a última) ou, sem linhas, a "Juntar um serviço". */
  const tirar = (linhaId: string) => {
    const indice = linhas.findIndex((l) => l.id === linhaId);
    if (indice < 0) return;
    const restantes = linhas.filter((l) => l.id !== linhaId);
    const vizinha = restantes[indice] ?? restantes[indice - 1];
    const chave = restantes.length === 0 ? "none" : restantes.length === 1 ? "one" : "many";
    setMotivo(null);
    setLinhas(restantes);
    setAviso(alternar(t(`${P}removed.${chave}`, { work: nomeDaLinha(t, linhas[indice]), count: restantes.length })));
    setFoco(vizinha ? idsDaLinha(id, vizinha).quantidade : idJuntar);
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    // O primeiro campo por corrigir, pela ordem do formulário (as linhas, e depois o desconto), leva o foco.
    for (const l of linhas) {
      const erros = errosDaLinha(l);
      if (erros.quantidade || erros.preco) { document.getElementById(idsDaLinha(id, l)[erros.quantidade ? "quantidade" : "preco"])?.focus(); return; }
    }
    if (erroDoDesconto(desconto)) { document.getElementById(idDesconto)?.focus(); return; }
    const faltas = aoGuardar(paraDados(linhas, desconto, vendaDireta));
    // O motivo diz-se DENTRO do diálogo (alerta): a região live da página fica fora do modal. Alterna um espaço inseparável para repetir.
    setMotivo(faltas.length > 0 ? alternar(explicar(faltas)) : null);
  };

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      {linhas.length === 0
        ? <p className="text-sm text-muted-foreground">{t(`${P}empty`)}</p>
        : (
          <ul role="list" aria-label={t(`${P}lines.label`)} className="divide-y divide-border rounded-lg border border-border px-3">
            {linhas.map((l) => (
              <LinhaDoOrcamento
                key={l.id} id={id} linha={l} erros={tentou ? errosDaLinha(l) : { quantidade: false, preco: false }}
                aoMudar={(parcial) => mudarLinha(l.id, parcial)} aoTirar={() => tirar(l.id)}
              />
            ))}
          </ul>
        )}
      <p role="status" className="sr-only">{aviso}</p>
      <div className="space-y-1.5">
        {disponiveis.length === 0
          ? <p className="text-sm text-muted-foreground">{t(`${P}add.none`)}</p>
          : (
            <>
              <Label htmlFor={idJuntar}>{t(`${P}add`)}</Label>
              <Select value="" onValueChange={(chave) => juntar(chave as ChaveTrabalho)}>
                <SelectTrigger id={idJuntar} className={cn("min-h-11", FOCO)}>
                  <SelectValue placeholder={t(`${P}add.placeholder`)} />
                </SelectTrigger>
                <SelectContent onCloseAutoFocus={(e) => { if (juntouAgora.current) e.preventDefault(); juntouAgora.current = false; }}>
                  {disponiveis.map((c) => <SelectItem key={c} value={c} className={ITEM}>{rotuloDoTrabalho(t, c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={idDesconto}>{t(`${P}discount`)}</Label>
        <Input
          id={idDesconto} value={desconto} inputMode="decimal" autoComplete="off" aria-invalid={erroDesconto || undefined}
          aria-describedby={`${idDesconto}-ajuda${erroDesconto ? ` ${idDesconto}-erro` : ""}`} className={cn("min-h-11 w-32", FOCO, erroDesconto && "border-destructive")}
          onChange={(e) => { setMotivo(null); setDesconto(e.target.value); }}
        />
        <p id={`${idDesconto}-ajuda`} className="text-xs text-muted-foreground">{t(`${P}discount.hint`)}</p>
        {erroDesconto && <MensagemErro id={`${idDesconto}-erro`} texto={t(`${P}discount.error`)} />}
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div>
          <Label htmlFor={`${id}-direta`}>{t(`${P}direct`)}</Label>
          <p id={`${id}-direta-ajuda`} className="text-xs text-muted-foreground">{t(`${P}direct.hint`)}</p>
        </div>
        <Switch id={`${id}-direta`} checked={vendaDireta} onCheckedChange={(ligada) => { setMotivo(null); setVendaDireta(ligada); }} aria-describedby={`${id}-direta-ajuda`} className={FOCO} />
      </div>
      <TotaisDoOrcamento totais={totais} />
      {motivo !== null && <MensagemErro id={`${id}-motivo`} texto={motivo} />}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${P}cancel`)}</Button>
        <Button id={idGuardar} type="submit" className={cn("min-h-11", FOCO)}>{t(`${P}save`)}</Button>
      </DialogFooter>
    </form>
  );
}

interface EditorOrcamentoProps {
  /** O negócio cujo orçamento se edita; `null` com o diálogo fechado. */
  negocio: NegocioDoPasso | null;
  inicial: OrcamentoInicial;
  /** Guarda o orçamento; devolve o que falta (vazio = guardou, e quem chama fecha o diálogo). */
  aoGuardar: (dados: DadosDoOrcamento) => FaltaProcesso[];
  /** O texto de "o que falta" de um portão, já traduzido (o diálogo di-lo num alerta). */
  explicar: (faltas: FaltaProcesso[]) => string;
  aoFechar: () => void;
  /** Devolve o foco ao botão certo e diz se o fez; se não, o diálogo devolve-o por si. */
  aoDevolverFoco: () => boolean;
}

export function EditorOrcamento({ negocio, inicial, aoGuardar, explicar, aoFechar, aoDevolverFoco }: EditorOrcamentoProps) {
  const { t } = useTranslation();
  const ultimo = useRef(negocio);
  if (negocio) ultimo.current = negocio;
  const mostrado = negocio ?? ultimo.current;
  const work = mostrado?.trabalho ?? "";
  return (
    <Dialog open={negocio !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <DialogContent hideClose className="max-w-2xl motion-reduce:!animate-none" onCloseAutoFocus={(e) => { if (aoDevolverFoco()) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{inicial.versao > 1 ? t(`${P}titleVersion`, { work, version: inicial.versao }) : t(`${P}title`, { work })}</DialogTitle>
          <DialogDescription>{t(`${P}description`, { name: mostrado?.nome ?? "" })}</DialogDescription>
        </DialogHeader>
        {mostrado && <Formulario key={mostrado.id} inicial={inicial} aoGuardar={aoGuardar} explicar={explicar} aoFechar={aoFechar} />}
      </DialogContent>
    </Dialog>
  );
}
