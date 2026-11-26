// 25/11: as regras do 3D do produto: que atributo pinta que zona (frente, corpo, tampo…) e se «pinta» ou «não pinta». Sem regras, cada zona é pintada pelo NOME do atributo
// («Cor da frente», «Cor do corpo», «Cor»); uma regra explícita manda sobre o nome. «Não pinta» tira o atributo dessa zona. Controlado: o rascunho vive em quem o usa (o 3D mostra-o logo).
// 26/11: passa a «Regras do produto» e a viver DENTRO do painel «Aspeto 3D» (PainelAspeto3D.tsx), que tem o único «Guardar»: aqui só se edita. As regras agrupam-se por atributo, com «Todas as
// zonas» à cabeça e as excepções por baixo, recuadas; uma regra que não chega a pintar numa zona di-lo em texto («sem efeito aqui: Frente»); e apontar ou focar uma regra realça no 3D só as
// zonas que ela pinta de facto. Sem three: só o ecrã.
import { useEffect, useId, useRef, useState } from "react";
import { EyeOff, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_LIGACOES, erroDasLigacoes, rotuloDaOrigemConfig, type Ligacao, type OrigemConfig, type ZonaLigacao } from "./config3dDados";
import type { LeituraDoProduto, LeituraPorOmissao } from "./planta3d/acabamentoCor3d";
import type { Eixos } from "./planta3d/eixosMedida";
import { sem } from "./planta3d/catalogo3d";
import { ZONAS, rotuloDaZona, type ZonaGlb } from "./planta3d/zonasGlb";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors duration-200 hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SELECT = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DESLIGADO = "cursor-not-allowed opacity-50 hover:bg-card";
const DESCONHECIDO = "Atributo desconhecido";
const SEM_ESTE = "o produto já não tem este atributo";

/** `fora`: o atributo tem uma regra gravada mas o produto já não o tem (ou já não tem valor escolhido): só serve para a ver e remover, nunca para ligar de novo. */
export interface AtributoLigavel { id: string; nome: string; fora?: boolean }
export interface PropsLigacoes {
  /** As regras em vigor no ecrã (o rascunho, ou as guardadas ou herdadas). */
  valor: readonly Ligacao[];
  /** O rascunho difere do que está guardado: só então se pode guardar. */
  alterado: boolean;
  /** 26/11: as regras guardadas (ou herdadas), para dizer quantas alterações estão por guardar. Ausente: o painel diz só «Por guardar». */
  guardadas?: readonly Ligacao[];
  /** De onde vêm as regras guardadas, e se este produto tem as suas (só então se pode «voltar a herdar»). */
  origem: OrigemConfig; proprio: boolean;
  /** Os atributos de lista do produto que se podem ligar (a Medida não pinta nada). */
  atributos: readonly AtributoLigavel[];
  /** 25/11: os atributos QUE O PRODUTO TEM (com valor escolhido) com hex, foto ou aspeto, e o que o 3D faz com cada um por omissão (sem configuração): aplicado pelo nome, ou desligado. Ausente: a lista não se mostra; vazia: diz que o produto não tem nenhum. */
  omissoes?: readonly LeituraPorOmissao[];
  /** As zonas que o modelo tem. */
  zonas: readonly ZonaGlb[];
  /** Regras da base a atributos que já não existem, e regras inválidas que o leitor largou. */
  orfas: number; ignoradas: number;
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
  gravar: () => Promise<string | null>;
  herdar: () => Promise<string | null>;
  /** 26/11: deixa o rascunho e volta ao guardado. Ausente: não há «Descartar». */
  descartar?: () => void;
}

/**
 * A configuração 3D que a pré-visualização recebe (só existe quando a base a devolveu: sem ela o painel «Medidas» é só para ver, como era). Os eixos: os guardados (ou herdados), de onde
 * vêm, se são deste produto, e como se gravam (null herda). As regras: o que o painel «Aspeto 3D» precisa (sem `zonas` nem `podeEditar`, que a pré-visualização acrescenta).
 */
export interface Config3dPrevia {
  podeEditar: boolean;
  eixos: { guardados: Eixos | null; origem: OrigemConfig; proprio: boolean; gravar: (e: Eixos | null) => Promise<string | null> };
  ligacoes: Omit<PropsLigacoes, "zonas" | "podeEditar">;
  /** 25/11: os atributos QUE O PRODUTO TEM (com valor escolhido) que o 3D lê, com a opção escolhida: o que o painel da zona oferece. Ausente: nenhum. */
  atributosDoProduto?: readonly LeituraDoProduto[];
  /** 26/11: os atributos do produto e a lista deles, para o painel dizer PORQUÊ cada zona leva o que leva (porqueDaZona). Ausente: o painel não mostra o «Porquê». */
  leitura?: { attrs: readonly AtributoProduto[] | undefined; defs: readonly AtributoDef[] | undefined };
}

/** Como se diz a zona de uma regra: «Todas as zonas» (e não «tudo») ou o nome da zona. */
const rotuloDaZonaLigacao = (z: ZonaLigacao): string => (z === "tudo" ? "Todas as zonas" : rotuloDaZona(z));

/**
 * A zona que «Ligar» propõe, pelo nome do atributo: puxador/tirador/pega → «Puxadores»; «… do corpo» → Corpo; «… da frente» → Frente; senão «Todas as zonas». Só propõe uma zona que o modelo tem
 * (as `ofertadas`); sem ela fica «Todas as zonas». Nunca a primeira zona do modelo à sorte (um Puxador na frente pintava as portas).
 */
function zonaProposta(nome: string, ofertadas: readonly ZonaLigacao[]): ZonaLigacao {
  const n = sem(nome);
  const tem = (z: ZonaLigacao): boolean => ofertadas.includes(z);
  if (/puxador|tirador|pega/.test(n)) return tem("puxadores") ? "puxadores" : "tudo";
  if (/\bcorpo\b/.test(n) && tem("corpo")) return "corpo";
  if (/\bfrente\b/.test(n) && tem("frente")) return "frente";
  return "tudo";
}
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

/**
 * Um interruptor «Pinta» / «Não pinta» (atributos de cor: hex ou foto) ou «Aplica» / «Não aplica» (atributos de superfície: Tonalidade, Brilho): o nome acessível é sempre o do estado ligado
 * («Pinta» ou «Aplica»; o estado vai em aria-checked) e o estado também se lê em texto.
 */
function Pinta({ ligado, aoMudar, superficie = false }: { ligado: boolean; aoMudar: (v: boolean) => void; superficie?: boolean }) {
  const sim = superficie ? "Aplica" : "Pinta";
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={sim} onClick={() => aoMudar(!ligado)} className={cn(BOTAO, "justify-start gap-2 px-3")}>
      <span aria-hidden="true" className={cn("relative inline-block h-5 w-9 shrink-0 rounded-full border border-input transition-colors duration-200", ligado ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-all duration-200", ligado ? "left-[18px]" : "left-0.5")} />
      </span>
      <span aria-hidden="true">{ligado ? sim : `Não ${sim.toLowerCase()}`}</span>
    </button>
  );
}

/**
 * As regras de UM atributo ditas em português claro (e não «ligado: Todas as zonas sim»): «pinta todas as zonas; não pinta em Frente», «dá a superfície a todas as zonas», «pinta só em Tampo».
 * `superficie`: o atributo dá a superfície (Brilho, Tonalidade) e não a cor. Uma regra explícita «pinta» ao lado de «Todas as zonas: pinta» é redundante e não se repete.
 */
function fraseDasRegras(ls: readonly Ligacao[], superficie: boolean): string {
  const pinta = superficie ? "dá a superfície" : "pinta", naoPinta = superficie ? "não dá superfície" : "não pinta";
  const nomes = (zs: readonly Ligacao[]) => zs.map((l) => rotuloDaZonaLigacao(l.zona)).join(", ");
  const tudo = ls.find((l) => l.zona === "tudo");
  const sim = ls.filter((l) => l.zona !== "tudo" && l.aplicar), nao = ls.filter((l) => l.zona !== "tudo" && !l.aplicar);
  const frases: string[] = [];
  if (tudo?.aplicar) frases.push(superficie ? `${pinta} a todas as zonas` : `${pinta} todas as zonas`);
  else if (tudo && sim.length === 0) frases.push(`${naoPinta} em nenhuma zona`);
  if (!tudo?.aplicar && sim.length) frases.push(`${pinta}${tudo ? " só" : ""} em ${nomes(sim)}`);
  if (nao.length) frases.push(`${naoPinta} em ${nomes(nao)}`);
  return frases.join("; ");
}

/** O estado de um atributo no painel: o das regras guardadas ou do rascunho, se as há; senão o que vale por omissão. */
function estadoDoAtributo(o: LeituraPorOmissao, valor: readonly Ligacao[], superficie: boolean): string {
  const ls = valor.filter((l) => l.atributo === o.id);
  if (ls.length) return fraseDasRegras(ls, superficie);
  return o.aplicado ? `aplicado por omissão (${o.onde})` : "desligado por omissão";
}

interface LinhaIdx { l: Ligacao; i: number }
/** As regras agrupadas por atributo (pela ordem em que cada atributo aparece), com «Todas as zonas» à cabeça de cada grupo. `i` é o lugar na lista original (é por ele que se muda e remove). */
function agrupar(valor: readonly Ligacao[]): { atributo: string; linhas: LinhaIdx[] }[] {
  const mapa = new Map<string, LinhaIdx[]>();
  valor.forEach((l, i) => mapa.set(l.atributo, [...(mapa.get(l.atributo) ?? []), { l, i }]));
  return [...mapa].map(([atributo, linhas]) => ({ atributo, linhas: [...linhas].sort((a, b) => (a.l.zona === "tudo" ? 0 : 1) - (b.l.zona === "tudo" ? 0 : 1)) }));
}

export interface PropsRegras {
  valor: readonly Ligacao[];
  origem: OrigemConfig;
  atributos: readonly AtributoLigavel[];
  omissoes?: readonly LeituraPorOmissao[];
  /** 26/11: os ids dos atributos de SUPERFÍCIE das definições (aspeto, sem hex nem foto: Tonalidade, Brilho; ver idsDeSuperficieDasDefs): o interruptor deles diz «Aplica», o dos outros «Pinta». Ausente: vale `daSuperficie` das `omissoes`. */
  idsSuperficie?: readonly string[];
  zonas: readonly ZonaGlb[];
  orfas: number; ignoradas: number;
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
  /** As zonas em que uma regra «pinta» não chega a pintar (a excepção, ou outro atributo que ganha): diz-se em texto na linha e não se realçam no 3D. Ausente: nenhuma. */
  semEfeito?: (regra: Ligacao) => readonly ZonaGlb[];
  /** Apontar ou focar uma regra: as zonas que ela pinta de facto (para o 3D as realçar); null ao sair. */
  aoApontar?: (zonas: readonly ZonaGlb[] | null) => void;
  /** O id do aviso de regra repetida: quem tem o «Guardar» aponta-lhe com aria-describedby. */
  idErro: string;
}

export function RegrasDoProduto({ valor, origem, atributos, omissoes, idsSuperficie, zonas, orfas, ignoradas, podeEditar, aoMudar, semEfeito, aoApontar, idErro }: PropsRegras) {
  const id = useId();
  // de superfície («Aplica»): pelos ids das definições (que já põem de parte quem tem hex ou foto); sem eles, pelo que a leitura por omissão diz
  const daSuperficie = (a: string): boolean => (idsSuperficie ? idsSuperficie.includes(a) : omissoes?.some((o) => o.id === a && o.daSuperficie === true) === true);
  const [aberto, setAberto] = useState(true);
  // o que «Ligar» e «Desligar» acabaram de fazer, para a região viva o anunciar (o botão não desaparece, mas o leitor de ecrã não vê a lista mudar)
  const [anuncio, setAnuncio] = useState("");
  const botaoAcrescentar = useRef<HTMLButtonElement>(null);
  const [novaLinha, setNovaLinha] = useState<number | null>(null);
  const nomeDe = (a: string) => atributos.find((x) => x.id === a)?.nome ?? DESCONHECIDO;
  const foraDe = (a: string) => atributos.find((x) => x.id === a)?.fora === true;
  // o que se pode ligar de novo: só os atributos que o produto tem
  const ligaveis = atributos.filter((a) => !a.fora);
  // as zonas oferecidas: «Todas as zonas», as do modelo e, para não as perder, as já usadas que o modelo não tem
  const usadas = new Set(valor.map((l) => l.zona));
  const zonasOfertadas: ZonaLigacao[] = ["tudo", ...ZONAS.filter((z) => zonas.includes(z) || usadas.has(z))];
  const rotuloOrigem = rotuloDaOrigemConfig(origem);
  const invalida = erroDasLigacoes(valor);
  const livre = (): Ligacao | null => {
    for (const a of ligaveis) for (const z of zonasOfertadas) if (!valor.some((l) => l.atributo === a.id && l.zona === z)) return { atributo: a.id, zona: z, aplicar: true };
    return null;
  };
  const cheio = valor.length >= MAX_LIGACOES;
  const podeAcrescentar = !cheio && !!livre();
  // o campo que se acabou de mexer (atributo, zona): mudar o atributo ou a zona leva a linha para outro sítio da lista agrupada, e o navegador larga o foco a um nó que o React move
  const refocar = useRef<string | null>(null);
  const mudar = (i: number, parte: Partial<Ligacao>, campo?: "a" | "z") => {
    if (campo) refocar.current = `${id}-${campo}${i}`;
    aoMudar(valor.map((l, j) => (j === i ? { ...l, ...parte } : l)));
  };
  useEffect(() => {
    const alvo = refocar.current;
    if (!alvo) return;
    refocar.current = null;
    const el = document.getElementById(alvo);
    if (el && document.activeElement !== el) el.focus();
  });
  // ao acrescentar, o foco vai ao campo «Atributo» da regra nova; ao remover, ao botão de acrescentar (que continua lá)
  useEffect(() => {
    if (novaLinha === null) return;
    document.getElementById(`${id}-a${novaLinha}`)?.focus();
    setNovaLinha(null);
  }, [novaLinha, id, valor.length]);
  const zonasQuePinta = (l: Ligacao): ZonaGlb[] => {
    if (!l.aplicar) return [];
    const base = l.zona === "tudo" ? zonas : zonas.filter((z) => z === l.zona);
    const semAqui = semEfeito?.(l) ?? [];
    return base.filter((z) => !semAqui.includes(z));
  };
  const grupos = agrupar(valor);
  // a regra apontada é a que o rato está por cima ou, senão, a que tem o foco (a posição na lista): o realce no 3D calcula-se SEMPRE a partir das regras em vigor, e por isso acompanha
  // a edição (desligar «Pinta», mudar a zona) e acaba quando a regra desaparece. A chave (as zonas juntas) evita avisar o 3D de cada vez que o painel se redesenha.
  const [rato, setRato] = useState<number | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const apontada = rato ?? foco;
  const regraApontada = apontada === null ? undefined : valor[apontada];
  const chaveRealce = regraApontada ? zonasQuePinta(regraApontada).join("|") : null;
  useEffect(() => { aoApontar?.(chaveRealce === null ? null : chaveRealce === "" ? [] : (chaveRealce.split("|") as ZonaGlb[])); }, [chaveRealce]); // eslint-disable-line react-hooks/exhaustive-deps -- só quando muda o que se realça
  useEffect(() => () => aoApontar?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps -- só ao desmontar

  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 id={`${id}-t`} className="text-[15px] font-semibold">Regras do produto</h4>
        <button type="button" aria-expanded={aberto} aria-controls={`${id}-corpo`} onClick={() => { if (aberto) { setRato(null); setFoco(null); } setAberto((v) => !v); }} className={cn(BOTAO, "px-3")}>
          {aberto ? "Esconder" : `Mostrar (${valor.length})`}
        </button>
      </div>
      <div id={`${id}-corpo`} hidden={!aberto} className="grid gap-3">
        <p className={NOTA}>
          {rotuloOrigem ? `Regras ${rotuloOrigem}. ` : "Sem regras guardadas: cada zona é pintada pelo nome do atributo («Cor da frente» pinta a frente, «Cor do corpo» o corpo, «Cor» o resto). "}
          Uma regra manda sobre o nome; «Não pinta» («Não aplica», nos atributos de superfície) tira o atributo dessa zona.
        </p>

        {omissoes && omissoes.length === 0 && <p className={NOTA}>Este produto não tem nenhum atributo que pinte o 3D (cor, foto ou aspeto escolhidos): não há nada para ligar.</p>}
        {omissoes && omissoes.length > 0 && (
          <div className="grid gap-1">
            <h5 className="text-[15px] font-medium">Atributos que o 3D lê</h5>
            <ul className="grid gap-2 text-[15px]">
              {omissoes.map((o) => {
                const proprias = valor.filter((l) => l.atributo === o.id);
                // ligado (aplica) hoje: pelas regras do atributo, se as há; senão pelo que vale por omissão
                const ativo = proprias.length ? proprias.some((l) => l.aplicar) : o.aplicado;
                const alternar = () => {
                  const resto = valor.filter((l) => l.atributo !== o.id);
                  if (ativo) { aoMudar(o.aplicado ? [...resto, { atributo: o.id, zona: "tudo", aplicar: false }] : resto); setAnuncio(`${o.nome} desligado`); return; }
                  const zona = zonaProposta(o.nome, zonasOfertadas);
                  aoMudar([...resto, { atributo: o.id, zona, aplicar: true }]);
                  setAnuncio(`${o.nome} ligado à zona ${rotuloDaZonaLigacao(zona)}`);
                };
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2">
                    <span><strong className="font-medium">{o.nome}</strong>: {estadoDoAtributo(o, valor, daSuperficie(o.id))}</span>
                    {/* o MESMO botão muda de rótulo (Ligar ↔ Desligar) em vez de desaparecer: assim o foco do teclado fica nele, e a região viva anuncia o resultado */}
                    {podeEditar && <button type="button" aria-label={`${ativo ? "Desligar" : "Ligar"} ${o.nome}`} onClick={alternar} className={BOTAO}>{ativo ? "Desligar" : "Ligar"}</button>}
                  </li>
                );
              })}
            </ul>
            <p aria-live="polite" className="sr-only">{anuncio}</p>
          </div>
        )}

        {valor.length === 0 && <p className={NOTA}>Sem regras: o 3D pinta cada zona pelo nome dos atributos.</p>}

        {!podeEditar ? (
          <>
            {valor.length > 0 && (
              <ul className="grid gap-1 text-[15px]">
                {valor.map((l, i) => <li key={i}>{nomeDe(l.atributo)} → {rotuloDaZonaLigacao(l.zona)}: {daSuperficie(l.atributo) ? (l.aplicar ? "aplica" : "não aplica") : l.aplicar ? "pinta" : "não pinta"}{foraDe(l.atributo) ? ` (${SEM_ESTE})` : ""}</li>)}
              </ul>
            )}
            <p className={NOTA}>Para mudar as regras precisa da permissão de editar produtos.</p>
          </>
        ) : (
          <>
            {atributos.length === 0 && !omissoes && <p className={NOTA}>Nenhum atributo deste produto tem cor, foto ou aspeto: não há atributos para ligar ao 3D.</p>}
            {/* lista plana (o React mantém a linha e o foco quando ela muda de grupo); a ordem é a dos grupos, com um respiro antes de cada grupo novo */}
            <div className="grid gap-2">
              {grupos.flatMap((g, gi) => {
                const temTudo = g.linhas.some((x) => x.l.zona === "tudo");
                return g.linhas.map(({ l, i }, li) => {
                  const conhecido = atributos.some((a) => a.id === l.atributo);
                  const excecao = temTudo && l.zona !== "tudo";
                  const semAqui = (semEfeito?.(l) ?? []).filter((z) => l.zona === "tudo" || z === l.zona);
                  const idQuem = `${id}-d${i}`;
                  return (
                    <div key={i} role="group" aria-label={`Regra ${i + 1}`} aria-describedby={idQuem}
                      onMouseEnter={() => setRato(i)} onMouseLeave={() => setRato(null)}
                      onFocus={() => setFoco(i)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(null); }}
                      className={cn("grid grid-cols-2 gap-2 rounded-lg border border-border p-2 transition-colors duration-200 hover:bg-muted/40", li === 0 && gi > 0 && "mt-1", excecao && "ml-4 border-l-4 border-l-primary/40")}>
                      {/* o número é o da lista; quem lê com leitor de ecrã ouve também de que regra se trata */}
                      <span id={idQuem} className="sr-only">{nomeDe(l.atributo)}, {rotuloDaZonaLigacao(l.zona)}</span>
                      <div className="grid min-w-0 gap-1">
                        <label htmlFor={`${id}-a${i}`} className="text-[15px] font-medium">Atributo</label>
                        <select id={`${id}-a${i}`} value={l.atributo} onChange={(e) => mudar(i, { atributo: e.target.value }, "a")} className={SELECT}>
                          {!conhecido && <option value={l.atributo}>{DESCONHECIDO}</option>}
                          {atributos.filter((a) => !a.fora || a.id === l.atributo).map((a) => <option key={a.id} value={a.id}>{a.fora ? `${a.nome} (${SEM_ESTE})` : a.nome}</option>)}
                        </select>
                        {foraDe(l.atributo) && <p className={NOTA}>O produto já não tem este atributo: remova a regra.</p>}
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <label htmlFor={`${id}-z${i}`} className="text-[15px] font-medium">Zona{excecao ? " (excepção)" : ""}</label>
                        <select id={`${id}-z${i}`} value={l.zona} onChange={(e) => mudar(i, { zona: e.target.value as ZonaLigacao }, "z")} className={SELECT}>
                          {zonasOfertadas.map((z) => <option key={z} value={z}>{rotuloDaZonaLigacao(z)}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Pinta ligado={l.aplicar} superficie={daSuperficie(l.atributo)} aoMudar={(v) => mudar(i, { aplicar: v })} />
                        <button type="button" aria-label={`Remover a regra ${i + 1}`} aria-describedby={idQuem} title="Remover"
                          onClick={() => { setRato(null); setFoco(null); aoMudar(valor.filter((_, j) => j !== i)); botaoAcrescentar.current?.focus(); }} className={cn(BOTAO, "min-w-11 px-0")}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {semAqui.length > 0 && (
                        <p className="col-span-2 flex items-center gap-1.5 text-[15px] text-muted-foreground">
                          <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>sem efeito aqui: {semAqui.map((z) => rotuloDaZona(z)).join(", ")}</span>
                        </p>
                      )}
                    </div>
                  );
                });
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {ligaveis.length > 0 && (
                <button ref={botaoAcrescentar} type="button" aria-disabled={!podeAcrescentar} onClick={() => { const nova = livre(); if (podeAcrescentar && nova) { aoMudar([...valor, nova]); setNovaLinha(valor.length); } }} className={cn(BOTAO, !podeAcrescentar && DESLIGADO)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Acrescentar regra
                </button>
              )}
              {cheio && <span className={NOTA}>Máximo de {MAX_LIGACOES} regras.</span>}
            </div>
          </>
        )}

        {orfas > 0 && <p role="status" className={NOTA}>{plural(orfas, "regra a um atributo que já não existe foi ignorada", "regras a atributos que já não existem foram ignoradas")}.</p>}
        {ignoradas > 0 && <p role="status" className={NOTA}>{plural(ignoradas, "regra inválida foi ignorada", "regras inválidas foram ignoradas")}.</p>}
      </div>
      {/* fora do bloco que se esconde: com as Regras escondidas o «Guardar» continua desactivado e o motivo (o aviso, a que ele aponta) tem de se ver */}
      {podeEditar && invalida && <p id={idErro} role="alert" className="text-[15px] text-red-700 dark:text-red-400">{invalida}</p>}
    </section>
  );
}
