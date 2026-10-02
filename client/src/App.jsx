import { useEffect, useState } from 'react';
import { useRoute } from './hooks';
import Layout from './components/Layout';
import { Notice } from './components/Shared';
import LinksPage from './pages/LinksPage';
import CreatePage from './pages/CreatePage';
import StatsPage from './pages/StatsPage';

export default function App() {
    const { view, code } = useRoute();
    const [notice, setNotice] = useState(null);
    useEffect(() => {
        setNotice(null);
        window.scrollTo(0, 0);
        document.title = `${view === 'create' ? 'Create link' : view === 'stats' ? 'Analytics' : 'Links'} · Linklane`;
    }, [view, code]);

    return (
        <Layout view={view}>
            {notice && (
                <Notice type={notice.type} onDismiss={() => setNotice(null)}>
                    {notice.message}
                </Notice>
            )}
            {view === 'links' && <LinksPage notify={setNotice} />}
            {view === 'create' && <CreatePage notify={setNotice} />}
            {view === 'stats' && <StatsPage code={code} />}
        </Layout>
    );
}
