import { useEffect, useState } from 'react';
import {
    ArrowUpRight,
    BarChart3,
    CalendarClock,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Link2,
    Plus,
    RefreshCw,
    Trash2
} from 'lucide-react';
import { useClock, useResource, navigate } from '../hooks';
import { displayUrl, formatDate, formatNumber } from '../format';
import { CopyButton, ErrorState, Loading, StatusBadge } from '../components/Shared';
import DeleteDialog from '../components/DeleteDialog';

function LinkRow({ link, now, notify, onDelete }) {
    const expired = Boolean(link.expiresAt && new Date(link.expiresAt).getTime() <= now);
    return (
        <tr>
            <td>
                <div className="link-cell">
                    <div className="destination-icon">
                        <Link2 size={19} />
                    </div>
                    <div className="link-details">
                        <a
                            href={link.shortUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="short-link"
                        >
                            {displayUrl(link.shortUrl)}
                            <ArrowUpRight size={13} />
                        </a>
                        <span className="destination-url" title={link.originalUrl}>
                            {link.originalUrl}
                        </span>
                    </div>
                </div>
            </td>
            <td className="date-cell">
                <span>{formatDate(link.createdAt)}</span>
                <small>
                    {link.expiresAt ? `Expires ${formatDate(link.expiresAt)}` : 'No expiry'}
                </small>
            </td>
            <td>
                <StatusBadge expired={expired} />
            </td>
            <td>
                <div className="row-actions">
                    <CopyButton
                        value={link.shortUrl}
                        notify={notify}
                        label={`Copy short URL ${link.code}`}
                    />
                    <button
                        className="icon-button"
                        title="View statistics"
                        aria-label={`View stats for ${link.code}`}
                        onClick={() => navigate('stats', link.code)}
                    >
                        <BarChart3 size={17} />
                    </button>
                    <a
                        className="icon-button external-action"
                        href={link.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Visit short link"
                        aria-label={`Visit short URL ${link.code}`}
                    >
                        <ExternalLink size={16} />
                    </a>
                    <button
                        className="icon-button delete-action"
                        title="Delete link"
                        aria-label={`Delete ${link.code}`}
                        onClick={() => onDelete(link)}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </td>
        </tr>
    );
}

export default function LinksPage({ notify }) {
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [deleting, setDeleting] = useState(null);
    const now = useClock();
    const { data, status, error, refresh } = useResource(`/urls?page=${page}&limit=${limit}`);
    const links = data?.items || [];
    const expired = links.filter(
        (link) => link.expiresAt && new Date(link.expiresAt).getTime() <= now
    ).length;
    const pagination = data?.pagination;

    useEffect(() => {
        if (pagination && page > Math.max(pagination.totalPages, 1)) {
            setPage(Math.max(pagination.totalPages, 1));
        }
    }, [pagination, page]);

    function onDeleted(code) {
        setDeleting(null);
        notify({ type: 'success', message: `Link ${code} has been deleted.` });
        refresh();
    }

    const summaries = [
        {
            label: 'Saved links',
            value: pagination?.totalItems,
            icon: Link2,
            caption: 'All links in your library',
            tone: 'blue'
        },
        {
            label: 'Active on this page',
            value: data ? links.length - expired : undefined,
            icon: CheckCircle2,
            caption: 'Ready to send visitors on',
            tone: 'green'
        },
        {
            label: 'Expired on this page',
            value: data ? expired : undefined,
            icon: CalendarClock,
            caption: 'Past their expiry date',
            tone: 'amber'
        }
    ];

    return (
        <>
            <section className="page-heading">
                <div>
                    <div className="eyebrow">YOUR LINK WORKSPACE</div>
                    <h1 id="page-title">
                        Your links, simplified<span className="heading-period">.</span>
                    </h1>
                    <p>A little less URL. A little more possibility.</p>
                </div>
                <a href="#create" className="button button-primary">
                    <Plus size={18} />
                    Create a short link
                </a>
            </section>
            <section className="summary-grid" aria-label="Link summary">
                {summaries.map(({ label, value, icon: Icon, caption, tone }) => (
                    <div className="card summary-card" key={label}>
                        <div className="summary-top">
                            <span>{label}</span>
                            <span className={`metric-icon ${tone}`}>
                                <Icon size={19} />
                            </span>
                        </div>
                        <strong className="stat-number">
                            {value === undefined ? '—' : formatNumber(value)}
                        </strong>
                        <small>{caption}</small>
                    </div>
                ))}
            </section>
            <section
                className="card links-card"
                aria-labelledby="library-title"
                aria-busy={status === 'loading'}
            >
                <div className="card-toolbar">
                    <div>
                        <h2 id="library-title">
                            Link library{' '}
                            <span className="count-badge">
                                {pagination ? formatNumber(pagination.totalItems) : '—'}
                            </span>
                        </h2>
                        <p>Every link, a new connection.</p>
                    </div>
                    <div className="toolbar-actions">
                        <label className="page-size">
                            <span className="sr-only">Links per page</span>
                            <select
                                value={limit}
                                onChange={(event) => {
                                    setLimit(Number(event.target.value));
                                    setPage(1);
                                }}
                            >
                                {[5, 10, 20, 50, 100].map((size) => (
                                    <option key={size} value={size}>
                                        {size} per page
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            className="icon-button bordered-icon"
                            title="Refresh links"
                            aria-label="Refresh links"
                            disabled={status === 'loading'}
                            onClick={refresh}
                        >
                            <RefreshCw size={17} />
                        </button>
                    </div>
                </div>
                {status === 'loading' && <Loading label="Loading your links…" />}
                {status === 'error' && <ErrorState message={error} onRetry={refresh} />}
                {status === 'success' && !links.length && (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <Link2 size={31} />
                        </div>
                        <h3>A fresh start for your links</h3>
                        <p>
                            Create your first short link. Make it memorable,
                            <br className="desktop-break" /> share it anywhere, and follow its
                            journey.
                        </p>
                        <a className="button button-primary" href="#create">
                            <Plus size={17} />
                            Create your first link
                        </a>
                        <div className="empty-features">
                            <span>
                                <CheckCircle2 size={14} />
                                Custom aliases
                            </span>
                            <span>
                                <CalendarClock size={14} />
                                Optional expiry
                            </span>
                            <span>
                                <BarChart3 size={14} />
                                Click insights
                            </span>
                        </div>
                    </div>
                )}
                {status === 'success' && links.length > 0 && (
                    <div className="table-scroll">
                        <table className="links-table">
                            <thead>
                                <tr>
                                    <th scope="col">LINK & DESTINATION</th>
                                    <th scope="col">CREATED / EXPIRY</th>
                                    <th scope="col">STATUS</th>
                                    <th scope="col" className="actions-heading">
                                        ACTIONS
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {links.map((link) => (
                                    <LinkRow
                                        key={link.code}
                                        link={link}
                                        now={now}
                                        notify={notify}
                                        onDelete={setDeleting}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {pagination && pagination.totalItems > 0 && (
                    <div className="pagination">
                        <span>
                            Showing{' '}
                            <strong>
                                {(page - 1) * limit + 1}–
                                {Math.min(page * limit, pagination.totalItems)}
                            </strong>{' '}
                            of <strong>{formatNumber(pagination.totalItems)}</strong> links
                        </span>
                        <div className="pagination-controls">
                            <button
                                className="icon-button bordered-icon"
                                aria-label="Previous page"
                                disabled={!pagination.hasPreviousPage}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span>
                                Page <strong>{page}</strong> of{' '}
                                {formatNumber(pagination.totalPages)}
                            </span>
                            <button
                                className="icon-button bordered-icon"
                                aria-label="Next page"
                                disabled={!pagination.hasNextPage || page >= 10000}
                                onClick={() => setPage((value) => value + 1)}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </section>
            <div className="page-footnote">
                <Link2 size={14} />
                <span>A small link can take you somewhere great.</span>
            </div>
            {deleting && (
                <DeleteDialog
                    link={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={onDeleted}
                />
            )}
        </>
    );
}
