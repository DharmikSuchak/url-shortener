const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export async function apiRequest(path, options = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }
        throw new Error('We couldn’t connect to the service. Please try again.');
    }

    if (response.status === 204) {
        return null;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(
            body?.error || 'The service could not complete this request. Please try again.'
        );
        error.status = response.status;
        throw error;
    }
    if (!body) {
        throw new Error('The service returned an unexpected response. Please try again.');
    }
    return body;
}
