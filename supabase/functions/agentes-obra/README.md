# Os agentes da Olyvia no servidor

Estado a 25 de novembro de 2026. É a etapa 3b do plano «Obra Viva».

**No ar na testarh (uetjgh) desde 25 de novembro, 21h32**: migration aplicada, função publicada pelo painel, segredos postos,
conta `Olyvia (agentes)` criada com o papel «Supervisor de obra» na Mudelar. A obra OB-1048 tem os agentes do Plano e da Equipa
em «pede» (o plano está em validação).

Os agentes já vigiam as obras quando alguém das Operações tem a Olyvia aberta (etapa 3a).
Com isto, **vigiam também com a Olyvia fechada**, de 15 em 15 minutos.

Em cada volta, e para cada obra em curso ou aprovada:

- as propostas novas ficam vistas (o prazo do degrau 2 começa a contar aí);
- as que chegaram ao prazo aplicam-se, pelas mesmas regras e com o mesmo histórico e desfazer da fita;
- só se grava a obra que mudou, e só se ninguém lhe mexeu entretanto (senão fica para a volta seguinte);
- **nada vai para o cliente**: os rascunhos do Agente do Cliente ficam à espera de quem carrega em enviar.

## Como funciona

```
pg_cron (15 em 15 min)
  → fn_agentes_agendado()                 token do Vault ('agentes_segredo')
  → Edge Function agentes-obra            confere o token e entra com a conta robô
  → correrAgentesServidor (motor.bundle)  as mesmas leituras e a mesma volta da página dos Negócios
  → obra_guardar_negocio                  com as permissões da conta robô
```

O motor é o da app, empacotado para o servidor. O código está em `src/emylia/estudioObra/agentesServidor.ts`,
`VigiaAgentes.tsx`, `agentes.ts`, e nesta pasta (`index.ts`, `entrada.ts`, `clienteServidor.ts`).

## O que é preciso

| # | Passo | Onde |
|---|---|---|
| 1 | Colar a migration `20270127000000_agentes_obra_servidor.sql` | Supabase › SQL Editor |
| 2 | Empacotar e publicar a função (sem verificação de JWT) | Abaixo |
| 3 | Pôr os segredos da função | Supabase › Edge Functions › Secrets |
| 4 | Confirmar que corre | Abaixo |

### A conta robô, sem palavra-passe

Ninguém cria a conta à mão nem escolhe uma palavra-passe. Na primeira volta, a função (`contaRobo.ts`):

1. cria a conta `AGENTES_EMAIL` (por omissão `agentes.olyvia@example.com`) sem palavra-passe, já confirmada, sem enviar email;
2. dá-lhe o papel `AGENTES_PAPEL` em cada organização de `AGENTES_ORGS`, pela mesma função da app
   (`rpc_finalize_user_profile_full`), em nome de `AGENTES_ATOR` (o id em `anew_users` de quem pode criar utilizadores).

Em cada volta, a sessão gera-se ali mesmo com a chave de serviço (um link de entrada de uso único que nunca sai da função).
A conta só faz o que o papel deixa. Para a parar, tira-se-lhe o acesso na Olyvia, ou pára-se o agendamento (abaixo).

### Os segredos da função

| Segredo | O quê |
|---|---|
| `AGENTES_ORGS` | o id da organização (vários, separados por vírgulas) |
| `AGENTES_PAPEL` | o id do papel da conta robô (o «Supervisor de obra»: planear a obra, ler o Catálogo e os negócios) |
| `AGENTES_ATOR` | o id em `anew_users` de quem autoriza a conta: tem de criar utilizadores **e ver a organização** (um administrador dela) |
| `AGENTES_EMAIL` | opcional; por omissão `agentes.olyvia@example.com` |

```sql
SELECT id, name FROM public.anew_organizations ORDER BY name;
SELECT id, name, code FROM public.anew_roles WHERE code = 'supervisor_de_obra';
```

O endereço das funções no Vault (`erp_funcoes_url`) já existe, porque a verificação do Eticadata usa o mesmo. Se faltar:

```sql
SELECT vault.create_secret('https://<projeto>.supabase.co/functions/v1/', 'erp_funcoes_url', 'Onde o pg_cron chama as funções');
```

### Empacotar e publicar

```
npm run build:agentes-obra
```

```
npx supabase functions deploy agentes-obra --no-verify-jwt --project-ref <projeto>
```

Sem o CLI, publica-se pelo painel (Edge Functions › Deploy a new function) com `index.ts`, `contaRobo.ts` e `motor.bundle.js`, e a verificação de JWT desligada.

O `motor.bundle.js` não vai para o git. Gera-se sempre antes de publicar, para levar o motor de agora.

### Confirmar que corre

```sql
-- correr uma volta já, sem esperar pelos 15 minutos
SELECT public.fn_agentes_agendado();

-- a resposta da função (o resumo da volta: obras, aplicadas, gravadas, adiadas, erros)
SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 3;

-- as voltas do agendamento
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'agentes-obra') ORDER BY start_time DESC LIMIT 5;
```

Para parar os agentes no servidor: `SELECT cron.unschedule('agentes-obra');`.
