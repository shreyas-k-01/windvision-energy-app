import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileClock,
  Gauge,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDashboard } from './api.js';

const DECISION_MONTH = '2026-01';
const INITIAL_DECISION_DATE = '2026-01-13';
const INITIAL_CUTOFF = '10:00';
const HOURS_PER_DAY = 24;

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', options);
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function formatPublished(value) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function decisionToDeliveryDate(decisionDate) {
  const date = new Date(`${decisionDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function downloadCsv(records) {
  const columns = [
    'decision_date',
    'delivery_date',
    'start_time',
    'publish_time',
    'forecast_mw',
    'actual_mw',
    'error_mw',
  ];
  const rows = [
    columns.join(','),
    ...records.map((record) =>
      columns
        .map((key) => `"${String(record[key] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    ),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'windvision-january-2026-decision-analysis.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, unit, note, icon: Icon, tone = 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}><Icon size={18} /></span>
      </div>
      <div className="metric-value">{value}<small>{unit ? ` ${unit}` : ''}</small></div>
      <p>{note}</p>
    </article>
  );
}

function SectionTitle({ eyebrow, title, aside }) {
  return (
    <div className="section-title-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {aside && <div className="section-aside">{aside}</div>}
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="empty-state">{message}</div>;
}

export default function App() {
  const [activePage, setActivePage] = useState('decision');
  const [decisionDate, setDecisionDate] = useState(INITIAL_DECISION_DATE);
  const [cutoffTime, setCutoffTime] = useState(INITIAL_CUTOFF);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadData(forceRefresh = false) {
    setError('');
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await getDashboard({
        decisionMonth: DECISION_MONTH,
        cutoffTime,
        refresh: forceRefresh,
      });
      setData(result);
    } catch (err) {
      setError(err.message || 'Could not load Elexon data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData(false);
    // The API response is intentionally reloaded when the decision cutoff changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffTime]);

  const deliveryDate = useMemo(
    () => decisionToDeliveryDate(decisionDate),
    [decisionDate],
  );

  const allRecords = data?.records || [];
  const summary = data?.summary || {};
  const dailyMetrics = data?.daily_metrics || [];

  const selectedRecords = useMemo(
    () => allRecords
      .filter((row) => row.delivery_date === deliveryDate)
      .slice()
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time)),
    [allRecords, deliveryDate],
  );

  const selectedDaily = useMemo(
    () => dailyMetrics.find((row) => row.delivery_date === deliveryDate) || null,
    [dailyMetrics, deliveryDate],
  );

  const selectedVersions = useMemo(() =>
    (data?.forecast_versions || [])
      .filter((row) => row.delivery_date === deliveryDate)
      .slice()
      .sort((a, b) => new Date(a.publish_time) - new Date(b.publish_time)),
  [data, deliveryDate]);

  const selectedChart = selectedRecords.map((row) => ({
    hour: formatTime(row.start_time),
    forecast: row.forecast_mw,
    actual: row.actual_mw,
  }));

  const dailyChart = dailyMetrics.map((row) => ({
    date: formatDate(row.delivery_date, { day: '2-digit', month: 'short' }),
    mae: row.mae_mw,
    bias: row.bias_mw,
  }));

  const worstDays = dailyMetrics
    .filter((row) => row.mae_mw !== null && row.mae_mw !== undefined)
    .slice()
    .sort((a, b) => Number(b.mae_mw) - Number(a.mae_mw))
    .slice(0, 5);

  const forecastRows = selectedRecords.filter((row) => row.forecast_mw !== null && row.forecast_mw !== undefined);
  const actualRows = selectedRecords.filter((row) => row.actual_mw !== null && row.actual_mw !== undefined);
  const matchedRows = selectedRecords.filter((row) => row.forecast_mw != null && row.actual_mw != null);
  const averageForecast = selectedDaily?.average_forecast_mw;
  const latestUsedPublication = selectedRecords
    .map((row) => row.publish_time)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const uniquePublications = new Set(selectedRecords.map((row) => row.publish_time).filter(Boolean)).size;
  const monthlyBias = Number(summary.bias_mw || 0);
  const selectedDayBias = Number(selectedDaily?.bias_mw || 0);

  const monthlyInsight = monthlyBias > 0
    ? `Across the January backtest, wind forecasts were ${formatNumber(Math.abs(monthlyBias))} MW higher than actual generation on average. Treat the forecast as an estimate, not guaranteed supply.`
    : monthlyBias < 0
      ? `Across the January backtest, wind forecasts were ${formatNumber(Math.abs(monthlyBias))} MW lower than actual generation on average.`
      : 'Across the January backtest, average forecast and actual wind generation were closely aligned.';

  const decisionGuidance = Number(summary.coverage_pct) < 100
    ? 'Some expected hourly comparisons are missing. Review the unavailable periods before relying on this day-ahead profile.'
    : forecastRows.length < HOURS_PER_DAY
      ? `Only ${forecastRows.length} of ${HOURS_PER_DAY} hourly forecasts are available for this delivery day. Check the forecast issue history before using the profile.`
      : monthlyBias > 0
        ? 'Historical forecasts tended to overestimate wind output. When assessing how much wind supply to rely on, account for the measured forecast error and review contingency options.'
        : monthlyBias < 0
          ? 'Historical forecasts tended to underestimate wind output. Review the hourly forecast profile and the historical error before finalising the procurement view.'
          : 'Historical average bias is close to zero. Review the hourly forecast profile and the size of historical errors before finalising the procurement view.';

  const hasData = Boolean(data && allRecords.length > 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Wind size={23} /></div>
          <div>
            <div className="brand-name">WindVision</div>
            <div className="brand-sub">DAY-AHEAD WIND INTELLIGENCE</div>
          </div>
        </div>

        <div className="nav-caption">DECISION WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={`nav-item ${activePage === 'decision' ? 'active' : ''}`} onClick={() => setActivePage('decision')}>
            <Gauge size={18} /><span>Decision brief</span>
          </button>
          <button className={`nav-item ${activePage === 'forecast' ? 'active' : ''}`} onClick={() => setActivePage('forecast')}>
            <Wind size={18} /><span>Hourly forecast</span>
          </button>
          <button className={`nav-item ${activePage === 'accuracy' ? 'active' : ''}`} onClick={() => setActivePage('accuracy')}>
            <Activity size={18} /><span>Forecast accuracy</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="source-card">
            <span className="source-icon"><CheckCircle2 size={17} /></span>
            <div><strong>Data source</strong><span>Elexon BMRS · Great Britain</span></div>
          </div>
          <div className="sidebar-footnote">JANUARY 2026 PILOT<br />HISTORICAL DECISION ANALYSIS</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">WINDVISION <span>/</span> DAY-AHEAD PROCUREMENT</div>
          <div className="topbar-right">
            <span className="historical-chip">Historical pilot · Jan 2026</span>
            <button className="icon-button" onClick={() => loadData(true)} disabled={loading || refreshing} title="Refresh Elexon data" aria-label="Refresh data">
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow">DAY-AHEAD PROCUREMENT DECISION SUPPORT</div>
            <h1>{activePage === 'decision' ? 'Decision brief' : activePage === 'forecast' ? 'Hourly wind forecast' : 'Forecast accuracy'}</h1>
            <p>See the wind forecast available at the decision cutoff and the historical error that should inform procurement planning.</p>
          </div>
          <div className="decision-filters">
            <label>
              <span>DECISION DATE</span>
              <div className="filter-control"><CalendarDays size={15} /><input type="date" min="2026-01-01" max="2026-01-31" value={decisionDate} onChange={(event) => setDecisionDate(event.target.value)} /></div>
            </label>
            <label>
              <span>DECISION CUTOFF · UK</span>
              <div className="filter-control"><Clock3 size={15} /><input type="time" value={cutoffTime} onChange={(event) => setCutoffTime(event.target.value)} /></div>
            </label>
          </div>
        </section>

        <div className="context-strip">
          <div><span className="context-label">DECISION</span><strong>{formatDate(decisionDate)}</strong></div>
          <div className="context-arrow">→</div>
          <div><span className="context-label">DELIVERY DAY</span><strong>{formatDate(deliveryDate)}</strong></div>
          <div className="context-divider" />
          <div><span className="context-label">FORECAST RULE</span><strong>Latest issue published by {cutoffTime} UK</strong></div>
          <button className="export-button" onClick={() => downloadCsv(allRecords)} disabled={!hasData}><Download size={15} /> Export CSV</button>
        </div>

        {loading && <div className="loading-panel"><div className="loader" /><strong>Loading January 2026 decision data</strong><span>Fetching wind forecasts and actual generation from Elexon BMRS…</span></div>}

        {error && !loading && (
          <div className="error-banner">
            <AlertTriangle size={20} />
            <div><strong>Unable to load the decision data</strong><span>{error}</span></div>
            <button onClick={() => loadData(true)}>Try again</button>
          </div>
        )}

        {hasData && !loading && !error && (
          <>
            {activePage === 'decision' && (
              <>
                <section className="decision-hero">
                  <div className="hero-copy">
                    <div className="hero-kicker"><span className="hero-kicker-dot" /> DAY-AHEAD FORECAST AVAILABLE AT CUTOFF</div>
                    <div className="hero-main-value">{formatNumber(averageForecast)} <small>MW</small></div>
                    <h2>Average wind generation forecast for {formatDate(deliveryDate)}</h2>
                    <p>Built from the latest eligible WINDFOR publication for each delivery hour, using the selected {cutoffTime} UK decision cutoff.</p>
                  </div>
                  <div className="hero-details">
                    <div><span>Latest publication used</span><strong>{formatPublished(latestUsedPublication)}</strong></div>
                    <div><span>Forecast hours available</span><strong>{forecastRows.length} / {HOURS_PER_DAY}</strong></div>
                    <div><span>Publication versions used</span><strong>{uniquePublications}</strong></div>
                  </div>
                </section>

                <section className="metric-grid four-grid">
                  <MetricCard label="Historical MAE" value={formatNumber(summary.mae_mw)} unit="MW" note="Typical absolute forecast miss across January" icon={Activity} tone="blue" />
                  <MetricCard label="Historical RMSE" value={formatNumber(summary.rmse_mw)} unit="MW" note="Places more weight on large misses" icon={Gauge} tone="violet" />
                  <MetricCard label="Historical MAPE" value={formatNumber(summary.mape_pct, 1)} unit="%" note="Average percentage error; zero actuals excluded" icon={TrendingDown} tone="amber" />
                  <MetricCard label="Historical bias" value={`${monthlyBias > 0 ? '+' : ''}${formatNumber(monthlyBias)}`} unit="MW" note={monthlyBias > 0 ? 'Forecasts overestimated output on average' : monthlyBias < 0 ? 'Forecasts underestimated output on average' : 'No average directional bias'} icon={monthlyBias >= 0 ? TrendingUp : TrendingDown} tone="green" />
                </section>

                <section className="guidance-panel">
                  <div className="guidance-icon"><ShieldAlert size={21} /></div>
                  <div>
                    <div className="eyebrow">WHAT THIS MEANS FOR THE BUYER</div>
                    <h2>{monthlyBias > 0 ? 'Allow for the historical tendency to overforecast' : monthlyBias < 0 ? 'Review the historical tendency to underforecast' : 'Review forecast uncertainty before finalising procurement'}</h2>
                    <p>{decisionGuidance}</p>
                  </div>
                </section>

                <section className="panel chart-panel">
                  <SectionTitle eyebrow="DELIVERY-DAY PROFILE" title="Forecast generation by hour" aside={<span className="chart-unit">MW · hourly</span>} />
                  <div className="chart-legend"><span><i className="legend-dot forecast-dot" /> Forecast available at cutoff</span><span><i className="legend-dot actual-dot" /> Actual generation (retrospective)</span></div>
                  {selectedChart.some((row) => row.forecast != null || row.actual != null) ? (
                    <ResponsiveContainer width="100%" height={290}>
                      <LineChart data={selectedChart} margin={{ top: 12, right: 12, left: -12, bottom: 2 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#26374a" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                        <YAxis tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: '#101d2d', border: '1px solid #30445c', borderRadius: 9, color: '#edf4fb' }} formatter={(value, name) => [`${formatNumber(value)} MW`, name === 'forecast' ? 'Forecast' : 'Actual']} />
                        <Line type="monotone" dataKey="forecast" name="forecast" stroke="#57a8f5" strokeWidth={2.6} dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="actual" name="actual" stroke="#40c79c" strokeWidth={2.4} dot={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="No hourly forecast records are available for this delivery day." />}
                  <p className="chart-footnote">Actual generation is shown only for retrospective evaluation. It was not available when the original day-ahead purchase decision was made.</p>
                </section>

                <section className="panel table-panel">
                  <SectionTitle eyebrow="HOURLY DECISION EVIDENCE" title="Forecast used for each delivery hour" aside={<span className="status-pill">{matchedRows.length} matched hours</span>} />
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Delivery hour · UK</th><th>Forecast publication</th><th>Wind forecast</th><th>Actual outturn*</th><th>Forecast error*</th></tr></thead>
                      <tbody>
                        {selectedRecords.map((row) => (
                          <tr key={row.start_time}>
                            <td>{formatTime(row.start_time)}</td>
                            <td>{formatPublished(row.publish_time)}</td>
                            <td className="table-strong">{row.forecast_mw == null ? 'Unavailable' : `${formatNumber(row.forecast_mw)} MW`}</td>
                            <td>{row.actual_mw == null ? '—' : `${formatNumber(row.actual_mw)} MW`}</td>
                            <td className={Number(row.error_mw) > 0 ? 'positive-value' : Number(row.error_mw) < 0 ? 'negative-value' : ''}>{row.error_mw == null ? '—' : `${row.error_mw > 0 ? '+' : ''}${formatNumber(row.error_mw)} MW`}</td>
                          </tr>
                        ))}
                        {selectedRecords.length === 0 && <tr><td colSpan="5" className="table-empty">No records for this delivery day.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">* Actual outturn and error are retrospective validation fields. The decision-time forecast is the forecast shown in the third column. Each hour can use a different publication if a later issue did not contain that hour.</p>
                </section>
              </>
            )}

            {activePage === 'forecast' && (
              <>
                <section className="forecast-summary-grid">
                  <div className="small-stat"><span>Average wind forecast</span><strong>{formatNumber(averageForecast)} MW</strong><small>For delivery on {formatDate(deliveryDate)}</small></div>
                  <div className="small-stat"><span>Forecast hours</span><strong>{forecastRows.length} / 24</strong><small>Expected hourly periods</small></div>
                  <div className="small-stat"><span>Latest issue used</span><strong>{formatTime(latestUsedPublication)}</strong><small>UK publication time</small></div>
                  <div className="small-stat"><span>Issues used</span><strong>{uniquePublications}</strong><small>Across this delivery day</small></div>
                </section>

                <section className="panel chart-panel">
                  <SectionTitle eyebrow="DECISION-TIME FORECAST" title="Hourly forecast profile" aside={<span className="chart-unit">Delivery: {formatDate(deliveryDate)}</span>} />
                  <ResponsiveContainer width="100%" height={310}>
                    <AreaChart data={selectedChart} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57a8f5" stopOpacity={0.28} /><stop offset="100%" stopColor="#57a8f5" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#26374a" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#101d2d', border: '1px solid #30445c', borderRadius: 9, color: '#edf4fb' }} formatter={(value) => [`${formatNumber(value)} MW`, 'Forecast']} />
                      <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#57a8f5" strokeWidth={2.5} fill="url(#windFill)" connectNulls={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="chart-footnote">The forecast profile is selected per delivery hour using the most recent publication timestamp at or before the configured decision cutoff.</p>
                </section>

                <section className="panel table-panel">
                  <SectionTitle eyebrow="PUBLICATION AUDIT" title="Forecast issues available before cutoff" />
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Published · UK</th><th>Average forecast</th><th>Hours in issue</th><th>Use in selected profile</th></tr></thead>
                      <tbody>
                        {selectedVersions.slice().reverse().map((version) => {
                          const used = selectedRecords.filter((row) => row.publish_time === version.publish_time).length;
                          return (
                            <tr key={version.publish_time}>
                              <td>{formatPublished(version.publish_time)}</td>
                              <td>{formatNumber(version.average_generation_mw)} MW</td>
                              <td>{version.periods_available} / 24</td>
                              <td>{used} hours</td>
                            </tr>
                          );
                        })}
                        {selectedVersions.length === 0 && <tr><td colSpan="4" className="table-empty">No forecast issues were available before this cutoff.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">Only publications at or before {cutoffTime} UK are eligible. The application chooses the latest eligible publication independently for each hour; later issues can be used for some hours while earlier issues fill missing hours.</p>
                </section>
              </>
            )}

            {activePage === 'accuracy' && (
              <>
                <section className="retrospective-banner"><FileClock size={19} /><span>Retrospective evaluation of January 2026 decisions. These full-month metrics are a backtest summary, not information that was available at the start of January.</span></section>

                <section className="metric-grid four-grid">
                  <MetricCard label="Mean absolute error" value={formatNumber(summary.mae_mw)} unit="MW" note="Average size of forecast miss" icon={Activity} tone="blue" />
                  <MetricCard label="Root mean square error" value={formatNumber(summary.rmse_mw)} unit="MW" note="Highlights larger individual misses" icon={Gauge} tone="violet" />
                  <MetricCard label="Mean absolute percentage error" value={formatNumber(summary.mape_pct, 1)} unit="%" note="Periods with zero actual output excluded" icon={TrendingDown} tone="amber" />
                  <MetricCard label="Mean forecast bias" value={`${monthlyBias > 0 ? '+' : ''}${formatNumber(monthlyBias)}`} unit="MW" note={monthlyBias > 0 ? 'Positive means overforecasting' : monthlyBias < 0 ? 'Negative means underforecasting' : 'No directional bias'} icon={monthlyBias >= 0 ? TrendingUp : TrendingDown} tone="green" />
                </section>

                <section className="guidance-panel compact-guidance">
                  <div className="guidance-icon"><AlertTriangle size={21} /></div>
                  <div><div className="eyebrow">INTERPRETATION</div><h2>{monthlyBias > 0 ? 'A persistent overforecast tendency was observed' : monthlyBias < 0 ? 'A persistent underforecast tendency was observed' : 'No material average directional bias was observed'}</h2><p>{monthlyInsight}</p></div>
                </section>

                <section className="panel chart-panel">
                  <SectionTitle eyebrow="DAY-BY-DAY PERFORMANCE" title="Daily mean absolute error" aside={<span className="chart-unit">MW</span>} />
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailyChart} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="errorFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7a24d" stopOpacity={0.28} /><stop offset="100%" stopColor="#d7a24d" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#26374a" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                      <YAxis tick={{ fill: '#8ea2b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#101d2d', border: '1px solid #30445c', borderRadius: 9, color: '#edf4fb' }} formatter={(value) => [`${formatNumber(value)} MW`, 'Daily MAE']} />
                      <Area type="monotone" dataKey="mae" stroke="#d7a24d" strokeWidth={2.2} fill="url(#errorFill)" connectNulls={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </section>

                <section className="panel table-panel">
                  <SectionTitle eyebrow="PERIODS TO REVIEW" title="Five highest-error delivery days" />
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Decision date</th><th>Delivery date</th><th>Matched hours</th><th>Daily MAE</th><th>Daily bias</th><th>MAPE</th></tr></thead>
                      <tbody>
                        {worstDays.map((row) => (
                          <tr key={row.delivery_date}>
                            <td>{formatDate(row.decision_date)}</td>
                            <td>{formatDate(row.delivery_date)}</td>
                            <td>{row.count} / 24</td>
                            <td className="table-strong">{formatNumber(row.mae_mw)} MW</td>
                            <td className={Number(row.bias_mw) > 0 ? 'positive-value' : Number(row.bias_mw) < 0 ? 'negative-value' : ''}>{row.bias_mw > 0 ? '+' : ''}{formatNumber(row.bias_mw)} MW</td>
                            <td>{formatNumber(row.mape_pct, 1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <footer className="page-footer">
              <span>Source: Elexon BMRS public datasets · WINDFOR forecasts and FUELHH WIND actuals.</span>
              <span>Hourly comparison: two half-hourly actual readings averaged into each hour.</span>
              <span>January 2026 pilot · All times shown in UK local time.</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
