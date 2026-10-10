// A ficha de uma pessoa (coluna da direita no computador, ecrã inteiro no telemóvel): cabeçalho e cinco separadores.
import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { proximoDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { perfilDe } from "./perfilDocs";
import { FichaCabecalho } from "./FichaCabecalho";
import { FichaResumo } from "./FichaResumo";
import { SepAtividade, SepDocumentos, SepEntradas } from "./FichaListas";
import { SepNegocios } from "./SepNegocios";
import { fazer, type Ctx } from "./pecas";

export type SepFicha = "resumo" | "negocios" | "entradas" | "atividade" | "contratos";
const SEP_BASE: { id: SepFicha; nome: string }[] = [
  { id: "resumo", nome: "Resumo" }, { id: "negocios", nome: "Negócios" }, { id: "entradas", nome: "Entradas" }, { id: "atividade", nome: "Atividade" },
];
/** Os clientes têm cinco separadores (mais os contratos e documentos); as leads, quatro. */
export const separadoresDe = (papel: PessoaApp["papel"]): { id: SepFicha; nome: string }[] =>
  papel === "cliente" ? [...SEP_BASE, { id: "contratos", nome: "Contratos e documentos" }] : SEP_BASE;

export interface FichaProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  voltar: () => void;
  sep: SepFicha;
  aoMudarSep: (s: SepFicha) => void;
}

export function PessoaFicha({ S, A, go, p, voltar, sep, aoMudarSep }: FichaProps) {
  const f = perfilDe(p, S), d = p.principal, nx = proximoDe(p, S);
  const separadores = separadoresDe(p.papel), ativo = separadores.some((s) => s.id === sep) ? sep : "resumo";
  const abrir = (id: number) => go(() => A.abrir(id));
  // No telemóvel a ficha ocupa o ecrã: o foco vai para o nome, que anuncia a pessoa. No computador a lista mantém o foco.
  const nome = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 1024px)").matches) nome.current?.focus();
  }, []);
  return (
    <article className="min-w-0 max-w-full px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
      <button type="button" onClick={go(() => { A.perderNao(); voltar(); })}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar às pessoas
      </button>
      <FichaCabecalho p={p} f={f} nx={nx} nomeRef={nome} aoProximo={go(() => (nx.act ? fazer(A, nx.act, d.id) : A.abrir(d.id)))} />

      <Tabs value={ativo} onValueChange={(v) => aoMudarSep(v as SepFicha)} className="mt-6 min-w-0">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1" aria-label={p.papel === "cliente" ? "Ficha do cliente" : "Ficha da lead"}>
          {separadores.map(({ id, nome }) => (
            <TabsTrigger key={id} value={id} className="min-h-11 cursor-pointer px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background">{nome}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="resumo" className="mt-5"><FichaResumo S={S} A={A} go={go} p={p} f={f} voltar={voltar} /></TabsContent>
        <TabsContent value="negocios" className="mt-5"><SepNegocios S={S} p={p} abrir={abrir} /></TabsContent>
        <TabsContent value="entradas" className="mt-5"><SepEntradas S={S} p={p} /></TabsContent>
        <TabsContent value="atividade" className="mt-5"><SepAtividade S={S} p={p} f={f} /></TabsContent>
        {p.papel === "cliente" && <TabsContent value="contratos" className="mt-5"><SepDocumentos S={S} p={p} abrir={abrir} /></TabsContent>}
      </Tabs>
    </article>
  );
}
