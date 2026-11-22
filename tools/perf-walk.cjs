// 같은 길이나 앉는 자리에서 세 번씩 프레임 간격을 재요.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const native = process.argv.includes('--native');
const uncapped = process.argv.includes('--uncapped');
const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg' };
const spots = {
  walk: { start: { x: 0, z: -74, yaw: 0 } },
  beach: { start: { x: 4, z: 81.8, yaw: 0 }, seat: 'sit' },
  spring: { start: { x: -65.9, z: 72, yaw: 0 }, seat: 'soak' },
  rain: { start: { x: -80, z: 0.3, yaw: 0 }, seat: 'sit' },
  chimes: { start: { x: 70.4, z: 69.3, yaw: 0 }, seat: 'sit' }
};

async function startServer() {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const asset = pathname === '/' ? '/index.html' : pathname;
    if (asset !== '/index.html' && !/^\/textures\/[\w.-]+\.jpg$/.test(asset)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const data = await fs.readFile(path.join(root, asset));
      response.writeHead(200, { 'Content-Type': types[path.extname(asset)] }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function measure(browser, url, spot) {
  const context = await browser.newContext(native
    ? { viewport: null }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(start => {
      window.claude = { hot: { data: { mode: 'play', ...start } } };
    }, spot.start);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    await page.waitForFunction(() => window.__soft?.frame > 2);
    const environment = await page.evaluate(() => {
      const renderer = window.__soft.renderer;
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        canvas: [renderer.domElement.width, renderer.domElement.height],
        gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
      };
    });
    if (spot.seat) {
      await page.keyboard.press('KeyE');
      await page.waitForFunction(kind => window.__soft.player.seat?.kind === kind, spot.seat);
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(1000);
      await page.keyboard.down('KeyW');
    }
    const sample = await page.evaluate(() => new Promise(resolve => {
      const { player, renderer } = window.__soft;
      const origin = player.pos.clone();
      const startedVisible = document.visibilityState === 'visible';
      const startedFocused = document.hasFocus();
      let hiddenDuringSample = !startedVisible;
      let lostFocus = !startedFocused;
      const checkVisibility = () => { if (document.hidden) hiddenDuringSample = true; };
      const checkFocus = () => { lostFocus = true; };
      document.addEventListener('visibilitychange', checkVisibility);
      window.addEventListener('blur', checkFocus);
      const intervals = [];
      let calls = 0;
      let triangles = 0;
      let total = 0;
      let latest;
      function collect(time) {
        if (latest !== undefined) {
          const ms = time - latest;
          total += ms;
          intervals.push(ms);
          calls = Math.max(calls, renderer.info.render.calls);
          triangles = Math.max(triangles, renderer.info.render.triangles);
        }
        latest = time;
        if (total < 4000) {
          requestAnimationFrame(collect);
          return;
        }
        intervals.sort((a, b) => a - b);
        document.removeEventListener('visibilitychange', checkVisibility);
        window.removeEventListener('blur', checkFocus);
        resolve({
          frames: intervals.length,
          meanMs: total / intervals.length,
          p99Ms: intervals[Math.ceil(intervals.length * 0.99) - 1],
          maxMs: intervals.at(-1),
          distance: player.pos.distanceTo(origin),
          startedVisible,
          startedFocused,
          hiddenDuringSample,
          lostFocus,
          calls,
          triangles
        });
      }
      requestAnimationFrame(collect);
    }));
    if (!spot.seat) {
      await page.keyboard.up('KeyW');
      if (sample.distance < 1) throw new Error('캠핑장 걷기에서 눈사람이 움직이지 않았어요.');
    }
    if (errors.length) throw new Error('페이지 오류: ' + errors.join(' / '));
    return { ...environment, ...sample };
  } finally {
    await context.close();
  }
}

async function main() {
  const spotOption = process.argv.indexOf('--spot');
  const name = spotOption === -1 ? 'walk' : process.argv[spotOption + 1];
  if (!Object.hasOwn(spots, name)) throw new Error('--spot은 ' + Object.keys(spots).join(', ') + ' 중 하나여야 해요.');
  const server = await startServer();
  let browser;
  try {
    const args = [];
    if (native) args.push('--start-maximized');
    if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
    browser = await chromium.launch({ channel: 'chrome', headless: false, args });
    const url = 'http://127.0.0.1:' + server.address().port;
    for (let trial = 1; trial <= 3; trial++) {
      console.log(JSON.stringify({ spot: name, trial, uncapped, browser: browser.version(), ...await measure(browser, url, spots[name]) }));
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
