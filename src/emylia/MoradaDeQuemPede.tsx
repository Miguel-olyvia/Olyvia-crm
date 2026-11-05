// 4/11: no passo «Quem pede» (Por contactar), a morada DE QUEM PEDE: a da ficha do cliente (anew_addresses, ligada à entidade), que pode ser
// diferente da morada da obra. Não toca na morada da obra (d.f.morada, d.f.cp, d.f.localidade, negocios.morada_obra): só grava na entidade,
// pela RPC sync_entity_primary_address (a da «Nova lead»). Quem lê e grava é a página real (definirMoradaDaEntidade); fora dela (protótipo)
// o bloco não aparece e nada se grava. Só se grava por ação de quem edita (ao sair do bloco ou ao fechá-lo), nunca ao abrir nem pela
// pesquisa do código postal, e só conta como gravada a decisão da RPC que ligou mesmo a morada (DECISOES_GRAVADAS).
import { useEffect, useRef, useState } from "react";
import { cpCompleto } from "@/lib/addresses/procurarCodigoPostal";
import { seVazio, useMoradaPorCodigoPostal } from "@/hooks/useMoradaPorCodigoPostal";
import { cn } from "@/lib/utils";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { podeNeg } from "./permissoes";
import { DECISOES_GRAVADAS } from "./real/gravarMoradaDaEntidade";
import { sugerirMoradas } from "./real/moradaDaLead";

export interface MoradaEntidade { rua: string; cp: string; localidade: string; /** andar e fração que a ficha já tem (só se mostra; a RPC não os grava) */ fracao?: string }
export interface RegistoMoradaEntidade {
  /** A morada da ficha; null = não tem. LANÇA se não conseguiu ler. */
  ler: (entityId: string) => Promise<MoradaEntidade | null>;
  /** Grava e devolve a decisão da RPC. */
  gravar: (entityId: string, m: MoradaEntidade) => Promise<string>;
}

let registo: RegistoMoradaEntidade | null = null;
/** A página real regista quem lê e grava a morada da entidade. Devolve como desligar. */
export function definirMoradaDaEntidade(r: RegistoMoradaEntidade): () => void {
  registo = r;
  return () => { if (registo === r) registo = null; };
}
/** Há quem grave (página real) e o negócio tem a pessoa. */
export const comMoradaDaEntidade = (d: Negocio) => !!d.dadosLead && !!registo;

const ROT = "grid gap-1.5 text-[15px] font-medium";
const INP = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 read-only:bg-muted/40";
const VAZIA: MoradaEntidade = { rua: "", cp: "", localidade: "" };
// os mesmos «lixos de preenchimento» que a RPC recusa
const RUAS_LIXO = new Set(["-", "--", "n/a", "na", "null", "none", "s/n", "sn"]);

type Campo = "rua" | "cp";
interface Erro { campos: Campo[]; texto: string }
const E_INCOMPLETA: Erro = { campos: ["rua", "cp"], texto: "Para gravar a morada, preencha a rua e o código postal com 7 dígitos (0000-000)." };
const E_ZEROS: Erro = { campos: ["cp"], texto: "O código postal 0000-000 não é válido." };
const E_RUA: Erro = { campos: ["rua"], texto: "A rua não é válida: escreva a rua e o número." };
const E_RECUSADA: Erro = { campos: ["rua", "cp"], texto: "Morada não aceite: confira a rua e o código postal." };
const E_APAGAR: Erro = { campos: ["rua", "cp"], texto: "Apagar os campos não remove a morada da ficha. Para a trocar, escreva a nova morada por inteiro." };

const chaveDe = (m: MoradaEntidade) => `${m.rua.trim()}|${cpCompleto(m.cp) ?? m.cp.trim()}|${m.localidade.trim()}`;
const vazia = (m: MoradaEntidade) => !m.rua.trim() && !m.cp.trim() && !m.localidade.trim();

export function MoradaDeQuemPede({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  if (!comMoradaDaEntidade(d)) return null;
  // key: ao mudar de pessoa o bloco recomeça (nada do estado da anterior fica a poder ser gravado na seguinte)
  return <Bloco key={d.dadosLead!.entityId} ctx={ctx} d={d} entityId={d.dadosLead!.entityId} />;
}

function Bloco({ ctx, d, entityId }: { ctx: Ctx; d: Negocio; entityId: string }) {
  const id = `quem-morada-${d.id}`;
  const editar = podeNeg(ctx.S.role, "contacto.registar");
  const [m, setM] = useState<MoradaEntidade>(VAZIA);
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState<Erro | null>(null);
  const [leitura, setLeitura] = useState<"a ler" | "ok" | "falhou">("a ler");
  const [feito, setFeito] = useState("");
  const mRef = useRef(m); mRef.current = m;
  const tocadoRef = useRef(false);
  const gravada = useRef(chaveDe(VAZIA));
  const fracao = useRef("");
  const aGravar = useRef(false);
  const depois = useRef(false);

  // lê a morada que a ficha já tem; o que a pessoa escrever entretanto não é pisado
  useEffect(() => {
    let vivo = true;
    void registo?.ler(entityId).then((x) => {
      if (!vivo) return;
      setLeitura("ok");
      if (!x) return;
      gravada.current = chaveDe(x);
      fracao.current = x.fracao ?? "";
      if (!tocadoRef.current) setM({ rua: x.rua, cp: x.cp, localidade: x.localidade });
    }).catch(() => { if (vivo) setLeitura("falhou"); });
    return () => { vivo = false; };
  }, [entityId]);

  const tentar = (v: MoradaEntidade): void => {
    if (!editar || !tocadoRef.current) return;
    if (vazia(v)) { setErro(gravada.current === chaveDe(VAZIA) ? null : E_APAGAR); return; }
    const cp = cpCompleto(v.cp);
    if (!v.rua.trim() || !cp) { setFeito(""); setErro(E_INCOMPLETA); return; }
    if (cp === "0000-000") { setFeito(""); setErro(E_ZEROS); return; }
    if (RUAS_LIXO.has(v.rua.trim().toLowerCase())) { setFeito(""); setErro(E_RUA); return; }
    const limpa = { rua: v.rua.trim(), cp, localidade: v.localidade.trim() };
    const chave = chaveDe(limpa);
    if (chave === gravada.current) { setErro(null); return; }
    const quem = registo;
    if (!quem) return;
    if (aGravar.current) { depois.current = true; return; } // uma gravação em curso: a seguir grava-se o que lá estiver
    aGravar.current = true;
    setErro(null);
    void (async () => {
      try {
        const decisao = await quem.gravar(entityId, limpa);
        if (!DECISOES_GRAVADAS.has(decisao)) { setFeito(""); setErro(E_RECUSADA); return; }
        gravada.current = chave;
        // o que se escreveu entretanto não se apaga: só se normaliza o código postal se o ecrã ainda mostra o que foi enviado
        if (chaveDe(mRef.current) === chave) { tocadoRef.current = false; setM({ ...mRef.current, cp }); }
        const perdeuFracao = fracao.current && decisao === "repointed";
        setFeito(`Morada de quem pede gravada na ficha do cliente.${perdeuFracao ? ` O andar ou fração «${fracao.current}» não passou para a nova morada: volte a indicá-lo na ficha.` : ""}`);
        if (perdeuFracao) fracao.current = "";
        // a sugestão da «Morada da obra» lê-se desta morada: acompanha-a (a morada da obra em si não muda)
        ctx.run(() => sugerirMoradas([d], () => entityId, new Map([[entityId, { morada: limpa.rua, cp, localidade: limpa.localidade, fracao: "", de: "ficha" as const }]])));
      } catch (e) {
        setFeito("");
        setErro({ campos: [], texto: (e as Error).message || "Não foi possível gravar a morada de quem pede." });
      } finally {
        aGravar.current = false;
        if (depois.current) { depois.current = false; tentar(mRef.current); }
      }
    })();
  };

  // ao fechar o bloco (mudar de passo, de negócio) com alterações por gravar, grava-as na pessoa a que pertencem
  const fechar = useRef(tentar); fechar.current = tentar;
  useEffect(() => () => { fechar.current(mRef.current); }, []);

  // código postal completo: só PREENCHE a rua e a localidade vazias (a pedido de quem escreveu o código); nunca grava
  useMoradaPorCodigoPostal(m.cp, (x) => {
    setM((a) => ({ ...a, rua: seVazio(a.rua, x.rua), localidade: seVazio(a.localidade, x.localidade) }));
    setErro(null);
  }, tocado && editar);

  const mudar = (p: Partial<MoradaEntidade>) => { tocadoRef.current = true; setTocado(true); setFeito(""); setM((a) => ({ ...a, ...p })); };
  const sair = (e: React.FocusEvent<HTMLFieldSetElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    tentar(mRef.current);
  };
  const liga = (c: Campo) => (erro?.campos.includes(c) ? `${id}-erro` : undefined);

  return (
    <fieldset onBlur={sair} className="col-span-full grid min-w-0 gap-3 border-0 p-0">
      <legend className="p-0 text-[15px] font-semibold text-foreground">Morada de quem pede</legend>
      <p id={`${id}-aviso`} className="text-sm text-muted-foreground">Se for diferente da morada da obra, preencha-a aqui. A morada da obra pede-se mais à frente.</p>
      {!editar && <p className="text-sm text-muted-foreground">Só de leitura: mudar a morada de quem pede precisa da permissão de registar o contacto (negocios.contacto.registar).</p>}
      {leitura === "falhou" && <p role="alert" className="text-sm text-destructive">Não foi possível ler a morada da ficha. O que aqui escrever pode substituir a que lá está: confira-a antes.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn(ROT, "sm:col-span-2")}>
          <label htmlFor={`${id}-rua`}>Rua e número</label>
          <input id={`${id}-rua`} value={m.rua} readOnly={!editar} autoComplete="street-address" className={INP}
            aria-invalid={liga("rua") ? true : undefined} aria-describedby={[`${id}-aviso`, liga("rua")].filter(Boolean).join(" ")}
            onChange={(e) => mudar({ rua: e.target.value })} />
        </div>
        <div className={ROT}>
          <label htmlFor={`${id}-cp`}>Código postal</label>
          <input id={`${id}-cp`} value={m.cp} readOnly={!editar} maxLength={8} inputMode="numeric" autoComplete="postal-code" placeholder="0000-000" className={INP}
            aria-invalid={liga("cp") ? true : undefined} aria-describedby={liga("cp")} onChange={(e) => mudar({ cp: e.target.value })} />
        </div>
        <div className={ROT}>
          <label htmlFor={`${id}-localidade`}>Localidade</label>
          <input id={`${id}-localidade`} value={m.localidade} readOnly={!editar} autoComplete="address-level2" className={INP} onChange={(e) => mudar({ localidade: e.target.value })} />
        </div>
      </div>
      {erro && <p id={`${id}-erro`} role="alert" className="text-sm text-destructive">{erro.texto}</p>}
      <p role="status" className="text-sm min-h-5 text-muted-foreground">{feito}</p>
    </fieldset>
  );
}
