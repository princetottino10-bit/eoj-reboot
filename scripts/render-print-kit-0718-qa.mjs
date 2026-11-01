import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const htmlPath = path.join(root, 'print-kit-0718-clean.html');
const outDir = path.join(root, 'tmp', 'pdfs', 'print-kit-0718');
fs.mkdirSync(outDir, {recursive: true});

const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-setuid-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1200, height:1600, deviceScaleFactor:1});
await page.goto(`file:///${htmlPath.replaceAll('\\','/')}`, {waitUntil:'networkidle0'});
const sections = await page.$$('.sheet, .rules');
for (let i = 0; i < sections.length; i += 1) {
  await sections[i].screenshot({path:path.join(outDir, `page-${String(i + 1).padStart(2,'0')}.png`)});
}
await browser.close();
console.log(`Rendered ${sections.length} QA pages to ${path.relative(root, outDir)}`);
