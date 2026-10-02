function recentDays(clicksByDay) {
    const counts = new Map(clicksByDay.map((day) => [day.date, day.count]));
    const today = new Date();
    return Array.from({ length: 14 }, (_, index) => {
        const date = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 13 + index)
        );
        const key = date.toISOString().slice(0, 10);
        return { date: key, count: counts.get(key) || 0 };
    });
}

export default function ClicksChart({ clicksByDay }) {
    const days = recentDays(clicksByDay);
    const maximum = Math.max(2, Math.ceil(Math.max(...days.map((day) => day.count)) / 2) * 2);
    const points = days.map(
        (day, index) => `${42 + index * 44},${155 - (day.count / maximum) * 120}`
    );
    const label = (date) =>
        new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC'
        }).format(new Date(`${date}T00:00:00Z`));
    return (
        <figure className="clicks-chart">
            <svg
                viewBox="0 0 660 200"
                role="img"
                aria-label="Daily clicks over the past 14 UTC days"
            >
                <defs>
                    <linearGradient id="click-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity=".19" />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity=".01" />
                    </linearGradient>
                </defs>
                {[0, 0.5, 1].map((ratio) => (
                    <g key={ratio}>
                        <line
                            x1="42"
                            y1={155 - ratio * 120}
                            x2="628"
                            y2={155 - ratio * 120}
                            stroke="#e2e8f0"
                            strokeDasharray="3 5"
                        />
                        <text
                            x="28"
                            y={159 - ratio * 120}
                            textAnchor="end"
                            fill="#64748b"
                            fontSize="11"
                        >
                            {Math.round(maximum * ratio)}
                        </text>
                    </g>
                ))}
                <polygon points={`42,155 ${points.join(' ')} 614,155`} fill="url(#click-fill)" />
                <polyline
                    points={points.join(' ')}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                />
                {days.map((day, index) => (
                    <circle
                        key={day.date}
                        cx={42 + index * 44}
                        cy={155 - (day.count / maximum) * 120}
                        r={day.count ? 4 : 2}
                        fill={day.count ? '#0284c7' : '#cbd5e1'}
                        stroke="white"
                        strokeWidth="1.5"
                    >
                        <title>
                            {day.date}: {day.count} clicks
                        </title>
                    </circle>
                ))}
                <text x="42" y="185" fill="#64748b" fontSize="11">
                    {label(days[0].date)}
                </text>
                <text x="328" y="185" textAnchor="middle" fill="#64748b" fontSize="11">
                    {label(days[6].date)}
                </text>
                <text x="614" y="185" textAnchor="end" fill="#64748b" fontSize="11">
                    {label(days[13].date)}
                </text>
            </svg>
            <figcaption className="sr-only">
                {days.map((day) => `${day.date}: ${day.count} clicks`).join('; ')}
            </figcaption>
        </figure>
    );
}
