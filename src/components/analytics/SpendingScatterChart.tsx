import React, { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../../store';
import { formatCurrency } from '../../utils/formatters';
import { getTranslation } from '../../i18n/translations';
import type { Transaction } from '../../types';

interface SpendingScatterChartProps {
  transactions: Transaction[];
  currency: string;
}

const correlation = (left: number[], right: number[]) => {
  if (left.length < 2) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(
    left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) *
    right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0)
  );
  return denominator === 0 ? 0 : numerator / denominator;
};

export const SpendingScatterChart: React.FC<SpendingScatterChartProps> = ({ transactions, currency }) => {
  const theme = useTheme();
  const { language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);
  const data = useMemo(() => transactions
    .filter((transaction) => !transaction.isTransfer && transaction.currency === currency)
    .map((transaction) => ({
      amount: transaction.cost,
      participants: Object.values(transaction.memberBalances).filter((balance) => balance !== 0).length,
      description: transaction.description,
    })), [transactions, currency]);
  const coefficient = correlation(data.map((item) => item.amount), data.map((item) => item.participants));

  if (data.length < 2) {
    return <Typography color="text.secondary">{t.analytics.noDataAvailable}</Typography>;
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t.analytics.scatterDesc} <strong>r = {coefficient.toFixed(2)}</strong>
      </Typography>
      <Box sx={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ScatterChart margin={{ top: 12, right: 18, left: 8, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
            <XAxis type="number" dataKey="amount" name={t.transactions.amount} tickFormatter={(value) => formatCurrency(value, currency)} tick={{ fontSize: 11 }} />
            <YAxis type="number" dataKey="participants" name={t.analytics.participants} allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, name) => [value, name]} />
            <Scatter name={t.analytics.expenses} data={data} fill="#ff652f" fillOpacity={0.72} />
          </ScatterChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};