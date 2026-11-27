import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://www.caniemail.com/api/data.json';

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const raw = await res.json();

const slim = {
  source: SOURCE,
  last_update_date: raw.last_update_date,
  nicenames: { family: raw.nicenames.family, platform: raw.nicenames.platform },
  data: raw.data.map(({ slug, title, category, url, stats, notes_by_num }) => ({
    slug,
    title,
    category,
    url,
    stats,
    notes_by_num,
  })),
};

const target = new URL('../data/caniemail.json', import.meta.url);
await writeFile(target, JSON.stringify(slim));
console.log(`Saved ${slim.data.length} features (caniemail update ${slim.last_update_date})`);
