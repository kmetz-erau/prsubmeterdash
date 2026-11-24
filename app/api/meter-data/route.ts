import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fileDate(name: string) {
  const match = name.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export async function GET() {
  const dataDirectory = path.join(process.cwd(), 'public', 'data');
  const files = await fs.readdir(dataDirectory);
  const candidates = files.filter((name) => name.toLowerCase().endsWith('.csv'));

  const dated = candidates
    .filter((name) => fileDate(name))
    .sort((left, right) => fileDate(right).localeCompare(fileDate(left)));
  const selected = dated[0] || (candidates.includes('meter-readings.csv') ? 'meter-readings.csv' : candidates[0]);

  if (!selected) {
    return new Response('No meter CSV found in public/data.', { status: 404 });
  }

  const csv = await fs.readFile(path.join(dataDirectory, selected), 'utf8');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Meter-Data-File': selected,
    },
  });
}
