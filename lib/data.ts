export type MeterReading = {
  meter: string;
  uom: string;
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

export function parseMeterCsv(csv: string): MeterReading[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      meter: cells[0] || 'Unknown',
      uom: cells[1] || 'Unknown',
      readingDate: cells[2] || '',
      billingPeriod: cells[3] || '',
      readerId: cells[5] || '',
      description: cells[7] || '',
      usage: numberValue(cells[10] || ''),
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
