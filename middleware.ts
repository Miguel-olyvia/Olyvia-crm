import { createServerClient } from '@supabase/ssr'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

export default async function middleware(request: Request): Promise<Response> {
  const response = new Response(null, { status: 200 })

  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get('cookie') ?? ''
          return cookieHeader
            .split(';')
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const [name, ...rest] = c.split('=')
              return { name: name.trim(), value: rest.join('=') }
            })
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const parts = [`${name}=${value}`]
            if (options?.path) parts.push(`Path=${options.path}`)
            if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`)
            if (options?.domain) parts.push(`Domain=${options.domain}`)
            if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`)
            if (options?.secure) parts.push('Secure')
            if (options?.httpOnly) parts.push('HttpOnly')
            response.headers.append('Set-Cookie', parts.join('; '))
          })
        },
      },
    }
  )

  // Refresh session — keeps the cookie-based session alive on every request.
  // The result is intentionally ignored; side effect is the refreshed Set-Cookie header.
  await supabase.auth.getUser()

  return response
}
