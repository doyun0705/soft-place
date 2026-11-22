// Soft Place 플레이 시험: "어느 자리에서 시작해, 무엇을 누르고, 무엇을 확인하는지"
//
// 쓰는 법 (저장소 맨 위 폴더에서):
//   node tools/play-check.js                  전부
//   node tools/play-check.js walk,aerial      골라서 (쉼표로)
//   node tools/play-check.js --list           시험 목록
// 옵션:
//   --gl=swiftshader   그래픽카드가 없는 곳(클라우드)에서 소프트웨어로 그려요. 아주 느려요
//   --headed           창을 띄워서 봐요
//   --offline          바깥 주소(글꼴 등)를 막아요. three.js는 SP_THREE로 줘야 해요
// 환경 변수:
//   SP_THREE=경로      three@0.128.0의 build/three.min.js. cdnjs가 막힌 곳에서 써요
//   SP_WAIT_MS=숫자    한 번 기다리는 최대 시간 (기본 120000)
// 결과: 화면에 ✅/❌, 사진은 tools/out/, 하나라도 실패하면 종료 코드 1.
// 게임 상태는 index.html의 window.__soft (시험 손잡이)로 읽어요.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const argv = process.argv.slice(2);
const opt = {
  gl: (argv.find(a => a.startsWith('--gl=')) || '').slice(5),
  headed: argv.includes('--headed'),
  offline: argv.includes('--offline'),
  list: argv.includes('--list'),
};
const picked = (argv.find(a => !a.startsWith('--')) || '').split(',').filter(Boolean);
const THREE_FILE = process.env.SP_THREE || '';
const WAIT_MS = Number(process.env.SP_WAIT_MS) || 120000;
const FIRE_SEAT = { x: 0, z: -86.2, yaw: 0 };    // 모닥불 앞 통나무 (E 누르면 불멍)
const VIEW_SEAT = { x: 3, z: -96, yaw: 0 };      // 캠핑장 절벽 전망 자리
const PLAZA = { x: -4, z: 6, yaw: 0.6 };         // 중앙 광장 (눈이라 발자국이 남아요)
const BEACH_BENCH = { x: 4, z: 81.8, yaw: 0 };   // 파도 해변 벤치 앞 (E 누르면 바다를 보고 앉아요)
const SPRING_EDGE = { x: -65.9, z: 72, yaw: 0 };   // 눈꽃 온천 남쪽 물가 (E 누르면 몸을 담가요)
const CHIMES_BENCH = { x: 70.4, z: 69.3, yaw: 0 };   // 풍경 나무 동남쪽 벤치 앞 (E 누르면 느티나무와 북쪽 하늘을 보고 앉아요)
const RAIN_BENCH = { x: -80, z: 0.3, yaw: 0 };   // 비 오는 숲 정자 마루 가운데 (E 누르면 마루 안쪽에 앉아 남쪽 연못을 봐요)

// ---------- 작은 웹 서버: 저장소 폴더를 그대로 보여 줘요 ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---------- 도우미 ----------
let BASE = '';
let browser = null;

async function newContext(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (THREE_FILE && /three(\.min)?\.js/.test(u)) return route.fulfill({ body: fs.readFileSync(THREE_FILE), contentType: 'application/javascript' });
    if (opt.offline) return route.abort();
    return route.continue();
  });
  return ctx;
}

// spawn이 있으면 꾸미기 화면을 건너뛰고 그 자리에서 시작해요 (window.claude.hot.data)
async function open(ctx, t, spawn, hash) {
  const page = await ctx.newPage();
  page.on('pageerror', e => t.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) t.warns.push(m.text()); });
  if (spawn) await page.addInitScript(d => { window.claude = { hot: { data: d } }; }, Object.assign({ mode: 'play' }, spawn));
  await page.goto(BASE + '/index.html' + (hash || ''), { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await until(page, () => window.__soft && window.__soft.frame > 2, null, '첫 화면 그리기 (window.__soft)');
  return page;
}

// 게임 상태가 될 때까지 기다려요 (정해진 초 대신: 느린 컴퓨터에서도 같은 결과)
async function until(page, fn, arg, what, ms) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || WAIT_MS, polling: 200 }); }
  catch (e) { throw new Error('기다려도 안 됨: ' + what); }
}
// 프레임 n개가 지나갈 때까지
async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__soft.frame);
  await until(page, k => window.__soft.frame >= k, f0 + n, n + '프레임 지나기');
}
function check(t, ok, what, detail) {
  if (!ok) throw new Error(what + (detail === undefined ? '' : ' -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
  t.notes.push('✓ ' + what);
}
async function shot(t, page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, t.name + '-' + name + '.png') });
}
async function press(page, key) { await page.keyboard.press(key); }
async function drag(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 }); await page.mouse.up();
}
// 앉기: E를 누르고 그 자리 종류가 될 때까지
async function sit(page, kind) {
  await until(page, () => window.__soft.state.mode === 'play', null, '걷는 화면');
  await press(page, 'KeyE');
  await until(page, k => window.__soft.player.seat && window.__soft.player.seat.kind === k, kind, kind + ' 자리에 앉기');
}

// ---------- 시험들 ----------
const tests = {
  panel: {
    what: '첫 화면: 꾸미기 창과 혼자 / 아무 방이나 / 방 만들기 / 코드 입력이 화면 안에 보여요 (1280×800)',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, null);
      await until(p, () => !document.getElementById('panel').hidden, null, '꾸미기 창 열림');
      const s = await p.evaluate(() => {
        const box = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { shown: e.offsetWidth > 0 && e.offsetHeight > 0, top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
        return { mode: window.__soft.state.mode, howBox: !document.getElementById('howBox').hidden, enterHidden: document.getElementById('btnEnter').hidden, h: innerHeight,
          ways: ['waySolo', 'wayRandom', 'wayMake', 'codeInput', 'wayJoin'].map(id => [id, box(id)]) };
      });
      check(t, s.mode === 'customize', '처음엔 꾸미기 화면', s.mode);
      check(t, s.howBox, '어떻게 들어갈지 고르는 상자가 보임');
      check(t, s.enterHidden, "처음엔 '다 꾸몄어요' 버튼 대신 고르기 버튼만");
      for (const [id, b] of s.ways) check(t, b && b.shown && b.top >= 0 && b.bottom <= s.h, '#' + id + ' 가 스크롤 없이 화면 안에', b);
      await shot(t, p, 'panel');
      await ctx.close();
    },
  },

  phone: {
    what: '폰 크기(390×844): 옆으로 넘치지 않고, 고르기 버튼까지 내려가서 누를 수 있어요',
    run: async t => {
      const ctx = await newContext({ width: 390, height: 844 });
      const p = await open(ctx, t, null);
      await until(p, () => !document.getElementById('panel').hidden, null, '꾸미기 창 열림');
      await shot(t, p, 'panel');
      const s = await p.evaluate(() => {
        const b = document.getElementById('waySolo'); b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, w: innerWidth, top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight };
      });
      check(t, s.sw <= s.w, '옆으로 넘치는 것 없음', s);
      check(t, s.top >= 0 && s.bottom <= s.h, '스크롤하면 혼자 있기 버튼이 보임', s);
      await p.click('#waySolo');
      await until(p, () => window.__soft.state.mode === 'play', null, '혼자 있기 눌러서 들어가기');
      check(t, true, '폰 크기에서도 들어가짐');
      await shot(t, p, 'play');
      await ctx.close();
    },
  },

  solo: {
    what: '혼자 있기: 누르면 바로 세계로, 방 없음, 다른 사람 0명, 소리 엔진 켜짐',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, null);
      await p.click('#waySolo');
      await until(p, () => window.__soft.state.mode === 'play', null, '세계로 들어가기');
      await frames(p, 3);
      const s = await p.evaluate(() => { const S = window.__soft; return { kind: S.net.kind, room: S.net.room, others: Object.keys(S.others).length, panel: document.getElementById('panel').hidden, audio: !!S.audio, ctxState: S.audio && S.audio.ctx.state }; });
      check(t, s.kind === 'solo' && !s.room, '혼자 모드, 방 코드 없음', s);
      check(t, s.others === 0, '다른 사람 0명', s.others);
      check(t, s.panel, '꾸미기 창 닫힘');
      check(t, s.audio, '소리 엔진이 만들어짐 (상태: ' + s.ctxState + ')');
      await ctx.close();
    },
  },

  walk: {
    what: '걷기: W로 걸으면 움직이고 눈에 발자국이 남아요. 마우스 클릭으로는 걷지 않아요(도윤 결정)',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, PLAZA);
      const before = await p.evaluate(() => { const S = window.__soft; return { x: S.player.pos.x, z: S.player.pos.z, prints: S.printBorn.filter(v => v > -999).length }; });
      await p.keyboard.down('KeyW');
      await until(p, b => Math.hypot(window.__soft.player.pos.x - b.x, window.__soft.player.pos.z - b.z) > 2.5, before, 'W로 2.5m 걷기');
      await p.keyboard.up('KeyW');
      const prints = await p.evaluate(() => window.__soft.printBorn.filter(v => v > -999).length);
      check(t, true, 'W를 누르면 걸어감');
      check(t, prints > before.prints, '발자국이 남음 (' + before.prints + ' -> ' + prints + ')');
      await until(p, () => !window.__soft.player.moving, null, '멈추기');
      const here = await p.evaluate(() => ({ x: window.__soft.player.pos.x, z: window.__soft.player.pos.z }));
      await p.mouse.click(640, 600);   // 눈사람 앞 바닥
      await frames(p, 8);
      const after = await p.evaluate(() => ({ x: window.__soft.player.pos.x, z: window.__soft.player.pos.z, target: window.__soft.player.target }));
      check(t, after.target === null && Math.hypot(after.x - here.x, after.z - here.z) < 0.05, '바닥을 클릭해도 걷지 않음', after);
      await shot(t, p, 'walked');
      await ctx.close();
    },
  },

  look: {
    what: '시야: 화면 위쪽 빈 곳도 마우스가 3D 화면에 닿고(HUD가 가로막던 버그), 끌면 시야가 돌아요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, PLAZA);
      const blocked = await p.evaluate(() => {
        const bad = [];
        for (const y of [150, 250, 350, 450]) for (const x of [320, 640, 960]) { const e = document.elementFromPoint(x, y); if (!e || e.id !== 'world') bad.push(x + ',' + y + '=' + (e ? e.tagName + '#' + e.id + '.' + e.className : 'null')); }
        return bad;
      });
      check(t, blocked.length === 0, '화면 가운데 12곳이 모두 3D 화면', blocked);
      const y0 = await p.evaluate(() => window.__soft.cam.yaw);
      await drag(p, 640, 250, 440, 250);
      const y1 = await p.evaluate(() => window.__soft.cam.yaw);
      check(t, Math.abs(y1 - y0) > 0.3, '왼쪽으로 끌면 시야가 돔 (yaw ' + y0.toFixed(2) + ' -> ' + y1.toFixed(2) + ')');
      await ctx.close();
    },
  },

  aerial: {
    what: '공중샷: V로 하늘로 올라가고, 휠로 높이를 바꾸고, V로 돌아와요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, PLAZA);
      await press(p, 'KeyV');
      await until(p, () => window.__soft.state.aerial && window.__soft.cam.pos.y > 25, null, 'V 누르고 카메라가 25m 위로');
      check(t, await p.evaluate(() => document.getElementById('btnAir').getAttribute('aria-pressed') === 'true'), '공중샷 버튼이 켜짐으로 보임');
      await shot(t, p, 'up');
      const a0 = await p.evaluate(() => window.__soft.cam.air);
      await p.mouse.move(640, 300); await p.mouse.wheel(0, 600);
      await until(p, a => window.__soft.cam.air !== a, a0, '휠로 높이 바꾸기');
      const a1 = await p.evaluate(() => window.__soft.cam.air);
      check(t, a1 > a0, '휠을 내리면 더 높이 (' + a0 + ' -> ' + a1 + ')');
      await press(p, 'KeyV');
      await until(p, () => !window.__soft.state.aerial && window.__soft.cam.pos.y < 15, null, 'V 다시 누르고 돌아오기');
      check(t, true, 'V로 공중샷 끄기');
      await ctx.close();
    },
  },

  fire: {
    what: '불멍 + 마시멜로: E로 앉고, Q로 꽂고, 탄 걸 먹으면 콜록과 검은 재 연기가 나요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, FIRE_SEAT);
      await p.click('#btnSound');   // 진짜 소리 엔진도 같이 돌려 봐요 (오류가 나면 실패)
      await until(p, () => !!window.__soft.audio, null, '소리 엔진 켜기');
      await sit(p, 'fire');
      check(t, true, 'E로 불멍 자리에 앉음');
      await frames(p, 3);
      check(t, await p.evaluate(() => !window.__soft.player.parts.group.visible), '불멍은 내 눈으로 보니까 눈사람이 숨음');
      await press(p, 'KeyQ');
      await until(p, () => window.__soft.mallow.on, null, 'Q로 마시멜로 꽂기');
      check(t, true, 'Q로 마시멜로를 꽂음');
      await shot(t, p, 'mallow');
      const eaten0 = await p.evaluate(() => window.__soft.mallow.eaten);
      await p.evaluate(() => { window.__soft.mallow.cook = 1.25; });   // 다 타 버린 것으로
      for (let i = 0; i < 4; i++) {   // 불붙어 있으면 첫 Q는 '후~', 그다음 Q는 가까이 보기
        if (await p.evaluate(() => window.__soft.mallow.inspect >= 0 || !window.__soft.mallow.on)) break;
        await press(p, 'KeyQ'); await frames(p, 2);
      }
      await until(p, e => window.__soft.mallow.eaten > e, eaten0, '가까이 본 뒤 먹기');
      check(t, true, '탄 마시멜로를 먹음');
      await until(p, () => window.__soft.ashes.list.some(g => g.on), null, '검은 재 연기 나오기');
      check(t, true, '검은 재 연기가 나옴');
      await shot(t, p, 'ash');
      await ctx.close();
    },
  },

  element: {
    what: '원소 넣기: 솜 손이 가루를 뿌리고, 불이 휙 커졌다가 원래대로 돌아와요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, FIRE_SEAT);
      await sit(p, 'fire');
      await p.click('#btnElem');
      await p.click('.elem-btn >> text=Cu');
      await until(p, () => window.__soft.sprinkle.t >= 0, null, '가루 뿌리기 시작');
      check(t, true, 'Cu를 누르면 솜 손이 뿌리기 시작');
      await until(p, () => window.__soft.fire.surge > 0.3, null, '불이 커지기');
      check(t, true, '불이 휙 커짐');
      await shot(t, p, 'surge');
      await until(p, () => window.__soft.fire.surgeT > 1.6 && window.__soft.fire.surge < 0.05, null, '불이 원래 크기로');
      check(t, true, '불이 원래대로 돌아옴');
      const tint = await p.evaluate(() => window.__soft.fire.tintAmt);
      check(t, tint > 0.2, '불빛에 원소 색이 듦 (' + tint.toFixed(2) + ')');
      await ctx.close();
    },
  },

  seatLook: {
    what: '앉아서 둘러보기: 전망 자리에서 끌면 고개가 돌고, 정해진 만큼만 돌아가요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, VIEW_SEAT);
      await sit(p, 'view');
      await frames(p, 3);
      await drag(p, 640, 400, 200, 250);
      await drag(p, 640, 400, 200, 250);   // 두 번 끌어서 끝까지
      const s = await p.evaluate(() => ({ yaw: window.__soft.cam.lookYaw, pitch: window.__soft.cam.lookPitch, lim: window.__soft.LOOK_LIMIT.view }));
      check(t, Math.abs(s.yaw) > 0.1, '끌면 고개가 돎 (' + s.yaw.toFixed(2) + ')');
      check(t, Math.abs(s.yaw) <= s.lim[0] + 1e-6, '좌우는 ' + s.lim[0] + ' 라디안까지만', s);
      check(t, s.pitch >= -s.lim[1] - 1e-6 && s.pitch <= s.lim[2] + 1e-6, '위아래도 정해진 만큼만', s);
      await shot(t, p, 'look');
      await ctx.close();
    },
  },

  seats: {
    what: '앉은 자리 1인칭: 해변 벤치는 내 눈으로 보고(눈사람·글씨 숨김), B로 숨 흔들림 끄고 켜고, 수다 마당 그루터기는 3인칭 그대로',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, BEACH_BENCH);
      await p.click('#btnSound');   // 파도 소리(화면 파도와 같은 박자)도 같이 돌려 봐요
      await until(p, () => !!window.__soft.audio, null, '소리 엔진 켜기');
      await sit(p, 'sit');
      await until(p, () => window.__soft.cam.pos.y > 1.2 && window.__soft.cam.pos.y < 1.9, null, '눈높이로 카메라 옮기기');
      const s = await p.evaluate(() => ({ watching: document.body.classList.contains('watching'), hidden: !window.__soft.player.parts.group.visible, y: +window.__soft.cam.pos.y.toFixed(2) }));
      check(t, s.watching && s.hidden, '해변 벤치에 앉으면 1인칭 (눈사람과 화면 글씨 숨김)', s);
      const b0 = await p.evaluate(() => window.__soft.breath.on);
      await press(p, 'KeyB');
      check(t, (await p.evaluate(() => window.__soft.breath.on)) === !b0, 'B로 숨 흔들림 ' + (b0 ? '끄기' : '켜기'));
      await press(p, 'KeyB');
      check(t, (await p.evaluate(() => window.__soft.breath.on)) === b0, 'B를 한 번 더 누르면 돌아옴');
      await frames(p, 5);
      await shot(t, p, 'beach');
      const stump = await p.evaluate(() => { const st = window.__soft.seats.find(x => x.third); return st && { x: st.x + Math.sin(st.heading) * 1.3, z: st.z + Math.cos(st.heading) * 1.3 }; });
      check(t, !!stump, '3인칭으로 남긴 자리(그루터기)가 있음');
      await ctx.close();
      const ctx2 = await newContext();
      const q = await open(ctx2, t, { x: stump.x, z: stump.z, yaw: 0 });
      await sit(q, 'sit');
      await frames(q, 3);
      const r = await q.evaluate(() => ({ third: !!window.__soft.player.seat.third, watching: document.body.classList.contains('watching'), shown: window.__soft.player.parts.group.visible }));
      check(t, r.third && !r.watching && r.shown, '그루터기는 3인칭 (내 눈사람이 보임)', r);
      await ctx2.close();
    },
  },

  spring: {
    what: '온천 몸 담그기: 1인칭 눈높이가 물 바로 위, 김이 보이고, 둘레 설산은 온천에 있을 때만 보여요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, SPRING_EDGE);
      await sit(p, 'soak');
      await until(p, () => window.__soft.cam.pos.y > 0.5 && window.__soft.cam.pos.y < 1.05, null, '물 위 눈높이로 카메라 옮기기');
      const s = await p.evaluate(() => ({ watching: document.body.classList.contains('watching'), y: +window.__soft.cam.pos.y.toFixed(2), steam: window.__soft.spring.steam.visible }));
      check(t, s.watching && s.steam, '몸을 담그면 1인칭이고 김이 보임', s);
      await until(p, () => window.__soft.peaks.group.visible && window.__soft.peaks.mats[0].uniforms.uVista.value > 0.6, null, '둘레 설산이 나타나기');
      check(t, true, '온천에서는 둘레 설산이 보임');
      await frames(p, 5);
      await shot(t, p, 'spring');
      await ctx.close();
      const ctx2 = await newContext();
      const q = await open(ctx2, t, BEACH_BENCH);
      await frames(q, 30);
      const far = await q.evaluate(() => window.__soft.peaks.group.visible);
      check(t, !far, '해변에서는 온천 설산을 그리지 않음', { visible: far });
      await ctx2.close();
    },
  },

  rain: {
    what: '비 오는 숲 정자: 마루에 앉으면 1인칭으로 연못과 안개 속 큰 나무가 보이고, 연못에 장면이 비치고, 처마 물방울이 떨어지고, 달은 구름 뒤로 숨어요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, RAIN_BENCH);
      await sit(p, 'sit');
      await until(p, () => window.__soft.cam.pos.y > 1.2 && window.__soft.cam.pos.y < 1.9, null, '눈높이로 카메라 옮기기');
      const s = await p.evaluate(() => ({ watching: document.body.classList.contains('watching'), cover: +window.__soft.rain.cover.toFixed(2) }));
      check(t, s.watching && s.cover === 1, '정자 벤치는 1인칭이고 큰 나무 숲 안', s);
      await until(p, () => window.__soft.grove.group.visible && window.__soft.grove.mats[0].uniforms.uVista.value > 0.9, null, '큰 나무 줄기가 보이기');
      const y0 = await p.evaluate(() => window.__soft.rain.drips.map(d => d.y).join());
      await frames(p, 4);
      const y1 = await p.evaluate(() => window.__soft.rain.drips.map(d => d.y).join());
      check(t, y0 !== y1, '처마 물방울이 떨어짐');
      await until(p, () => window.__soft.rain.mirrorOn === true, null, '앉아 있으면 연못에 장면이 비침 (거울 카메라)');
      check(t, true, '연못 거울 카메라 켜짐');
      await until(p, () => window.__soft.sky.moon.material.opacity < 0.05, null, '달이 구름 뒤로 숨기');
      check(t, true, '비 오는 숲에서는 달이 안 보임');
      await shot(t, p, 'rain');
      await ctx.close();
    },
  },

  chimes: {
    what: '풍경 나무 벤치: 1인칭으로 앉으면 느티나무 가지 너머 북쪽 하늘에 오로라가 보이고, 다른 공간에서는 오로라를 그리지 않아요',
    run: async t => {
      const ctx = await newContext();
      const p = await open(ctx, t, CHIMES_BENCH);
      await sit(p, 'sit');
      await until(p, () => window.__soft.cam.pos.y > 1.2 && window.__soft.cam.pos.y < 1.9, null, '눈높이로 카메라 옮기기');
      const s = await p.evaluate(() => ({ watching: document.body.classList.contains('watching'), zone: window.__soft.state.zone }));
      check(t, s.watching && s.zone === 'chimes', '풍경 나무 벤치는 1인칭', s);
      const signs = await p.evaluate(() => window.__soft.gateSigns.filter(g => g.visible).length);
      check(t, signs === 0, '1인칭으로 앉으면 구역 입구 표지판을 숨김', { visible: signs });
      await until(p, () => window.__soft.aurora.group.visible && window.__soft.aurora.mats[0].uniforms.uVista.value > 0.8, null, '오로라가 나타나기');
      const t0 = await p.evaluate(() => window.__soft.aurora.mats[0].uniforms.uTime.value);
      await frames(p, 4);
      const t1 = await p.evaluate(() => window.__soft.aurora.mats[0].uniforms.uTime.value);
      check(t, t1 !== t0, '오로라가 천천히 움직임');
      await shot(t, p, 'chimes');
      await ctx.close();
      const ctx2 = await newContext();
      const q = await open(ctx2, t, BEACH_BENCH);
      await frames(q, 30);
      const far = await q.evaluate(() => window.__soft.aurora.group.visible);
      check(t, !far, '해변에서는 오로라를 그리지 않음', { visible: far });
      await ctx2.close();
    },
  },

  rooms: {
    what: '방: 만들기, 코드로 들어가기(소문자도), 아무 방이나 둘이 만나기, 혼자로 바꾸면 사라지기 (같은 브라우저 탭 4개)',
    run: async t => {
      const ctx = await newContext({ width: 640, height: 480 });   // 같은 컨텍스트라야 탭끼리 만나요
      const st = p => p.evaluate(() => ({ kind: window.__soft.net.kind, room: window.__soft.net.room, others: Object.keys(window.__soft.others).length, mode: window.__soft.state.mode }));
      const sees = (p, n, who) => until(p, k => Object.keys(window.__soft.others).length === k, n, who + '가 ' + n + '명 보기');
      const A = await open(ctx, t, null);
      await A.click('#wayMake');
      await until(A, () => window.__soft.net.room.length === 4 && window.__soft.state.mode === 'play', null, 'A 방 만들기');
      const a = await st(A);
      check(t, a.kind === 'prv', 'A가 방을 만듦 (코드 ' + a.room + ')');
      const B = await open(ctx, t, null);
      await B.click('#wayJoin');
      check(t, (await st(B)).mode === 'customize', '코드 없이 누르면 안 들어가고 안내만');
      await B.fill('#codeInput', a.room.toLowerCase());
      await B.press('#codeInput', 'Enter');
      await sees(A, 1, 'A'); await sees(B, 1, 'B');
      check(t, (await st(B)).room === a.room, 'B가 소문자 코드로 같은 방에 들어가 서로 보임');
      const C = await open(ctx, t, null);
      await C.click('#wayRandom');
      await until(C, () => window.__soft.net.room.length === 4, null, 'C 아무 방이나');
      const D = await open(ctx, t, null);
      await D.click('#wayRandom');
      await until(D, () => window.__soft.net.room.length === 4, null, 'D 아무 방이나');
      const c = await st(C), d = await st(D);
      check(t, c.kind === 'pub' && c.room === d.room, '아무 방이나 누른 둘이 같은 방 (' + c.room + ')', { c, d });
      await sees(C, 1, 'C'); await sees(D, 1, 'D');
      check(t, (await st(A)).others === 1, '만든 방(A, B)은 그대로 2명');
      await B.bringToFront();
      await B.click('#btnEdit');
      await B.click('#btnRooms');
      await B.click('#waySolo');
      await sees(A, 0, 'A');
      check(t, (await st(B)).kind === 'solo', 'B가 혼자로 바꾸면 A 화면에서 사라짐');
      await A.bringToFront();
      await A.click('#peopleChip');
      const noteText = await A.evaluate(() => document.getElementById('viewNote').textContent);
      check(t, noteText.includes(a.room), '사람 수를 누르면 방 코드를 알려 줌', noteText);
      await ctx.close();
    },
  },

  sound: {
    what: '소리 크기: 소리 함수를 OfflineAudioContext로 그려서 나는지, 모닥불(RMS 0.06~0.09)에 안 묻히는지 재요',
    run: async t => {
      const ctx = await newContext({ width: 640, height: 400 });
      const p = await open(ctx, t, PLAZA);
      // [이름, 부르는 코드, 길이(초), 가장 큰 RMS가 이만큼은 돼야 함]
      const list = [
        // 기준은 2026-11-22에 잰 값의 약 60%: 소리가 사라지거나 크게 작아지면 걸려요. 소리를 일부러 줄이면 같이 고치세요
        ['기침 (탄 마시멜로)', 'S.coughAt(0.1)', 1.8, 0.15],
        ["'후~' 불어 끄기", 'S.playBlow()', 1.2, 0.1],
        ["'휙' 불 커짐", 'S.playFlare()', 1.6, 0.08],
        ['가루 뿌리기', 'S.playSprinkle()', 0.8, 0.04],
        ['쫀득 (덜 구움)', "S.playEat('chew')", 1.6, 0.06],
        ['바삭 (노릇)', "S.playEat('crisp')", 1.4, 0.045],
        ['와삭 (캐러멜)', "S.playEat('crunch')", 1.4, 0.04],
        ['탄 것 먹기 + 기침', "S.playEat('burnt')", 2.6, 0.13],
        ["장작 '타닥' 20번", 'for (let i = 0; i < 20; i++) S.crackle(0.6, 0.05 + i * 0.06, i === 10)', 1.5, 0.01],   // 하나하나는 크기가 제멋대로라 여러 번
      ];
      const rows = [];
      for (const [name, call, dur, need] of list) {
        const r = await p.evaluate(async ({ call, dur }) => {
          const S = window.__soft.sound, sr = 44100;
          const ctx = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
          const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);   // 진짜 엔진과 같은 크기 (리미터 앞)
          const g = () => { const x = ctx.createGain(); x.gain.value = 0; x.connect(master); return x; };
          const A = { ctx, master, white: S.makeNoiseBuffer(ctx, 'white'), fireGain: g(), fireLP: ctx.createBiquadFilter(), fireAir: g(), crk: { rate: 0, left: 99 },
            rainGain: g(), wavesGain: g(), springGain: g(), blupIn: 9, tickIn: 9, tickAlt: false, on: true };
          const was = S.use(A);
          let err = '';
          try { new Function('S', call)(S); } catch (e) { err = e.message; }
          let buf;
          try { buf = await ctx.startRendering(); } finally { S.use(was); }
          const d = buf.getChannelData(0), win = Math.floor(sr * 0.05);
          let peak = 0, maxRms = 0, loud = 0, bad = false;
          for (let i = 0; i < d.length; i += win) {
            let s = 0; const end = Math.min(d.length, i + win);
            for (let j = i; j < end; j++) { const v = d[j]; if (!isFinite(v)) bad = true; s += v * v; peak = Math.max(peak, Math.abs(v)); }
            const rms = Math.sqrt(s / (end - i)); maxRms = Math.max(maxRms, rms); if (rms > 0.02) loud += (end - i) / sr;
          }
          return { err, bad, peak, maxRms, loud };
        }, { call, dur });
        rows.push('  ' + name.padEnd(14) + ' 가장 큰 RMS ' + r.maxRms.toFixed(3) + ' | 꼭대기 ' + r.peak.toFixed(2) + ' | 들리는 길이 ' + r.loud.toFixed(2) + '초');
        check(t, !r.err && !r.bad, name + ': 오류 없음', r.err || 'NaN');
        check(t, r.maxRms >= need, name + ': RMS ' + r.maxRms.toFixed(3) + ' ≥ ' + need, r);
      }
      t.notes.push(...rows);
      await ctx.close();
    },
  },
};

// ---------- 실행 ----------
(async () => {
  if (opt.list) { for (const [k, v] of Object.entries(tests)) console.log(k.padEnd(9), v.what); return; }
  const names = picked.length ? picked : Object.keys(tests);
  const unknown = names.filter(n => !tests[n]);
  if (unknown.length) { console.log('없는 시험:', unknown.join(', '), '| 목록: node tools/play-check.js --list'); process.exit(2); }
  const server = await serve();
  BASE = 'http://127.0.0.1:' + server.address().port;
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (opt.gl === 'swiftshader') args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
  browser = await chromium.launch({ headless: !opt.headed, args });
  console.log('[🧪 test] 시작 -> 시험:', names.join(', '), '| 그래픽:', opt.gl || '기본', '| 주소:', BASE);
  let failed = 0;
  for (const name of names) {
    const t = { name, notes: [], errors: [], warns: [] };
    const t0 = Date.now();
    let err = null;
    try { await tests[name].run(t); } catch (e) { err = e; }
    if (!err && t.errors.length) err = new Error('페이지 오류: ' + t.errors[0]);
    const sec = ((Date.now() - t0) / 1000).toFixed(0) + '초';
    console.log((err ? '❌ ' : '✅ ') + name + ' (' + sec + ') ' + tests[name].what);
    for (const n of t.notes) console.log('   ' + n);
    if (t.warns.length) console.log('   ⚠ 콘솔 오류 ' + t.warns.length + '개: ' + t.warns[0]);
    if (err) { failed++; console.log('   ✗ ' + err.message.split('\n')[0]); }
  }
  await browser.close();
  server.close();
  console.log(failed ? '\n❌ ' + failed + '개 실패 / ' + names.length + '개' : '\n✅ 전부 통과 (' + names.length + '개)');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('[🧪 test] 시험 도구 오류 ->', e); process.exit(2); });
