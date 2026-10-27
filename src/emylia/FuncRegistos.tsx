// As três ações rápidas da V2 funcional que escrevem na memória do dia a dia (diaADia.ts), cada uma num popover pequeno: Registar chamada
// (resultado, nota curta e próximo passo; "Guardar" é o único botão primário), Nota e Adiar (Amanhã, Em 3 dias, Na próxima semana).
// Nada aqui toca no Estado nem no motor. O gatilho é dado por quem usa (um botão de ícone na linha, ou um botão com texto na ficha).
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CONTACTO } from "./campos";
import { PASSOS, registar, type PassoSeguinte } from "./diaADia";
import { HOJE_FUNC } from "./funcHoje";
import { somarDias } from "./leadsDocs";
import { BORDA_CTRL } from "./PessoaLinha";
import { classePortal } from "./FiltrosPopover";
import { SEM_ATALHOS } from "./useAtalhos";

/** As opções do resultado: as do campo "Resultado" da chamada (campos.ts). */
export const RESULTADOS: readonly string[] = CONTACTO[0].campos.find((c) => c.k === "resultado")?.op ?? [];
export const ADIAMENTOS: readonly { dias: number; nome: string }[] = [{ dias: 1, nome: "Amanhã" }, { dias: 3, nome: "Em 3 dias" }, { dias: 7, nome: "Na próxima semana" }];

const ESCOLHA = (ativo: boolean): string => cn("min-h-11 rounded-lg border px-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  ativo ? "border-foreground bg-foreground text-background" : cn(BORDA_CTRL, "bg-card text-foreground hover:bg-muted"));
const CONTEUDO = "w-[min(24rem,calc(100vw-2rem))] p-4";

interface BaseProps {
  /** O nome da pessoa (a chave dos registos). */
  nome: string;
  /** O botão que abre o popover. */
  gatilho: ReactNode;
  /** Diz o que aconteceu (aviso aria-live da página). */
  avisar: (msg: string) => void;
  leitura?: boolean;
}

/** Um grupo de escolha única em botões (aria-pressed), com legenda. */
function Escolha<T extends string>({ legenda, opcoes, valor, mudar }: { legenda: string; opcoes: readonly { id: T; nome: string }[]; valor: T | null; mudar: (v: T) => void }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-[15px] font-medium">{legenda}</legend>
      {opcoes.map((o) => <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => mudar(o.id)} className={ESCOLHA(valor === o.id)}>{o.nome}</button>)}
    </fieldset>
  );
}

/** Registar chamada: escolher o resultado, escrever uma nota (opcional) e escolher o próximo passo. */
export function RegistarChamada({ nome, gatilho, avisar, leitura = false }: BaseProps) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [passo, setPasso] = useState<PassoSeguinte | null>(null);
  const [nota, setNota] = useState("");
  const idNota = useId();
  const limpar = (): void => { setResultado(null); setPasso(null); setNota(""); };
  const guardar = (): void => {
    if (!resultado) return;
    registar({ nome, tipo: "chamada", resultado, nota: nota.trim(), passo: passo ?? "nenhum" });
    setAberto(false); limpar();
    avisar(`Chamada registada: ${nome}`);
  };
  return (
    <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) limpar(); }}>
      <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
      <PopoverContent align="end" className={cn(CONTEUDO, classePortal(leitura))} {...{ [SEM_ATALHOS]: "" }} aria-label={`Registar chamada de ${nome}`}>
        <div className="grid max-h-[min(36rem,calc(100vh-8rem))] gap-4 overflow-y-auto">
          <p className="text-base font-semibold">Registar chamada · {nome}</p>
          <Escolha<string> legenda="Resultado" opcoes={RESULTADOS.map((r) => ({ id: r, nome: r }))} valor={resultado} mudar={(v) => setResultado(v)} />
          <div className="grid gap-1.5">
            <label htmlFor={idNota} className="text-[15px] font-medium">Nota (opcional)</label>
            <input id={idNota} type="text" value={nota} maxLength={140} onChange={(e) => setNota(e.target.value)}
              className={cn("h-11 rounded-md border bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", BORDA_CTRL)} />
          </div>
          <Escolha<PassoSeguinte> legenda="Próximo passo" opcoes={PASSOS} valor={passo} mudar={(v) => setPasso(v)} />
          {!resultado && <p className="text-[15px] text-muted-foreground">Escolhe o resultado para guardar.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className={cn("min-h-11 text-[15px]", BORDA_CTRL)} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="button" className="min-h-11 text-[15px]" disabled={!resultado} onClick={guardar}>Guardar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Adiar: o próximo contacto passa para amanhã, daqui a 3 dias ou para a próxima semana, e a pessoa sai do Hoje até lá. */
export function Adiar({ nome, gatilho, avisar, leitura = false }: BaseProps) {
  const [aberto, setAberto] = useState(false);
  const adiar = (dias: number): void => {
    registar({ nome, tipo: "adiar", dias });
    setAberto(false);
    avisar(`${nome}: próximo contacto a ${somarDias(HOJE_FUNC, dias)}`);
  };
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
      <PopoverContent align="end" className={cn(CONTEUDO, classePortal(leitura))} {...{ [SEM_ATALHOS]: "" }} aria-label={`Adiar ${nome}`}>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-base font-semibold">Adiar o próximo contacto</legend>
          {ADIAMENTOS.map((a) => (
            <button key={a.dias} type="button" onClick={() => adiar(a.dias)} className={ESCOLHA(false)}>{a.nome} <span className="text-muted-foreground">({somarDias(HOJE_FUNC, a.dias)})</span></button>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/** Nota rápida: um texto curto que entra na Atividade e nas notas do Resumo. */
export function NotaRapida({ nome, gatilho, avisar, leitura = false }: BaseProps) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const id = useId();
  const juntar = (): void => {
    if (!texto.trim()) return;
    registar({ nome, tipo: "nota", texto: texto.trim() });
    setTexto(""); setAberto(false);
    avisar(`Nota juntada: ${nome}`);
  };
  return (
    <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setTexto(""); }}>
      <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
      <PopoverContent align="end" className={cn(CONTEUDO, classePortal(leitura))} {...{ [SEM_ATALHOS]: "" }} aria-label={`Nota sobre ${nome}`}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); juntar(); }}>
          <label htmlFor={id} className="text-base font-semibold">Nota rápida</label>
          <input id={id} type="text" value={texto} maxLength={140} onChange={(e) => setTexto(e.target.value)}
            className={cn("h-11 rounded-md border bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", BORDA_CTRL)} />
          <div className="flex justify-end">
            <Button type="submit" variant="outline" className={cn("min-h-11 text-[15px]", BORDA_CTRL)} disabled={!texto.trim()}>Juntar nota</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
