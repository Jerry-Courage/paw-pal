/**
 * Geo-aware currency formatting for the $0.99/mo plan.
 *
 * Strategy:
 * 1. Call a free IP-geolocation API to get the user's country code.
 * 2. Map the country to a currency + approximate local price.
 * 3. Cache in sessionStorage so we only call once per session.
 *
 * Prices are set to feel natural in each currency (not exact FX conversions).
 * Paystack actually accepts GHS, NGN, USD, GBP, ZAR, KES, EUR natively,
 * so the currency code is also passed to the backend initialize endpoint.
 */

export interface PriceInfo {
  amount: number          // numeric amount
  currency: string        // ISO 4217 code, e.g. "GHS"
  symbol: string          // e.g. "₵"
  display: string         // e.g. "₵14.99"
  displayShort: string    // e.g. "₵14.99/mo"
  paystackCurrency: string // what to send to Paystack
  countryCode: string
}

// Map: country ISO code → { currency, symbol, amount }
// Amounts chosen to feel like natural local pricing around ~$0.99 USD
const COUNTRY_PRICE_MAP: Record<string, { currency: string; symbol: string; amount: number }> = {
  // West Africa
  GH: { currency: 'GHS', symbol: '₵',  amount: 10.00 },
  NG: { currency: 'NGN', symbol: '₦',  amount: 1499  },
  SN: { currency: 'XOF', symbol: 'CFA', amount: 599  },
  CI: { currency: 'XOF', symbol: 'CFA', amount: 599  },
  // East Africa
  KE: { currency: 'KES', symbol: 'KSh', amount: 129  },
  UG: { currency: 'UGX', symbol: 'USh', amount: 3699 },
  TZ: { currency: 'TZS', symbol: 'TSh', amount: 2499 },
  RW: { currency: 'RWF', symbol: 'RF',  amount: 1199 },
  ET: { currency: 'ETB', symbol: 'Br',  amount: 59   },
  // Southern Africa
  ZA: { currency: 'ZAR', symbol: 'R',   amount: 18.99 },
  ZM: { currency: 'ZMW', symbol: 'ZK',  amount: 24.99 },
  ZW: { currency: 'USD', symbol: '$',   amount: 0.99  },
  BW: { currency: 'BWP', symbol: 'P',   amount: 13.99 },
  // North Africa
  EG: { currency: 'EGP', symbol: 'E£',  amount: 49.99 },
  MA: { currency: 'MAD', symbol: 'DH',  amount: 9.99  },
  TN: { currency: 'TND', symbol: 'DT',  amount: 2.99  },
  // UK & Europe
  GB: { currency: 'GBP', symbol: '£',   amount: 0.79  },
  DE: { currency: 'EUR', symbol: '€',   amount: 0.99  },
  FR: { currency: 'EUR', symbol: '€',   amount: 0.99  },
  ES: { currency: 'EUR', symbol: '€',   amount: 0.99  },
  IT: { currency: 'EUR', symbol: '€',   amount: 0.99  },
  NL: { currency: 'EUR', symbol: '€',   amount: 0.99  },
  // Americas
  US: { currency: 'USD', symbol: '$',   amount: 0.99  },
  CA: { currency: 'CAD', symbol: 'C$',  amount: 1.39  },
  BR: { currency: 'BRL', symbol: 'R$',  amount: 4.99  },
  // Asia-Pacific
  IN: { currency: 'INR', symbol: '₹',   amount: 79    },
  AU: { currency: 'AUD', symbol: 'A$',  amount: 1.49  },
  // Default fallback
  DEFAULT: { currency: 'USD', symbol: '$', amount: 0.99 },
}

// Paystack only accepts certain currencies natively
const PAYSTACK_SUPPORTED = new Set(['USD', 'GHS', 'NGN', 'ZAR', 'KES', 'GBP', 'EUR'])

const CACHE_KEY = 'fs_price_info'
const CACHE_TTL = 1000 * 60 * 60 * 24 // 24 hours

async function detectCountry(): Promise<string> {
  // Try multiple providers in order
  const providers = [
    async () => {
      const res = await fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const text = (await res.text()).trim().toUpperCase()
        if (/^[A-Z]{2}$/.test(text)) return text
      }
      return null
    },
    async () => {
      const res = await fetch('https://api.country.is/', { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const data = await res.json()
        if (data?.country) return data.country.toUpperCase()
      }
      return null
    },
    async () => {
      const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const data = await res.json()
        if (data?.country_code) return data.country_code.toUpperCase()
      }
      return null
    },
  ]

  for (const provider of providers) {
    try {
      const result = await provider()
      if (result) return result
    } catch {}
  }

  // Last resort: use browser locale to guess region (not country, but better than nothing)
  try {
    const locale = navigator.language || ''
    // e.g. "en-GH" → "GH"
    const parts = locale.split('-')
    if (parts.length > 1 && /^[A-Z]{2}$/.test(parts[1].toUpperCase())) {
      return parts[1].toUpperCase()
    }
  } catch {}

  return 'US'
}

export async function getPriceInfo(): Promise<PriceInfo> {
  // Check session cache first
  if (typeof window !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL) {
          return parsed.data as PriceInfo
        }
      }
    } catch {}
  }

  const countryCode = await detectCountry()
  const config = COUNTRY_PRICE_MAP[countryCode] ?? COUNTRY_PRICE_MAP['DEFAULT']

  // If Paystack doesn't support the currency natively, fall back to USD
  const paystackCurrency = PAYSTACK_SUPPORTED.has(config.currency) ? config.currency : 'USD'
  const paystackAmount = paystackCurrency === config.currency ? config.amount : 0.99
  const paystackSymbol = paystackCurrency === config.currency ? config.symbol : '$'

  const info: PriceInfo = {
    amount: paystackAmount,
    currency: paystackCurrency,
    symbol: paystackSymbol,
    display: `${paystackSymbol}${paystackAmount}`,
    displayShort: `${paystackSymbol}${paystackAmount}/mo`,
    paystackCurrency,
    countryCode,
  }

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: info }))
    } catch {}
  }

  return info
}

/** Synchronous version — returns cached value or USD default while async resolves */
export function getPriceInfoSync(): PriceInfo {
  if (typeof window !== 'undefined') {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL) {
          return parsed.data as PriceInfo
        }
      }
    } catch {}
  }
  return {
    amount: 0.99,
    currency: 'USD',
    symbol: '$',
    display: '$0.99',
    displayShort: '$0.99/mo',
    paystackCurrency: 'USD',
    countryCode: 'US',
  }
}
