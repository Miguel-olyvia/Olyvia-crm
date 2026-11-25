# Os agentes da Olyvia no servidor

Estado a 25 de novembro de 2026. É a etapa 3b do plano «Obra Viva».

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

## O que tens de fazer

| # | Passo | Onde |
|---|---|---|
| 1 | Criar a conta robô «Olyvia (agentes)» | Abaixo |
| 2 | Colar a migration `20270127000000_agentes_obra_servidor.sql` | Supabase › SQL Editor |
| 3 | Pôr os segredos da função | Abaixo, no terminal |
| 4 | Empacotar e publicar a função | Abaixo, no terminal, em `D:\Olyvia\wt-olyvia-voz` |
| 5 | Confirmar que corre | Abaixo |

### 1. A conta robô

1. Cria um utilizador com um email teu, por exemplo `agentes@…`, e uma palavra-passe forte. Pode ser pelo Supabase, em Authentication › Users › Add user.
2. Na Olyvia, dá-lhe acesso à organização (a Mudelar) com o **papel das Operações**, como a um colega. Tem de poder planear a obra (`negocios.obra.planear`) e ler o Catálogo e os negócios.

A conta robô só faz o que o papel das Operações deixa. Para a parar, basta tirar-lhe o acesso.

### 3. Os segredos da função

O id da organização tira-se no SQL Editor:

```sql
SELECT id, name FROM public.organizations ORDER BY name;
```

Depois, no terminal (escreves tu o email e a palavra-passe):

```
npx supabase secrets set AGENTES_EMAIL=<email da conta robô> AGENTES_PALAVRA_PASSE=<palavra-passe> AGENTES_ORGS=<id da organização> --project-ref <projeto>
```

O endereço das funções no Vault (`erp_funcoes_url`) já existe, porque a verificação do Eticadata usa o mesmo. Se faltar:

```sql
SELECT vault.create_secret('https://<projeto>.supabase.co/functions/v1/', 'erp_funcoes_url', 'Onde o pg_cron chama as funções');
```

### 4. Empacotar e publicar

```
npm run build:agentes-obra
```

```
npx supabase functions deploy agentes-obra --no-verify-jwt --project-ref <projeto>
```

O `motor.bundle.js` não vai para o git. Gera-se sempre antes de publicar, para levar o motor de agora.

### 5. Confirmar que corre

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
