// O Recursos Humanos no protótipo: os ecrãs de RH de exemplo (src/pages/rh-exemplo, vindos do ramo feature/rh-pessoas com dados em memória e sem
// base de dados) dentro da moldura do protótipo. Um MemoryRouter próprio, com as mesmas rotas lazy do CRM mas sem sessão nem permissões, faz com
// que as ligações e navegações dos ecrãs (/rh-exemplo/...) continuem a funcionar sem os alterar e sem mexer no endereço do navegador.
// É só protótipo com dados de teste: nada daqui fala com a base. Repor a demonstração chama esquecerRh() (loja.ts).
import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { MemoryRouter, Navigate, Route, Routes, UNSAFE_LocationContext, UNSAFE_RouteContext, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ABAS_RH, CAMINHO_DE, TITULO_RH, abaDeCaminho, idioma, type AbaRh } from "./abas";
import { garantirTecnicosNoRh } from "../equipa/pontes";
import type { EquipaCtx } from "../equipa/ctx";
import { ExtensoesFichaRh } from "@/components/rh-exemplo/ficha/extensoesFicha";

// 22/10: a agenda da equipa (ecrã do protótipo, com o Estado dele) e o bloco "Obra" que entra na ficha das pessoas que são técnicos de obra
const AgendaEquipa = lazy(() => import("../equipa/AgendaEquipa"));
const BlocoObraPessoa = lazy(() => import("../equipa/BlocoObraPessoa"));

const PessoasRh = lazy(() => import("@/pages/rh-exemplo/PessoasRh"));
const PessoaRhDetalhe = lazy(() => import("@/pages/rh-exemplo/PessoaRhDetalhe"));
const RhAssiduidadeEAusencias = lazy(() => import("@/pages/rh-exemplo/RhAssiduidadeEAusencias"));
const RhMinhasAusencias = lazy(() => import("@/pages/rh-exemplo/RhMinhasAusencias"));
const RhMeuPonto = lazy(() => import("@/pages/rh-exemplo/RhMeuPonto"));
const RhMeusDocumentos = lazy(() => import("@/pages/rh-exemplo/RhMeusDocumentos"));
const RhCentrosTrabalho = lazy(() => import("@/pages/rh-exemplo/RhCentrosTrabalho"));
const RhOrganizacao = lazy(() => import("@/pages/rh-exemplo/RhOrganizacao"));
const RhModelosDocumentos = lazy(() => import("@/pages/rh-exemplo/RhModelosDocumentos"));
const RhProcessamentoSalarial = lazy(() => import("@/pages/rh-exemplo/RhProcessamentoSalarial"));
const RhConfiguracaoAdmissao = lazy(() => import("@/pages/rh-exemplo/RhConfiguracaoAdmissao"));
const RhCustos = lazy(() => import("@/pages/rh-exemplo/RhCustos"));
const RhRegrasFimContrato = lazy(() => import("@/pages/rh-exemplo/RhRegrasFimContrato"));
const RhConviteAdmissao = lazy(() => import("@/pages/rh-exemplo/RhConviteAdmissao"));
const RhPortalColaborador = lazy(() => import("@/pages/rh-exemplo/RhPortalColaborador"));
const RhAdmissaoIndice = lazy(() => import("@/pages/rh-exemplo/RhAdmissaoIndice"));
const RhMinhasDenuncias = lazy(() => import("@/pages/rh-exemplo/RhMinhasDenuncias"));
const RhDenuncias = lazy(() => import("@/pages/rh-exemplo/RhDenuncias"));

// No App o protótipo já vive dentro do BrowserRouter e de uma rota; o react-router recusa um Router dentro de outro. Este isolamento
// repõe os contextos de localização e de rota ao valor de origem (fora de qualquer router) para o MemoryRouter próprio do RH poder montar.
const SEM_ROTA = { outlet: null, matches: [], isDataRoute: false } as const;
function IsolaRouter({ children }: { children: ReactNode }) {
  return (
    <UNSAFE_LocationContext.Provider value={null as never}>
      <UNSAFE_RouteContext.Provider value={SEM_ROTA}>{children}</UNSAFE_RouteContext.Provider>
    </UNSAFE_LocationContext.Provider>
  );
}

const A_ABRIR:Record<"pt" | "en", string> = { pt: "A abrir os Recursos Humanos…", en: "Opening Human Resources…" };

/** Quando um ecrã navega para outro (por exemplo da lista à Organização), o menu do protótipo acompanha. */
function SincronizaMenu({ aba, aoMudarAba, origemInterna }: { aba: AbaRh; aoMudarAba?: (a: AbaRh) => void; origemInterna: { current: AbaRh } }) {
  const { pathname } = useLocation();
  useEffect(() => {
    const nova = abaDeCaminho(pathname);
    if (nova && nova !== aba) { origemInterna.current = nova; aoMudarAba?.(nova); } // marca que a mudança veio do router: não o recomeçar
  }, [pathname, aba, aoMudarAba, origemInterna]);
  return null;
}

/** 22/10: os ecrãs da equipa (equipa/): mostram-se direto, sem o router interno, e precisam do Estado do protótipo (`equipa`). */
const ECRAS_EQUIPA: Partial<Record<AbaRh, true>> = { agenda: true };
const SEM_ESTADO: Record<"pt" | "en", string> = {
  pt: "Este ecrã precisa dos negócios e das obras do protótipo: abra-o pelo menu Recursos Humanos do protótipo.",
  en: "This screen needs the prototype's deals and works: open it from the prototype's Human Resources menu.",
};

interface Props { aba: AbaRh; aoMudarAba?: (a: AbaRh) => void; /** 22/10: o Estado e as ações do protótipo, para a Agenda e o bloco "Obra" da ficha dos técnicos. */ equipa?: EquipaCtx }
export default function RhPagina({ aba, aoMudarAba, equipa }: Props) {
  const lg = idioma(); // lida a cada render (o resto do protótipo faz o mesmo); se a língua mudar com o RH aberto, muda no render seguinte
  // 22/10: os técnicos de obra são pessoas do RH de exemplo: juntam-se ao store (só as que faltam; sem mudança não avisa ninguém)
  garantirTecnicosNoRh();
  // O router interno só recomeça quando a aba muda por escolha no menu. Quando é o próprio ecrã a navegar para outra aba (a pessoa da
  // Organização, ?tab=...), o destino exacto mantém-se: SincronizaMenu regista a aba de origem interna e aqui não se muda a chave.
  const origemInterna = useRef<AbaRh>(aba);
  const abaAnterior = useRef<AbaRh>(aba);
  const geracao = useRef(0);
  // 22/10: a Agenda abre a ficha de uma pessoa: o router interno recomeça nesse caminho (/rh-exemplo/pessoas/:id) em vez do da aba
  const destino = useRef<string | null>(null);
  const entrada = useRef<string>(CAMINHO_DE[aba]);
  if (aba !== abaAnterior.current) {
    abaAnterior.current = aba;
    if (aba !== origemInterna.current) { geracao.current += 1; entrada.current = destino.current ?? CAMINHO_DE[aba]; }
    destino.current = null;
    origemInterna.current = aba;
  }
  const abrirPessoa = aoMudarAba ? (pid: string) => { destino.current = `/rh-exemplo/pessoas/${encodeURIComponent(pid)}`; aoMudarAba("pessoas"); } : undefined;
  // 22/10: o bloco "Obra" na Visão geral da ficha (só aparece nas pessoas que são técnicos de obra; sem o Estado do protótipo, nada)
  const blocosFicha = equipa
    ? (pid: string) => <Suspense fallback={null}><BlocoObraPessoa pessoaId={pid} S={equipa.S} A={equipa.A} run={equipa.run} irObra={equipa.irObra} /></Suspense>
    : null;
  return (
    <LanguageProvider>
      <section id="rh-painel" aria-label={TITULO_RH[lg]} className="mx-auto w-full max-w-7xl px-4 pb-10 pt-6 sm:px-8">
        {/* O leitor de ecrã ouve a troca de ecrã; o foco fica no menu, onde o utilizador de teclado está. */}
        <p data-testid="rh-anuncio" role="status" aria-live="polite" className="sr-only">{ABAS_RH.find((a) => a.k === aba)?.rotulo[lg]}</p>
        {ECRAS_EQUIPA[aba] ? (
          <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">{A_ABRIR[lg]}</p>}>
            {!equipa ? (
              <div><h1 className="text-2xl font-semibold tracking-tight">{ABAS_RH.find((a) => a.k === aba)?.rotulo[lg]}</h1><p className="mt-2 text-[15px] text-muted-foreground">{SEM_ESTADO[lg]}</p></div>
            ) : <AgendaEquipa {...equipa} aoAbrirPessoa={abrirPessoa} />}
          </Suspense>
        ) : (
        /* key: trocar de aba no menu recomeça o router interno no caminho dessa aba */
        <ExtensoesFichaRh value={blocosFicha}><IsolaRouter><MemoryRouter key={geracao.current} initialEntries={[entrada.current]}>
          <SincronizaMenu aba={aba} aoMudarAba={aoMudarAba} origemInterna={origemInterna} />
          <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">{A_ABRIR[lg]}</p>}>
            <Routes>
              <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
              <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
              <Route path="/rh-exemplo/assiduidade-e-ausencias" element={<RhAssiduidadeEAusencias />} />
              <Route path="/rh-exemplo/ausencias" element={<RhMinhasAusencias />} />
              <Route path="/rh-exemplo/assiduidade" element={<RhMeuPonto />} />
              <Route path="/rh-exemplo/documentos" element={<RhMeusDocumentos />} />
              <Route path="/rh-exemplo/centros" element={<RhCentrosTrabalho />} />
              <Route path="/rh-exemplo/organizacao" element={<RhOrganizacao />} />
              <Route path="/rh-exemplo/documentos/modelos" element={<RhModelosDocumentos />} />
              <Route path="/rh-exemplo/processamento-salarial" element={<RhProcessamentoSalarial />} />
              <Route path="/rh-exemplo/minhas-horas-extra" element={<Navigate to="/rh-exemplo/assiduidade?aba=horas-extra" replace />} />
              <Route path="/rh-exemplo/custos" element={<RhCustos />} />
              <Route path="/rh-exemplo/admissao" element={<RhAdmissaoIndice />} />
              <Route path="/rh-exemplo/admissao/configuracao" element={<RhConfiguracaoAdmissao />} />
              <Route path="/rh-exemplo/contratos/configuracao" element={<RhRegrasFimContrato />} />
              <Route path="/rh-exemplo/denunciar" element={<Navigate to="/rh-exemplo/minhas-denuncias?nova=1" replace />} />
              <Route path="/rh-exemplo/minhas-denuncias" element={<RhMinhasDenuncias />} />
              <Route path="/rh-exemplo/denuncias" element={<RhDenuncias />} />
              <Route path="/rh-exemplo/admissao/:token" element={<RhConviteAdmissao />} />
              <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
              <Route path="*" element={<Navigate to="/rh-exemplo/pessoas" replace />} />
            </Routes>
          </Suspense>
        </MemoryRouter></IsolaRouter></ExtensoesFichaRh>
        )}
      </section>
    </LanguageProvider>
  );
}
