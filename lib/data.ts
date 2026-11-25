      billingPeriod: cells[3] || '',
      readerId: cells[5] || '',
      description: cells[7] || '',
      usage,
      previousReading: pair?.previous,
      currentReading: pair?.current,
      adjusted: cells[11] === 'Yes',
      verified: cells[12] === 'Yes',
      invoiceDate: cells[13] || '',
      sourceUrl: cells[14] || '',
      error: cells[15] || '',
      sourceNormalizedUsage: normalized.normalizedUsage,
    };
  });

  // B72B has a 100,000-point rollover and a 120x multiplier. AssetWorks
  // exports rollover intervals as false multi-million-KWH spikes. Replace
  // those outliers with the mean of the adjacent valid B72B periods while
  // retaining the original source value for auditability.
  const b72bManualCorrections: Record<string, number> = {
    'Aug 15, 2023 12:00 AM': 8_520,
    'Sep 15, 2023 12:00 AM': 8_640,
  };

  return parsed.map((row, index, allRows) => {
    const manualCorrection = row.meter === 'B72B.1' ? b72bManualCorrections[row.readingDate] : undefined;
    if (manualCorrection !== undefined) {
      return {
        ...row,
        normalizedUsage: manualCorrection,
        corrected: true,
        correctionReason: 'B72B source reading correction for rollover/meter-entry error',
      };
    }

    if (row.meter !== 'B72B.1' || row.normalizedUom !== 'KWH' || row.normalizedUsage <= 1_000_000) return row;
    const neighbors = [allRows[index - 1], allRows[index + 1]]
      .filter((neighbor) => Boolean(neighbor && neighbor.meter === row.meter && neighbor.normalizedUom === 'KWH' && neighbor.normalizedUsage > 0 && neighbor.normalizedUsage <= 100_000));
    if (!neighbors.length) return row;
    const replacement = neighbors.reduce((sum, neighbor) => sum + (neighbor?.normalizedUsage || 0), 0) / neighbors.length;
    return {
      ...row,
      normalizedUsage: replacement,
      corrected: true,
      correctionReason: 'B72B rollover outlier replaced with adjacent-period average',
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
