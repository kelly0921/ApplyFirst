import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  confidenceLabels,
  filterOptions,
  getMonitorSignal,
  getOpportunityTracks,
  opportunities,
  priorityLabels,
  stats,
  statusLabels,
} from './opportunities';

const quickViews = [
  { id: 'all', label: 'All' },
  { id: 'Freshman', label: 'Freshman' },
  { id: 'Sophomore', label: 'Sophomore' },
  { id: 'All class years', label: 'All years' },
];

const savedStorageKey = 'applyfirst-shortlist';
const phaseOneTarget = 25;

function App() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [roleTrack, setRoleTrack] = useState('all');
  const [priority, setPriority] = useState('all');
  const [classYear, setClassYear] = useState('all');
  const [timing, setTiming] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(opportunities[0].id);
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
        (category === 'all' || opportunity.category === category) &&
        (classYear === 'all' || opportunity.classYears.includes(classYear)) &&
        (timing === 'all' || opportunity.timing === timing) &&
        (status === 'all' || opportunity.status === status)
      );
    });
  }, [category, classYear, priority, query, roleTrack, status, timing]);

  const selectedOpportunity = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const savedOpportunities = opportunities.filter((item) => savedIds.includes(item.id));
  const actionCount = filtered.filter((item) =>
    ['open', 'expectedSoon', 'deadlineSoon'].includes(item.status),
  ).length;
  const verifyCount = filtered.filter((item) => item.status === 'verifyManually').length;
  const highPriorityCount = filtered.filter((item) => getMonitorSignal(item).priority === 'high').length;
  const verifiedCount = opportunities.filter((item) => item.confidence === 'high').length;
  const readinessPercent = Math.min(Math.round((opportunities.length / phaseOneTarget) * 100), 100);

  useEffect(() => {
    window.localStorage.setItem(savedStorageKey, JSON.stringify(savedIds));
  }, [savedIds]);

  const resetFilters = () => {
    setQuery('');
    setRoleTrack('all');
    setPriority('all');
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
          <div className="product-title">
            <p>ApplyFirst</p>
            <h1>Early-career program monitor</h1>
          </div>
          <label className="global-search">
            <span>Search programs</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search program, role, timing, or signal..."
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
          <MetricTile label="Priority" value={highPriorityCount} tone="green" />
          <MetricTile label="Action" value={actionCount} tone="green" />
          <MetricTile label="Verify" value={verifyCount} tone="rose" />
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
                <span>Monitor queue</span>
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
            <SignalMap selectedOpportunity={selectedOpportunity} />
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
        <strong>ApplyFirst</strong>
      </a>
      <nav aria-label="Page links">
        <a href="#library">Monitor</a>
        <a href="https://github.com/zapplyjobs/underclassmen-internships" target="_blank" rel="noreferrer">
          Inspiration
        </a>
        <span>{savedCount} saved</span>
      </nav>
    </header>
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
    { label: 'Monitor filters', complete: true },
    { label: 'Persistent shortlist', complete: true },
    { label: `${target}+ curated records`, complete: recordCount >= target },
    { label: 'Source verification', complete: verifiedCount >= target },
  ];

  return (
    <section className="readiness-panel">
      <div className="panel-heading">
        <span>Phase 1</span>
        <h2>{mvpComplete ? 'Monitor MVP complete' : 'Monitor MVP in progress'}</h2>
      </div>
      <div className="readiness-meter" aria-label={`Phase 1 record target is ${readinessPercent}% complete`}>
        <span style={{ width: `${readinessPercent}%` }} />
      </div>
      <p>
        {recordCount}/{target} records, {verifiedCount} verified.{' '}
        {mvpComplete
          ? 'The Phase 1 app is usable; public alerts should wait for a deeper source verification pass.'
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
        label="Monitor priority"
        value={priority}
        onChange={setPriority}
        options={filterOptions.priorities}
        labels={priorityLabels}
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
            {labels[option] ?? option}
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

  return (
    <article className={`opportunity-record${selected ? ' selected' : ''}`} role="listitem">
      <button className="record-main" type="button" onClick={onSelect}>
        <div className="record-title">
          <span className={`status-pill status-${opportunity.status}`}>{statusLabels[opportunity.status]}</span>
          <h3>{opportunity.name}</h3>
          <p>{opportunity.organization}</p>
        </div>
        <div className="record-meta">
          <span className={`priority-chip priority-${monitorSignal.priority}`}>{monitorSignal.priorityLabel}</span>
          <span>{monitorSignal.alertReadinessLabel}</span>
          <span>{primaryTrack}</span>
          <span>{opportunity.classYears.join(', ')}</span>
        </div>
      </button>
      <div className="record-side">
        <span>{opportunity.category}</span>
        <button className={saved ? 'saved' : ''} type="button" onClick={onSave}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  );
}

function SignalMap({ selectedOpportunity }) {
  const monitorSignal = selectedOpportunity ? getMonitorSignal(selectedOpportunity) : null;

  return (
    <section className="signal-map" aria-label="Opportunity signal map">
      <div className="signal-map-head">
        <span>Monitor signal</span>
        <strong>{monitorSignal?.priorityLabel ?? 'Select a program'}</strong>
      </div>
      <div className="signal-orbit" aria-hidden="true">
        <i className="node node-blue" />
        <i className="node node-green" />
        <i className="node node-rose" />
        <i className="node node-gold" />
        <b />
      </div>
      <p>
        {selectedOpportunity
          ? `${selectedOpportunity.name} is tagged as ${selectedOpportunity.status === 'verifyManually' ? 'verification needed' : statusLabels[selectedOpportunity.status].toLowerCase()}.`
          : 'Select a program to inspect its monitoring signal.'}
      </p>
    </section>
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
        <span>Next action</span>
        <h2>{monitorSignal.alertReadinessLabel}</h2>
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
        <button type="button" onClick={onSave}>
          {saved ? 'Remove from shortlist' : 'Add to shortlist'}
        </button>
      </div>
      <div className="metric-grid">
        <Metric label="Year" value={opportunity.classYears.join(', ')} />
        <Metric label="Priority" value={monitorSignal.priorityLabel} />
        <Metric label="Role track" value={tracks.join(' + ')} />
        <Metric label="Category" value={opportunity.category} />
        <Metric label="Timing" value={opportunity.timing} />
        <Metric label="Funding" value={opportunity.funding} />
        <Metric label="Confidence" value={confidenceLabels[opportunity.confidence]} />
      </div>
      <DetailSection title="Why this matters">{opportunity.why}</DetailSection>
      <DetailSection title="Prep notes">{opportunity.prep}</DetailSection>
      <div className="tracker-fields">
        <h3>Tracker fields</h3>
        <dl>
          <div>
            <dt>Open date</dt>
            <dd>{opportunity.openDate}</dd>
          </div>
          <div>
            <dt>Alert readiness</dt>
            <dd>{monitorSignal.alertReadinessLabel}</dd>
          </div>
          <div>
            <dt>Source signal</dt>
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
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
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
        <span>Saved</span>
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
        <p>Save records to compare your next moves.</p>
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
