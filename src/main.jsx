import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  confidenceLabels,
  filterOptions,
  getMonitorSignal,
  getMonitoringReadiness,
  getOpportunityTracks,
  getVerificationState,
  monitoringStats,
  opportunities,
  priorityLabels,
  stats,
  statusLabels,
  verificationLabels,
} from './opportunities';

const quickViews = [
  { id: 'all', label: 'All' },
  { id: 'Freshman', label: 'Freshman' },
  { id: 'Sophomore', label: 'Sophomore' },
  { id: 'All class years', label: 'All years' },
];

const savedStorageKey = 'applyfirst-shortlist';
const alertStorageKey = 'applyfirst-alert-preview';
const phaseOneTarget = 25;

function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [roleTrack, setRoleTrack] = useState('all');
  const [priority, setPriority] = useState('all');
  const [verification, setVerification] = useState('all');
  const [classYear, setClassYear] = useState('all');
  const [timing, setTiming] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(opportunities[0].id);
  const [alertPrefs, setAlertPrefs] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(alertStorageKey)) ?? {
        classYear: 'Freshman',
        roleTrack: 'Software Engineering',
        priority: 'high',
      };
    } catch {
      return {
        classYear: 'Freshman',
        roleTrack: 'Software Engineering',
        priority: 'high',
      };
    }
  });
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(savedStorageKey)) ?? [];
    } catch {
      return [];
    }
  });

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return opportunities.filter((opportunity) => {
      const searchText = [
        opportunity.name,
        opportunity.organization,
        opportunity.category,
        opportunity.why,
        opportunity.prep,
        opportunity.funding,
        opportunity.location,
        getMonitorSignal(opportunity).priorityLabel,
        getMonitorSignal(opportunity).alertReadinessLabel,
        getMonitorSignal(opportunity).sourceSignal.label,
        verificationLabels[getVerificationState(opportunity)],
        ...getOpportunityTracks(opportunity),
        ...opportunity.tags,
        ...opportunity.classYears,
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (roleTrack === 'all' || getOpportunityTracks(opportunity).includes(roleTrack)) &&
        (priority === 'all' || getMonitorSignal(opportunity).priority === priority) &&
        (verification === 'all' || getVerificationState(opportunity) === verification) &&
        (category === 'all' || opportunity.category === category) &&
        (classYear === 'all' || opportunity.classYears.includes(classYear)) &&
        (timing === 'all' || opportunity.timing === timing) &&
        (status === 'all' || opportunity.status === status)
      );
    });
  }, [category, classYear, priority, query, roleTrack, status, timing, verification]);

  const selectedOpportunity = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const savedOpportunities = opportunities.filter((item) => savedIds.includes(item.id));
  const alertPreviewMatches = useMemo(
    () =>
      opportunities.filter((opportunity) => {
        const tracks = getOpportunityTracks(opportunity);
        const signal = getMonitorSignal(opportunity);

        return (
          (alertPrefs.classYear === 'all' || opportunity.classYears.includes(alertPrefs.classYear)) &&
          (alertPrefs.roleTrack === 'all' || tracks.includes(alertPrefs.roleTrack)) &&
          (alertPrefs.priority === 'all' || signal.priority === alertPrefs.priority)
        );
      }),
    [alertPrefs],
  );
  const alertablePreviewCount = alertPreviewMatches.filter((item) => getMonitoringReadiness(item).alertable).length;
  const actionCount = filtered.filter((item) =>
    ['open', 'expectedSoon', 'deadlineSoon'].includes(item.status),
  ).length;
  const verifyCount = filtered.filter((item) => item.status === 'verifyManually').length;
  const recommendedCount = filtered.filter((item) => getMonitorSignal(item).priority === 'high').length;
  const verifiedCount = opportunities.filter((item) => item.confidence === 'high').length;
  const readinessPercent = Math.min(Math.round((opportunities.length / phaseOneTarget) * 100), 100);

  useEffect(() => {
    window.localStorage.setItem(savedStorageKey, JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    window.localStorage.setItem(alertStorageKey, JSON.stringify(alertPrefs));
  }, [alertPrefs]);

  const resetFilters = () => {
    setQuery('');
    setRoleTrack('all');
    setPriority('all');
    setVerification('all');
    setCategory('all');
    setClassYear('all');
    setTiming('all');
    setStatus('all');
  };

  const toggleSaved = (id) => {
    setSavedIds((currentIds) =>
      currentIds.includes(id) ? currentIds.filter((savedId) => savedId !== id) : [...currentIds, id],
    );
  };

  return (
    <div className="app-shell">
      <Header savedCount={savedIds.length} />
      <main className="workspace">
        <section className="command-strip" aria-label="Opportunity search command center">
          <label className="global-search">
            <span>Search programs</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search program, role, timing, or source..."
            />
          </label>
          <div className="summary-grid" aria-label="Library summary">
            {stats.map((stat) => (
              <span key={stat.label}>
                <strong>{stat.value}</strong>
                {stat.label}
              </span>
            ))}
          </div>
        </section>

        <section className="prototype-note" aria-label="Prototype notice">
          <strong>Public prototype</strong>
          <p>
            ApplyFirst is not a job board. It helps students find high-value career-launch programs, prepare
            before applications open, and see which records still need official verification.
          </p>
        </section>

        <section className="phase-two-strip" id="alerts" aria-label="Phase 2 alert setup preview">
          <AlertSetupPanel
            alertPrefs={alertPrefs}
            setAlertPrefs={setAlertPrefs}
            matchCount={alertPreviewMatches.length}
            alertableCount={alertablePreviewCount}
          />
          <MonitoringReadinessPanel />
        </section>

        <section className="recommendation-guide" aria-label="Recommendation guide">
          <span><strong>Recommended</strong> underclassmen-fit programs with strong career leverage.</span>
          <span><strong>Watch List</strong> relevant programs to keep tracking.</span>
          <span><strong>Foundation</strong> scholarships, communities, conferences, and prep.</span>
        </section>

        <section className="insight-band" aria-label="Current program monitor view">
          <div className="view-controls">
            <span>Class-year view</span>
            <div className="segmented-control">
              {quickViews.map((view) => (
                <button
                  key={view.id}
                  className={classYear === view.id ? 'active' : ''}
                  type="button"
                  onClick={() => setClassYear(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
          <MetricTile label="In view" value={filtered.length} tone="blue" />
          <MetricTile label="Recommended" value={recommendedCount} tone="green" />
          <MetricTile label="Ready soon" value={actionCount} tone="green" />
          <MetricTile label="Needs review" value={verifyCount} tone="rose" />
        </section>

        <section className="product-grid" id="library" aria-label="Opportunity library">
          <aside className="left-rail">
            <ReadinessPanel
              readinessPercent={readinessPercent}
              recordCount={opportunities.length}
              verifiedCount={verifiedCount}
              target={phaseOneTarget}
            />
            <FilterStack
              category={category}
              setCategory={setCategory}
              roleTrack={roleTrack}
              setRoleTrack={setRoleTrack}
              priority={priority}
              setPriority={setPriority}
              verification={verification}
              setVerification={setVerification}
              timing={timing}
              setTiming={setTiming}
              status={status}
              setStatus={setStatus}
              resetFilters={resetFilters}
            />
          </aside>

          <section className="results-board">
            <div className="board-toolbar">
              <div>
                <span>Program queue</span>
                <strong>{filtered.length} programs</strong>
              </div>
              <button type="button" onClick={resetFilters}>
                Clear
              </button>
            </div>
            <div className="record-table" role="list">
              {filtered.length ? (
                filtered.map((opportunity) => (
                  <OpportunityRecord
                    key={opportunity.id}
                    opportunity={opportunity}
                    selected={selectedOpportunity?.id === opportunity.id}
                    saved={savedIds.includes(opportunity.id)}
                    onSelect={() => setSelectedId(opportunity.id)}
                    onSave={() => toggleSaved(opportunity.id)}
                  />
                ))
              ) : (
                <EmptyState onReset={resetFilters} />
              )}
            </div>
          </section>

          <aside className="right-rail">
            <NextActionPanel selectedOpportunity={selectedOpportunity} />
            <OpportunityDetail
              opportunity={selectedOpportunity}
              saved={selectedOpportunity ? savedIds.includes(selectedOpportunity.id) : false}
              onSave={() => selectedOpportunity && toggleSaved(selectedOpportunity.id)}
            />
            <Shortlist items={savedOpportunities} onSelect={setSelectedId} />
          </aside>
        </section>
      </main>
    </div>
  );
}

function Header({ savedCount }) {
  return (
    <header className="site-header">
      <a className="brand" href="#library" aria-label="ApplyFirst home">
        <span aria-hidden="true">AF</span>
        <span className="brand-copy">
          <strong>ApplyFirst</strong>
          <em>Track career-launch programs</em>
        </span>
      </a>
      <nav aria-label="Page links">
        <a href="#library">Monitor</a>
        <a href="#alerts">Alerts</a>
        <a href="https://github.com/zapplyjobs/underclassmen-internships" target="_blank" rel="noreferrer">
          Inspiration
        </a>
        <span>{savedCount} saved</span>
      </nav>
    </header>
  );
}

function AlertSetupPanel({ alertPrefs, setAlertPrefs, matchCount, alertableCount }) {
  const updatePref = (key, value) => {
    setAlertPrefs((currentPrefs) => ({
      ...currentPrefs,
      [key]: value,
    }));
  };

  return (
    <section className="alert-setup-panel">
      <div className="panel-heading">
        <span>Phase 2</span>
        <h2>Alert preview</h2>
      </div>
      <p>
        Choose the programs a student would want monitored. This saves locally for now; real email alerts come
        after the official-source workflow is reliable.
      </p>
      <div className="alert-controls">
        <FilterSelect
          label="Class year"
          value={alertPrefs.classYear}
          onChange={(value) => updatePref('classYear', value)}
          options={filterOptions.classYears}
        />
        <FilterSelect
          label="Role track"
          value={alertPrefs.roleTrack}
          onChange={(value) => updatePref('roleTrack', value)}
          options={filterOptions.roleTracks}
        />
        <FilterSelect
          label="Recommendation"
          value={alertPrefs.priority}
          onChange={(value) => updatePref('priority', value)}
          options={filterOptions.priorities}
          labels={priorityLabels}
        />
      </div>
      <div className="alert-preview-summary" aria-label="Alert preview summary">
        <span>
          <strong>{matchCount}</strong>
          Matching programs
        </span>
        <span>
          <strong>{alertableCount}</strong>
          Monitoring ready
        </span>
      </div>
    </section>
  );
}

function MonitoringReadinessPanel() {
  return (
    <section className="monitoring-readiness-panel">
      <div className="panel-heading">
        <span>Monitoring layer</span>
        <h2>Source readiness</h2>
      </div>
      <p>
        Records become alert-ready only when the official URL, current timing, and last-checked source details
        are reliable enough to avoid noisy public notifications.
      </p>
      <div className="monitoring-stats">
        {monitoringStats.map((item) => (
          <span key={item.label}>
            <strong>{item.value}</strong>
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function MetricTile({ label, value, tone }) {
  return (
    <div className={`metric-tile tile-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReadinessPanel({ readinessPercent, recordCount, verifiedCount, target }) {
  const mvpComplete = recordCount >= target;
  const readinessItems = [
    { label: 'Standalone app shell', complete: true },
    { label: 'Core filters', complete: true },
    { label: 'Persistent shortlist', complete: true },
    { label: `${target}+ curated records`, complete: recordCount >= target },
    { label: 'Source verification', complete: verifiedCount >= target },
  ];

  return (
    <section className="readiness-panel">
      <div className="panel-heading">
        <span>Phase 1</span>
        <h2>{mvpComplete ? 'Prototype MVP ready' : 'Prototype MVP in progress'}</h2>
      </div>
      <div className="readiness-meter" aria-label={`Phase 1 record target is ${readinessPercent}% complete`}>
        <span style={{ width: `${readinessPercent}%` }} />
      </div>
      <p>
        {recordCount}/{target} records, {verifiedCount} verified.{' '}
        {mvpComplete
          ? 'The Phase 1 app is usable as a public prototype; live alerts should wait for a deeper source verification pass.'
          : 'The shell is usable; the seed set still needs expansion before Phase 1 is complete.'}
      </p>
      <ul>
        {readinessItems.map((item) => (
          <li className={item.complete ? 'complete' : ''} key={item.label}>
            <span aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterStack({
  category,
  setCategory,
  roleTrack,
  setRoleTrack,
  priority,
  setPriority,
  verification,
  setVerification,
  timing,
  setTiming,
  status,
  setStatus,
  resetFilters,
}) {
  return (
    <section className="filter-stack">
      <div className="panel-heading">
        <span>Filters</span>
        <h2>Refine the monitor</h2>
      </div>
      <FilterSelect
        label="Role track"
        value={roleTrack}
        onChange={setRoleTrack}
        options={filterOptions.roleTracks}
      />
      <FilterSelect
        label="Recommendation"
        value={priority}
        onChange={setPriority}
        options={filterOptions.priorities}
        labels={priorityLabels}
      />
      <FilterSelect
        label="Verification"
        value={verification}
        onChange={setVerification}
        options={filterOptions.verification}
        labels={verificationLabels}
      />
      <FilterSelect label="Category" value={category} onChange={setCategory} options={filterOptions.categories} />
      <FilterSelect label="Timing" value={timing} onChange={setTiming} options={filterOptions.timing} />
      <FilterSelect label="Status" value={status} onChange={setStatus} options={filterOptions.status} labels={statusLabels} />
      <button className="plain-button" type="button" onClick={resetFilters}>
        Reset filters
      </button>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, labels = {} }) {
  const selectId = `filter-${label.toLowerCase().replaceAll(' ', '-').replaceAll('/', '').replaceAll('&', 'and')}`;

  return (
    <label className="select-control">
      <span id={`${selectId}-label`}>{label}</span>
      <select aria-labelledby={`${selectId}-label`} id={selectId} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatDisplayLabel(labels[option] ?? option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function OpportunityRecord({ opportunity, selected, saved, onSelect, onSave }) {
  const tracks = getOpportunityTracks(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const primaryTrack = tracks[0];
  const verificationState = getVerificationState(opportunity);
  const verificationMark = verificationState === 'verified' ? '✓' : verificationState === 'needsReview' ? '!' : '';

  return (
    <article className={`opportunity-record${selected ? ' selected' : ''}`} role="listitem">
      <button className="record-main" type="button" onClick={onSelect}>
        <div className="record-title">
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
          <h3>{opportunity.name}</h3>
          <p>{opportunity.organization}</p>
        </div>
        <div className="record-summary">
          <span>{primaryTrack}</span>
          <span>{opportunity.classYears.join(', ')}</span>
          <span>{opportunity.timing}</span>
        </div>
      </button>
      <div className="record-side">
        <span className={`priority-chip priority-${monitorSignal.priority}`}>{monitorSignal.priorityLabel}</span>
        <div className="record-icons">
          <span
            className={`icon-status verification-${verificationState}`}
            aria-label={verificationLabels[verificationState]}
            title={verificationLabels[verificationState]}
          >
            {verificationMark}
          </span>
          <button
            className={`bookmark-button${saved ? ' saved' : ''}`}
            type="button"
            onClick={onSave}
            aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
            title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </div>
    </article>
  );
}

function NextActionPanel({ selectedOpportunity }) {
  if (!selectedOpportunity) {
    return null;
  }

  const monitorSignal = getMonitorSignal(selectedOpportunity);

  return (
    <section className="next-action-panel">
      <div className="panel-heading">
        <span>Next step</span>
        <h2>{monitorSignal.actionLabel}</h2>
      </div>
      <p>{monitorSignal.nextAction}</p>
      <dl>
        <div>
          <dt>Opening window</dt>
          <dd>{selectedOpportunity.openDate}</dd>
        </div>
      </dl>
    </section>
  );
}

function OpportunityDetail({ opportunity, saved, onSave }) {
  if (!opportunity) {
    return (
      <section className="detail-panel empty">
        <h2>No matches yet</h2>
        <p>Clear a filter or search another term to bring records back.</p>
      </section>
    );
  }

  const tracks = getOpportunityTracks(opportunity);
  const monitorSignal = getMonitorSignal(opportunity);
  const verificationState = getVerificationState(opportunity);

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
        <h2>{opportunity.name}</h2>
        <p>{opportunity.organization}</p>
      </div>
      <div className="detail-actions">
        <a href={opportunity.url} target="_blank" rel="noreferrer">
          View source
        </a>
        <button
          className={`detail-bookmark${saved ? ' saved' : ''}`}
          type="button"
          onClick={onSave}
          aria-label={saved ? 'Remove from shortlist' : 'Add to shortlist'}
          title={saved ? 'Remove from shortlist' : 'Add to shortlist'}
        >
          <BookmarkIcon filled={saved} />
          Shortlist
        </button>
      </div>
      <div className="metric-grid">
        <Metric label="Best for" value={opportunity.classYears.join(', ')} />
        <Metric label="Track" value={tracks.join(' + ')} />
        <Metric label="Timing" value={opportunity.timing} />
        <Metric label="Funding" value={opportunity.funding} />
      </div>
      <div className="detail-status-row" aria-label="Program status summary">
        <StatusItem label="Recommendation" value={monitorSignal.priorityLabel} tone={monitorSignal.priority} />
        <StatusItem label="Application Status" value={monitorSignal.actionLabel} />
        <StatusItem
          label="Verification"
          value={verificationLabels[verificationState]}
          tone={verificationState}
        />
      </div>
      <DetailSection title="Why this matters">{opportunity.why}</DetailSection>
      <DetailSection title="Prep notes">{opportunity.prep}</DetailSection>
      <div className="tracker-fields">
        <h3>Monitoring details</h3>
        <dl>
          <div>
            <dt>Open date</dt>
            <dd>{opportunity.openDate}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{formatDisplayLabel(opportunity.category)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{confidenceLabels[opportunity.confidence]}</dd>
          </div>
          <div>
            <dt>Source coverage</dt>
            <dd>{monitorSignal.sourceSignal.label}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{opportunity.deadline}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{opportunity.location}</dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>{opportunity.lastChecked || 'Needs verification pass'}</dd>
          </div>
          <div>
            <dt>Previous URL</dt>
            <dd>{opportunity.previousUrl || 'Not tracked yet'}</dd>
          </div>
        </dl>
      </div>
      <div className="source-note">
        <h3>Source note</h3>
        <p>{opportunity.sourceNote}</p>
      </div>
      <div className="tag-list">
        {opportunity.tags.map((tag) => (
          <span key={tag}>{formatDisplayLabel(tag)}</span>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <span>
      <strong>{formatDisplayLabel(value)}</strong>
      {label}
    </span>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d="M4 2.5C4 1.7 4.7 1 5.5 1h5c.8 0 1.5.7 1.5 1.5V15l-4-2.4L4 15V2.5Z" />
      {!filled ? <path className="bookmark-cutout" d="M5.5 2.4h5c.1 0 .2.1.2.2v10L8 11 5.3 12.6v-10c0-.1.1-.2.2-.2Z" /> : null}
    </svg>
  );
}

function StatusItem({ label, value, tone = 'neutral' }) {
  return (
    <span className={`status-item status-item-${tone}`} aria-label={`${label}: ${value}`} title={`${label}: ${value}`}>
      <strong>{value}</strong>
    </span>
  );
}

function formatDisplayLabel(value) {
  const labelMap = {
    'Software engineering': 'Software Engineering',
    'Product engineering': 'Product Engineering',
    'Open source': 'Open Source',
    'Big tech': 'Big Tech',
    'Insight program': 'Insight Program',
    'Women in tech': 'Women in Tech',
    'Diversity in tech': 'Diversity in Tech',
    'Production engineering': 'Production Engineering',
    'Civic tech': 'Civic Tech',
    'Public interest tech': 'Public Interest Tech',
    'Virtual experience': 'Virtual Experience',
    'Career exploration': 'Career Exploration',
    'AI projects': 'AI Projects',
    'Nontraditional backgrounds': 'Nontraditional Backgrounds',
    'Early-career': 'Early-Career',
    'Project building': 'Project Building',
    'Professional development': 'Professional Development',
    'Interview prep': 'Interview Prep',
    'Technical training': 'Technical Training',
    'Python basics': 'Python Basics',
    'Portfolio project': 'Portfolio Project',
    'Career prep': 'Career Prep',
    'Internship matching': 'Internship Matching',
    'Underrepresented students': 'Underrepresented Students',
    'Computer science': 'Computer Science',
    'Career exposure': 'Career Exposure',
    'Research conference': 'Research Conference',
    'CS research': 'CS Research',
    'Women in computing': 'Women in Computing',
    'Career events': 'Career Events',
    'Black CS students': 'Black CS Students',
    'Latinx CS students': 'Latinx CS Students',
    'Career fairs': 'Career Fairs',
    'Graduate school prep': 'Graduate School Prep',
    'Women in STEM': 'Women in STEM',
    'Conference funding': 'Conference Funding',
    'Externship / insight series': 'Externship / Insight Series',
    'Internship-matching fellowship': 'Internship-Matching Fellowship',
    'Conference funding': 'Conference Funding',
    'Technical community': 'Technical Community',
    'Training program': 'Training Program',
    'Special program / resource': 'Special Program / Resource',
    'All class years': 'All Class Years',
    'Paid internship': 'Paid Internship',
    'Paid fellowship': 'Paid Fellowship',
    'Travel support': 'Travel Support',
    'Host-site dependent': 'Host-Site Dependent',
    'Scholarship': 'Scholarship',
    'Stipend': 'Stipend',
    'Free': 'Free',
    'Varies': 'Varies',
  };

  return labelMap[value] ?? value;
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function Shortlist({ items, onSelect }) {
  return (
    <section className="shortlist">
      <div className="panel-heading">
        <span>Shortlist</span>
        <h2>Shortlist</h2>
      </div>
      {items.length ? (
        items.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)}>
            <span>{item.name}</span>
            <em>{item.classYears.join(', ')}</em>
          </button>
        ))
      ) : (
        <p>Bookmarked programs appear here for comparison.</p>
      )}
    </section>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="empty-state">
      <h3>No opportunities match those filters.</h3>
      <p>Try a broader class year, category, or status.</p>
      <button type="button" onClick={onReset}>
        Clear filters
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
