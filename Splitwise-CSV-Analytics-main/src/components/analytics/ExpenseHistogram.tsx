import React, { useMemo, useState } from 'react';
import { Box, Tab, Tabs, Typography, useTheme } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../../store';
import { formatCurrency } from '../../utils/formatters';
import { getTranslation } from '../../i18n/translations';
import type { Transaction } from '../../types';

interface ExpenseHistogramProps {
  transactions: Transaction[];
}

export const ExpenseHistogram: React.FC<ExpenseHistogramProps> = ({ transactions }) => {
  const theme = useTheme();
  const { language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

  const currencies = useMemo(
    () => Array.from(new Set(transactions.filter((transaction) => !transaction.isTransfer).map((transaction) => transaction.currency))).sort(),
    [transactions]
  );
  const currency = selectedCurrency && currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0];

  const data = useMemo(() => {
    const values = transactions
      .filter((transaction) => !transaction.isTransfer && transaction.currency === currency && transaction.cost >= 0)
      .map((transaction) => transaction.cost);
    if (values.length === 0) return [];

    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const binCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const width = maximum === minimum ? 1 : (maximum - minimum) / binCount;

    return Array.from({ length: binCount }, (_, index) => {
      const start = minimum + index * width;
      const end = index === binCount - 1 ? maximum : start + width;
      return {
        range: `${formatCurrency(start, currency)}-${formatCurrency(end, currency)}`,
        count: values.filter((value) => value >= start && (index === binCount - 1 ? value <= end : value < end)).length,
      };
    });
  }, [transactions, currency]);

  if (!currency || data.length === 0) {
    return <Typography color="text.secondary">{t.analytics.noDataAvailable}</Typography>;
  }

  return (
    <Box>
      {currencies.length > 1 && (
        <Tabs
          value={Math.max(0, currencies.indexOf(currency))}
          onChange={(_, index) => setSelectedCurrency(currencies[index])}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 32, mb: 1, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' } }}
        >
          {currencies.map((item) => <Tab key={item} label={item} />)}
        </Tabs>
      )}
      <Box sx={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 12, right: 18, left: 8, bottom: 52 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="range" angle={-35} textAnchor="end" height={76} tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name={t.analytics.transactionFrequency} fill="#48be9d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};