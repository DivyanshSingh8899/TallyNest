import React, { useMemo } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip, BarChart, Bar, ErrorBar } from 'recharts';
import { useStore } from '../../store';
import { formatCurrency } from '../../utils/formatters';
import { getTranslation } from '../../i18n/translations';
import type { Transaction } from '../../types';

interface BoxPlotChartProps {
  transactions: Transaction[];
  currency: string;
}

const percentile = (values: number[], fraction: number) => {
  const position = (values.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
};

export const BoxPlotChart: React.FC<BoxPlotChartProps> = ({ transactions, currency }) => {
  const theme = useTheme();
  const { language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);

  const data = useMemo(() => {
    const grouped = new Map<string, number[]>();
    transactions
      .filter((transaction) => !transaction.isTransfer && transaction.cost >= 0)
      .forEach((transaction) => {
        const values = grouped.get(transaction.category) || [];
        values.push(transaction.cost);
        grouped.set(transaction.category, values);
      });

    return Array.from(grouped.entries())
      .map(([category, rawValues]) => {
        const values = rawValues.sort((a, b) => a - b);
        const q1 = percentile(values, 0.25);
        const median = percentile(values, 0.5);
        const q3 = percentile(values, 0.75);
        return {
          category,
          box: [q1, q3],
          median,
          error: [median - values[0], values[values.length - 1] - median],
          minimum: values[0],
          maximum: values[values.length - 1],
          count: values.length,
        };
      })
      .sort((left, right) => right.median - left.median)
      .slice(0, 12);
  }, [transactions]);

  if (data.length === 0) {
    return <Typography color="text.secondary">{t.analytics.noDataAvailable}</Typography>;
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t.analytics.boxPlotDesc}
      </Typography>
      <Box sx={{ height: 330 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 12, right: 20, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="category" angle={-35} textAnchor="end" height={70} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => formatCurrency(value, currency)} />
            <Tooltip
              formatter={(_value, _name, item) => {
                const entry = item.payload;
                return [
                  `${formatCurrency(entry.minimum, currency)} - ${formatCurrency(entry.maximum, currency)} | ${t.analytics.median}: ${formatCurrency(entry.median, currency)} (${entry.count})`,
                  t.analytics.range,
                ];
              }}
            />
            <Bar dataKey="box" fill="#48be9d" fillOpacity={0.78} radius={[3, 3, 3, 3]}>
              <ErrorBar dataKey="error" width={14} stroke="#ff652f" strokeWidth={2} direction="y" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};