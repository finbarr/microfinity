import {useEffect, useRef, useState} from 'react';
import type {Manifest} from '../server/store';
import {GamePreview} from './GamePreview';
import {audio} from './audio';
import './editor.css';

type API = (path: string, body?: unknown) => Promise<any>;
type Props = {projectId: string | null; remix?: string; token: string; api: API;
  onOpen: (id: string | null) => void; onPublished: () => void; onAdd?: (version: string) => void};
const stageName: Record<string,string> = {queued: 'Waiting for a builder', starting: 'Opening your workspace', media: 'Making the art and soundtrack', building: 'Building your game', validating: 'Playtesting all four player counts', ready: 'Ready to play', failed: 'This edit needs another try', cancelled: 'Edit stopped'};
const assistantText = (text: string) => text
  .replace(/\[[^\]]+\]\(\/(?:work|input|scratch|kit|references)\/[^)]+\)/g, 'your game')
  .replace(/\boutput\.ts\b/g, 'your game').replace(/\*\*|`/g, '');

export function GameEditor({projectId, remix, token, api, onOpen, onPublished, onAdd}: Props) {
  const [project, setProject] = useState<any>(null), [history, setHistory] = useState<any[]>([]), [events, setEvents] = useState<any[]>([]);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [regenerateArt, setArt] = useState(false), [regenerateMusic, setMusic] = useState(false);
  const [playingRevision, setPlayingRevision] = useState<string | null>(null), [mobileTab, setMobileTab] = useState('chat');
  const [attachReplay, setAttachReplay] = useState(false), [hasReplay, setHasReplay] = useState(false), [connected, setConnected] = useState(false);
  const latestReplay = useRef<any>(null), apiRef = useRef(api), pendingRequest = useRef<{signature: string; id: string} | undefined>(undefined);
  apiRef.current = api;
  const currentId = useRef(projectId); currentId.current = projectId;
  const conversation = useRef<HTMLDivElement>(null), followConversation = useRef(true);
  const loadHistory = () => apiRef.current('/projects').then(setHistory).catch(e => setError(e.message));
  useEffect(() => {void loadHistory();}, []);
  useEffect(() => {if (!projectId) setMessage(remix ? 'Keep the core idea, but ' : '');}, [remix, projectId]);
  useEffect(() => {
    setProject(null); setEvents([]); setPlayingRevision(null); setError(''); setHasReplay(false); setAttachReplay(false); setMobileTab('chat'); setMessage(!projectId && remix ? 'Keep the core idea, but ' : '');
    latestReplay.current = null; followConversation.current = true;
    if (!projectId) return;
    const abort = new AbortController();
    let cursor = 0;
    const refresh = async () => {
      const next = await apiRef.current(`/projects/${projectId}`);
      if (!abort.signal.aborted) {setProject(next); setPlayingRevision(prior => prior ?? next.selected_revision);}
    };
    void refresh().catch(e => {if (!abort.signal.aborted) setError(e.message);});
    async function stream() {
      while (!abort.signal.aborted) {
        try {
          const response = await fetch(`/api/projects/${projectId}/events?after=${cursor}`, {headers: {Authorization: `Bearer ${token}`}, signal: abort.signal});
          if (!response.ok || !response.body) throw Error('Progress connection unavailable');
          setConnected(true);
          const reader = response.body.getReader(), decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const {done, value} = await reader.read();
            if (done || abort.signal.aborted) break;
            buffer += decoder.decode(value, {stream: true});
            let end, changed = false;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              const line = block.split('\n').find(s => s.startsWith('data: '));
              if (!line) continue;
              const event = JSON.parse(line.slice(6));
              if (Number(event.id) <= cursor) continue;
              cursor = Number(event.id); changed = true;
              setEvents(previous => [...previous, event]);
            }
            if (changed) {await refresh(); void loadHistory();}
          }
        } catch (e) {if (abort.signal.aborted) return;}
        setConnected(false);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    void stream();
    return () => {abort.abort(); setConnected(false);};
  }, [projectId, token]);
  useEffect(() => {
    if (followConversation.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [events.length]);
  const command = async (operation: () => Promise<any>) => {
    setBusy(true); setError('');
    try {return await operation();} catch (e) {setError((e as Error).message); return null;} finally {setBusy(false);}
  };
  const submit = async () => {
    const text = message.trim();
    if (!text) return;
    const body: any = projectId ? {message: text, regenerateArt, regenerateMusic,
      ...(attachReplay && latestReplay.current ? {feedback: latestReplay.current} : {})} : {prompt: text, ...(remix ? {remix, reuseMedia: true} : {})};
    const signature = JSON.stringify({projectId, body});
    if (pendingRequest.current?.signature !== signature) pendingRequest.current = {signature, id: crypto.randomUUID()};
    body.requestId = pendingRequest.current.id;
    const submittedId = projectId;
    const next = await command(() => apiRef.current(projectId ? `/projects/${projectId}/turns` : '/projects', body));
    if (next && currentId.current === submittedId) {
      pendingRequest.current = undefined; setMessage(''); setArt(false); setMusic(false); setAttachReplay(false);
      followConversation.current = true; setProject(next); onOpen(next.id); void loadHistory();
    }
  };
  const updateProject = (next: any) => {if (next.id === currentId.current) setProject(next);};
  const chooseRevision = async (revision: string) => {
    const next = await command(() => apiRef.current(`/projects/${projectId}/select`, {revisionId: revision}));
    if (next && currentId.current === projectId) {setProject(next); setPlayingRevision(revision); setMobileTab('play');}
  };
  const selected = project?.revisions.find((r: any) => r.id === project.selected_revision);
  const playing = project?.revisions.find((r: any) => r.id === playingRevision);
  const working = project?.turns.find((t: any) => t.status === 'working') ?? project?.turns.find((t: any) => t.status === 'queued');
  const latestTurn = project?.turns.at(-1);
  const snapshots = events.filter(event => event.kind === 'snapshot');
  const media = project?.media;
  const undo = selected?.parent_id;
  return <section className="game-editor" data-editor-surface aria-label="Game editor">
    <div className="editor-heading"><div><div className="eyebrow">YOUR LITTLE GAME STUDIO</div><h1>{project?.title ?? (remix ? 'Make it your own.' : 'What’s your little big idea?')}</h1><p>{project ? 'Play, change a little, play again.' : 'Describe a tiny game. Give it a world, a sound, and a life of its own.'}</p></div>{projectId && <button className="secondary" onClick={() => onOpen(null)}>＋ New game</button>}</div>
    <div className="editor-mobile-tabs"><button aria-pressed={mobileTab === 'chat'} onClick={() => setMobileTab('chat')}>Conversation</button><button aria-pressed={mobileTab === 'play'} onClick={() => setMobileTab('play')}>Play {selected && '●'}</button></div>
    <div className={`editor-columns mobile-${mobileTab}`}>
      <div className="editor-chat">
        {projectId && <div className="editor-connection" role="status">{connected ? 'Conversation saved' : 'Reconnecting to your saved conversation…'}</div>}
        <div className="editor-conversation" ref={conversation} onScroll={() => {const e = conversation.current!; followConversation.current = e.scrollHeight - e.scrollTop - e.clientHeight < 100;}}>
          {events.filter(e => ['message','snapshot','ready','failed','cancelled','published'].includes(e.kind)).map(event => <div className={`editor-event event-${event.kind} ${event.payload.role ?? ''}`} key={event.id}>
            {event.kind === 'message' && <><span>{event.payload.role === 'user' ? 'You' : 'Game maker'}</span><p>{event.payload.role === 'user' ? event.payload.text : assistantText(event.payload.text)}</p></>}
            {event.kind === 'snapshot' && <figure><img src={event.payload.url} alt="Game development snapshot" loading="lazy"/><figcaption>Work in progress · {new Date(event.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</figcaption></figure>}
            {event.kind === 'ready' && <p>✓ A new version is ready to play.</p>}
            {event.kind === 'failed' && <p>This edit stopped: {event.payload.message}. Your previous version is saved.</p>}
            {event.kind === 'cancelled' && <p>Edit stopped. Your saved game is still here.</p>}
            {event.kind === 'published' && <p>✦ Published to the arcade.</p>}
          </div>)}
          {!events.length && <div className="editor-welcome"><span>✦</span><p>{projectId ? 'Opening your conversation…' : 'A sleepy dragon catching marshmallows? A penguin racing the sunrise? Start with a few sentences.'}</p></div>}
        </div>
        {working && <div className="editor-progress" role="status"><span className="pixel-spark" aria-hidden="true">✦</span><span>{stageName[working.stage] ?? working.stage}{working.status === 'queued' && project.queueAhead > 0 ? ` · ${project.queueAhead} ahead` : ''}</span><button disabled={busy} onClick={() => void command(async () => updateProject(await apiRef.current(`/projects/${projectId}/turns/${working.id}/cancel`, {})))}>Stop</button></div>}
        {!working && ['failed','cancelled'].includes(latestTurn?.status) && <button className="secondary" disabled={busy} onClick={() => void command(async () => updateProject(await apiRef.current(`/projects/${projectId}/turns`, {requestId: crypto.randomUUID(), message: latestTurn.message, retryOf: latestTurn.id})))}>Retry this edit</button>}
        <form className="editor-composer" onSubmit={e => {e.preventDefault(); void submit();}}>
          <label htmlFor="game-message">{projectId ? 'What would you like to change?' : 'The game in your head'}</label>
          <textarea id="game-message" data-nav-start value={message} maxLength={600} onChange={e => setMessage(e.target.value)} placeholder={projectId ? 'Make it a little faster, and give me three lives…' : 'Describe a tiny game…'}/>
          <div className="editor-composer-bottom"><small>{message.length}/600 · A few sentences</small><button className="primary" disabled={busy || message.trim().length < (projectId ? 1 : 12)}>{busy ? 'Saving…' : projectId ? working ? 'Queue this change' : 'Make this change' : 'Make this game'} ✦</button></div>
          {projectId && <details><summary>Art, sound and playtest feedback</summary><label><input type="checkbox" checked={regenerateArt} onChange={e => setArt(e.target.checked)}/> Make new artwork</label><label><input type="checkbox" checked={regenerateMusic} onChange={e => setMusic(e.target.checked)}/> Compose new music</label><label><input type="checkbox" disabled={!hasReplay} checked={attachReplay} onChange={e => setAttachReplay(e.target.checked)}/> Include my current playtest replay</label></details>}
        </form>
        {error && <p className="editor-error" role="alert">{error}</p>}
      </div>
      <div className="editor-stage">
        {selected && <div className="editor-revisions"><label>Version <select aria-label="Selected game revision" value={project.selected_revision} disabled={busy} onChange={e => void chooseRevision(e.target.value)}>{project.revisions.map((revision: any, index: number) => <option key={revision.id} value={revision.id}>{index + 1} · {revision.message.slice(0, 45)}</option>)}</select></label><button disabled={busy || !undo} onClick={() => void chooseRevision(undo)}>Undo</button><button className="primary" disabled={busy || project.published_revision === selected.id} onClick={() => void command(async () => {updateProject(await apiRef.current(`/projects/${projectId}/publish`, {revisionId: selected.id})); await loadHistory(); onPublished();})}>{project.published_revision === selected.id ? 'Published ✓' : 'Publish'}</button>{onAdd && project.published_revision === selected.id && <button disabled={busy} onClick={() => onAdd(selected.version_id)}>Add to party</button>}</div>}
        {selected && playingRevision !== selected.id && <div className="editor-new-version"><span>A new version is ready. Your current round is unchanged.</span><button onClick={() => {setPlayingRevision(selected.id); setMobileTab('play');}}>Play latest</button></div>}
        {playing ? <GamePreview key={playing.id} manifest={playing.manifest as Manifest} revisionId={playing.id} onReplay={replay => {latestReplay.current = replay; setHasReplay(!!replay);}}/> : <div className="editor-empty-stage">{snapshots.length ? <img src={snapshots.at(-1).payload.url} alt="Latest game development snapshot"/> : <><span aria-hidden="true">✦</span><h2>{projectId ? 'Your game is taking shape.' : 'Room for something strange.'}</h2><p>{projectId ? 'The first gameplay snapshot will appear here.' : 'Your playable game will live here, right beside the conversation.'}</p></>}</div>}
        {media && (media.icon || media.assets?.length || media.music) && <div className="editor-media">{media.icon && <img src={media.icon.url} alt="Cartridge cover"/>}{media.assets?.map((asset: any) => <img key={asset.hash} src={asset.url} alt={`Game artwork: ${asset.name}`}/>)}{media.music && <div><span>YOUR SOUNDTRACK</span><audio controls src={media.music.url} preload="none" onPlay={() => audio.stopLoop()}/></div>}</div>}
      </div>
    </div>
    {!!history.length && <nav className="editor-history" aria-label="Your games"><h2>Your little inventions</h2>{history.map(game => <button key={game.id} aria-current={game.id === projectId ? 'page' : undefined} onClick={() => onOpen(game.id)}><strong>{game.title}</strong><span>{game.published_revision ? 'Published' : game.selected_revision ? 'Private draft' : 'In progress'}</span></button>)}</nav>}
  </section>;
}
