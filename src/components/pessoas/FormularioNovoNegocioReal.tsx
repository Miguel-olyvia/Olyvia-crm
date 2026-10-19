// O corpo do painel «Novo negócio» na ficha real: duas abas (Geral e, com permissão de editar, Registos), o rodapé fixo (Cancelar e Criar o
// negócio) e a gravação contra a base (neg_criar_negocio). O id do negócio gera-se ao abrir (o painel desmonta ao fechar, por isso é novo
// a cada abertura) e fica o mesmo entre reenvios: é o que torna o criar idempotente. O erro diz-se pelo código dentro do painel e o painel
// só fecha em sucesso. Um envio recusado leva ao primeiro campo errado. O comercial fica por escolher: a base usa quem cria.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { AbaLigarRegistos } from "@/components/negocio-metas/AbaLigarRegistos";
import { AbaNovo, ListaAbasNovo, Tabs, TabsContent } from "@/components/negocio-metas/AbasNovoNegocio";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ErroDeEnvio } from "@/components/negocio-metas/DialogoDeEnvio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { ligarInicial, type LigarRegistos } from "@/components/negocio-metas/ligarNegocio";
import type { MutacoesNegocio, RefRegistoBase, ResultadoCriar } from "@/components/negocio-metas/mutacoesNegocio";
import { leadMaisRecente } from "@/components/negocio-metas/SeletorLead";
import { useAoNegocioIndisponivel } from "@/components/negocio-metas/useAoNegocioIndisponivel";
import { useEnvioAssincrono } from "@/components/negocio-metas/useEnvioAssincrono";
import { AbaGeralNovoNegocioReal, type ErrosGeralReal } from "./AbaGeralNovoNegocioReal";
import { chaveDocumento, DocumentosNoCriar } from "./DocumentosNoCriar";

const N = "businessGoals.new.";
const C = "pessoasPagina.neg.create.";
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);

type Aba = "geral" | "registos";

/** A escolha de partida dos registos: os contactos e visitas por ligar marcados, e o levantamento mais recente (ou nenhum: «fazer um novo» é do P5). */
function ligacaoInicial(porLigar: ReturnType<typeof registosPorLigar>): LigarRegistos {
  const inicial = ligarInicial(porLigar);
  return inicial.levantamento.tipo === "novo" ? { ...inicial, levantamento: { tipo: "dispensar" } } : inicial;
}

interface FormularioProps {
  pessoaId: string;
  pessoaNome: string;
  mutacoes: MutacoesNegocio;
  dados: DadosNegocio;
  /** O painel diz a quem o controla se há uma gravação em curso (o Esc e o clique fora não fecham enquanto guarda). */
  ocupado: MutableRefObject<boolean>;
  aoSujar: () => void;
  aoCriado: (resultado: ResultadoCriar, titulo: string) => void;
  /** Fecha o painel (NG001: o negócio já não está disponível). */
  aoFechar: () => void;
}

export function FormularioNovoNegocioReal({ pessoaId, mutacoes, dados, ocupado, aoSujar, aoCriado, aoFechar }: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const [idNegocio] = useState(() => crypto.randomUUID());
  const envio = useEnvioAssincrono(useAoNegocioIndisponivel(aoFechar));
  const resultado = useRef<ResultadoCriar | null>(null);
  const tituloRef = useRef<HTMLInputElement>(null);
  const reabrirRef = useRef<HTMLInputElement>(null);
  const [aba, setAba] = useState<Aba>("geral");
  const [tentou, setTentou] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [lead, setLead] = useState(() => leadMaisRecente(dados.leadsAbertas)?.id ?? "");
  const [reabrir, setReabrir] = useState(false);
  const porLigar = useMemo(() => registosPorLigar(dados.registos, pessoaId), [dados.registos, pessoaId]);
  const [ligar, setLigar] = useState<LigarRegistos>(() => ligacaoInicial(porLigar));
  const [docs, setDocs] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    ocupado.current = envio.aGuardar;
  }, [ocupado, envio.aGuardar]);

  const podeLigar = dados.podeEditar;
  const comDocumentos = mutacoes.criarComDocumentos && podeLigar;
  const escolhida = dados.leadsAbertas.find((l) => l.id === lead);
  const erros: ErrosGeralReal = tentou ? { titulo: titulo.trim() === "", reabrir: escolhida?.encerrada === true && !reabrir } : {};
  const tituloLimpo = titulo.trim();

  const mudarGeral = (p: { titulo?: string; notas?: string; lead?: string; reabrir?: boolean }) => {
    aoSujar();
    if (p.titulo !== undefined) setTitulo(p.titulo);
    if (p.notas !== undefined) setNotas(p.notas);
    if (p.lead !== undefined) setLead(p.lead);
    if (p.reabrir !== undefined) setReabrir(p.reabrir);
  };
  const alternarDoc = (d: { tipo: string; id: string }) => {
    aoSujar();
    const chave = chaveDocumento(d as Parameters<typeof chaveDocumento>[0]);
    setDocs((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (envio.aGuardar) return;
    setTentou(true);
    const semTitulo = tituloLimpo === "";
    const semReabrir = escolhida?.encerrada === true && !reabrir;
    if (semTitulo || semReabrir) {
      const alvo = semTitulo ? tituloRef : reabrirRef;
      if (aba === "geral") {
        alvo.current?.focus();
      } else {
        // A aba de destino acaba de montar: o foco vai num instante a seguir.
        setAba("geral");
        setTimeout(() => alvo.current?.focus(), 0);
      }
      return;
    }
    const documentos: RefRegistoBase[] = comDocumentos
      ? dados.documentosPorLigar.filter((d) => d.temBase && docs.has(chaveDocumento(d))).map((d) => ({ tipo: d.tipo, id: d.id }))
      : [];
    const pedido = {
      id: idNegocio, titulo: tituloLimpo, notas, comercialId: null, leadId: escolhida?.id ?? null, reabrirAbordagem: reabrir && escolhida?.encerrada === true,
      registos: podeLigar ? [...ligar.registos, ...documentos] : [],
      levantamentoId: podeLigar && ligar.levantamento.tipo === "existente" ? ligar.levantamento.id : null,
    };
    envio.enviar(
      async () => { resultado.current = await mutacoes.criar(pedido); },
      () => { if (resultado.current) aoCriado(resultado.current, tituloLimpo); },
    );
  };

  const geral = (
    <AbaGeralNovoNegocioReal
      id={id} titulo={titulo} notas={notas} lead={lead} reabrir={reabrir} leads={dados.leadsAbertas} erros={erros} tituloRef={tituloRef}
      reabrirRef={reabrirRef} aoMudar={mudarGeral}
    />
  );
  const nRegistos = ligar.registos.length;
  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      {podeLigar ? (
        <Tabs value={aba} className="flex min-h-0 flex-1 flex-col" onValueChange={(v) => setAba(v === "registos" ? "registos" : "geral")}>
          <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
            <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={tentou && (!!erros.titulo || !!erros.reabrir)} />
            <AbaNovo
              value="registos" rotulo={t(`${N}tab.records`)} contador={nRegistos}
              contadorLeitor={t(`${N}tab.records.count${nRegistos === 1 ? ".one" : ""}`, { n: nRegistos })}
            />
          </ListaAbasNovo>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <TabsContent value="geral" className={CONTEUDO}>{geral}</TabsContent>
            <TabsContent value="registos" className={cn(CONTEUDO, "space-y-5")}>
              <AbaLigarRegistos id={id} pessoaEscolhida porLigar={porLigar} valor={ligar} aoMudar={(v) => { aoSujar(); setLigar(v); }} semNovo />
              {comDocumentos && <DocumentosNoCriar id={id} documentos={dados.documentosPorLigar} marcados={docs} aoAlternar={alternarDoc} />}
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {geral}
          <p className="text-sm text-muted-foreground">{t(`${C}records.noPermission`)}</p>
        </div>
      )}
      <div className="shrink-0 px-6"><ErroDeEnvio chave={envio.erro} /></div>
      <p role="status" aria-live="polite" className="sr-only">{envio.aGuardar ? t("pessoasPagina.neg.saving") : ""}</p>
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        <SheetClose asChild onClick={(e) => { if (envio.aGuardar) e.preventDefault(); }}>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined}>{t(`${C}cancel`)}</Button>
        </SheetClose>
        <Button type="submit" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-disabled={envio.aGuardar || undefined} aria-busy={envio.aGuardar || undefined}>
          {t(`${C}submit`)}
        </Button>
      </SheetFooter>
    </form>
  );
}
