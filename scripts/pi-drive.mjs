#!/usr/bin/env node
// Drive the Raspberry Pi kiosk Chromium over CDP (via `ssh -L 9222:localhost:9222 pi`).
// Kiosk must be launched with --remote-debugging-port=9222.
//
//   node scripts/pi-drive.mjs shot [file.png]
//   node scripts/pi-drive.mjs goto <url> [file.png]
//   node scripts/pi-drive.mjs tap <x> <y>          | tap <css-selector>
//   node scripts/pi-drive.mjs swipe <x1> <y1> <x2> <y2> [durationMs=300]
//   node scripts/pi-drive.mjs scroll-swipe <css-selector> <up|down|left|right> [distancePx=300] [durationMs=300]
//   node scripts/pi-drive.mjs eval "<js expression>"
//   node scripts/pi-drive.mjs console [seconds=5]   # print console output/errors while idle
//
// Every command that changes something also prints console errors seen while it ran.
//
// INPUT MODE: the Pi's touchscreen reaches Chromium as a *mouse* (pointerdown/mousedown/
// pointermove/mouseup/click — zero touch events; confirmed by recording real drags), so
// tap/swipe default to mouse events. Set PI_INPUT=touch to send real touch events instead
// (only useful for testing code paths that expect touch devices).
import { chromium } from 'playwright-core';

const CDP_URL = process.env.PI_CDP_URL || 'http://localhost:9222';
const [cmd, ...args] = process.argv.slice(2);

const browser = await chromium.connectOverCDP(CDP_URL);
const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http'));
if (!page) throw new Error('No http(s) page found in the kiosk browser');
const cdp = await browser.contexts()[0].newCDPSession(page);

const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INPUT = process.env.PI_INPUT === 'touch' ? 'touch' : 'mouse';
const touch = (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });
const mouse = (type, x, y) =>
  cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1,
  });
// Input-mode-neutral primitives: down / move / up.
const down = (x, y) => (INPUT === 'touch' ? touch('touchStart', x, y) : mouse('mousePressed', x, y));
const move = (x, y) => (INPUT === 'touch' ? touch('touchMove', x, y) : mouse('mouseMoved', x, y));
const up = (x, y) => (INPUT === 'touch' ? touch('touchEnd', x, y) : mouse('mouseReleased', x, y));

// Swipe: press, interpolate moves at ~60Hz, release.
async function swipe(x1, y1, x2, y2, ms = 300) {
  const steps = Math.max(2, Math.round(ms / 16));
  await down(x1, y1);
  for (let i = 1; i <= steps; i++) {
    await move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await sleep(ms / steps);
  }
  await up(x2, y2);
}

async function center(selector) {
  const loc = page.locator(selector).first();
  // Off-screen elements would give negative/out-of-viewport coordinates, which
  // touch dispatch treats as undefined — bring the target into view first.
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error(`No visible element for ${selector}`);
  if (box.y < 0 || box.y + box.height > (await page.evaluate(() => innerHeight))) {
    // Still partly off-screen (e.g. taller than the viewport): aim at the visible part.
    box.y = Math.max(box.y, 0);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function shot(file) {
  await sleep(300);
  await page.screenshot({ path: file });
  console.log('screenshot ->', file);
}

switch (cmd) {
  case 'shot':
    await shot(args[0] || 'pi.png');
    break;
  case 'goto':
    await page.goto(args[0], { waitUntil: 'networkidle' });
    await shot(args[1] || 'pi.png');
    break;
  case 'tap': {
    let [x, y] = args.map(Number);
    if (Number.isNaN(x)) ({ x, y } = await center(args[0]));
    await down(x, y);
    await sleep(60);
    await up(x, y);
    console.log(`tapped ${x},${y} (${INPUT})`);
    break;
  }
  case 'swipe':
    await swipe(...args.slice(0, 4).map(Number), Number(args[4]) || 300);
    break;
  case 'scroll-swipe': {
    const [selector, dir, dist = '300', ms = '300'] = args;
    const { x, y } = await center(selector);
    const d = Number(dist);
    // Finger moves opposite to the scroll direction: "down" = finger swipes up.
    const [dx, dy] = { down: [0, -d], up: [0, d], right: [-d, 0], left: [d, 0] }[dir];
    const before = await page.locator(selector).first().evaluate((el) => [el.scrollLeft, el.scrollTop]);
    await swipe(x, y, x + dx, y + dy, Number(ms));
    await sleep(400); // let momentum settle
    const after = await page.locator(selector).first().evaluate((el) => [el.scrollLeft, el.scrollTop]);
    console.log(`scroll [left,top] ${before} -> ${after}`);
    break;
  }
  case 'eval':
    console.log(JSON.stringify(await page.evaluate(args[0]), null, 2));
    break;
  case 'console':
    await sleep(Number(args[0] || 5) * 1000);
    break;
  default:
    console.error('Unknown command. See header of scripts/pi-drive.mjs');
    process.exitCode = 1;
}

if (logs.length) console.log('--- console ---\n' + logs.join('\n'));
await browser.close();
