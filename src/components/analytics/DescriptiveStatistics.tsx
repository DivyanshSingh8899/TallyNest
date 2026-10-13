import React, { useMemo } from 'react';
import { Box, Grid, Typography } from '@mui/material';
import { useStore } from '../../store';
import { formatCurrency } from '../../utils/formatters';
import { getTranslation } from '../../i18n/translations';
import type { Transaction } from '../../types';

interface DescriptiveStatisticsProps {
  transactions: Transaction[];
  currency: string;
}

export const DescriptiveStatistics: React.FC<DescriptiveStatisticsProps> = ({ transactions, currency }) => {
  const { language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);
  const stats = useMemo(() => {
    const values = transactions.filter((transaction) => !transaction.isTransfer && transaction.currency === currency).map((transaction) => transaction.cost).sort((a, b) => a - b);
    if (values.length === 0) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const median = values.length % 2 === 0 ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2 : values[Math.floor(values.length / 2)];
    return { count: values.length, mean, median, standardDeviation: Math.sqrt(variance), minimum: values[0], maximum: values[values.length - 1] };
  }, [transactions, currency]);

  if (!stats) return <Typography color="text.secondary">{t.analytics.noDataAvailable}</Typography>;
  const items = [
    [t.analytics.expenseCount, stats.count.toString()],
    [t.analytics.mean, formatCurrency(stats.mean, currency)],
    [t.analytics.median, formatCurrency(stats.median, currency)],
    [t.analytics.standardDeviation, formatCurrency(stats.standardDeviation, currency)],
    [t.analytics.minimum, formatCurrency(stats.minimum, currency)],
    [t.analytics.maximum, formatCurrency(stats.maximum, currency)],
  ];

  return (
    <Grid container spacing={1.5}>
      {items.map(([label, value]) => (
        <Grid key={label} size={{ xs: 6, sm: 4 }}>
          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="subtitle1" fontWeight={700}>{value}</Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
};