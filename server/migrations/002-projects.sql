ALTER TABLE versions ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
UPDATE versions SET visibility='private' WHERE manifest->'provenance'->>'draft'='true';
ALTER TABLE games ADD COLUMN IF NOT EXISTS published_version TEXT;
UPDATE games g SET published_version=(SELECT v.id FROM versions v WHERE v.game_id=g.id AND v.visibility='public' ORDER BY v.created_at DESC LIMIT 1) WHERE published_version IS NULL;
DROP INDEX IF EXISTS jobs_one_active_creation;

CREATE TABLE IF NOT EXISTS builder_admission (id INTEGER PRIMARY KEY);
INSERT INTO builder_admission VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES guests(id), title TEXT NOT NULL,
  idea TEXT NOT NULL, game_id TEXT NOT NULL, selected_revision TEXT, published_revision TEXT,
  selection_epoch INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  media JSONB NOT NULL DEFAULT '{}', remix TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS project_turns (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL, request_hash TEXT NOT NULL, message TEXT NOT NULL, options JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued', base_revision TEXT, selection_epoch INTEGER,
  worker_id TEXT, lease_until TIMESTAMPTZ, generation INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'queued', error TEXT,
  revision_id TEXT, progress JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  UNIQUE(project_id,request_id)
);
CREATE INDEX IF NOT EXISTS turns_queue ON project_turns(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS turns_one_writer ON project_turns(project_id) WHERE status='working';
CREATE UNIQUE INDEX IF NOT EXISTS turns_one_owner ON project_turns(owner_id) WHERE status='working';
CREATE TABLE IF NOT EXISTS project_revisions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), turn_id TEXT UNIQUE REFERENCES project_turns(id),
  version_id TEXT NOT NULL REFERENCES versions(id), parent_id TEXT, message TEXT NOT NULL,
  validation JSONB NOT NULL, session JSONB, witnesses JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_events (
  id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), turn_id TEXT,
  kind TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_events_cursor ON project_events(project_id,id);
CREATE TABLE IF NOT EXISTS stored_assets (file TEXT PRIMARY KEY, public BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS project_assets (
  project_id TEXT NOT NULL REFERENCES projects(id), file TEXT NOT NULL REFERENCES stored_assets(file),
  PRIMARY KEY(project_id,file)
);
CREATE TABLE IF NOT EXISTS project_requests (
  owner_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id), PRIMARY KEY(owner_id,request_id)
);

ALTER TABLE project_turns ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}';

-- Historical completed jobs become editable project history; existing deep links survive.
INSERT INTO projects(id,owner_id,title,idea,game_id,selected_revision,published_revision,media,created_at)
SELECT j.id,j.owner_id,COALESCE(j.record->>'title',v.manifest->'meta'->>'title'),j.record->>'prompt',
  CASE WHEN g.owner_id=j.owner_id THEN g.id ELSE 'creation-'||j.id END,
  substring(md5('revision-'||j.id),1,24),substring(md5('revision-'||j.id),1,24),
  jsonb_build_object('assets',v.manifest->'assets','music',v.manifest->'music','icon',v.manifest->'icon'),j.created_at
FROM jobs j JOIN versions v ON v.id=j.record->>'finishedVersion' JOIN games g ON g.id=v.game_id
JOIN guests owner ON owner.id=j.owner_id
WHERE j.status='ready' ON CONFLICT DO NOTHING;
INSERT INTO project_revisions(id,project_id,version_id,message,validation,created_at)
SELECT substring(md5('revision-'||j.id),1,24),j.id,v.id,j.record->>'prompt',
  jsonb_build_object('policy',0,'historical',true),j.created_at
FROM jobs j JOIN projects p ON p.id=j.id JOIN versions v ON v.id=j.record->>'finishedVersion'
WHERE j.status='ready' ON CONFLICT DO NOTHING;
INSERT INTO project_events(project_id,kind,payload)
SELECT p.id,'message',jsonb_build_object('role','user','text',p.idea)
FROM projects p JOIN jobs j ON j.id=p.id
WHERE NOT EXISTS(SELECT 1 FROM project_events e WHERE e.project_id=p.id);

-- Record intent before allocation, so a crashed worker can reclaim its microVMs.
CREATE TABLE IF NOT EXISTS builder_sandboxes (
  name TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES project_turns(id),
  lease_tag TEXT NOT NULL, check_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '25 minutes'
);
