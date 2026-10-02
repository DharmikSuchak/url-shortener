import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { apiRequest } from '../api';
import { Notice } from './Shared';

export default function DeleteDialog({ link, onClose, onDeleted }) {
    const dialog = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const element = dialog.current;
        element.showModal();
        return () => element.close();
    }, []);

    async function removeLink() {
        setBusy(true);
        setError('');
        try {
            await apiRequest(`/urls/${encodeURIComponent(link.code)}`, { method: 'DELETE' });
            onDeleted(link.code);
        } catch (error) {
            if (error.status === 404) {
                onDeleted(link.code);
                return;
            }
            setError(error.message);
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={dialog}
            className="delete-dialog"
            aria-labelledby="delete-title"
            aria-describedby="delete-description"
            onCancel={(event) => {
                if (busy) {
                    event.preventDefault();
                } else {
                    onClose();
                }
            }}
        >
            <div className="dialog-icon">
                <Trash2 size={25} />
            </div>
            <h2 id="delete-title">Delete this link?</h2>
            <p id="delete-description">
                The short link <strong>{link.code}</strong> will stop working. This action cannot be
                undone.
            </p>
            <div className="dialog-url">{link.originalUrl}</div>
            {error && <Notice>{error}</Notice>}
            <div className="dialog-actions">
                <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={onClose}
                    autoFocus
                >
                    Keep link
                </button>
                <button className="button button-danger" disabled={busy} onClick={removeLink}>
                    {busy ? <LoaderCircle size={17} className="spinner" /> : <Trash2 size={17} />}
                    {busy ? 'Deleting…' : 'Delete link'}
                </button>
            </div>
        </dialog>
    );
}
