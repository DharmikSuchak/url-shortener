import { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Copy, LoaderCircle, RefreshCw, X } from 'lucide-react';

export function Notice({ type = 'error', children, onDismiss }) {
    const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
    return (
        <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
            <Icon size={19} aria-hidden="true" />
            <span>{children}</span>
            {onDismiss && (
                <button
                    className="icon-button"
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={onDismiss}
                >
                    <X size={17} />
                </button>
            )}
        </div>
    );
}

export function Loading({ label = 'Loading…' }) {
    return (
        <div className="loading-state" role="status">
            <LoaderCircle size={25} className="spinner" aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

export function ErrorState({ message, onRetry }) {
    return (
        <div className="empty-state error-state" role="alert">
            <div className="empty-icon">
                <AlertCircle size={28} />
            </div>
            <h3>Something got in the way</h3>
            <p>{message}</p>
            <button className="button button-secondary" onClick={onRetry}>
                <RefreshCw size={16} />
                Try again
            </button>
        </div>
    );
}

export function CopyButton({ value, notify, withLabel = false, label = 'Copy short link' }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            notify({ type: 'success', message: 'Short link copied to your clipboard.' });
        } catch {
            notify({
                type: 'error',
                message: 'Couldn’t copy this link. Select the link text and copy it instead.'
            });
        }
    }

    return (
        <button
            type="button"
            className={withLabel ? 'button button-secondary' : 'icon-button'}
            title={label}
            aria-label={copied ? 'Copied short link' : label}
            onClick={copy}
        >
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {withLabel && (copied ? 'Copied!' : 'Copy link')}
        </button>
    );
}

export function StatusBadge({ expired }) {
    return (
        <span className={`status-badge ${expired ? 'status-expired' : 'status-active'}`}>
            <span className="status-dot" />
            {expired ? 'Expired' : 'Active'}
        </span>
    );
}
