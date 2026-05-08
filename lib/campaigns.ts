import type { Campaign, CampaignKey } from './types'

// Build a 48-interval curve from three Gaussian peaks with given weights/positions.
// Returns relative weights (not normalized) — the kernel normalizes at use time.
function makeCurve(peaks: { hour: number; sigma: number; weight: number }[]): number[] {
  return Array.from({ length: 48 }, (_, i) => {
    const h = i / 2
    return peaks.reduce((acc, p) => acc + p.weight * Math.exp(-Math.pow((h - p.hour) / p.sigma, 2)), 0.05)
  })
}

export const campaigns: Record<CampaignKey, Campaign> = {
  us_telco_manila: {
    key: 'us_telco_manila',
    label: 'US Telco Inbound – Manila',
    hoop: { startMin: 0, endMin: 1440 },                                  // 24/7
    curveTemplate: makeCurve([
      { hour: 10, sigma: 2.2, weight: 1.0 },
      { hour: 15, sigma: 2.4, weight: 0.85 },
      { hour: 20, sigma: 2.0, weight: 0.45 },
    ]),
    dailyTotal: 12400,
    aht: 420, sl: 80, asa: 20, shrink: 32, abs: 9,
    abandonThresholdSec: 60,
    abandonCurveBeta: 0.05,
    rules: 'Voice inbound · Tier 1 troubleshoot · 24/7 follow-the-sun · ESL premium tagging',
  },
  au_retail_cebu: {
    key: 'au_retail_cebu',
    label: 'AU Retail Chat – Cebu',
    hoop: { startMin: 360, endMin: 1320 },                                // 06:00–22:00
    curveTemplate: makeCurve([
      { hour: 11, sigma: 2.0, weight: 1.0 },
      { hour: 17, sigma: 2.0, weight: 0.9 },
    ]),
    dailyTotal: 5800,
    aht: 240, sl: 85, asa: 30, shrink: 28, abs: 7,
    abandonThresholdSec: 90,
    abandonCurveBeta: 0.03,
    rules: 'Chat (2 concurrent) · AEST coverage · holiday surge model · post-sales focus',
  },
  uk_fintech_manila: {
    key: 'uk_fintech_manila',
    label: 'UK Fintech Voice – Manila',
    hoop: { startMin: 540, endMin: 1080 },                                // 09:00–18:00
    curveTemplate: makeCurve([
      { hour: 11, sigma: 1.8, weight: 1.0 },
      { hour: 14, sigma: 1.8, weight: 0.95 },
    ]),
    dailyTotal: 7600,
    aht: 540, sl: 90, asa: 15, shrink: 35, abs: 8,
    abandonThresholdSec: 45,
    abandonCurveBeta: 0.08,
    rules: 'Voice · KYC compliance · GMT coverage · senior-tier only · strict QA',
  },
  us_healthcare_clark: {
    key: 'us_healthcare_clark',
    label: 'US Healthcare – Clark',
    hoop: { startMin: 480, endMin: 1260 },                                // 08:00–21:00 (split EST/CST coverage)
    curveTemplate: makeCurve([
      { hour: 10, sigma: 2.2, weight: 1.0 },
      { hour: 14, sigma: 2.2, weight: 0.95 },
      { hour: 18, sigma: 2.0, weight: 0.7 },
    ]),
    dailyTotal: 4400,
    aht: 600, sl: 90, asa: 30, shrink: 38, abs: 10,
    abandonThresholdSec: 75,
    abandonCurveBeta: 0.04,
    rules: 'Voice · HIPAA · EST/CST split · seasonal Q4 enrollment surge',
  },
  ph_telco_davao: {
    key: 'ph_telco_davao',
    label: 'PH Telco Local – Davao',
    hoop: { startMin: 360, endMin: 1320 },                                // 06:00–22:00
    curveTemplate: makeCurve([
      { hour: 9, sigma: 1.8, weight: 1.0 },
      { hour: 16, sigma: 2.4, weight: 0.85 },
    ]),
    dailyTotal: 14800,
    aht: 300, sl: 75, asa: 25, shrink: 30, abs: 12,
    abandonThresholdSec: 60,
    abandonCurveBeta: 0.06,
    rules: 'Voice · Bisaya/Tagalog dual · local hours · weather-event flex (typhoon)',
  },
}
