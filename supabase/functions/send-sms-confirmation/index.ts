// Supabase Edge Function: send SMS confirmation via Twilio
// Triggered from the Log Incentive form when the "Send confirmation text" toggle is on.
//
// Required environment variables (set via Supabase secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER         e.g. +447xxxxxxxxx (or "whatsapp:+14155238886" for WhatsApp sandbox)
//
// Request body (JSON):
//   {
//     "to": "+447xxxxxxxxx",
//     "name": "Sarah",
//     "amount": 25,
//     "date": "2026-04-15",
//     "given_by": "Rob Jones",
//     "area": "waterlooville" | null,
//     "shift": "morning" | null
//   }

// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function formatGBP(amount: number): string {
  return `£${amount.toFixed(2)}`
}

function buildMessage(p: {
  name: string
  amount: number
  date: string
  given_by: string
  area: string | null
  shift: string | null
}): string {
  const dateLabel = new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })

  const reasonParts: string[] = []
  if (p.area) reasonParts.push(p.area.charAt(0).toUpperCase() + p.area.slice(1))
  if (p.shift) reasonParts.push(p.shift)
  const reason = reasonParts.length ? ` for ${reasonParts.join(' ')}` : ''

  return `Hi ${p.name}, you've been given a ${formatGBP(p.amount)} incentive on ${dateLabel}${reason} by ${p.given_by}. This will be added to your next payslip. Thanks — Lillyfields Care`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(
        JSON.stringify({ error: 'Twilio credentials not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { to, name, amount, date, given_by, area, shift } = body as {
      to: string
      name: string
      amount: number
      date: string
      given_by: string
      area: string | null
      shift: string | null
    }

    if (!to || !name || amount == null || !date || !given_by) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const messageBody = buildMessage({ name, amount, date, given_by, area, shift })

    // If the from number starts with "whatsapp:", auto-prefix the destination too
    const isWhatsApp = fromNumber.startsWith('whatsapp:')
    const toNumber = isWhatsApp && !to.startsWith('whatsapp:') ? `whatsapp:${to}` : to

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const auth = btoa(`${accountSid}:${authToken}`)

    const params = new URLSearchParams({
      To: toNumber,
      From: fromNumber,
      Body: messageBody,
    })

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const twilioData: any = await twilioRes.json()

    if (!twilioRes.ok) {
      return new Response(
        JSON.stringify({
          error: twilioData?.message ?? 'Twilio request failed',
          code: twilioData?.code,
        }),
        { status: twilioRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
