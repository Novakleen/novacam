import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { extractText } from 'https://esm.sh/unpdf@1.8.1'
import { ADMIN_ROLES, requireCaller } from '../_shared/auth.ts'
import { callInvoiceAi, handleTresoPdfExtract, supabasePdfDb } from '../_shared/tresoPdfExtract.js'
import { extractSimplePdfText } from '../_shared/tresoPdfText.js'
import { corsHeaders } from './cors.ts'

// verify_jwt is false (supabase/config.toml). Admin JWT only, via requireCaller.
// The anon key is a signed JWT and must not pass.
//
// Scanned or low-text PDFs fall back to an external model. Set one secret
// (the first one present is used):
//   OPENAI_API_KEY      model gpt-4o-mini, override with OPENAI_PDF_MODEL
//   ANTHROPIC_API_KEY   model claude-3-5-haiku-latest, override with ANTHROPIC_PDF_MODEL
// With neither secret, text extraction still runs. Uncertain invoices are
// queued for confirmation instead of failing the request.
// Text comes from unpdf (PDF.js, no native pdftotext).

const BUCKET = 'treso-supplier-invoices'

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const result = await extractText(bytes, { mergePages: true })
    const value = result?.text
    const text = Array.isArray(value) ? value.join('\n') : String(value || '')
    if (text.replace(/\s/g, '').length >= 20) return text
  } catch (error) {
    console.error('unpdf', error instanceof Error ? error.message : error)
  }
  return extractSimplePdfText(bytes)
}

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const env = {
    OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY') ?? '',
    ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    OPENAI_PDF_MODEL: Deno.env.get('OPENAI_PDF_MODEL') ?? '',
    ANTHROPIC_PDF_MODEL: Deno.env.get('ANTHROPIC_PDF_MODEL') ?? '',
  }

  return handleTresoPdfExtract(req, {
    corsHeaders,
    db: supabasePdfDb(admin),
    requireCaller: (request) => requireCaller(request, corsHeaders, ADMIN_ROLES),
    extractText: extractPdfText,
    callAi: ({ bytes, text }) => callInvoiceAi({ bytes, text, env }),
    download: async (path) => {
      const { data, error } = await admin.storage.from(BUCKET).download(path)
      if (error || !data) throw new Error(error?.message || 'pdf_missing')
      return new Uint8Array(await data.arrayBuffer())
    },
  })
})
