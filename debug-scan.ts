import { crawlSite } from './artifacts/api-server/src/qa/crawler.js';
import { inspectUI } from './artifacts/api-server/src/qa/ui-inspector.js';
import path from 'path';

async function test() {
  const url = 'https://sanketzoreportfoli.vercel.app/';
  const jobId = 'test-job';
  const screenshotsDir = path.join(process.cwd(), 'tmp-screenshots');
  
  console.log(`Starting test crawl for: ${url}`);
  const { pages, allLinks } = await crawlSite(
    url,
    10,
    jobId,
    screenshotsDir,
    (curr) => console.log(`Crawling: ${curr}`)
  );
  
  console.log(`Crawl complete. Pages found: ${pages.length}`);
  pages.forEach(p => {
    console.log(` - ${p.url} (Status: ${p.statusCode}, Links found: ${p.linksFound})`);
    console.log(`   Screenshot: ${p.screenshotFile}`);
  });
  
  console.log(`\nTotal links discovered for queue: ${allLinks.length}`);
  allLinks.slice(0, 10).forEach(l => console.log(`  -> ${l.linkUrl}`));

  console.log('\nRunning UI Inspection...');
  const issues = await inspectUI(pages);
  console.log(`UI Inspection complete. Issues found: ${issues.length}`);
  issues.forEach(i => console.log(` [${i.severity}] ${i.issueType}: ${i.description}`));
}

test().catch(console.error);
