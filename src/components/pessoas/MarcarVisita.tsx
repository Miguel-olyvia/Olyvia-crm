// "Marcar visita" nas submissões que a pedem e no "A fazer": um diálogo curto (dia, hora, nota e morada da visita) que marca a visita da
// PESSOA EM MEMÓRIA (a pessoa passa à etapa Visita e a atividade regista-o). Com `naBase` abre o formulário ligado à base (`MarcarVisitaReal`, que
// se carrega à parte) e grava por `useAcoesVisita`. Um contexto liga o botão de cada cartão de submissão ao diálogo único da
// página; sem o provider (outros usos do cartão) o botão não existe.
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CamposDataHora, MensagemErro } from "./CamposDataHora";
import { FormularioVisitaCarregavel } from "./FormularioVisitaCarregavel";
import { MarcarVisitaContext, type AberturaVisita } from "./marcarVisitaContexto";
import { MoradaVisitaCampos } from "./MoradaVisitaCampos";
import { destinoInicial, validarDestino, type DestinoVisita } from "./moradaVisita";
import type { ErroMoradaVisita } from "./moradaVisita";
import type { DadosVisitaPessoa } from "./visitaDaPessoa";
import { MAX_NOTA_VISITA, validarVisita, type ErroVisita } from "./visitaPessoa";

const V = "pessoasPagina.visitDialog.";

// O formulário ligado à base só se carrega quando se abre com `naBase`: o exemplo (e os seus testes) nunca importa a ligação à base.
// Uma função de módulo (estável); se o pacote falhar a carregar, `FormularioVisitaCarregavel` contém o erro e deixa tentar de novo.
const importarFormVisitaReal = () => import("./MarcarVisitaReal").then((m) => ({ default: m.FormVisitaReal }));

interface ProviderProps {
  /** O dia de hoje (AAAA-MM-DD): a data mínima da visita. */
  hoje: string;
  /** Marca a visita da pessoa EM MEMÓRIA (o exemplo): `dados` são o dia, a hora, a nota e a morada. Com `naBase` nunca se chama. */
  aoMarcar: (pessoaId: string, dados: DadosVisitaPessoa, negocioId?: string) => boolean | void;
  /** Liga o diálogo à base: grava por `useAcoesVisita` (quadro, recursos, hora obrigatória, conflito) e não usa `aoMarcar`. */
  naBase?: boolean;
  /** As pessoas que já têm uma visita por ligar (juntam-se às marcadas neste ecrã). */
  jaComVisita?: ReadonlySet<string>;
  /**
   * Só a ficha real: completa o que quem pede não sabe (a morada da lead e o responsável da pessoa, que o botão do negócio não conhece) antes de
   * abrir o diálogo.
   */
  completar?: (abertura: AberturaVisita) => AberturaVisita;
  /** Ao fechar o diálogo: devolve o foco a quem o abriu e diz se o fez (o `ProcessoProvider` fá-lo para o "A fazer"); sem isto, o diálogo devolve-o por si. */
  aoDevolverFoco?: () => boolean;
  children: ReactNode;
}

interface CamposVisitaProps {
  id: string;
  campos: { data: string; hora: string; nota: string };
  erro: ErroVisita | null;
  hoje: string;
  campoData: Ref<HTMLInputElement>;
  aoMudar: (parcial: Partial<CamposVisitaProps["campos"]>) => void;
  moradaLead: AberturaVisita["moradaLead"];
  destino: DestinoVisita;
  aoMudarDestino: (destino: DestinoVisita) => void;
}

const ERROS_DA_MORADA: readonly ErroVisita[] = ["ruaVazia", "codigoPostalInvalido", "notaAcessoComprida"];

/** Os campos da visita: dia, hora, nota e a morada da visita. */
function CamposVisita({ id, campos, erro, hoje, campoData, aoMudar, moradaLead, destino, aoMudarDestino }: CamposVisitaProps) {
  const { t } = useTranslation();
  const erroData = erro === "dataVazia" || erro === "dataPassada";
  return (
    <>
      <CamposDataHora
        id={id} data={campos.data} hora={campos.hora} hoje={hoje} campoData={campoData} rotuloData={t(`${V}date`)} rotuloHora={t(`${V}time`)}
        erroData={erroData ? t(`${V}error.${erro}`) : null} erroHora={erro === "horaInvalida" ? t(`${V}error.horaInvalida`) : null}
        aoMudar={aoMudar}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{t(`${V}note`)}</Label>
        <Input
          id={`${id}-nota`} value={campos.nota} autoComplete="off" aria-invalid={erro === "notaComprida" ? true : undefined}
          aria-describedby={erro === "notaComprida" ? `${id}-nota-erro` : undefined} className={cn("min-h-11", FOCO)}
          onChange={(e) => aoMudar({ nota: e.target.value })}
        />
        {erro === "notaComprida" && <MensagemErro id={`${id}-nota-erro`} texto={t(`${V}error.notaComprida`, { max: MAX_NOTA_VISITA })} />}
      </div>
      <MoradaVisitaCampos
        id={`${id}-morada`} moradaLead={moradaLead} valor={destino} aoMudar={aoMudarDestino}
        erro={erro !== null && ERROS_DA_MORADA.includes(erro) ? (erro as ErroMoradaVisita) : null}
      />
    </>
  );
}

function FormVisita({ pessoa, hoje, aoMarcar, aoFechar }: { pessoa: AberturaVisita; hoje: string; aoMarcar: ProviderProps["aoMarcar"]; aoFechar: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [campos, setCampos] = useState({ data: "", hora: "", nota: "" });
  const [destino, setDestino] = useState<DestinoVisita>(() => destinoInicial(pessoa.moradaLead));
  const [tentou, setTentou] = useState(false);
  const campoData = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const erroAtual = validarVisita({ ...campos, destino }, hoje, pessoa.moradaLead);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (erroAtual) {
      // O foco vai para o primeiro campo com erro (o dia, a hora, a nota ou a morada), depois de o erro aparecer.
      setTimeout(() => (formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? campoData.current)?.focus(), 0);
      return;
    }
    // `false`: pediu-se um negócio e a visita ficou por ligar. O toast não pode dizer só «marcada», nem fica calado.
    const ligada = aoMarcar(pessoa.pessoaId, { ...campos, destino }, pessoa.negocioId ?? undefined) !== false;
    if (ligada) toast.success(t(`${V}done`, { name: pessoa.nome }));
    else toast.info(t(`${V}doneUnlinked`, { name: pessoa.nome }));
    pessoa.aoMarcada?.(ligada);
    aoFechar();
  };
  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="space-y-4">
      <CamposVisita
        id={id} campos={campos} erro={tentou ? erroAtual : null} hoje={hoje} campoData={campoData}
        aoMudar={(parcial) => setCampos((c) => ({ ...c, ...parcial }))}
        moradaLead={pessoa.moradaLead} destino={destino} aoMudarDestino={setDestino}
      />
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t(`${V}cancel`)}</Button>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${V}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}

export function MarcarVisitaProvider({ hoje, aoMarcar, naBase = false, aoDevolverFoco, jaComVisita, completar, children }: ProviderProps) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState<AberturaVisita | null>(null);
  const ultimo = useRef<AberturaVisita | null>(null);
  // Quem tinha o foco ao pedir o diálogo: o diálogo não tem um gatilho do Radix, por isso o foco volta-se a esse elemento ao fechar.
  const origemDoFoco = useRef<HTMLElement | null>(null);
  if (aberta) ultimo.current = aberta;
  const mostrado = aberta ?? ultimo.current;
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  // Uma gravação na base está a correr: o diálogo não se deixa fechar (Escape, clique fora, «Cancelar»). Lê-se no instante do clique, por isso é uma ref.
  const ocupado = useRef(false);
  // Se é uma revisita fixa-se ao abrir: trocar de pessoa na ficha a meio muda `jaComVisita` (passa a ser o da pessoa nova) e não pode mudar o tipo desta visita.
  const [revisitaAoAbrir, setRevisitaAoAbrir] = useState(false);
  const valor = useMemo(() => {
    const todas = jaComVisita ? new Set([...marcadas, ...jaComVisita]) : marcadas;
    return {
      pedir: (p: AberturaVisita) => {
        origemDoFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRevisitaAoAbrir(todas.has(p.pessoaId));
        setAberta(completar ? completar(p) : p);
      },
      marcadas: todas,
    };
  }, [marcadas, jaComVisita, completar]);
  const juntarMarcada = (pessoaId: string) => setMarcadas((antes) => new Set(antes).add(pessoaId));
  const marcar: ProviderProps["aoMarcar"] = (pessoaId, dados, negocioId) => {
    const ligada = aoMarcar(pessoaId, dados, negocioId) !== false;
    // Marcada a partir de um negócio e ligada a ele, a visita fica nele: o botão «Marcar visita» das submissões da pessoa não tem de
    // desaparecer. Sem negócio, ou com a ligação recusada, a visita fica por ligar à pessoa e esse botão sai.
    if (!negocioId || !ligada) juntarMarcada(pessoaId);
    return ligada;
  };
  const descricao = naBase ? t("pessoasPagina.real.visit.marcar.description", { name: mostrado?.nome ?? "" }) : t("pessoasPagina.process.visitDescription", { name: mostrado?.nome ?? "" });
  return (
    <MarcarVisitaContext.Provider value={valor}>
      {children}
      <Dialog open={aberta !== null} onOpenChange={(aberto) => { if (!aberto && !ocupado.current) setAberta(null); }}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto motion-reduce:!animate-none" onCloseAutoFocus={(e) => {
            if (aoDevolverFoco?.()) { e.preventDefault(); return; }
            const origem = origemDoFoco.current;
            if (origem?.isConnected) { e.preventDefault(); origem.focus(); }
          }}
          onEscapeKeyDown={(e) => { if (ocupado.current) e.preventDefault(); }} onInteractOutside={(e) => { if (ocupado.current) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{t(`${V}title`)}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          {mostrado && naBase && (
            <FormularioVisitaCarregavel
              key={mostrado.pessoaId} importar={importarFormVisitaReal}
              propriedades={{
                pessoa: mostrado, hoje, revisita: revisitaAoAbrir,
                aoOcupado: (a: boolean) => { ocupado.current = a; }, aoMarcada: () => juntarMarcada(mostrado.pessoaId), aoFechar: () => setAberta(null),
              }}
            />
          )}
          {mostrado && !naBase && <FormVisita key={mostrado.pessoaId} pessoa={mostrado} hoje={hoje} aoMarcar={marcar} aoFechar={() => setAberta(null)} />}
        </DialogContent>
      </Dialog>
    </MarcarVisitaContext.Provider>
  );
}
