# Verificação automática do pagamento no Eticadata

Estado a 12 de novembro de 2026.

O Financeiro emite a fatura no Eticadata e escreve o número na Olyvia (por exemplo `FAT 15200126/538`).
A partir daí, **o servidor verifica sozinho, de 10 em 10 minutos**, se a fatura já foi paga.
Não é preciso ninguém ter o negócio aberto.

Quando a fatura está paga no ERP (falta menos de 1 €):

- o pagamento fica validado, com o recibo do ERP (`REC …`);
- o passo Pagamento fica com a data, o valor e o comprovativo do ERP;
- o histórico do negócio diz «Pagamento confirmado no Eticadata · … (verificação automática)»;
- com a 1.ª prestação, o negócio passa a Obra. Com o plano aprovado, sai a encomenda de cliente.

É a mesma regra do botão «Verificar no ERP». Com o NIF da fatura no ERP diferente do NIF de faturação do negócio,
**não se valida sozinha**: fica um aviso no histórico e o Financeiro valida à mão.

## Como funciona

```
pg_cron (10 em 10 min)
  → fn_erp_verificar_agendado()                 só chama se houver faturas por pagar
  → Edge Function erp-verificar-pagamentos      token do Vault, sem sessão
  → ponte do Eticadata (GET /fatura?numero=…)   na rede da empresa, só leitura, por túnel
  → neg_erp_registar_leitura(fatura, leitura)   grava a leitura e, paga, valida o pagamento
```

- Lê no máximo 60 faturas por volta, as lidas há mais tempo primeiro, com uma pausa entre leituras.
- Se a ponte falhar, a volta para e tenta-se outra vez 10 minutos depois.
- O código está em `index.ts`, `../_shared/erpVerificar.ts` (com testes) e na migration `20270115400000_erp_verificar_pagamentos.sql`.

## O que tem de existir

| # | Peça | Onde |
|---|---|---|
| 1 | A migration `20270115400000` aplicada | Supabase › SQL Editor. Cria o segredo `erp_verificar_segredo` no Vault e o agendamento. Precisa do `pg_cron` e do `pg_net` ligados |
| 2 | O endereço das funções no Vault | Ver abaixo |
| 3 | A Edge Function publicada | `npx supabase functions deploy erp-verificar-pagamentos --no-verify-jwt --project-ref <projeto>` |
| 4 | A ponte instalada e o túnel | README da ponte (`ponte-eticadata/README.md`, em `D:\Olyvia2.0-Documentacao`) |
| 5 | Os segredos da ponte nas Edge Functions | `ERP_PONTE_URL`, `ERP_PONTE_TOKEN` e, com o Cloudflare Access, `ERP_PONTE_CF_ID` e `ERP_PONTE_CF_SECRET`. São os mesmos da `erp-fatura` |
| 6 | Opcional: `ERP_PONTE_ORGS` | As organizações cujas faturas estão na base que a ponte lê, separadas por vírgulas. Vazio: todas |

O endereço das funções (passo 2), uma vez por projeto, no SQL Editor:

```sql
SELECT vault.create_secret('https://<projeto>.supabase.co/functions/v1/', 'erp_funcoes_url',
  'Onde o pg_cron chama a erp-verificar-pagamentos');
```

## Como confirmar que está a correr

```sql
-- as voltas do agendamento
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'erp-verificar-pagamentos')
ORDER BY start_time DESC LIMIT 5;

-- o que a função respondeu (o resumo: lidas, validadas, por pagar, e porque parou)
SELECT status_code, content, created FROM net._http_response ORDER BY created DESC LIMIT 5;

-- quando cada fatura por pagar foi lida no ERP
SELECT numero, erp_pago, erp_lida_em FROM faturas WHERE estado IN ('emitida', 'parcial') ORDER BY erp_lida_em DESC NULLS LAST;
```

Sem a ponte configurada, a função responde 503 e nada muda: o pagamento valida-se à mão, como até aqui.

## Limites

- A ponte lê uma só base do ERP (`ETICADATA_BD`). Para a Mudelar é a `Emp_B004`. Outra empresa do grupo precisa da sua ponte, ou de a ponte passar a escolher a base pela organização.
- Se alguém tiver o negócio aberto com dados antigos e gravar, o histórico e o passo Pagamento podem voltar ao que o ecrã tinha. O pagamento, o recibo e a fase não se perdem: são do servidor.
