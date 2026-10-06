# Capacidade — vamos ter gente para o que aí vem?

> Feito a 06/10/2026 (ramo `feat/ops-capacidade`). Ecrã **Trabalho → Capacidade**
> (`/operacao/capacidade`), só para gestor/admin.

## O que mostra

Um mapa **especialidade × semana** (12 semanas a partir desta) com a
**ocupação** = procura ÷ oferta, e um semáforo:

| Ocupação | Estado |
|---|---|
| até 85 % | Folga |
| 85–100 % | Apertado |
| acima de 100 % | Falta gente — "+N pess." = pessoas a mais nessa semana |
| oferta 0 com trabalho | Ninguém com a especialidade |

Por cima, as frases do que pede atenção ("Faltam ~2 pessoas de Canalização na
semana de 10/11"). Um clique numa semana mostra **de onde vem o trabalho**:
cada obra (com link), contrato, orçamento aceite ou proposta, com a certeza e
as horas.

Dois modos:

- **Com o comercial** — obras + contratos + orçamentos aceites (× 90 %) +
  propostas enviadas (× a probabilidade);
- **Só o certo** — obras e contratos assinados.

## Como se calcula (`db/capacidade.sql`)

**Oferta** — por pessoa ativa da equipa (técnico ou operador) com
especialidades: dias úteis da semana (sem feriados da organização nem
ausências aprovadas — `resource_time_off` da agenda e, quando estiver em
produção, `pessoas_ausencias_dias` do RH) × horas por dia do horário dela
(`ops_horario.horas_dia`, senão 8 h) ÷ o número de especialidades dela. Quem
faz três ofícios conta um terço em cada: a mesma hora não se conta três vezes.
A semana atual só conta de hoje em diante.

**Procura** (pessoa × minuto, como os tempos das tarefas):

1. **Obras planeadas / em curso** — tarefas por fazer, rejeitadas e em curso
   (destas, o que falta: previsto − real, no mínimo 25 %), repartidas pelos
   dias úteis entre o início e o fim planeados. O que devia ter acabado e não
   acabou cai hoje ("atrasado").
2. **Contratos assinados sem obra** (início ≥ hoje − 30 dias, ou sem data) —
   expandidos pelo mesmo motor da Nova obra (`ops_obra_tarefas_do_orcamento`:
   modelos dos serviços, medidas, pacotes). Começam na data de início do
   contrato, nunca antes de hoje + 7. 100 %.
3. **Orçamentos aceites sem contrato nem obra** (últimos 120 dias, um por
   proposta) — 90 %, começam 30 dias depois de aceites (nunca antes de
   hoje + 14).
4. **Orçamentos enviados** (últimos 60 dias, um por proposta/negócio — o mais
   recente; sem propostas rejeitadas ou já aceites) — × a probabilidade da
   proposta, senão a do negócio, senão 50 %. Começam 21 dias depois da data
   prevista de fecho do negócio, senão 45 dias depois de enviados (nunca
   antes de hoje + 14). Os 150 mais recentes.

Para 2–4: a duração é a do trabalho com **uma equipa de 2 pessoas, 8 h/dia**
(no mínimo 5 dias úteis), e as **fases seguem-se pela ordem** (demolições,
instalações, acabamentos, limpeza), cada uma com a parte dos dias
proporcional ao seu tempo.

**Faltam N pessoas** = ⌈(procura − oferta) ÷ (dias úteis da semana × 480)⌉.

## Desempenho

O Supabase corta os pedidos do ecrã aos **8 s**. Por isso:

- o resultado fica em **cache 6 horas** por organização
  (`ops_capacidade_cache`, só acessível pela RPC); "Recalcular" força;
- no ecrã, a expansão dos orçamentos tem **4 s**: o que ficar por expandir
  aparece como "N por calcular" (contratos primeiro, depois aceites, depois
  propostas pela probabilidade);
- o **pg_cron** `ops-capacidade` recalcula de 3 em 3 horas as organizações que
  já abriram o ecrã, sem limite de tempo — quem abre a seguir tem a resposta
  logo.

## Aplicar

```
… → obras.sql → capacidade.sql
```

Idempotente. Só lê o CRM. Prova local: `npm run validar-capacidade`.

## Limites conhecidos

- A probabilidade no CRM está quase sempre nos 50 % por defeito: enquanto o
  comercial não a mexer, as propostas contam metade.
- O comercial não sabe quem vai fazer: usa uma equipa genérica de 2 pessoas.
- Os dados da Mudelar a 06/10: as especialidades da equipa real ainda não
  estão atribuídas (só a equipa de demonstração tem), por isso a oferta real
  é quase zero — o mapa vai dizer "Ninguém com a especialidade" até isso
  estar feito.
- Subempreiteiros ainda não entram na oferta (decisão em aberto).
