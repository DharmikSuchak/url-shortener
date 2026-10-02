import { useState } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    CalendarClock,
    CheckCircle2,
    Link2,
    LoaderCircle
} from 'lucide-react';
import { apiRequest } from '../api';
import { localDateTime } from '../format';
import { CopyButton, Notice } from '../components/Shared';

function creationBody(form) {
    const originalUrl = form.originalUrl.trim();
    let parsed;
    try {
        parsed = new URL(originalUrl);
    } catch {
        throw new Error('Enter a complete URL, including https:// or http://.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Please use an HTTP or HTTPS link.');
    }
    const body = { originalUrl };
    if (form.alias) {
        if (!/^[A-Za-z0-9_-]{6,7}$/.test(form.alias)) {
            throw new Error('Custom alias must be 6–7 characters (maximum 7). Use only letters, numbers, hyphens, or underscores.');
        }
        if (['api', 'health'].includes(form.alias.toLowerCase())) {
            throw new Error('This alias is reserved. Choose another one.');
        }
        body.alias = form.alias;
    }
    if (form.expiresAt) {
        const expiresAt = new Date(form.expiresAt);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            throw new Error('Choose an expiry date and time in the future.');
        }
        body.expiresAt = expiresAt.toISOString();
    }
    return body;
}

export default function CreatePage({ notify }) {
    const [form, setForm] = useState({ originalUrl: '', alias: '', expiresAt: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);

    function update(field, value) {
        setForm((previous) => ({ ...previous, [field]: value }));
        setError('');
    }

    async function submit(event) {
        event.preventDefault();
        notify(null);
        setError('');
        setCreated(null);
        setBusy(true);
        try {
            const link = await apiRequest('/urls', {
                method: 'POST',
                body: JSON.stringify(creationBody(form))
            });
            setCreated(link);
            setForm({ originalUrl: '', alias: '', expiresAt: '' });
        } catch (error) {
            setError(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <section className="page-heading">
                <div>
                    <div className="eyebrow">A NEW CONNECTION</div>
                    <h1 id="page-title">
                        Long URL. Short story<span className="heading-period">.</span>
                    </h1>
                    <p>Give your next destination a link that’s easy to share.</p>
                </div>
            </section>
            <div className="create-grid">
                <section className="card create-card">
                    <div className="section-heading">
                        <span className="section-icon">
                            <Link2 size={21} />
                        </span>
                        <div>
                            <h2>Create a short link</h2>
                            <p>Start with the destination. We’ll take it from here.</p>
                        </div>
                    </div>
                    <form onSubmit={submit}>
                        <div className="field">
                            <label htmlFor="original-url">
                                Destination URL <span className="required-mark">*</span>
                            </label>
                            <div className="input-with-icon">
                                <Link2 size={18} />
                                <input
                                    id="original-url"
                                    name="originalUrl"
                                    type="url"
                                    placeholder="https://example.com/your-next-big-idea"
                                    required
                                    value={form.originalUrl}
                                    onChange={(event) => update('originalUrl', event.target.value)}
                                    disabled={busy}
                                    autoComplete="url"
                                    aria-describedby="url-hint"
                                />
                            </div>
                            <small id="url-hint">
                                The full web address you want your short link to open.
                            </small>
                        </div>
                        <div className="optional-heading">
                            <span>Make it yours</span>
                            <span className="subtle-tag">OPTIONAL</span>
                        </div>
                        <div className="form-grid">
                            <div className="field">
                                <label htmlFor="alias">Custom alias</label>
                                <input
                                    id="alias"
                                    name="alias"
                                    placeholder="e.g. launch1"
                                    minLength={6}
                                    maxLength={7}
                                    pattern="(?:[A-Za-z0-9_]|-){6,7}"
                                    value={form.alias}
                                    onChange={(event) => update('alias', event.target.value)}
                                    disabled={busy}
                                    aria-describedby="alias-hint"
                                    autoComplete="off"
                                />
                                <small id="alias-hint">
                                    Use 6–7 letters, numbers, hyphens, or underscores. Maximum 7 characters.
                                </small>
                            </div>
                            <div className="field">
                                <label htmlFor="expires-at">Expiry date & time</label>
                                <input
                                    id="expires-at"
                                    name="expiresAt"
                                    type="datetime-local"
                                    min={localDateTime()}
                                    value={form.expiresAt}
                                    onChange={(event) => update('expiresAt', event.target.value)}
                                    disabled={busy}
                                    aria-describedby="expiry-hint"
                                />
                                <small id="expiry-hint">
                                    Your local time. Leave blank for no expiry.
                                </small>
                            </div>
                        </div>
                        {error && <Notice>{error}</Notice>}
                        <div className="form-bottom">
                            <span>
                                <CheckCircle2 size={15} />
                                Ready to share in seconds
                            </span>
                            <button className="button button-primary" type="submit" disabled={busy}>
                                {busy ? (
                                    <LoaderCircle size={17} className="spinner" />
                                ) : (
                                    <Link2 size={17} />
                                )}
                                {busy ? 'Creating your link…' : 'Create short link'}
                                {!busy && <ArrowRight size={16} />}
                            </button>
                        </div>
                    </form>
                </section>
                <aside className="create-aside">
                    <div className="card tip-card">
                        <div className="tip-illustration">
                            <span className="tip-long-link">
                                a-very-long-link-to-your-next-idea
                            </span>
                            <span className="tip-arrow">
                                <ArrowRight size={20} />
                            </span>
                            <span className="tip-short-link">
                                <Link2 size={17} />
                                your-link
                            </span>
                            <span className="tip-orbit tip-orbit-one" />
                            <span className="tip-orbit tip-orbit-two" />
                        </div>
                        <span className="eyebrow">SMALL LINK, BIG POSSIBILITIES</span>
                        <h2>
                            Make every share
                            <br />a little simpler.
                        </h2>
                        <p>
                            A memorable alias gives your link a personal touch. An expiry date keeps
                            time-sensitive destinations tidy.
                        </p>
                        <div className="tip-divider" />
                        <div className="tip-item">
                            <BarChart3 size={19} />
                            <span>See how people interact with your link.</span>
                        </div>
                        <div className="tip-item">
                            <CalendarClock size={19} />
                            <span>Choose when a link stops redirecting.</span>
                        </div>
                    </div>
                </aside>
            </div>
            {created && (
                <section className="card created-card" aria-live="polite">
                    <div className="created-heading">
                        <span className="success-icon">
                            <CheckCircle2 size={23} />
                        </span>
                        <div>
                            <h2>Your short link is ready</h2>
                            <p>Copy it, share it, and let it take the lead.</p>
                        </div>
                        <span className="subtle-tag success-tag">CREATED</span>
                    </div>
                    <div className="created-url">
                        <a href={created.shortUrl} target="_blank" rel="noreferrer">
                            {created.shortUrl}
                            <ArrowUpRight size={18} />
                        </a>
                        <CopyButton value={created.shortUrl} notify={notify} withLabel />
                    </div>
                    <div className="created-destination">
                        <span>DESTINATION</span>
                        <p>{created.originalUrl}</p>
                    </div>
                    <div className="created-actions">
                        <a
                            className="text-link"
                            href={`#stats/${encodeURIComponent(created.code)}`}
                        >
                            <BarChart3 size={16} />
                            View link statistics
                            <ArrowRight size={15} />
                        </a>
                        <a className="text-link secondary-text-link" href="#links">
                            Back to your links
                            <ArrowRight size={15} />
                        </a>
                    </div>
                </section>
            )}
        </>
    );
}
