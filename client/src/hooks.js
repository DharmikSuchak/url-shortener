import { useEffect, useState } from 'react';
import { apiRequest } from './api';

function currentRoute() {
    const [view, code] = window.location.hash.slice(1).split('/');
    try {
        return {
            view: ['links', 'create', 'stats'].includes(view) ? view : 'links',
            code: code ? decodeURIComponent(code) : ''
        };
    } catch {
        return { view: 'stats', code: '' };
    }
}

export function navigate(view, code = '') {
    window.location.hash = code ? `${view}/${encodeURIComponent(code)}` : view;
}

export function useRoute() {
    const [route, setRoute] = useState(currentRoute);
    useEffect(() => {
        const update = () => setRoute(currentRoute());
        window.addEventListener('hashchange', update);
        return () => window.removeEventListener('hashchange', update);
    }, []);
    return route;
}

export function useResource(path) {
    const [revision, setRevision] = useState(0);
    const [resource, setResource] = useState({
        data: null,
        status: path ? 'loading' : 'idle',
        error: ''
    });
    useEffect(() => {
        if (!path) {
            setResource({ data: null, status: 'idle', error: '' });
            return;
        }
        const controller = new AbortController();
        setResource({ data: null, status: 'loading', error: '' });
        apiRequest(path, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) {
                    setResource({ data, status: 'success', error: '' });
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setResource({ data: null, status: 'error', error: error.message });
                }
            });
        return () => controller.abort();
    }, [path, revision]);
    return { ...resource, refresh: () => setRevision((value) => value + 1) };
}

export function useClock() {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);
    return now;
}
