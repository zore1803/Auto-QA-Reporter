import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Read the screenshot as base64
const imgPath = '/home/runner/workspace/screenshots/qa-raw.jpg';
const imgB64 = fs.readFileSync(imgPath).toString('base64');
const imgSrc = `data:image/jpeg;base64,${imgB64}`;

// Image native size: 1280x720
const W = 1280, H = 720;

const issues = [
  {
    x: 335, y: 318, w: 38, h: 28,
    color: '#ef4444',
    label: '① Stray orphaned element (no purpose)',
    labelPos: 'below',
  },
  {
    x: 380, y: 518, w: 527, h: 90,
    color: '#f97316',
    label: '② Browser section missing container border — inconsistent styling',
    labelPos: 'above',
  },
  {
    x: 831, y: 633, w: 56, h: 40,
    color: '#ef4444',
    label: '③ Toggle switch appears unstyled / plain gray',
    labelPos: 'above',
  },
];

function issueHtml(issue) {
  const border = `3px solid ${issue.color}`;
  const boxStyle = `
    position:absolute;
    left:${issue.x}px; top:${issue.y}px;
    width:${issue.w}px; height:${issue.h}px;
    border:${border};
    box-sizing:border-box;
    pointer-events:none;
  `;

  const labelBase = `
    position:absolute;
    background:${issue.color};
    color:#fff;
    font:bold 12px/1 Arial, sans-serif;
    padding:3px 7px;
    border-radius:3px;
    white-space:nowrap;
    pointer-events:none;
  `;

  let labelStyle;
  if (issue.labelPos === 'above') {
    labelStyle = `${labelBase} left:${issue.x}px; top:${issue.y - 24}px;`;
  } else {
    labelStyle = `${labelBase} left:${issue.x}px; top:${issue.y + issue.h + 4}px;`;
  }

  return `<div style="${boxStyle}"></div><div style="${labelStyle}">${issue.label}</div>`;
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:${W}px; height:${H}px; overflow:hidden; background:#000; }
  .wrap { position:relative; width:${W}px; height:${H}px; }
  img { position:absolute; top:0; left:0; width:${W}px; height:${H}px; }
</style>
</head>
<body>
<div class="wrap">
  <img src="${imgSrc}" />
  ${issues.map(issueHtml).join('\n')}
</div>
</body>
</html>`;

const htmlPath = '/home/runner/workspace/annotate-page.html';
fs.writeFileSync(htmlPath, html);

// Launch Playwright and screenshot the HTML page
const { LD_LIBRARY_PATH, ...cleanEnv } = process.env;
const browser = await chromium.launch({
  headless: true,
  env: {
    ...cleanEnv,
    LD_LIBRARY_PATH: `/nix/store/24w3s75aa2lrvvxsybficn8y3zxd27kp-mesa-libgbm-25.1.0/lib:${LD_LIBRARY_PATH || ''}`,
  }
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`file://${htmlPath}`);
await page.waitForTimeout(300);
await page.screenshot({ path: '/home/runner/workspace/.canvas/assets/qa-annotated.jpg', type: 'jpeg', quality: 92 });
await browser.close();
fs.unlinkSync(htmlPath);
console.log('done');
