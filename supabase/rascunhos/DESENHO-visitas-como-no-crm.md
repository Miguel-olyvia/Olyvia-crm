# Desenho: passo Visitas com o agendamento do CRM
Estado: so desenho, nada aplicado. Base RH (uetjgh...), nike (b6ffce4f-...). Nao confirmado por catalogo = A CONFIRMAR.

## Factos
- O CRM da ficha NAO usa horas livres (dia e hora livres). Hora livre e so recursos do board sao construcao nova.
- Nao ha ligacao board-recurso. So settings.allowed_modules do quadro.
- get_resource_available_slots so aplica feriados e dias de trabalho com p_organization_id. Regra do recurso sobrepoe o horario da org.
- Almoco nao e usado por nenhuma RPC de slots.
- Semantica do almoco: visita que TERMINA na janela (lunch_window_start a end, inclusive) exige folga de deslocacao mais lunch_duration_minutes ate a seguinte.
- neg_guardar_visita e neg_alterar_visita so validam conflito (NG010), nao horario.
- A Emylia le d.f (chaves vN_) e d.vis nos gates (fecharVisita, extrasVisita, visitaFeita).
- Fora de PessoasRota o FontePessoasContext esta em modo exemplo e os hooks nao leem nem gravam.

## Fonte unica
A visita real e o schedule_item de neg_guardar_visita com p_negocio_id.
O passo le, mostra, conta e age so sobre o CRM (feito = alguma nao cancelada ou feita). Em d.f e d.vis fica um ESPELHO DERIVADO, escrito so pelo nosso componente apos gravar no CRM, nunca editado. Se discordar, o CRM ganha.
Visitas antigas so da Emylia: so leitura.

## Criar (src/components/pessoas/negocioEmylia/ e src/hooks/pessoas/)
- VisitasDoCrm.tsx: corpo do passo, com FontePessoasContext.Provider real local.
- MarcarVisitaNegocio.tsx: tipo, quadro, quem vai, dia, hora, duracao.
- HorasLivresVisita.tsx: botoes de horas livres.
- visitasDosPassos.tsx: comVisitasDoCrm(passos, c) para os ids visitas e vaga.
- espelhoVisitaEmylia.ts: schedule_item para vN_* e d.vis.
- useHorarioOrganizacao.ts: schedule_settings e schedule_holidays.
- useHorasLivresVisita.ts e horasLivresVisita.ts: RPC por recurso com p_organization_id, intersecao, filtro de cliente.
- useVisitasDoNegocio.ts: schedule_items por organization_id e negocio_id.
- tipoVisitaChave.ts: rotulo para levantamento, medicao, materiais, revisita.

## Alterar
- CamposAgendaVisita.tsx e SeletorRecursosVisita.tsx: props opcionais (omissao igual a hoje).
- pages/NegociosEmylia.tsx: 1 a 2 linhas no ajustarPassos existente (reler antes do Edit).
- NegocioEmyliaDoGuia.tsx: idem. VisitaDaEmylia.tsx: encadear comVisitasDoCrm e trocar o botao Comecar a visita.
- src/emylia/NegocioSimples.tsx: sem alteracao prevista.

## Fluxo
Primeira visita: neg_guardar_visita primeiro, depois A.marcarVisita com slot da hora real, depois o espelho corrige a data em ISO. Se o gate CONTACTO falhar, a visita fica no CRM e o ecra explica.
Revisita: mesmo formulario com tipo revisita. Cancelar: neg_cancelar_visita e espelho. Resultado: neg_resultado_visita. Voltar a visita e desistirVisita sao so movimentos de fase, nao tocam em visitas.

## Horario da org
Cliente: p_organization_id sempre, cortar fora de working_hours, dias fora de working_days e feriados, almoco por check_schedule_conflict(fim, fim mais duracao) nas horas que terminam na janela. Remarcar: hora atual selecionavel.
Servidor: rascunho NOVO-N_visitas_horario_da_org.sql com guarda nas duas RPCs. Medir na nike antes de push. Funcoes partilhadas com a Mudelar.

## Nike sem dados
Sem quadro, sem recurso, sem schedule_settings (usar omissao e dizer): mensagem honesta, Gravar desativado, nada inventado. Erros visiveis.

## DECISOES
1. Quem vai sem ligacao ao board: A filtrar por resource_type user com user_id (recomendado) ou B criar ligacao.
2. Visitas antigas so da Emylia: A so leitura (recomendado) ou B migrar.
3. Estado Feita: A manda o CRM (recomendado) ou B Feita automatico da Emylia.
4. Rascunho de guarda de horario nas RPCs partilhadas: sim como rascunho (recomendado), aplicar so com autorizacao.
