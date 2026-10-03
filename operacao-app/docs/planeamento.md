# Planeamento automático — do pedido à obra planeada

> 03/10/2026. Ramo `feat/planeamento-tempos-padrao`. Origem: os manuais
> operacionais de remodelação de casa de banho e de cozinha (enviados pelo
> Hugo) e a reunião de 02/10/2026 (`docs/reuniao-2026-10-02-transcricao.md`,
> fora do git).

## O que faz, numa frase

A visita mede a área de intervenção; o orçamento vende um pacote e extras; o
contrato assinado vira obra com as tarefas do manual, os tempos dimensionados
pelas medidas, as curas e os feriados no calendário; e cada tarefa validada
ensina ao motor quanto tempo aquilo leva de facto.

## O caminho dos dados

```
CRM                                       Operações (operacao-app/db/obras.sql)
───                                       ─────────────────────────────────────
Necessidade do negócio = área             ops_obra_tarefas_do_orcamento
  diag_tipo_area, m² de pavimento,          · pacote → passos do modelo (manual)
  perímetro, altura do revestimento,        · extras → juntam-se a um passo do pacote
  pontos de água, gás, toalheiro,             ou entram entre dois passos
  janela, local dos cortes, distância,      · medidas: da área; senão, as de
  mobília, portas  (migração 20261208100000)   referência do pacote
Ficha do local (exterior + interior)      · condições (gás, toalheiro)
  habitada, acesso, elevador, andar       · fatores (casa habitada, cortes fora…)
Orçamento: linhas com source_deal_need_id · tempo aprendido, se houver
Contrato assinado ───────────────────────► ops_obra_criar_impl → plano
                                            (esperas em tempo corrido, feriados)
                                          Terminar: "quanto fizeste?" (medida real)
                                          Validar → ops_obra_ritmo_aprender
```

## As peças

| Peça | Onde |
|---|---|
| Passos com chave, vários "depois de", espera (h de relógio), medida, condição, encaixe, fatores | `ops_obra_servico_tarefa` (2c) |
| Papel do serviço: pacote de casa de banho/cozinha (+ medidas de referência), não planeia, dá medida | `ops_obra_servico_perfil` |
| Tempos padrão (pacotes completos, modelos 0–3, mudança de mobiliário, 39 extras) | `ops_obra_tempos_padrao()`, `rpc_ops_obra_semear_tempos_padrao` (6d) |
| Calendário da organização e esperas | `ops_obra_dias_uteis_lista`, `ops_obra_minuto_apos_espera` (4) |
| Ritmo aprendido e histórico | `ops_obra_ritmo`, `ops_obra_ritmo_historico`, `ops_obra_ritmo_aprender` (9b) |
| Regras espelhadas no ecrã, com testes | `src/domain/planeamento.ts` |
| Campos do diagnóstico no CRM | `src/lib/deals/diagnosticoPlaneamento.ts`, `DealNeedDiagnostic.tsx` |

### Como se aprende

Por passo de modelo, com as tarefas **validadas**: real por pessoa (sem os
minutos dos extras juntos), medida real dita ao terminar. Ficam de fora os
atrasos por razões de fora (material em falta, acesso do cliente,
meteorologia). Estimativa = (3 × padrão + Σ observado) ÷ (3 + n); absurdos
(> 4× ou < ¼ da mediana) não entram; com 5+ tarefas de tamanhos diferentes
separa o fixo do variável. Dois níveis: geral e por combinação de fatores. As
obras já criadas não mudam — o aprendido entra nas seguintes, e o passo 2 da
Nova obra mostra "padrão" ou "aprendido (n tarefas)".

## Aplicar (ordem)

1. **CRM:** `supabase/migrations/20261208100000_diagnostico_planeamento_obra.sql`
   (acaba num bloco CONFERIR).
2. **Operações:** `npm run supabase:obras` (ou correr `db/obras.sql`). Idempotente;
   `npm run validar-atualizacao` prova que dá a mesma base que instalar de novo.
3. **Uma vez, por organização:** Obras → Modelos → Serviços → **Carregar tempos
   padrão** (ou `select rpc_ops_obra_semear_tempos_padrao('<org>')`). Não pisa
   modelos revistos à mão.
4. Publicar as duas apps.

Sem o passo 1, o CRM continua a funcionar (a secção nova não aparece) e as
Operações usam as medidas de referência. Sem o passo 3, as obras nascem como
antes (modelos sugeridos ou ficha técnica).

### Estado na produção (03/10/2026)

- Passos 1 e 2 aplicados; passo 3 feito na **Mudelar**: 52 serviços, 168
  passos (8 pacotes com 119, 39 extras com 49), 3 condicionais, ofícios Gás
  (ITG), Marmorista e Logística criados. "Carregar tempos padrão" carrega na
  organização em que se está — noutra organização dá "0 serviços".
- ⚠ As duas proteções de compatibilidade (abaixo) entraram em `obras.sql`
  DEPOIS dessa aplicação: **correr `db/obras.sql` outra vez**.

### Compatibilidade com os ecrãs publicados antes

A base nova serve os ecrãs antigos sem os partir:

| Ecrã antigo | O que manda | O que a base faz |
|---|---|---|
| Terminar tarefa | 4 argumentos | `p_medida_real` tem default; a medida real fica = prevista |
| Gravar modelo de serviço | sem `chave` nem campos novos | os campos do planeamento seguem a **posição** do passo (não se apagam) |
| Nova obra, passo 2 (`p_tarefas`) | sem espera/chave/medida | vêm do passo de modelo de onde a tarefa veio |
| Pré-visualização | — | os campos novos a mais são ignorados |
| CRM, gravar necessidade | sem as chaves `diag_*` novas | ficam como estavam (`CASE WHEN ? THEN`) |

`validar-planeamento` prova as duas do meio.

## Testar o fluxo inteiro, desde a lead

1. **Lead → negócio.** Qualificar uma lead de teste e criar o negócio.
2. **Necessidade = casa de banho.** Na necessidade, aba *Diagnóstico*:
   escolher o serviço "MO Modelo Remodelação Completa - Casa de Banho Comum" e
   preencher *Para o planeamento da obra* — ex.: casa de banho, pavimento 5,
   perímetro 9, pé-direito 2,5, revestimento ao teto (mostra 22,5 m² de
   parede), 4 pontos de água, cortes fora, sem janela. Juntar os extras
   "Supressão de ponto de água" (2) e "Construção de Nicho".
3. **Morada de entrega** com a ficha do local (ex.: 3.º andar, sem elevador,
   acesso difícil, casa habitada).
4. **Orçamento** a partir do negócio (*Importar do negócio*), aceitar,
   **contrato** assinado.
5. **Operações → Nova obra → Contrato assinado → Seguinte.** Esperado:
   - 17 tarefas do pacote (sem "aquecimento", porque não há toalheiro);
   - canalização com 25 h (22 h + 2 × 1,5 h de supressões juntas);
   - azulejo com 27,5 m², marcado "padrão";
   - o nicho entre os ensaios e a impermeabilização;
   - "espera 48 h" na impermeabilização e 24 h nas juntas e na montagem;
   - nenhuma tarefa num feriado.
6. **Abrir obra**, ver o Gantt (a dica de cada barra diz o tempo e a espera).
7. **Executar:** no telemóvel, iniciar e concluir o azulejo — aparece *Quanto
   fizeste?* com 27,5 m²; pôr o que se fez de facto.
8. **Validar** como supervisor (outra pessoa).
9. **Modelos → o pacote:** o passo do azulejo mostra "aprendido: … (1 tarefa)".
10. Um segundo contrato igual: o passo 2 mostra o azulejo "aprendido (1 tarefa)".

`npm run validar-planeamento` faz os passos 5–10 numa base PGlite.

## Ainda não

- **Capacidade por ofício.** O plano continua com "vagas" genéricas (até 4);
  a distribuição é que escolhe pessoas pela especialidade. As especialidades
  ainda não têm pessoas associadas em produção.
- **Prazos de materiais** (móveis por encomenda) não condicionam o início; a
  bancada usa a espera de 5 dias do modelo.
- **Impacto da ficha no preço** (decisão em aberto da reunião) e distância ao
  armazém: fora deste trabalho.
- **Medidas e tempos de referência** são estimativas nossas, validadas pela
  equipa na folha "Planeamento - tempos padrão casa de banho e cozinha.xlsx";
  a aprendizagem corrige-os com o uso.
