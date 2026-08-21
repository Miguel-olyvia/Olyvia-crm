# Ativar a integração Stripe — checklist

Todo o código (migration `20261112420000_stripe_checkout_readiness.sql`,
`_shared/stripe.ts`, `stripe-create-checkout-session`, `stripe-webhook`) já
está pronto e à espera. Até estes passos serem feitos, a aplicação continua
a funcionar exatamente como hoje (fatura manual `status='pendente'`) — não
há nenhum "big bang".

1. **Conta/produto Stripe** — se ainda não existir, criar a conta Stripe da
   empresa (modo `test` primeiro, depois `live`).

2. **Configurar a chave secreta**:
   ```
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... (ou sk_live_...)
   ```
   A partir deste momento, `isStripeConfigured()` passa a `true` e
   `stripe-create-checkout-session` deixa de usar o modo manual — usa
   sempre Stripe Checkout a partir daqui. `stripe-webhook` continua
   bloqueado (400) até o passo 5.

3. **Deploy da função `stripe-webhook`** e copiar o URL gerado
   (`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`).

4. **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
   - Colar o URL do passo 3.
   - Selecionar os eventos:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`

5. **Copiar o "Signing secret"** gerado pelo Stripe para este endpoint
   (`whsec_...`) e configurar:
   ```
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   Só a partir deste momento `stripe-webhook` passa a aceitar e processar
   pedidos — sem este secret, rejeita tudo com 400 (comportamento seguro
   por omissão).

6. **Configurar o domínio de produção** (usado nos `success_url`/
   `cancel_url` do Checkout):
   ```
   supabase secrets set APP_URL=https://<domínio de produção>
   ```
   Sem isto, cai no fallback já usado noutras funções (`SITE_URL`) e depois
   no domínio de produção conhecido — mas definir `APP_URL` explicitamente
   é o caminho documentado.

7. **Preencher os preços em falta** em `plan_pricing` (só `starter=79€` vem
   pré-preenchido). Sem isto, o upgrade para `pro`/`enterprise` via Stripe
   devolve `{ error: "plan_pricing_not_configured" }` em vez de avançar:
   ```sql
   UPDATE plan_pricing SET price_eur = ..., updated_at = now() WHERE plan = 'pro';
   UPDATE plan_pricing SET price_eur = ..., updated_at = now() WHERE plan = 'enterprise';
   ```

8. **(Opcional)** Criar Products/Prices reais no Stripe Dashboard e
   preencher `ai_credit_packages.stripe_price_id` / `plan_pricing.stripe_price_id`
   com os respetivos Price IDs (`price_...`). Só necessário se quiser preços
   fixos geridos no Stripe Dashboard em vez do `price_data` inline calculado
   a partir de `price_sale`/`price_eur` — ambos funcionam sem esta etapa.
