'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, formatNumber, MeterReading, parseMeterCsv, toDate } from '../lib/data';
import { lookupCommercialAccount } from '../lib/account-map';
import { lookupProperty } from '../lib/property-map';

const DATA_FILE = '/data/AiM_meter_readings_2026-10-26.csv';

function shortName(id: string) {
  if (!id) return 'Not assigned';
  return id.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, value % 1 ? 1 : 0);
}

export default function Dashboard() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [selectedUom, setSelectedUom] = useState('KWH');
  const [selectedMeter, setSelectedMeter] = useState('All meters');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showOnlyExceptions, setShowOnlyExceptions] = useState(false);
  const [mappingSearch, setMappingSearch] = useState('');
  const [selectedMapping, setSelectedMapping] = useState<{ kind: 'building' | 'account'; value: string } | null>(null);

  useEffect(() => {
    fetch(DATA_FILE).then((response) => response.text()).then((csv) => setReadings(parseMeterCsv(csv)));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const property = params.get('property');
    const use = params.get('use');
    if (property) {
      setSelectedMapping({ kind: 'building', value: property });
      setSelectedUom('All units');
    }
    if (use) {
      setMappingSearch(use);
      document.getElementById('mapping')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const uoms = useMemo(() => Array.from(new Set(readings.map((row) => row.normalizedUom))).sort(), [readings]);
  const meters = useMemo(() => Array.from(new Set(readings.filter((row) => !selectedUom || row.normalizedUom === selectedUom).map((row) => row.meter))).sort(), [readings, selectedUom]);

  const filtered = useMemo(() => readings.filter((row) => {
    const date = toDate(row.readingDate);
    const matchesUom = selectedUom === 'All units' || row.normalizedUom === selectedUom;
    const matchesMeter = selectedMeter === 'All meters' || row.meter === selectedMeter;
    const haystack = `${row.meter} ${row.description} ${row.readerId} ${row.asset?.asset || ''} ${row.asset?.property || ''} ${row.asset?.parentCommercialMeter || ''}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStart = !startDate || (date && date >= new Date(`${startDate}T00:00:00`));
    const matchesEnd = !endDate || (date && date <= new Date(`${endDate}T23:59:59`));
    const matchesException = !showOnlyExceptions || row.adjusted || !row.verified || Boolean(row.error);
    const matchesMapping = !selectedMapping || (selectedMapping.kind === 'building' ? row.asset?.property === selectedMapping.value : row.asset?.parentCommercialMeter === selectedMapping.value);
    return Boolean(matchesUom && matchesMeter && matchesSearch && matchesStart && matchesEnd && matchesException && matchesMapping);
  }), [readings, selectedUom, selectedMeter, search, startDate, endDate, showOnlyExceptions, selectedMapping]);

  const summary = useMemo(() => {
    const usage = filtered.reduce((sum, row) => sum + row.normalizedUsage, 0);
    const units = Array.from(new Set(filtered.map((row) => row.normalizedUom)));
    const verified = filtered.filter((row) => row.verified).length;
    const exceptions = filtered.filter((row) => row.adjusted || !row.verified || row.error).length;
    return { usage, units, verified, exceptions, meters: new Set(filtered.map((row) => row.meter)).size, mapped: filtered.filter((row) => row.asset).length };
  }, [filtered]);

  const monthly = useMemo(() => {
    const grouped = new Map<string, { label: string; usage: number; count: number }>();
    filtered.forEach((row) => {
      const date = toDate(row.readingDate);
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const previous = grouped.get(key) || { label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), usage: 0, count: 0 };
      previous.usage += row.normalizedUsage;
      previous.count += 1;
      grouped.set(key, previous);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-18).map(([, value]) => value);
  }, [filtered]);

  const topMeters = useMemo(() => {
    const grouped = new Map<string, number>();
    filtered.forEach((row) => grouped.set(row.meter, (grouped.get(row.meter) || 0) + row.normalizedUsage));
    return Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  const maxMonthly = Math.max(...monthly.map((row) => row.usage), 1);
  const maxMeter = Math.max(...topMeters.map(([, value]) => value), 1);
  const recent = [...filtered].sort((a, b) => (toDate(b.readingDate)?.getTime() || 0) - (toDate(a.readingDate)?.getTime() || 0)).slice(0, 10);

  const buildingRows = useMemo(() => {
    const grouped = new Map<string, { code: string; meters: Set<string>; readings: number; utilities: Set<string> }>();
    readings.forEach((row) => {
      const property = row.asset?.property;
      if (!property) return;
      const existing = grouped.get(property) || { code: property, meters: new Set<string>(), readings: 0, utilities: new Set<string>() };
      existing.meters.add(row.asset?.asset || row.meter);
      existing.readings += 1;
      existing.utilities.add(row.asset?.assetType || 'Other');
      grouped.set(property, existing);
    });
    return Array.from(grouped.values()).filter((row) => {
      const info = lookupProperty(row.code);
      return !mappingSearch || `${row.code} ${info?.name || ''} ${info?.use || ''}`.toLowerCase().includes(mappingSearch.toLowerCase());
    }).sort((a, b) => (lookupProperty(a.code)?.name || a.code).localeCompare(lookupProperty(b.code)?.name || b.code));
  }, [readings, mappingSearch]);

  const accountRows = useMemo(() => {
    const grouped = new Map<string, { account: string; meters: Set<string>; properties: Set<string>; readings: number; utilities: Set<string> }>();
    readings.forEach((row) => {
      const account = row.asset?.parentCommercialMeter;
      if (!account) return;
      const existing = grouped.get(account) || { account, meters: new Set<string>(), properties: new Set<string>(), readings: 0, utilities: new Set<string>() };
      existing.meters.add(row.asset?.asset || row.meter);
      if (row.asset?.property) existing.properties.add(row.asset.property);
      existing.readings += 1;
      if (row.asset?.assetType) existing.utilities.add(row.asset.assetType);
      grouped.set(account, existing);
    });
    return Array.from(grouped.values()).filter((row) => {
      const info = lookupCommercialAccount(row.account);
      return !mappingSearch || `${row.account} ${info?.description || ''} ${info?.utilityType || ''} ${info?.rate || ''}`.toLowerCase().includes(mappingSearch.toLowerCase());
    }).sort((a, b) => b.meters.size - a.meters.size);
  }, [readings, mappingSearch]);

  function resetFilters() {
    setSelectedUom('KWH'); setSelectedMeter('All meters'); setSearch(''); setStartDate(''); setEndDate(''); setShowOnlyExceptions(false); setMappingSearch(''); setSelectedMapping(null);
  }

  function selectMapping(kind: 'building' | 'account', value: string) {
    setSelectedMapping(selectedMapping?.kind === kind && selectedMapping.value === value ? null : { kind, value });
    setSelectedUom('All units');
    setSelectedMeter('All meters');
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">A</div><div><strong>AiM</strong><span>Meter intelligence</span></div></div>
        <nav><a className="active" href="#overview"><span>◈</span> Overview</a><a href="/buildings"><span>⌘</span> Building rankings</a><a href="/weather"><span>☼</span> Weather normalization</a><a href="#mapping"><span>⌘</span> Buildings & accounts</a><a href="#readings"><span>▦</span> Readings</a><a href="#meters"><span>◌</span> Meter health</a></nav>
        <div className="sidebar-bottom"><div className="sync-dot" /> <div><small>Data source</small><strong>AssetWorks AiM</strong><span>Synced Oct 26, 2026</span></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">OPERATIONS / UTILITIES</p><h1>Meter readings</h1></div><div className="top-actions"><span className="status-pill"><i /> Live dataset</span><button className="export-btn" onClick={() => window.open(DATA_FILE, '_blank')}>↗ View source CSV</button></div></header>
        <div className="filter-panel">
          <div className="filter-heading"><span>Filters</span><button onClick={resetFilters}>Reset all</button></div>
          <label className="search-field"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search meter or description" /></label>
          <label><span>Unit</span><select value={selectedUom} onChange={(e) => { setSelectedUom(e.target.value); setSelectedMeter('All meters'); }}><option>All units</option>{uoms.map((uom) => <option key={uom}>{uom}</option>)}</select></label>
          <label><span>Meter</span><select value={selectedMeter} onChange={(e) => setSelectedMeter(e.target.value)}><option>All meters</option>{meters.map((meter) => <option key={meter}>{meter}</option>)}</select></label>
          <label><span>From</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <button className={`exception-toggle ${showOnlyExceptions ? 'on' : ''}`} onClick={() => setShowOnlyExceptions(!showOnlyExceptions)}><span className="toggle-dot" /> Exceptions only</button>
        </div>
        <div className="result-line"><span>Showing <strong>{formatNumber(filtered.length)}</strong> readings {selectedUom !== 'All units' ? `normalized to ${selectedUom}` : 'across all utilities'}{selectedMapping ? ` · filtered to ${selectedMapping.kind === 'building' ? 'building' : 'account'} ${selectedMapping.value}` : ''}</span><span className="result-note">{selectedMapping && <button className="clear-mapping" onClick={() => setSelectedMapping(null)}>Clear mapping</button>}{summary.exceptions ? `${formatNumber(summary.exceptions)} need review` : 'No exceptions in view'}</span></div>
        <section id="overview" className="kpis"><article><span className="kpi-label">Total usage</span><strong>{compact(summary.usage)}</strong><small>{summary.units.length === 1 ? summary.units[0] : 'normalized units'} · selected range</small></article><article><span className="kpi-label">Readings</span><strong>{formatNumber(filtered.length)}</strong><small>{summary.meters} active meters</small></article><article><span className="kpi-label">Mapped</span><strong>{filtered.length ? `${Math.round(summary.mapped / filtered.length * 100)}%` : '—'}</strong><small>{formatNumber(summary.mapped)} of {formatNumber(filtered.length)} readings</small></article><article className={summary.exceptions ? 'warning' : ''}><span className="kpi-label">Exceptions</span><strong>{formatNumber(summary.exceptions)}</strong><small>{summary.exceptions ? 'Adjusted or unverified' : 'Everything looks clean'}</small></article></section>
        <section id="mapping" className="mapping-section"><div className="mapping-intro"><div><p className="eyebrow">ASSET HIERARCHY</p><h2>Buildings & commercial accounts</h2><p>Click a building or account to filter the dashboard to that hierarchy node. Search by property, asset, account, utility, or rate.</p></div><label className="mapping-search"><span>⌕</span><input value={mappingSearch} onChange={(e) => setMappingSearch(e.target.value)} placeholder="Search the mapping" /></label></div><div className="mapping-grid"><article className="card mapping-card"><div className="card-head"><div><p className="eyebrow">BUILDINGS</p><h2>{buildingRows.length} mapped properties</h2></div><span className="unit-tag">{new Set(readings.flatMap((row) => row.asset?.asset ? [row.asset.asset] : [])).size} assets</span></div><div className="mapping-list">{buildingRows.map((row) => { const info = lookupProperty(row.code); const selected = selectedMapping?.kind === 'building' && selectedMapping.value === row.code; return <button className={`mapping-row ${selected ? 'selected' : ''}`} key={row.code} onClick={() => selectMapping('building', row.code)}><div className="mapping-icon">⌂</div><div className="mapping-main"><div><strong>{info?.name || row.code}</strong><span>{row.code} · {info?.use || 'Property'}</span></div><small>{row.meters.size} meters · {formatNumber(row.readings)} readings · {Array.from(row.utilities).join(' / ')}</small></div><span className="row-arrow">→</span></button>; })}</div></article><article className="card mapping-card"><div className="card-head"><div><p className="eyebrow">PARENT ACCOUNTS</p><h2>{accountRows.length} commercial accounts</h2></div><span className="unit-tag">Roll-ups</span></div><div className="mapping-list">{accountRows.map((row) => { const info = lookupCommercialAccount(row.account); const selected = selectedMapping?.kind === 'account' && selectedMapping.value === row.account; return <button className={`account-row ${selected ? 'selected' : ''}`} key={row.account} onClick={() => selectMapping('account', row.account)}><div className="account-badge">{info?.utilityType?.startsWith('NATURAL') ? 'G' : 'E'}</div><div className="mapping-main"><div><strong>{row.account}</strong><span>{info?.description || 'Commercial account'}</span></div><small>{row.meters.size} meters · {row.properties.size} properties · {info?.rate || 'Rate not provided'}</small></div><span className="account-type">{info?.utilityType?.replace('-7460', '').replace('-7450', '') || Array.from(row.utilities).join(' / ')}</span><span className="row-arrow">→</span></button>; })}</div></article></div></section>
        <section className="grid-two"><article className="card chart-card"><div className="card-head"><div><p className="eyebrow">TREND</p><h2>Usage by month</h2></div><span className="unit-tag">{selectedUom === 'All units' ? 'Normalized units' : selectedUom}</span></div>{monthly.length ? <div className="bar-chart" aria-label="Monthly usage chart">{monthly.map((item) => <div className="bar-wrap" key={item.label} title={`${item.label}: ${formatNumber(item.usage, 1)}`}><div className="bar" style={{ height: `${Math.max(item.usage / maxMonthly * 100, 3)}%` }} /><span>{item.label}</span></div>)}</div> : <div className="empty">No readings match these filters.</div>}</article><article id="meters" className="card"><div className="card-head"><div><p className="eyebrow">RANKING</p><h2>Highest usage meters</h2></div><span className="muted">Top 8</span></div><div className="meter-list">{topMeters.map(([meter, value], index) => <div className="meter-row" key={meter}><span className="rank">0{index + 1}</span><div className="meter-info"><div><strong>{meter}</strong><span>{compact(value)} {selectedUom === 'All units' ? 'normalized' : selectedUom}</span></div><div className="meter-track"><i style={{ width: `${value / maxMeter * 100}%` }} /></div></div></div>)}</div></article></section>
        <section id="readings" className="card table-card"><div className="card-head"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent readings</h2></div><span className="muted">Latest 10 by reading date · normalized and mapped</span></div><div className="table-wrap"><table><thead><tr><th>Asset / meter</th><th>Property</th><th>Parent commercial meter</th><th>Reading date</th><th>Unit</th><th>Usage</th><th>Status</th><th /></tr></thead><tbody>{recent.map((row) => <tr key={`${row.meter}-${row.readingDate}-${row.invoiceDate}`}><td><strong>{row.asset?.asset || 'Unmapped'}</strong><small>{row.meter} · {row.asset?.assetType || 'Needs mapping'}</small></td><td>{row.asset?.property || '—'}</td><td>{row.asset?.parentCommercialMeter || '—'}</td><td>{formatDate(row.readingDate)}</td><td><span className="unit-tag">{row.normalizedUom}</span></td><td className="usage-cell">{formatNumber(row.normalizedUsage, 1)}</td><td><span className={`status ${row.verified && !row.adjusted ? 'verified' : 'review'}`}><i />{row.adjusted ? 'Adjusted' : row.verified ? 'Verified' : 'Review'}</span></td><td><a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">↗</a></td></tr>)}</tbody></table>{!recent.length && <div className="empty">No readings match these filters.</div>}</div></section>
        <footer>AiM Meter Intelligence <span>•</span> Built for facilities operations <span>•</span> Source: AssetWorks AiM export</footer>
      </section>
    </main>
  );
}
