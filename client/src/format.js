export function formatDate(value, withTime = false) {
    if (!value) {
        return '—';
    }
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        ...(withTime ? { timeStyle: 'short' } : {})
    }).format(new Date(value));
}

export function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
}

export function displayUrl(value) {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function localDateTime() {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
