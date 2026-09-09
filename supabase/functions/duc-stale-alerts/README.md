# duc-stale-alerts

Edge Function (Deno) que envia alertas de **"etapa parada"** do DUC (Documento
Único de Cliente).

Percorre todos os DUCs abertos (`status <> 'closed' AND deleted_at IS NULL`) e,
para cada um, verifica se a **etapa atual** (`current_stage`) está aberta há mais
dias do que o `notify.alertAfterDays` configurado para essa etapa em
`anew_client_duc_configs.config.stages`. Se estiver, envia **um** email de alerta
aos destinatários dessa etapa, reutilizando a função `send-email` (que resolve o
SMTP da organização).

Devolve um resumo JSON: `{ scanned, alerted, errors }`.

## Como funciona

1. Autentica como **SERVICE_ROLE** (usa `SUPABASE_SERVICE_ROLE_KEY`). Não aceita
   JWTs de utilizador — é um job interno/cron.
2. Vai buscar os DUCs não fechados e não apagados.
3. Determina há quanto tempo a etapa atual está aberta: usa a data de fecho da
   etapa **anterior** no `tracking` (`state = "done"`, campo `date`); se não
   existir, cai para o `updated_at` do DUC.
4. Lê a config da organização em `anew_client_duc_configs` para obter
   `notify.alertAfterDays` e `notify.recipients` da etapa atual.
5. Se `alertAfterDays > 0` e os dias abertos **>** `alertAfterDays`, resolve os
   emails (membros via `anew_users.email` por id + emails externos) e envia via
   `send-email` com assunto `DUC X · Etapa N parada há D dias`.

## Deploy

```bash
supabase functions deploy duc-stale-alerts
```

### Variáveis de ambiente necessárias

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas automaticamente pela
plataforma Supabase nas Edge Functions — não é preciso configurá-las
manualmente. A função usa-as para autenticar e para chamar `send-email`.

> **Precisa de deploy + agendamento manuais.** A função não corre sozinha: tem
> de ser publicada (acima) e agendada (abaixo).

## Como agendar (1x/dia)

A função tem de ser chamada por um scheduler. Duas opções:

### Opção A — pg_cron + pg_net (recomendado)

No SQL Editor do projeto (uma vez). Substitui `<PROJECT_REF>` e usa o
`service_role` key do projeto (guarda-o num secret do Vault, não em texto):

```sql
select cron.schedule(
  'duc-stale-alerts-daily',
  '0 8 * * *', -- todos os dias às 08:00 UTC
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/duc-stale-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

### Opção B — Supabase Scheduled Functions

No dashboard: **Edge Functions → Schedules → New schedule**, aponta para
`duc-stale-alerts`, cron `0 8 * * *`, com o header
`Authorization: Bearer <SERVICE_ROLE_KEY>`.

## Limitações honestas

- **Sem config de org → sem alertas.** O template base das etapas
  (incluindo `notify`/`alertAfterDays` por omissão) vive no frontend
  (`duc-app/src/lib/ducSchema.ts`) e **não** é acessível a partir da Edge
  Function. Por isso a função só alerta para organizações que tenham uma linha
  em `anew_client_duc_configs` com `config.stages` preenchido. DUCs de orgs sem
  config são simplesmente saltados.

- **Possível envio repetido diário (spam).** Não existe tabela/coluna de estado
  "last_alerted", por isso a função **não persiste** que já alertou uma etapa.
  Se agendada 1x/dia, uma etapa parada gera **um alerta por dia** enquanto
  continuar parada. Dentro de uma execução há dedup (no máximo um email por DUC,
  já que só há uma etapa atual por DUC). Para evitar o alerta diário repetido,
  proposta (fora do âmbito desta função — **não** altera o schema aqui):
  - adicionar coluna `tracking[].last_alerted_at timestamptz` (ou uma tabela
    `anew_client_duc_alerts (duc_id, stage_no, alerted_at)`), e antes de enviar
    verificar `alerted_at` do dia; ou
  - só enviar quando `daysOpen == alertAfterDays + 1` (alerta único no primeiro
    dia após ultrapassar o prazo) — mais simples mas frágil a atrasos do cron.

- **Aproximação da data de abertura da etapa.** Usa a data de fecho da etapa
  anterior no `tracking`; se a etapa anterior não estiver marcada como `done`
  com `date`, usa `updated_at` do DUC, que muda a cada gravação e pode
  subestimar os dias parados.

- **Erros por-DUC não abortam a execução.** Falhas individuais (email, config,
  resolução de destinatários) são registadas em `errors[]` no resumo e a função
  continua para os restantes DUCs.
