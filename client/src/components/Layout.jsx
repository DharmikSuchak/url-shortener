import {
    ArrowUpRight,
    BarChart3,
    ChevronRight,
    LayoutGrid,
    Link2,
    Plus,
    PlusCircle
} from 'lucide-react';

const navigation = [
    { view: 'links', label: 'Links', icon: LayoutGrid },
    { view: 'create', label: 'Create link', icon: PlusCircle },
    { view: 'stats', label: 'Analytics', icon: BarChart3 }
];

export default function Layout({ view, children }) {
    const title = navigation.find((item) => item.view === view)?.label;
    return (
        <div className="app-shell">
            <a
                className="skip-link"
                href="#main-content"
                onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('main-content').focus();
                }}
            >
                Skip to content
            </a>
            <aside className="sidebar">
                <a className="brand" href="#links" aria-label="Linklane home">
                    <span className="brand-mark">
                        <Link2 size={25} />
                    </span>
                    <span>
                        linklane<span className="brand-period">.</span>
                    </span>
                </a>
                <div className="nav-section-label">WORKSPACE</div>
                <nav className="main-navigation" aria-label="Main navigation">
                    {navigation.map(({ view: target, label, icon: Icon }) => (
                        <a
                            key={target}
                            href={`#${target}`}
                            aria-current={view === target ? 'page' : undefined}
                            className={view === target ? 'nav-item is-active' : 'nav-item'}
                        >
                            <Icon size={19} />
                            <span>{label}</span>
                            {view === target && <span className="nav-active-dot" />}
                        </a>
                    ))}
                </nav>
                <div className="sidebar-note">
                    <span className="sidebar-note-icon">
                        <ArrowUpRight size={24} />
                    </span>
                    <h3>A shorter way to share.</h3>
                    <p>One simple link. Wherever your next idea takes you.</p>
                </div>
                <div className="sidebar-caption">
                    <span className="status-dot" />
                    Simple links. Clear insights.
                </div>
            </aside>
            <div className="workspace">
                <header className="topbar">
                    <nav className="breadcrumb" aria-label="Breadcrumb">
                        <a className="breadcrumb-link" href="#links">Workspace</a>
                        <ChevronRight size={15} aria-hidden="true" />
                        <strong aria-current="page">{title}</strong>
                    </nav>
                    <a className="button button-primary button-small" href="#create">
                        <Plus size={16} />
                        Create link
                    </a>
                </header>
                <main id="main-content" className="main-content" tabIndex={-1}>
                    {children}
                </main>
                <nav className="mobile-navigation" aria-label="Mobile navigation">
                    {navigation.map(({ view: target, label, icon: Icon }) => (
                        <a
                            href={`#${target}`}
                            key={target}
                            aria-current={view === target ? 'page' : undefined}
                        >
                            <Icon size={21} />
                            <span>{label}</span>
                        </a>
                    ))}
                </nav>
            </div>
        </div>
    );
}
