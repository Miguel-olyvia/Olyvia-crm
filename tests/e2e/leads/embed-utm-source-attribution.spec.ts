import { test, expect } from '@playwright/test'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * End-to-end proof: does the lead's origin (Instagram vs Facebook vs organic)
 * reach the database automatically when a client site uses the RECOMMENDED
 * Olyvia embed snippet (`/embed/olyvia-form.js`)? And does a form with NO
 * campaign still create a lead instead of silently 400ing?
 *
 * The snippet is the only one of the three offered in FormIntegrationsTab that
 * forwards the host page's UTMs and `document.referrer` into the iframe.
 *
 * Reads/writes ONLY the `nike` organization. Every DB assertion re-checks
 * `organization_id` and the spec fails loudly if anything else shows up.
 *
 * Origin simulation is a REAL cross-origin browser navigation, never
 * `extraHTTPHeaders`. For the "organic click, no UTMs" scenarios we need the
 * Referer header to carry a domain the app actually recognises (instagram.com,
 * facebook.com, ...) — nobody owns those domains in a test environment, so
 * this uses Playwright's `page.route()` to fulfil the *content* of
 * http://www.instagram.com / http://www.facebook.com / an unknown throwaway
 * domain locally, without ever touching a real network. This does NOT fake
 * the Referer header: that header is still generated entirely by Chromium's
 * own default referrer policy (strict-origin-when-cross-origin) when it
 * navigates from that origin to the client site's real origin on another
 * port, exactly like a real click would produce.
 *
 * The mocked social origins are `http://` (not `https://`) on purpose: the
 * client-site fixtures can only be served over plain HTTP locally, and under
 * the default `strict-origin-when-cross-origin` policy Chromium correctly
 * DROPS the Referer on an HTTPS→HTTP downgrade (measured: `document.referrer`
 * came back empty). Keeping both sides on the same scheme lets the browser
 * emit the header on its own — the alternative (forcing it with
 * `extraHTTPHeaders`) would prove nothing. In production both sides are HTTPS
 * and the same header is sent.
 *
 * ## Which `create-lead` is under test
 *
 * Controlled by LOCAL_CREATE_LEAD_URL:
 *
 *  - Pointed at the DEPLOYED function
 *    (`https://<ref>.supabase.co/functions/v1/create-lead`) - the default mode
 *    of proof - no network interception is installed at all: the browser's own
 *    `POST .../functions/v1/create-lead`, carrying the `apikey`/`Authorization`
 *    headers the app itself attaches, travels straight to the published edge
 *    function. Re-fetching it through `route.fetch()` would only add a hop and
 *    a chance to lose those headers, so the route is deliberately NOT
 *    registered.
 *
 *  - Pointed at anything else (e.g. `http://127.0.0.1:8000/`, a local
 *    `deno run supabase/functions/create-lead/index.ts`) - the request is
 *    forwarded there with body, method and headers untouched, for iterating on
 *    the function before deploying.
 *
 * Either way it is the same remote database this spec then queries. Serve the
 * built app on APP_ORIGIN (`npm run build && npx vite preview --port 8080`).
 * Every other edge function (get-form-data, ...) always hits production.
 */

const NIKE_ORG_ID = 'b6ffce4f-f630-4933-833a-008649757a33'
const FORM_ID = '11111111-2222-4333-8444-555555550001'
// New fixture (created by this session): a nike form with NO campaign
// attached at all — proves create-lead no longer 400s when campaign_id is
// absent and no campaign owns the form either.
const NO_CAMPAIGN_FORM_ID = '11111111-2222-4333-8444-555555550004'
// Existing fixture, renamed by this session from "Instagram (E2E)" to
// "Instagram" with utm_aliases cleared to '{}' — so any source_id match for
// it can only come from the NAME, never the old "instagram" alias. See the
// final report for why.
const INSTAGRAM_SOURCE_ID = '11111111-2222-4333-8444-555555550003'
// Pre-existing GLOBAL lead source (organization_id IS NULL), utm_aliases '{}':
// nike has no org-local "Facebook", so a Facebook referrer must fall through to
// the global row — again purely by name.
const GLOBAL_FACEBOOK_SOURCE_ID = '3c99d816-87da-40d5-a400-c2ca65c9986a'
// Pre-existing GLOBAL lead source (organization_id IS NULL) used to represent
// PAID Google traffic (gclid). No new source row was created by this session.
const GLOBAL_GOOGLE_ADS_SOURCE_ID = 'd9830942-17c1-40c8-b702-085289019868'
const APP_ORIGIN = 'http://localhost:8080'
const LOCAL_CREATE_LEAD_URL =
  process.env.LOCAL_CREATE_LEAD_URL ?? 'http://127.0.0.1:8000/'
/**
 * True when LOCAL_CREATE_LEAD_URL is the published edge function itself, i.e.
 * exactly the endpoint the app already calls - there is then nothing to
 * redirect, and interception is skipped entirely (see file header).
 */
const TESTING_DEPLOYED_CREATE_LEAD =
  /^https:[/][/][^/]+[.]supabase[.]co[/]functions[/]v1[/]create-lead/.test(LOCAL_CREATE_LEAD_URL)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

// ---------------------------------------------------------------- fixtures --

interface Fixture {
  server: http.Server
  origin: string
}

const listen = (handler: http.RequestListener): Promise<Fixture> =>
  new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, origin: `http://127.0.0.1:${port}` })
    })
  })

const html = (body: string) =>
  `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`

/** The client's own website, embedding the form with the RECOMMENDED snippet. */
const clientSiteFixture = (formId: string) =>
  listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      html(`
        <h1>Site do cliente</h1>
        <!-- Olyvia Form com UTMs (recomendado) -->
        <div id="olyvia-form"></div>
        <script
          src="${APP_ORIGIN}/embed/olyvia-form.js"
          data-form-id="${formId}"
          data-routing="url"
          data-lang="pt"
          async></script>
      `),
    )
  })

/**
 * The client's own website with THREE pages, the recommended snippet present
 * on all of them (the realistic setup for a site-wide embed script: script in
 * the global template, form container on the page that needs it). The visitor
 * lands on `/`, browses to `/p2` and `/p3`, and only submits on `/p3` — where
 * `document.referrer` is the client's OWN previous page, so the Instagram
 * origin can only survive through the snippet's sessionStorage.
 */
const multiPageClientSiteFixture = (formId: string) =>
  listen((req, res) => {
    const url = req.url ?? '/'
    const next = url.startsWith('/p2') ? '/p3' : url.startsWith('/p3') ? null : '/p2'
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      html(`
        <h1>Site do cliente ${url}</h1>
        ${next ? `<a id="next" href="${next}">Continuar</a>` : '<p>Contacte-nos</p>'}
        <div id="olyvia-form"></div>
        <script
          src="${APP_ORIGIN}/embed/olyvia-form.js"
          data-form-id="${formId}"
          data-routing="url"
          data-lang="pt"
          async></script>
      `),
    )
  })

/**
 * The client's own website, embedding the form with the snippet the user's
 * real sites use today (the "JavaScript embed" tab): it builds an <iframe>
 * pointing straight at /form?... and forwards NOTHING — no UTMs, no
 * `document.referrer`, no `embed=utm`. Byte-for-byte the shape produced by
 * FormIntegrationsTab's `jsEmbedCode`.
 */
const legacyIframeSiteFixture = (formId: string) =>
  listen((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      html(`
        <h1>Site do cliente (snippet iframe)</h1>
        <div id="olyvia-form-legacy"></div>
        <script>
        (function() {
          var container = document.getElementById('olyvia-form-legacy');
          var iframe = document.createElement('iframe');
          iframe.src = '${APP_ORIGIN}/form/${formId}?lang=pt';
          iframe.style.cssText = 'width:100%;height:700px;border:none;border-radius:8px;';
          iframe.allow = 'geolocation';
          iframe.title = 'Olyvia form';
          container.appendChild(iframe);
        })();
        </script>
      `),
    )
  })

/**
 * No-op when LOCAL_CREATE_LEAD_URL is the deployed function: the browser
 * already calls exactly that endpoint by itself, with its own
 * apikey/Authorization headers. Otherwise forwards the browser's real
 * `create-lead` call to that URL with body/method/headers untouched, returning
 * the real response to the page. See file header.
 */
async function useLocalCreateLead(page: import('@playwright/test').Page): Promise<void> {
  if (TESTING_DEPLOYED_CREATE_LEAD) return
  await page.route('**/functions/v1/create-lead*', async (route) => {
    const response = await route.fetch({ url: LOCAL_CREATE_LEAD_URL })
    await route.fulfill({ response })
  })
}

/**
 * Fulfils requests to a real-looking origin (http://www.instagram.com, ...)
 * entirely in-process via Playwright's network interception — no real
 * network/DNS involved. `targetHref` is evaluated at request time so the
 * per-test suffix/email can be embedded in the link.
 */
async function mockReferrerOrigin(
  page: import('@playwright/test').Page,
  origin: string,
  targetHref: () => string,
): Promise<void> {
  await page.route(`${origin}/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html(`<h1>${origin}</h1><a id="cta" href="${targetHref()}">Ver oferta</a>`),
    })
  })
}

// ----------------------------------------------------------------- database --

const readDatabaseUrl = (): string => {
  const envPath = path.resolve(process.cwd(), '.env')
  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL missing from .env')
  return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
}

/**
 * The direct `db.<ref>.supabase.co` host is IPv6-only from this machine, so we
 * go through the shared pooler with the same credentials.
 */
async function queryDb<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const u = new URL(readDatabaseUrl())
  const ref = u.hostname.split('.')[1]
  const hosts = [
    'aws-0-eu-central-2.pooler.supabase.com',
    'aws-1-eu-central-2.pooler.supabase.com',
  ]
  let lastError: unknown
  for (const host of hosts) {
    const client = new pg.Client({
      host,
      port: 5432,
      database: 'postgres',
      user: `postgres.${ref}`,
      password: decodeURIComponent(u.password),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    })
    try {
      await client.connect()
      const r = await client.query(sql, params)
      await client.end()
      return r.rows as T[]
    } catch (e) {
      lastError = e
      try { await client.end() } catch { /* already closed */ }
    }
  }
  throw lastError
}

interface LeadRow {
  id: string
  organization_id: string
  campaign_id: string | null
  source: string | null
  source_id: string | null
  source_name: string | null
  tracking: Record<string, string> | null
  campaign_lead: Record<string, unknown> | null
}

async function fetchLeadByEmail(email: string): Promise<LeadRow> {
  const rows = await queryDb<LeadRow>(
    `select l.id,
            l.organization_id,
            l.campaign_id,
            l.source,
            l.source_id,
            ls.name as source_name,
            l.field_values->'_meta'->'tracking' as tracking,
            (select to_jsonb(cl) from campaign_leads cl where cl.anew_lead_id = l.id limit 1) as campaign_lead
       from anew_leads l
       left join lead_sources ls on ls.id = l.source_id
      where l.field_values->>'email' = $1
      order by l.created_at desc
      limit 1`,
    [email],
  )
  expect(rows.length, `lead for ${email} must exist in the database`).toBe(1)
  const lead = rows[0]
  expect(lead.organization_id, 'lead must belong to the nike organization').toBe(NIKE_ORG_ID)
  return lead
}

// ---------------------------------------------------------------- test flow --

const suffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

async function submitThroughEmbed(
  page: import('@playwright/test').Page,
  socialOrigin: string,
  clientOrigin: string,
  email: string,
  label: string,
) {
  page.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text().slice(0, 500)}`))
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => console.log(`[reqfail] ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', async (r) => {
    if (!r.url().includes('create-lead')) return
    let body = ''
    try { body = (await r.text()).slice(0, 800) } catch { body = '<unreadable>' }
    console.log(`[create-lead] ${r.status()} ${body}`)
  })

  // 1. Land on the "social network" page.
  await page.goto(`${socialOrigin}/`, { waitUntil: 'domcontentloaded' })

  // 2. Real user click -> real cross-origin navigation -> real Referer header.
  await Promise.all([
    page.waitForURL((u) => u.origin === clientOrigin, { timeout: 60_000 }),
    page.locator('#cta').click(),
  ])

  // Sanity: the host page really did receive a referrer from the social origin.
  const hostReferrer = await page.evaluate(() => document.referrer)
  expect(hostReferrer, 'host page must carry a referrer from the social origin').toContain(
    new URL(socialOrigin).host,
  )

  // 3. The embed script mounts the iframe; the form is inside it.
  const frame = page.frameLocator('iframe[title="Olyvia form"]')
  await frame.locator('#first_name').waitFor({ timeout: 180_000 })

  await frame.locator('#first_name').fill(label)
  await frame.locator('#last_name').fill('EmbedTracking')
  await frame.locator('#email').fill(email)
  await frame.locator('#phone').fill('912345678')

  const iframeSrc = await page.locator('iframe[title="Olyvia form"]').getAttribute('src')

  const submit = frame.locator('button:has-text("Enviar")').last()
  await submit.scrollIntoViewIfNeeded()
  await submit.click()
  // Success screen replaces the form.
  await expect(frame.locator('#first_name')).toBeHidden({ timeout: 180_000 })
  // The edge function runs attribution after the response; give it a moment.
  await page.waitForTimeout(4000)

  return { iframeSrc: iframeSrc ?? '', hostReferrer }
}

/** Same flow, but for a "direct visit" — no prior page, no referrer at all. */
async function submitThroughEmbedDirect(
  page: import('@playwright/test').Page,
  clientOrigin: string,
  formPath: string,
  email: string,
  label: string,
) {
  page.on('response', async (r) => {
    if (!r.url().includes('create-lead')) return
    let body = ''
    try { body = (await r.text()).slice(0, 800) } catch { body = '<unreadable>' }
    console.log(`[create-lead] ${r.status()} ${body}`)
  })

  await page.goto(`${clientOrigin}${formPath}`, { waitUntil: 'domcontentloaded' })
  const hostReferrer = await page.evaluate(() => document.referrer)
  expect(hostReferrer, 'direct visit must carry no referrer').toBe('')

  const frame = page.frameLocator('iframe[title="Olyvia form"]')
  await frame.locator('#first_name').waitFor({ timeout: 180_000 })
  await frame.locator('#first_name').fill(label)
  await frame.locator('#last_name').fill('EmbedTracking')
  await frame.locator('#email').fill(email)
  await frame.locator('#phone').fill('912345678')

  const iframeSrc = await page.locator('iframe[title="Olyvia form"]').getAttribute('src')

  const submit = frame.locator('button:has-text("Enviar")').last()
  await submit.scrollIntoViewIfNeeded()
  await submit.click()
  await expect(frame.locator('#first_name')).toBeHidden({ timeout: 180_000 })
  await page.waitForTimeout(4000)

  return { iframeSrc: iframeSrc ?? '', hostReferrer }
}

test.describe('embed snippet forwards lead origin to the database', () => {
  let clientSite: Fixture
  let noCampaignClientSite: Fixture

  test.beforeAll(async () => {
    clientSite = await clientSiteFixture(FORM_ID)
    noCampaignClientSite = await clientSiteFixture(NO_CAMPAIGN_FORM_ID)
  })

  test.afterAll(async () => {
    for (const f of [clientSite, noCampaignClientSite]) f?.server.close()
  })

  test.beforeEach(async ({ page }) => {
    await useLocalCreateLead(page)
  })

  // -- 1. Form without a campaign must still create a lead (was: silent 400) --
  test('form with NO campaign still creates a lead', async ({ page }) => {
    const s = suffix()
    const email = `e2enocamp${s}@example.test`

    let createLeadStatus: number | null = null
    page.on('response', async (r) => {
      if (!r.url().includes('create-lead')) return
      createLeadStatus = r.status()
      let body = ''
      try { body = (await r.text()).slice(0, 800) } catch { body = '<unreadable>' }
      console.log(`[create-lead] ${r.status()} ${body}`)
    })

    await page.goto(`${noCampaignClientSite.origin}/`, { waitUntil: 'domcontentloaded' })
    const frame = page.frameLocator('iframe[title="Olyvia form"]')
    await frame.locator('#first_name').waitFor({ timeout: 180_000 })
    await frame.locator('#first_name').fill(`E2ENOCAMP${s}`)
    await frame.locator('#last_name').fill('EmbedTracking')
    await frame.locator('#email').fill(email)
    await frame.locator('#phone').fill('912345678')
    const submit = frame.locator('button:has-text("Enviar")').last()
    await submit.scrollIntoViewIfNeeded()
    await submit.click()
    await expect(frame.locator('#first_name')).toBeHidden({ timeout: 180_000 })
    await page.waitForTimeout(2000)

    expect(createLeadStatus, 'create-lead must succeed (201), not 400, for a campaignless form').toBe(201)

    const lead = await fetchLeadByEmail(email)
    console.log('[NO-CAMPAIGN] lead:', JSON.stringify(lead, null, 2))
    expect(lead.campaign_id, 'lead must have no campaign').toBeNull()
  })

  // -- 2. Explicit utm_source=instagram must still win over the referrer (regression) --
  test('visit from Instagram with UTMs (utm_source wins over referrer)', async ({ page }) => {
    const s = suffix()
    const email = `e2eig${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.instagram.com', () =>
      `${clientSite.origin}/lp?utm_source=instagram&utm_medium=paid_social&utm_campaign=e2e_ig`,
    )
    const { iframeSrc, hostReferrer } = await submitThroughEmbed(
      page, 'http://www.instagram.com', clientSite.origin, email, `E2EIG${s}`,
    )

    // The iframe URL is the transport: prove the snippet put the origin in it.
    expect(iframeSrc, 'iframe url must carry embed=utm').toContain('embed=utm')
    expect(iframeSrc).toContain('utm_source=instagram')
    expect(decodeURIComponent(iframeSrc)).toContain(hostReferrer)

    const lead = await fetchLeadByEmail(email)
    console.log('[IG] lead:', JSON.stringify(lead, null, 2))

    expect(lead.tracking, 'tracking must be persisted on the lead').not.toBeNull()
    expect(lead.tracking?.utm_source).toBe('instagram')
    expect(lead.tracking?.utm_medium).toBe('paid_social')
    expect(lead.tracking?.referrer, 'referrer must reach the database').toContain('instagram.com')

    // Regression: an explicit utm_source must win over the referrer-derived
    // "Instagram" — the lead's textual source must be the raw utm_source
    // value ("instagram"), not the referrer fallback's display name.
    expect(lead.source, 'explicit utm_source must win over the referrer fallback').toBe('instagram')
  })

  test('visit from Facebook with UTMs and fbclid', async ({ page }) => {
    const s = suffix()
    const email = `e2efb${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.facebook.com', () =>
      `${clientSite.origin}/lp?utm_source=facebook&utm_medium=paid_social&utm_campaign=e2e_fb&fbclid=IwAR_e2e_test`,
    )
    const { iframeSrc, hostReferrer } = await submitThroughEmbed(
      page, 'http://www.facebook.com', clientSite.origin, email, `E2EFB${s}`,
    )

    expect(iframeSrc).toContain('utm_source=facebook')
    expect(iframeSrc).toContain('fbclid=IwAR_e2e_test')
    expect(decodeURIComponent(iframeSrc)).toContain(hostReferrer)

    const lead = await fetchLeadByEmail(email)
    console.log('[FB] lead:', JSON.stringify(lead, null, 2))

    expect(lead.tracking?.utm_source).toBe('facebook')
    expect(lead.tracking?.fbclid).toBe('IwAR_e2e_test')
    expect(lead.tracking?.referrer).toContain('facebook.com')
    expect(lead.source, 'explicit utm_source must win over the referrer fallback').toBe('facebook')
  })

  // -- 3. Organic Instagram click, NO utm params: source AND source_id must
  //       resolve automatically from the referrer domain + lead_sources.name,
  //       with ZERO utm_aliases configured (proves it's the name match, not
  //       the old alias) --
  test('organic visit from Instagram with NO utm params resolves source + source_id automatically', async ({ page }) => {
    const s = suffix()
    const email = `e2eigorg${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.instagram.com', () => `${clientSite.origin}/lp`)
    const { iframeSrc } = await submitThroughEmbed(
      page, 'http://www.instagram.com', clientSite.origin, email, `E2EIGORG${s}`,
    )

    expect(iframeSrc).not.toContain('utm_source')

    const lead = await fetchLeadByEmail(email)
    console.log('[IG-ORGANIC] lead:', JSON.stringify(lead, null, 2))

    // The referrer still reaches the database...
    expect(lead.tracking?.referrer).toContain('instagram.com')
    // ...and now the pipeline DOES turn a bare referrer into a lead source,
    // both the human-readable text and the internal source_id — with the
    // matching lead_sources row's utm_aliases empty, so this can only have
    // come from matching lead_sources.name, never an alias.
    expect(lead.source).toBe('Instagram')
    expect(lead.source_id).toBe(INSTAGRAM_SOURCE_ID)
    expect(lead.source_name).toBe('Instagram')
  })

  // -- 4. Organic Facebook click, NO utm params: nike has no org-local
  //       "Facebook", so this also proves the global-scope fallback: the
  //       pre-existing GLOBAL "Facebook" row (utm_aliases '{}') is matched by
  //       name and fills source_id. --
  test('organic visit from Facebook with NO utm params resolves source (text) from the referrer', async ({ page }) => {
    const s = suffix()
    const email = `e2efborg${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.facebook.com', () => `${clientSite.origin}/lp`)
    const { iframeSrc } = await submitThroughEmbed(
      page, 'http://www.facebook.com', clientSite.origin, email, `E2EFBORG${s}`,
    )

    expect(iframeSrc).not.toContain('utm_source')

    const lead = await fetchLeadByEmail(email)
    console.log('[FB-ORGANIC] lead:', JSON.stringify(lead, null, 2))

    expect(lead.tracking?.referrer).toContain('facebook.com')
    expect(lead.source).toBe('Facebook')
    expect(lead.source_id).toBe(GLOBAL_FACEBOOK_SOURCE_ID)
    expect(lead.source_name).toBe('Facebook')
  })

  // -- 5. Unknown referrer domain: never invents an origin (unchanged) --
  test('organic visit from an unrecognised referrer domain does not invent a source', async ({ page }) => {
    const s = suffix()
    const email = `e2eunknown${s}@example.test`
    const unknownOrigin = 'http://www.random-referrer-blog.invalid'
    await mockReferrerOrigin(page, unknownOrigin, () => `${clientSite.origin}/lp`)
    const { iframeSrc } = await submitThroughEmbed(
      page, unknownOrigin, clientSite.origin, email, `E2EUNKNOWN${s}`,
    )

    expect(iframeSrc).not.toContain('utm_source')

    const lead = await fetchLeadByEmail(email)
    console.log('[UNKNOWN-REFERRER] lead:', JSON.stringify(lead, null, 2))

    expect(lead.tracking?.referrer).toContain('random-referrer-blog.invalid')
    // Unrecognised domain -> no invented origin. The default text the public
    // form always sends ("public_form") must survive untouched.
    expect(lead.source).toBe('public_form')
    expect(lead.source_id).toBeNull()
  })

  // -- 6. Direct visit, no referrer at all: unchanged behaviour --
  test('direct visit with no referrer leaves source resolution unchanged', async ({ page }) => {
    const s = suffix()
    const email = `e2edirect${s}@example.test`
    await submitThroughEmbedDirect(page, clientSite.origin, '/', email, `E2EDIRECT${s}`)

    const lead = await fetchLeadByEmail(email)
    console.log('[DIRECT] lead:', JSON.stringify(lead, null, 2))

    expect(lead.tracking?.referrer, 'no referrer must reach the database for a direct visit').toBeUndefined()
    expect(lead.source).toBe('public_form')
    expect(lead.source_id).toBeNull()
  })

  // -- 7. The two snippets side by side: the one the user's sites actually use
  //       today (bare <iframe>, forwards nothing) vs the recommended
  //       olyvia-form.js. Identical Instagram click for both; the difference
  //       must be visible in the database, not asserted from the markup. --
  test('legacy iframe snippet vs recommended snippet: same Instagram click, different attribution', async ({ page }) => {
    const s = suffix()
    const legacyEmail = `e2elegacy${s}@example.test`
    const modernEmail = `e2emodern${s}@example.test`
    const legacySite = await legacyIframeSiteFixture(FORM_ID)

    try {
      // 7a. Legacy iframe snippet.
      await mockReferrerOrigin(page, 'http://www.instagram.com', () => `${legacySite.origin}/lp`)
      await page.goto('http://www.instagram.com/', { waitUntil: 'domcontentloaded' })
      await Promise.all([
        page.waitForURL((u) => u.origin === legacySite.origin, { timeout: 60_000 }),
        page.locator('#cta').click(),
      ])
      expect(await page.evaluate(() => document.referrer)).toContain('instagram.com')

      const legacyFrame = page.frameLocator('iframe[title="Olyvia form"]')
      await legacyFrame.locator('#first_name').waitFor({ timeout: 180_000 })
      const legacyIframeSrc = await page.locator('iframe[title="Olyvia form"]').getAttribute('src')
      await legacyFrame.locator('#first_name').fill(`E2ELEGACY${s}`)
      await legacyFrame.locator('#last_name').fill('EmbedTracking')
      await legacyFrame.locator('#email').fill(legacyEmail)
      await legacyFrame.locator('#phone').fill('912345678')
      const legacySubmit = legacyFrame.locator('button:has-text("Enviar")').last()
      await legacySubmit.scrollIntoViewIfNeeded()
      await legacySubmit.click()
      await expect(legacyFrame.locator('#first_name')).toBeHidden({ timeout: 180_000 })
      await page.waitForTimeout(4000)

      // 7b. Recommended snippet, same click.
      await mockReferrerOrigin(page, 'http://www.instagram.com', () => `${clientSite.origin}/lp`)
      await submitThroughEmbed(
        page, 'http://www.instagram.com', clientSite.origin, modernEmail, `E2EMODERN${s}`,
      )

      const legacyLead = await fetchLeadByEmail(legacyEmail)
      const modernLead = await fetchLeadByEmail(modernEmail)
      console.log('[SNIPPET-DIFF] legacy:', JSON.stringify(legacyLead, null, 2))
      console.log('[SNIPPET-DIFF] modern:', JSON.stringify(modernLead, null, 2))

      // The legacy snippet's iframe URL carries no embed marker at all...
      expect(legacyIframeSrc ?? '').not.toContain('embed=utm')
      // ...so nothing about the Instagram click survives into the lead: no
      // instagram referrer, and the generic public-form text stays.
      expect(legacyLead.tracking?.referrer ?? '').not.toContain('instagram.com')
      expect(legacyLead.source).toBe('public_form')
      expect(legacyLead.source_id).toBeNull()

      // The recommended snippet, from the very same click, attributes it.
      expect(modernLead.tracking?.referrer).toContain('instagram.com')
      expect(modernLead.source).toBe('Instagram')
      expect(modernLead.source_id).toBe(INSTAGRAM_SOURCE_ID)
    } finally {
      legacySite.server.close()
    }
  })
})

// ---------------------------------------------------------------------------
// GA-parity matrix (this session): origin surviving internal navigation, and
// paid vs organic separated by the ad click id (gclid / fbclid) — the one
// signal a referrer can never provide.
// ---------------------------------------------------------------------------

/** Fills and submits the embedded form on whatever page is currently open. */
async function fillAndSubmitEmbeddedForm(
  page: import('@playwright/test').Page,
  email: string,
  label: string,
) {
  const frame = page.frameLocator('iframe[title="Olyvia form"]')
  await frame.locator('#first_name').waitFor({ timeout: 180_000 })
  await frame.locator('#first_name').fill(label)
  await frame.locator('#last_name').fill('EmbedTracking')
  await frame.locator('#email').fill(email)
  await frame.locator('#phone').fill('912345678')
  const iframeSrc = (await page.locator('iframe[title="Olyvia form"]').getAttribute('src')) ?? ''
  const submit = frame.locator('button:has-text("Enviar")').last()
  await submit.scrollIntoViewIfNeeded()
  await submit.click()
  await expect(frame.locator('#first_name')).toBeHidden({ timeout: 180_000 })
  await page.waitForTimeout(4000)
  return { iframeSrc }
}

const logCreateLead = (page: import('@playwright/test').Page) => {
  page.on('response', async (r) => {
    if (!r.url().includes('create-lead')) return
    let body = ''
    try { body = (await r.text()).slice(0, 500) } catch { body = '<unreadable>' }
    console.log(`[create-lead] ${r.status()} ${body}`)
  })
}

const mediumOf = (lead: LeadRow): unknown =>
  (lead.campaign_lead as Record<string, unknown> | null)?.medium ?? null

test.describe('GA parity: session origin and paid vs organic', () => {
  let site: Fixture
  let multiSite: Fixture

  test.beforeAll(async () => {
    site = await clientSiteFixture(FORM_ID)
    multiSite = await multiPageClientSiteFixture(FORM_ID)
  })

  test.afterAll(async () => {
    for (const f of [site, multiSite]) f?.server.close()
  })

  test.beforeEach(async ({ page }) => {
    await useLocalCreateLead(page)
    logCreateLead(page)
  })

  // -- MATRIX #2: the one the user cares most about. Instagram click, then TWO
  //    internal page views, and only then the submit. On the last page
  //    `document.referrer` is the client's own site, so the ONLY way the
  //    origin can still be Instagram is the snippet's per-session memory. --
  test('organic Instagram click survives two internal navigations before submitting', async ({ page }) => {
    const s = suffix()
    const email = `e2eignav${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.instagram.com', () => `${multiSite.origin}/`)

    await page.goto('http://www.instagram.com/', { waitUntil: 'domcontentloaded' })
    await Promise.all([
      page.waitForURL((u) => u.origin === multiSite.origin, { timeout: 60_000 }),
      page.locator('#cta').click(),
    ])
    expect(await page.evaluate(() => document.referrer)).toContain('instagram.com')

    // Two internal navigations: /  ->  /p2  ->  /p3
    await Promise.all([
      page.waitForURL(`${multiSite.origin}/p2`, { timeout: 60_000 }),
      page.locator('#next').click(),
    ])
    await Promise.all([
      page.waitForURL(`${multiSite.origin}/p3`, { timeout: 60_000 }),
      page.locator('#next').click(),
    ])
    // On the submit page the browser's own referrer is INTERNAL...
    const lastReferrer = await page.evaluate(() => document.referrer)
    expect(lastReferrer, 'referrer on the submit page is the client site itself').toContain(
      new URL(multiSite.origin).host,
    )

    const { iframeSrc } = await fillAndSubmitEmbeddedForm(page, email, `E2EIGNAV${s}`)
    // ...yet the snippet must still be forwarding the Instagram referrer.
    expect(decodeURIComponent(iframeSrc), 'session origin must survive internal navigation').toContain(
      'instagram.com',
    )

    const lead = await fetchLeadByEmail(email)
    console.log('[IG-NAV] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.referrer).toContain('instagram.com')
    expect(lead.source).toBe('Instagram')
    expect(lead.source_id).toBe(INSTAGRAM_SOURCE_ID)
  })

  // -- MATRIX #3: Google ORGANIC. Same google.* referrer as an ad click, but
  //    no gclid: must NOT be reported as paid. --
  test('organic Google search click is attributed to Google and never marked paid', async ({ page }) => {
    const s = suffix()
    const email = `e2egorg${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.google.com', () => `${site.origin}/lp`)
    const { iframeSrc } = await submitThroughEmbed(
      page, 'http://www.google.com', site.origin, email, `E2EGORG${s}`,
    )
    expect(iframeSrc).not.toContain('utm_source')
    expect(iframeSrc).not.toContain('gclid')

    const lead = await fetchLeadByEmail(email)
    console.log('[GOOGLE-ORGANIC] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.referrer).toContain('google.com')
    expect(lead.tracking?.gclid, 'no click id on an organic click').toBeUndefined()
    expect(lead.source, 'organic google is "Google", not "Google Ads"').toBe('Google')
    // A origem global "Google" passou a existir (20261114020000), distinta de
    // "Google Ads", por isso o id resolve pelo nome normalizado. O que importa
    // aqui e que NAO resolve para "Google Ads": organico nunca conta como pago.
    expect(lead.source_id, 'organic google resolves to its own source').not.toBeNull()
    expect(lead.source, 'must not be the paid source').not.toBe('Google Ads')
    expect(mediumOf(lead), 'organic traffic must not get a paid medium').toBeNull()
  })

  // -- MATRIX #4: Google ADS. Identical referrer, gclid present -> paid. --
  test('Google Ads click (gclid) is separated from organic and recorded as paid', async ({ page }) => {
    const s = suffix()
    const email = `e2egads${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.google.com', () =>
      `${site.origin}/lp?gclid=Cj0KCQe2e${s}`,
    )
    const { iframeSrc } = await submitThroughEmbed(
      page, 'http://www.google.com', site.origin, email, `E2EGADS${s}`,
    )
    expect(iframeSrc).not.toContain('utm_source')
    expect(iframeSrc).toContain('gclid=')

    const lead = await fetchLeadByEmail(email)
    console.log('[GOOGLE-ADS] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.gclid).toBe(`Cj0KCQe2e${s}`)
    expect(lead.source, 'gclid must be read as paid Google traffic').toBe('Google Ads')
    expect(lead.source_id, 'matched against the EXISTING global "Google Ads" row').toBe(
      GLOBAL_GOOGLE_ADS_SOURCE_ID,
    )
    expect(mediumOf(lead), 'paid search is recorded as cpc in campaign_leads.medium').toBe('cpc')
  })

  // -- MATRIX #5: Meta paid click (fbclid), no utm params at all. --
  test('Facebook click with fbclid and no UTMs is attributed to Facebook as paid social', async ({ page }) => {
    const s = suffix()
    const email = `e2efbclid${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.facebook.com', () =>
      `${site.origin}/lp?fbclid=IwAR_e2e_${s}`,
    )
    const { iframeSrc } = await submitThroughEmbed(
      page, 'http://www.facebook.com', site.origin, email, `E2EFBCLID${s}`,
    )
    expect(iframeSrc).not.toContain('utm_source')
    expect(iframeSrc).toContain('fbclid=')

    const lead = await fetchLeadByEmail(email)
    console.log('[FBCLID] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.fbclid).toBe(`IwAR_e2e_${s}`)
    expect(lead.source).toBe('Facebook')
    expect(lead.source_id).toBe(GLOBAL_FACEBOOK_SOURCE_ID)
    expect(mediumOf(lead), 'paid social is recorded in campaign_leads.medium').toBe('paid_social')
  })
})

test.describe('GA parity: expanded referrer table, end to end', () => {
  let site: Fixture

  test.beforeAll(async () => {
    site = await clientSiteFixture(FORM_ID)
  })

  test.afterAll(async () => {
    site?.server.close()
  })

  test.beforeEach(async ({ page }) => {
    await useLocalCreateLead(page)
    logCreateLead(page)
  })

  // -- MATRIX #6 (E2E sample): the rest of the expanded domain table is
  //    covered by unit tests; this proves one of the newly added origins
  //    travels the whole pipeline into the database. TikTok has no
  //    lead_sources row in this database, so the textual origin is set and
  //    source_id is deliberately left unresolved (nothing is invented). --
  test('a newly supported referrer domain (TikTok) reaches the database as its own origin', async ({ page }) => {
    const s = suffix()
    const email = `e2etiktok${s}@example.test`
    await mockReferrerOrigin(page, 'http://www.tiktok.com', () => `${site.origin}/lp`)
    await submitThroughEmbed(page, 'http://www.tiktok.com', site.origin, email, `E2ETIKTOK${s}`)

    const lead = await fetchLeadByEmail(email)
    console.log('[TIKTOK] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.referrer).toContain('tiktok.com')
    expect(lead.source).toBe('TikTok')
    // A origem global "TikTok" passou a existir (20261114020000), por isso o id
    // resolve pelo nome normalizado em vez de ficar nulo.
    expect(lead.source_id, 'tiktok resolves to its own source').not.toBeNull()
  })

  // -- MATRIX #7 (security): `notinstagram.com` is a domain anybody can
  //    register. Proven end to end, not just in the unit test, that it can
  //    never forge the origin of a real lead. --
  test('a look-alike domain is never attributed to the brand it imitates', async ({ page }) => {
    const s = suffix()
    const email = `e2elookalike${s}@example.test`
    const lookAlike = 'http://www.notinstagram.com'
    await mockReferrerOrigin(page, lookAlike, () => `${site.origin}/lp`)
    await submitThroughEmbed(page, lookAlike, site.origin, email, `E2ELOOKALIKE${s}`)

    const lead = await fetchLeadByEmail(email)
    console.log('[LOOK-ALIKE] lead:', JSON.stringify(lead, null, 2))
    expect(lead.tracking?.referrer).toContain('notinstagram.com')
    expect(lead.source, 'a look-alike domain must not become Instagram').toBe('public_form')
    expect(lead.source_id).toBeNull()
  })
})
