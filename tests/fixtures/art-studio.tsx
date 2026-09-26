import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GameEditor} from '../../client/GameEditor';
import '../../client/styles.css';

function StudioPreview() {
  const [guest, setGuest] = useState<any>(null);
  const [projectId, setProjectId] = useState(new URLSearchParams(location.search).get('create'));
  useEffect(() => {void fetch('/api/guest', {method: 'POST'}).then(r => r.json()).then(setGuest);}, []);
  const api = async (path: string, body?: unknown) => {
    const response = await fetch('/api' + path, {method: body ? 'POST' : 'GET', headers: {
      Authorization: `Bearer ${guest.token}`, 'Content-Type': 'application/json',
    }, body: body ? JSON.stringify(body) : undefined});
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    return result;
  };
  return <div className="app"><header className="site-header"><span className="brand">MICROFINITY</span><span>LOCAL PREVIEW · FIXTURE ART & GAME</span></header><main className="creator studio">{guest && <GameEditor projectId={projectId} token={guest.token} api={api} onOpen={id => {
    history.replaceState(null, '', id ? `?create=${id}` : location.pathname);
    setProjectId(id);
  }} onPublished={() => {}}/>}</main></div>;
}
createRoot(document.getElementById('root')!).render(<StudioPreview/>);
