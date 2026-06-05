import { useState, useEffect } from 'react'
import { getPriceInfo, getPriceInfoSync, type PriceInfo } from '@/lib/currency'

/**
 * Hook that returns geo-aware pricing info.
 * Starts with a cached/default value immediately, then resolves the real
 * country-based price asynchronously.
 */
export function usePricing() {
  const [priceInfo, setPriceInfo] = useState<PriceInfo>(getPriceInfoSync)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPriceInfo().then(info => {
      if (!cancelled) {
        setPriceInfo(info)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  return { priceInfo, loading }
}
