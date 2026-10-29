import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { camposBase } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import { isBaseFieldCoveredByCampaignFields } from "@/hooks/pessoas/novaLead/coberturaCampanha";
import { useDadosNovaLead } from "@/hooks/pessoas/novaLead/useDadosNovaLead";
import { useNovaLead, type ConclusaoNovaLead, type EntradaNovaLead } from "@/hooks/pessoas/novaLead/useNovaLead";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { SEM_ORIGEM } from "./CampanhaOrigemNovaLead";
import { DuplicadosNovaLead } from "./DuplicadosNovaLead";
import { NovaLeadDialogo } from "./NovaLeadDialogo";

const N = "pessoasPagina.real.newLead.";

interface NovaLeadRealProps {
  /** Abre a ficha da pessoa em Pessoas (`?open=<id>`); o foco volta ao botão «Nova lead» quando a ficha fecha. */
  aoAbrirPessoa: (id: string, origem?: HTMLElement, negocioId?: string) => void;
  /** Anuncia uma mensagem na região viva da página. */
  aoAnunciar: (mensagem: string) => void;
}

/**
 * «Nova lead» no cabeçalho de Pessoas (modo real): o botão, o diálogo do formulário e o de duplicados. É o único que o `PessoasReal`
 * monta. Copia o fluxo de criar lead da página de Leads com as regras de Pessoas: email, telefone ou NIF iguais aos de uma pessoa da
 * organização bloqueiam (Abrir existente, Atualizar dados, Cancelar). Só se monta com a permissão `leads.create` (a guarda está em quem o usa).
 */
export function NovaLeadReal({ aoAbrirPessoa, aoAnunciar }: NovaLeadRealProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [formularioId, setFormularioId] = useState("");
  const [origemId, setOrigemId] = useState("");
  const [orgFiltro, setOrgFiltro] = useState("all");
  const botao = useRef<HTMLButtonElement>(null);

  const dados = useDadosNovaLead(organizationId, formularioId || null, aberto);
  // A campanha não se escolhe: é a do formulário, quando tem.
  const campanhaId = dados.campanhaId;
  const base = useMemo(() => camposBase(t), [t]);
  const baseVisivel = useMemo(
    () => base.filter((b) => !isBaseFieldCoveredByCampaignFields(b.field_key, dados.camposCampanha)),
    [base, dados.camposCampanha],
  );

  const concluir = useCallback((c: ConclusaoNovaLead) => {
    setAberto(false);
    setValores({});
    setFormularioId("");
    setOrigemId("");
    setOrgFiltro("all");
    // Com negócio (a «Nova lead» cria pessoa e negócio) a ficha abre já nele; «Abrir existente» só abre a pessoa.
    if (c.negocioId) aoAbrirPessoa(c.entityId, botao.current ?? undefined, c.negocioId);
    else aoAbrirPessoa(c.entityId, botao.current ?? undefined);
    if (c.mensagem) aoAnunciar(c.mensagem);
  }, [aoAbrirPessoa, aoAnunciar]);
  const nova = useNovaLead(concluir);
  const { reiniciar } = nova;
  // Fechar o diálogo (por Cancelar, Escape ou concluir) limpa o estado do fluxo.
  useEffect(() => {
    if (!aberto) reiniciar();
  }, [aberto, reiniciar]);

  const mudarValor = useCallback((chave: string, valor: unknown) => setValores((v) => ({ ...v, [chave]: valor })), []);
  /** O formulário de agora, ou null quando não se pode criar: sem os campos da campanha (a lead sairia sem os obrigatórios) ou sem as leituras de apoio. */
  const entradaAtual = useCallback((): EntradaNovaLead | null => {
    if (dados.erroApoio) return null;
    if (formularioId && (dados.camposACarregar || dados.camposErro)) return null;
    const origem = origemId && origemId !== SEM_ORIGEM ? dados.origens.find((o) => o.id === origemId) : undefined;
    return {
      base, campanha: dados.camposCampanha, valores, origemId: origem ? origem.id : null, origemNome: origem?.name ?? "manual", campanhaId: campanhaId || null,
    };
  }, [base, dados.camposCampanha, dados.camposACarregar, dados.camposErro, dados.erroApoio, dados.origens, valores, origemId, campanhaId, formularioId]);
  const { submeter, tentarDeNovo } = nova;
  const criar = useCallback(() => {
    const entrada = entradaAtual();
    if (entrada) void submeter(entrada);
  }, [entradaAtual, submeter]);
  // «Tentar de novo» depois de um erro ao verificar repete com o que o formulário tem agora, não com o que se enviou da primeira vez.
  const repetir = useCallback(() => {
    const entrada = entradaAtual();
    if (entrada) void tentarDeNovo(entrada);
  }, [entradaAtual, tentarDeNovo]);

  const irParaFormularios = useCallback(() => {
    // Sair daqui abandona o que já se escreveu: confirma antes de perder dados.
    const comDados = Object.values(valores).some((v) => v !== undefined && v !== null && v !== "");
    if (comDados && !window.confirm(t(`${N}campaign.confirmLeave`))) return;
    navigate("/forms");
  }, [valores, t, navigate]);

  return (
    <>
      <Button ref={botao} type="button" className={`min-h-11 gap-2 ${FOCO}`} onClick={() => setAberto(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t(`${N}open`)}
      </Button>
      <NovaLeadDialogo
        aberto={aberto} organizationId={organizationId} aoMudarAberto={setAberto} baseVisivel={baseVisivel} camposCampanha={dados.camposCampanha}
        valores={valores} errosCampo={nova.errosCampo} aoMudarValor={mudarValor} formularios={dados.formularios} formularioId={formularioId}
        aoMudarFormulario={setFormularioId} campanhaId={campanhaId} campanhaNome={dados.campanhaNome} origens={dados.origens}
        origemId={origemId} aoMudarOrigem={setOrigemId} comerciais={dados.comerciais} arvore={dados.arvore} orgFiltro={orgFiltro}
        aoMudarOrgFiltro={setOrgFiltro} aCriar={nova.aCriar && nova.duplicados === null} erro={nova.erro?.tipo === "verificar" || nova.erro?.tipo === "negocio" ? nova.erro : null}
        aoCriar={criar} aoCriarFormulario={irParaFormularios} aoTentarDeNovo={repetir}
        aoFocarOrigem={() => botao.current?.focus()} camposACarregar={dados.camposACarregar} camposErro={dados.camposErro}
        erroApoio={dados.erroApoio} aoRepetirDados={dados.repetir}
      />
      <DuplicadosNovaLead
        decisao={nova.duplicados} confirmar={nova.confirmar} aGuardar={nova.aCriar} erro={nova.erro?.tipo === "atualizar" ? nova.erro : null}
        parcial={nova.parcial} aoAbrir={nova.abrirExistente} aoAtualizar={nova.atualizar} aoConfirmar={() => void nova.confirmarAtualizar()}
        aoVoltar={nova.voltarDaConfirmacao} aoCancelar={nova.cancelarDuplicados} aoTentarDeNovo={() => void nova.tentarDeNovo()}
      />
    </>
  );
}
