import { useState, useMemo } from 'react';
import { Box, Typography, Grid } from '@mui/material';
import { ThemeProvider } from './components/ui/ThemeProvider';
import { Layout } from './components/ui/Layout';
import { FileUpload } from './components/transactions/FileUpload';
import { GlobalStats } from './components/dashboard/GlobalStats';
import { MemberCards } from './components/dashboard/MemberCards';
import { CategoryPieChart } from './components/charts/CategoryPieChart';
import { MonthlyTrendChart } from './components/charts/MonthlyTrendChart';
import { TransactionsTable } from './components/transactions/TransactionsTable';
import { TimeRangeSlider } from './components/ui/TimeRangeSlider';
import { CategoryManager } from './components/transactions/CategoryManager';
import {
  GlobalOverviewSection,
  CategoryInsightsSection,
  PerMemberInsightsSection,
  FairnessBalanceSection,
  SectionCard,
  CorrelationCoefficientChart,
  BoxPlotChart,
  ExpenseHistogram,
  SpendingScatterChart,
  DescriptiveStatistics,
} from './components/analytics';
import { useStore, useFilteredTransactions } from './store';

import { getTranslation } from './i18n/translations';

type PageType = 'dashboard' | 'categories' | 'transactions' | 'analytics';

const DashboardPage = () => {
  const { parsedData, language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);

  return (
    <Box className="animate-fade-in">
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t.dashboard.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t.dashboard.subtitle}
      </Typography>

      <FileUpload />

      {parsedData && (
        <>
          <GlobalStats />
          <MemberCards />
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <CategoryPieChart />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <MonthlyTrendChart />
            </Grid>
          </Grid>

        </>
      )}
    </Box>
  );
};

const CategoriesPage = () => {
  return <CategoryManager />;
};

const TransactionsPage = () => {
  const { parsedData, language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);

  return (
    <Box className="animate-fade-in">
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t.transactions.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        {t.transactions.subtitle}
      </Typography>

      {!parsedData ? (
        <FileUpload />
      ) : (
        <>
          <TimeRangeSlider />
          <TransactionsTable />
        </>
      )}
    </Box>
  );
};

const AnalyticsPage = () => {
  const { parsedData, language } = useStore();
  const t = useMemo(() => getTranslation(language), [language]);
  
  // Get filtered transactions from store (filtered by TimeRangeSlider)
  const filteredTransactions = useFilteredTransactions();

  // Primary currency
  const currency = parsedData?.currency || 'EUR';

  return (
    <Box className="animate-fade-in">
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {t.analytics.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t.analytics.subtitle}
      </Typography>

      {!parsedData ? (
        <FileUpload />
      ) : (
        <>
          {/* Global Time Range Slider */}
          <TimeRangeSlider />

          {/* Section 1: Global Overview */}
          <GlobalOverviewSection
            transactions={filteredTransactions}
            currency={currency}
          />

          {/* Section 2: Category Insights */}
          <CategoryInsightsSection
            transactions={filteredTransactions}
            currency={currency}
          />

          {/* Section 3: Per-member Insights */}
          <PerMemberInsightsSection
            transactions={filteredTransactions}
            members={parsedData.members}
            currency={currency}
          />

          {/* Section 4: Fairness & Balance */}
          <FairnessBalanceSection
            transactions={filteredTransactions}
            currency={currency}
          />

          {/* Section 5: Data visualizations */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <SectionCard
                title={t.analytics.correlationCoefficient}
                description={t.analytics.correlationCoefficientDesc}
              >
                <CorrelationCoefficientChart transactions={filteredTransactions} />
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <SectionCard title={t.analytics.boxPlot} description={t.analytics.boxPlotDesc}>
                <BoxPlotChart transactions={filteredTransactions} currency={currency} />
              </SectionCard>
            </Grid>
          </Grid>

          {/* Section 6: Distribution and descriptive analysis */}
          <SectionCard
            title={t.analytics.distributionAnalysis}
            description={t.analytics.distributionAnalysisDesc}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  {t.analytics.expenseHistogram}
                </Typography>
                <ExpenseHistogram transactions={filteredTransactions} />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  {t.analytics.descriptiveStatistics}
                </Typography>
                <DescriptiveStatistics transactions={filteredTransactions} currency={currency} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  {t.analytics.spendingParticipants}
                </Typography>
                <SpendingScatterChart transactions={filteredTransactions} currency={currency} />
              </Grid>
            </Grid>
          </SectionCard>
        </>
      )}
    </Box>
  );
};

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'transactions':
        return <TransactionsPage />;
      case 'analytics':
        return <AnalyticsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <ThemeProvider>
      <Layout currentPage={currentPage} onPageChange={(p) => setCurrentPage(p as PageType)}>
        {renderPage()}
      </Layout>
    </ThemeProvider>
  );
}

export default App;
