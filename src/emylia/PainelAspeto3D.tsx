// 26/11: o painel «Aspeto 3D» do 3D do produto: UM só sítio para ligar e escolher o que pinta cada zona. Substitui o painel «Zona: …/Pintar com» (em cima) e o painel «Ligações» (em baixo),
// que editavam o mesmo rascunho em dois sítios com dois nomes. Tem dois andares, o da zona escolhida (cor e superfície, com o «Porquê») e o das regras do produto (a lista completa), e um só
// «Guardar» no rodapé, que fica preso em baixo. Controlado: o rascunho das regras vive em quem o usa (Modelo3DProduto); o 3D mostra-o logo, sem gravar. Sem three: só o ecrã.
import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { erroDasLigacoes, type Ligacao } from "./config3dDados";
import { ZonaEscolhida } from "./Previa3DEscolherZona";
import { RegrasDoProduto, type Config3dPrevia } from "./Previa3DLigacoes";
import type { ContextoEscolha } from "./escolherZona";
import type { LeituraDoProduto } from "./planta3d/acabamentoCor3d";
import type { ZonaGlb, ZonasDoProduto } from "./planta3d/zonasGlb";
import { porqueDaZona, zonasSemEfeito } from "./porqueDaZona";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors duration-200 hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BOTAO_PRINCIPAL = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const DESLIGADO = "cursor-not-allowed opacity-50 hover:bg-card";
const FRASE_FALHA = "Não foi possível guardar. As alterações continuam aqui; tenta outra vez.";

/** Quantas regras diferem do guardado (acrescentadas, tiradas ou com outro «pinta»): uma regra é um par atributo e zona. */
function alteracoesPorGuardar(valor: readonly Ligacao[], guardadas: readonly Ligacao[]): number {
  const mapa = (l: readonly Ligacao[]) => new Map(l.map((x) => [`${x.atributo}|${x.zona}`, x.aplicar]));
  const a = mapa(valor), b = mapa(guardadas);
  let n = 0;
  for (const [k, v] of a) if (b.get(k) !== v) n++;
  for (const k of b.keys()) if (!a.has(k)) n++;
  return n;
}

export interface PropsAspeto3D {
  /** A zona escolhida (clique no 3D ou botão do painel «Zonas»); null: o andar «Zona» mostra o estado vazio. */
  zonaFixa: ZonaGlb | null;
  /** As zonas que o modelo tem. */
  zonasDoModelo: readonly ZonaGlb[];
  /** O que pinta cada zona hoje (a aparência da pré-visualização). */
  pintadaPor: ZonasDoProduto["zonas"] | undefined;
  /** Os atributos QUE O PRODUTO TEM (com valor escolhido) que o 3D lê: dão a cor ou a superfície de cada zona. */
  atributos: readonly LeituraDoProduto[];
  pintaHoje: (atributo: string) => readonly ZonaGlb[];
  pelaNome?: ContextoEscolha["pelaNome"];
  /** A zona foi escolhida clicando no 3D: o foco passa ao título da zona. */
  focarAoAbrir: boolean;
  /** Fecha a zona (botão X ou Escape): quem a abriu devolve o foco ao sítio de onde veio. */
  aoFechar: () => void;
  /** A configuração 3D; ausente: só se vê o que pinta a zona. */
  config3d: Config3dPrevia | undefined;
  /** Mostra o andar «Regras do produto» (só a secção «Modelo 3D» do produto o liga). */
  mostrarRegras: boolean;
  /** Apontar ou focar uma regra: as zonas que ela pinta de facto, para o 3D as realçar; null ao sair. */
  aoRealcarRegra: (zonas: readonly ZonaGlb[] | null) => void;
}

export function PainelAspeto3D({ zonaFixa, zonasDoModelo, pintadaPor, atributos, pintaHoje, pelaNome, focarAoAbrir, aoFechar, config3d, mostrarRegras, aoRealcarRegra }: PropsAspeto3D) {
  const id = useId();
  const lig = config3d?.ligacoes;
  const podeEditar = !!config3d?.podeEditar;
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  // o aviso de «guardado» é da última gravação: uma alteração nova já não é «guardada»
  const alterado = !!lig?.alterado;
  useEffect(() => { if (alterado) setMsg((m) => (m && !m.erro ? null : m)); }, [alterado]);
  const invalida = lig ? erroDasLigacoes(lig.valor) : null;
  const podeGuardar = !!lig && lig.alterado && !invalida && !ocupado;
  const idErro = `${id}-erro`, idRazao = `${id}-razao`, idHerdar = `${id}-herdar`;
  const razao = invalida ? null : ocupado ? "A guardar…" : !alterado ? "Sem alterações para guardar." : null;
  const descreveGuardar = podeGuardar ? undefined : invalida ? idErro : idRazao;
  const leitura = config3d?.leitura;
  const atributosCor = atributos.filter((a) => a.daCor), atributosSuperficie = atributos.filter((a) => a.daSuperficie);
  const porque = leitura && zonaFixa ? porqueDaZona({ zona: zonaFixa, regras: lig?.valor ?? [], attrs: leitura.attrs, defs: leitura.defs }) : undefined;
  const semEfeito = (regra: Ligacao): ZonaGlb[] => (leitura && lig ? zonasSemEfeito({ regra, regras: lig.valor, attrs: leitura.attrs, defs: leitura.defs, zonas: zonasDoModelo }) : []);
  const n = lig?.guardadas ? alteracoesPorGuardar(lig.valor, lig.guardadas) : null;

  const correr = async (fazer: () => Promise<string | null>, ok: string) => {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try {
      const erro = await fazer();
      setMsg(erro ? { erro: true, texto: erro } : { erro: false, texto: ok });
    } catch {
      setMsg({ erro: true, texto: FRASE_FALHA });
    } finally { setOcupado(false); }
  };

  return (
    <section aria-labelledby={`${id}-t`} aria-busy={ocupado} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-t`} className="text-[15px] font-semibold">Aspeto 3D</h3>
        {lig && podeEditar && (
          <p className="inline-flex items-center gap-2 text-[15px]">
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", alterado ? "bg-amber-500" : "bg-emerald-600")} />
            {alterado ? (n === null ? "Por guardar" : `Por guardar: ${n} ${n === 1 ? "alteração" : "alterações"}`) : "Guardado"}
          </p>
        )}
      </div>

      {zonaFixa ? (
        <ZonaEscolhida key={zonaFixa} zona={zonaFixa} pintadaPor={pintadaPor?.[zonaFixa]} atributosCor={atributosCor} atributosSuperficie={atributosSuperficie}
          ligacoes={lig ? { valor: lig.valor, podeEditar, aoMudar: lig.aoMudar } : undefined} pintaHoje={pintaHoje} {...(pelaNome ? { pelaNome } : {})}
          {...(porque ? { porque } : {})} focarAoAbrir={focarAoAbrir} aoFechar={aoFechar} />
      ) : zonasDoModelo.length >= 2 ? (
        <p className={NOTA}>Toca numa parte do móvel ou escolhe uma zona na lista de zonas para ver o que a pinta.</p>
      ) : null}

      {lig && mostrarRegras && zonasDoModelo.length >= 1 && (
        <RegrasDoProduto valor={lig.valor} origem={lig.origem} atributos={lig.atributos} {...(lig.omissoes ? { omissoes: lig.omissoes } : {})} zonas={zonasDoModelo}
          orfas={lig.orfas} ignoradas={lig.ignoradas} podeEditar={podeEditar} aoMudar={lig.aoMudar} semEfeito={semEfeito} aoApontar={aoRealcarRegra} idErro={idErro} />
      )}

      {lig && podeEditar && (
        <div className="sticky bottom-0 z-10 -mx-3 -mb-3 grid gap-2 rounded-b-xl border-t border-border bg-card px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado; assim o foco fica e o clique é só ignorado */}
            {lig.descartar && (
              <button type="button" aria-disabled={!alterado || ocupado} onClick={() => { if (alterado && !ocupado) { lig.descartar?.(); setMsg({ erro: false, texto: "Alterações descartadas." }); } }} className={cn(BOTAO, (!alterado || ocupado) && DESLIGADO)}>Descartar</button>
            )}
            <button type="button" aria-disabled={!podeGuardar} aria-describedby={descreveGuardar} aria-busy={ocupado} onClick={() => { if (podeGuardar) void correr(lig.gravar, "Regras guardadas."); }}
              className={cn(BOTAO_PRINCIPAL, !podeGuardar && "cursor-not-allowed opacity-50 hover:bg-primary")}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Guardar aspeto 3D
            </button>
            {/* apaga as regras guardadas do produto: com um rascunho por guardar perder-se-ia sem aviso, por isso primeiro guarda-se ou descarta-se */}
            <button type="button" aria-disabled={!lig.proprio || ocupado || alterado} aria-describedby={alterado && lig.proprio ? idHerdar : undefined}
              onClick={() => { if (lig.proprio && !ocupado && !alterado) void correr(lig.herdar, "As regras voltaram a ser herdadas."); }}
              className={cn(BOTAO, (!lig.proprio || ocupado || alterado) && DESLIGADO)}>Voltar a herdar as regras</button>
          </div>
          {razao && <p id={idRazao} className={NOTA}>{razao}</p>}
          {alterado && lig.proprio && <p id={idHerdar} className={NOTA}>Guarde ou descarte as alterações antes de voltar a herdar as regras.</p>}
          {/* região viva: o resultado de guardar ou de voltar a herdar; o erro como alerta */}
          <p aria-live="polite" className={NOTA}>{msg && !msg.erro ? msg.texto : ""}</p>
          {msg?.erro && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{msg.texto}{msg.texto === FRASE_FALHA ? "" : ` ${FRASE_FALHA}`}</p>}
        </div>
      )}
    </section>
  );
}
