import {SandboxInstance, listImageTags} from '@blaxel/core';

// Read-only preflight. Never print credential values or raw provider errors.
try {
  for (const key of ['OPENAI_API_KEY', 'BL_WORKSPACE']) {
    if (!process.env[key]?.trim()) throw Error(`${key} is not configured`);
  }
  if (!process.env.BL_API_KEY?.trim() && !process.env.BL_CLIENT_CREDENTIALS?.trim()) {
    throw Error('A Blaxel service credential is not configured');
  }
  const image = process.env.BLAXEL_BUILDER_IMAGE ?? '';
  if (!/^sandbox\/[a-z0-9][a-z0-9-]*:[a-f0-9]{20,64}$/.test(image)) {
    throw Error('BLAXEL_BUILDER_IMAGE must be pinned to a version');
  }
  await SandboxInstance.list({limit: 1}).catch(() => {throw Error('Blaxel workspace access failed');});
  const [imageName, tag] = image.slice('sandbox/'.length).split(':');
  const {data, response} = await listImageTags({path: {resourceType: 'sandbox', imageName},
    query: {name: tag, limit: 1}, signal: AbortSignal.timeout(30_000)});
  if (!response.ok || !data?.data.some(value => value.name === tag)) throw Error('Pinned Blaxel toolkit image is unavailable');
  console.log(JSON.stringify({ok: true, workspace: process.env.BL_WORKSPACE, image}));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
