import 'dotenv/config';
import OpenAI from 'openai';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const outDir = 'games/icons';
const artifactDir = 'artifacts/reference-icons';
const model = process.env.IMAGE_MODEL ?? 'gpt-image-1.5';
const style = 'A dedicated square cartridge-cover illustration for a tiny playful retro arcade game. Printed-label pixel-cartoon art with chunky pixel edges, bold clean outlines, a limited vivid palette, simple readable shapes, and a filled background. Compose one clear scene that still reads at small icon size. No words, letters, numbers, logos, watermark, frame, collage, or recognizable copyrighted character.';

const jobs = [
  ['asteroid-scramble', 'A little cream-and-coral rocket weaving through three chunky violet asteroids in a deep teal starfield, diagonal action, tiny bright shot streaks.'],
  ['conveyor-clash', 'A comic factory conveyor with three colorful lanes carrying square parcels, one gloved hand ready to catch a parcel, warm machinery and playful motion.'],
  ['crawl-for-gold', 'A determined tiny pajama crawler stretching one long arm toward a gleaming golden trophy at the end of a warm sandy lane; make the crawler and trophy the clear focal points.'],
  ['cup-shuffle', 'Three expressive upside-down carnival cups on a plum stage, one lime-green pea peeking from beneath the center cup, theatrical spotlight and playful shuffle swooshes.'],
  ['nose-dive', 'A silly rosy nose spinning at center while two colorful pairs of tiny fingers reach inward from opposite edges, sunny yellow backdrop, funny timing-game energy.'],
  ['odd-snack-out', 'Six identical round golden frosted snack faces, same shape, same pale pink frosting, same expression, same size, arranged in a tidy three-by-two grid on a pastel bakery counter. Exactly five snacks each have three large clearly separated dark sprinkles; exactly one snack has only two. Do not vary any other feature between snacks. The sprinkle-count difference must be immediately countable.'],
  ['patchwork-pass', 'A cozy overhead view of a shared patchwork quilt with bold geometric stitched pieces, one bright piece being placed into an open grid, craft-table warmth and thread details.'],
  ['skill-continue', 'A glowing mint timing zone with a bright white pulse crossing it, two small arcade relay batons passing between colorful player hands, dark indigo cabinet-like atmosphere.'],
  ['toast-catch', 'A smiling golden toast slice falling toward a waiting little hand over a cheerful breakfast kitchen counter, buttery orange and sky-blue colors.'],
  ['umbrella-panic', 'A small lavender umbrella sheltering a childlike figure while golden stars and a few red storm drops fall from a whimsical blue raincloud, playful rainy-day scene.'],
] as const;

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 0});
await mkdir(outDir, {recursive: true});
await mkdir(artifactDir, {recursive: true});

const existingManifestPath = `${outDir}/manifest.json`;
let previousIcons: Record<string, unknown> = {};
try {
  previousIcons = JSON.parse(await readFile(existingManifestPath, 'utf8')).icons ?? {};
} catch {}
const selectedId = process.argv[2];
const selectedJobs = selectedId ? jobs.filter(([id]) => id === selectedId) : [...jobs];
if (selectedId && selectedJobs.length !== 1) throw new Error(`Unknown game id: ${selectedId}`);
const manifest: {model: string; width: number; height: number; icons: Record<string, unknown>;} = {
  model,
  width: 256,
  height: 256,
  icons: {...previousIcons},
};
let next = 0;
let providerError: unknown;
async function worker() {
  while (!providerError) {
    const index = next++;
    if (index >= selectedJobs.length) return;
    const [gameId, scene] = selectedJobs[index];
    const prompt = `${style}\nScene: ${scene}`;
    try {
      const result = await client.images.generate({
        model,
        prompt,
        size: '1024x1024',
        quality: 'low',
        output_format: 'png',
        n: 1,
      });
      const encoded = result.data?.[0]?.b64_json;
      if (!encoded) throw new Error(`Image API returned no PNG data for ${gameId}`);
      const png = await sharp(Buffer.from(encoded, 'base64'))
        .resize(256, 256, {fit: 'cover', position: 'centre', kernel: 'lanczos3'})
        .png()
        .toBuffer();
      const filename = `${outDir}/${gameId}.png`;
      await writeFile(filename, png);
      manifest.icons[gameId] = {
        file: `${gameId}.png`,
        model,
        prompt,
        width: 256,
        height: 256,
        sha256: createHash('sha256').update(png).digest('hex'),
      };
      console.log(`Generated ${gameId}`);
    } catch (error) {
      providerError = error;
      throw error;
    }
  }
}

const results = await Promise.allSettled([worker(), worker()]);
const failure = results.find((result) => result.status === 'rejected');
if (failure?.status === 'rejected') {
  await writeFile(`${artifactDir}/provider-error.txt`, String(failure.reason));
  throw failure.reason;
}
if (Object.keys(manifest.icons).length < jobs.length) throw new Error('Generation stopped before all ten icons finished');
await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
