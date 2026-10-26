import { lookupMeterAsset, type MeterAsset } from './meter-map';

export type MeterReading = {
  meter: string;
  asset?: MeterAsset;
  uom: string;
  normalizedUom: string;
  normalizedUsage: number;
  conversionFactor: number;
  readingDate: string;
  billingPeriod: string;
  readerId: string;
  description: string;
  usage: number;
  adjusted: boolean;
  verified: boolean;
  invoiceDate: string;
  sourceUrl: string;
  error: string;
};

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUsage(uom: string, usage: number) {
  if (uom === 'MWH') return { normalizedUom: 'KWH', normalizedUsage: usage * 1_000, conversionFactor: 1_000 };
  if (uom === 'GWH') return { normalizedUom: 'KWH', normalizedUsage: usage * 1_000_000, conversionFactor: 1_000_000 };
  if (uom === 'CF') return { normalizedUom: 'CCF', normalizedUsage: usage / 100, conversionFactor: 0.01 };
  return { normalizedUom: uom, normalizedUsage: usage, conversionFactor: 1 };
}

export function parseMeterCsv(csv: string): MeterReading[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const uom = cells[1] || 'Unknown';
    const usage = numberValue(cells[10] || '');
    const normalized = normalizeUsage(uom, usage);
    return {
      meter: cells[0] || 'Unknown',
      asset: lookupMeterAsset(cells[0] || ''),
      uom,
      ...normalized,
      readingDate: cells[2] || '',
      billingPeriod: cells[3] || '',
      readerId: cells[5] || '',
      description: cells[7] || '',
      usage,
      adjusted: cells[11] === 'Yes',
      verified: cells[12] === 'Yes',
      invoiceDate: cells[13] || '',
      sourceUrl: cells[14] || '',
      error: cells[15] || '',
    };
  });
}

export function toDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

export function formatDate(value: string) {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}
