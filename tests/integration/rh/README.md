Testes de integracao do RH contra a base DEV (uetjghdkwbywbftedtth), so org nike.

Correr: definir RH_TEST_ENV_FILE (ficheiro com E2E_EMAIL e E2E_PASSWORD) e
`npm run test:integration:rh`. Sem a variavel, os testes sao saltados.
O URL e a chave publicavel vem de .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY);
se o ref do URL nao for o da dev, o teste aborta. Nunca service_role.
