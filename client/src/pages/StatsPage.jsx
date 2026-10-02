import { useEffect, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    CalendarDays,
    Clock3,
    MousePointerClick,
    RefreshCw,
    Search
} from 'lucide-react';
import { useResource, navigate } from '../hooks';
import { formatDate, formatNumber } from '../format';
import { ErrorState, Loading } from '../components/Shared';
import ClicksChart from '../components/ClicksChart';

function StatsDetails({ data, refresh }) {
    const metrics = [
        {
            label: 'Total clicks',
            value: formatNumber(data.totalClicks),
            caption: 'Since this link was created',
            icon: MousePointerClick,
            tone: 'blue'
        },
        {
            label: 'Days with activity',
            value: formatNumber(data.clicksByDay.length),
            caption: 'Based on UTC calendar days',
            icon: CalendarDays,
            tone: 'green'
        },
        {
            label: 'Last clicked',
            value: data.lastClickedAt ? formatDate(data.lastClickedAt) : 'Not yet',
            caption: data.lastClickedAt
                ? formatDate(data.lastClickedAt, true)
                : 'Your first visit is still ahead',
            icon: Clock3,
            tone: 'purple'
        }
    ];
    return (
        <>
            <div className="stats-link-card card">
                <div className="stats-link-icon">
                    <BarChart3 size={23} />
                </div>
                <div>
                    <span className="eyebrow">LINK OVERVIEW</span>
                    <h2>{data.code}</h2>
                    <p title={data.originalUrl}>{data.originalUrl}</p>
                </div>
                <button className="button button-secondary button-small" onClick={refresh}>
                    <RefreshCw size={15} />
                    Refresh stats
                </button>
            </div>
            <section className="summary-grid stats-summary" aria-label="Click summary">
                {metrics.map(({ label, value, caption, icon: Icon, tone }) => (
                    <div className="card summary-card" key={label}>
                        <div className="summary-top">
                            <span>{label}</span>
                            <span className={`metric-icon ${tone}`}>
                                <Icon size={19} />
                            </span>
                        </div>
                        <strong
                            className={`stat-number ${label === 'Last clicked' ? 'stat-date' : ''}`}
                        >
                            {value}
                        </strong>
                        <small>{caption}</small>
                    </div>
                ))}
            </section>
            <section className="card chart-card">
                <div className="card-toolbar">
                    <div>
                        <h2>Daily clicks</h2>
                        <p>Past 14 days · UTC</p>
                    </div>
                    <span className="chart-legend">
                        <span className="status-dot" />
                        Clicks
                    </span>
                </div>
                {data.totalClicks > 0 ? (
                    <ClicksChart clicksByDay={data.clicksByDay} />
                ) : (
                    <div className="empty-state compact-empty">
                        <div className="empty-icon">
                            <BarChart3 size={27} />
                        </div>
                        <h3>Your story is just getting started</h3>
                        <p>Share your short link. Its first clicks will appear here.</p>
                    </div>
                )}
            </section>
            <section className="card recent-card">
                <div className="card-toolbar">
                    <div>
                        <h2>Recent clicks</h2>
                        <p>The latest 20 visits to this short link.</p>
                    </div>
                    <span className="count-badge">{data.recentClicks.length}</span>
                </div>
                {data.recentClicks.length ? (
                    <div className="table-scroll">
                        <table className="activity-table">
                            <thead>
                                <tr>
                                    <th scope="col">WHEN</th>
                                    <th scope="col">USER AGENT</th>
                                    <th scope="col">REFERRER</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.recentClicks.map((click, index) => (
                                    <tr key={`${click.timestamp}-${index}`}>
                                        <td>{formatDate(click.timestamp, true)}</td>
                                        <td title={click.userAgent}>
                                            {click.userAgent || 'Not provided'}
                                        </td>
                                        <td title={click.referrer}>
                                            {click.referrer || 'Direct / not provided'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="table-empty">
                        No visits yet. Good things start with a first click.
                    </div>
                )}
            </section>
            <p className="analytics-note">
                <Clock3 size={14} />
                Statistics may take a moment to update after a visit. Refresh to see the latest
                recorded clicks.
            </p>
        </>
    );
}

export default function StatsPage({ code }) {
    const [lookup, setLookup] = useState(code);
    const { data, status, error, refresh } = useResource(
        code ? `/urls/${encodeURIComponent(code)}/stats` : null
    );
    useEffect(() => setLookup(code), [code]);

    function submit(event) {
        event.preventDefault();
        const value = lookup.trim();
        if (value === code) {
            refresh();
        } else {
            navigate('stats', value);
        }
    }

    return (
        <>
            <section className="page-heading">
                <div>
                    <div className="eyebrow">FOLLOW THE CONNECTION</div>
                    <h1 id="page-title">
                        Every click tells a story<span className="heading-period">.</span>
                    </h1>
                    <p>See where your short links are making connections.</p>
                </div>
                <a href="#links" className="button button-secondary">
                    <ArrowLeft size={16} />
                    Back to links
                </a>
            </section>
            <form className="stats-lookup card" onSubmit={submit}>
                <label htmlFor="stats-code">Find a link’s statistics</label>
                <div className="lookup-controls">
                    <div className="input-with-icon">
                        <Search size={17} />
                        <input
                            id="stats-code"
                            value={lookup}
                            onChange={(event) => setLookup(event.target.value)}
                            placeholder="Enter a short code or alias"
                            required
                            pattern="(?:[A-Za-z0-9_]|-){3,64}"
                            maxLength={64}
                            autoComplete="off"
                        />
                    </div>
                    <button className="button button-primary" type="submit">
                        View stats
                        <ArrowRight size={16} />
                    </button>
                </div>
            </form>
            {status === 'idle' && (
                <section className="card empty-state stats-welcome">
                    <div className="empty-icon">
                        <MousePointerClick size={31} />
                    </div>
                    <h3>A closer look at every link</h3>
                    <p>
                        Enter a code above, or choose the statistics icon
                        <br className="desktop-break" /> beside a link in your library.
                    </p>
                    <a href="#links" className="button button-secondary">
                        Explore your links
                        <ArrowRight size={16} />
                    </a>
                </section>
            )}
            {status === 'loading' && (
                <section className="card">
                    <Loading label="Loading link statistics…" />
                </section>
            )}
            {status === 'error' && (
                <section className="card">
                    <ErrorState message={error} onRetry={refresh} />
                </section>
            )}
            {status === 'success' && <StatsDetails data={data} refresh={refresh} />}
        </>
    );
}
