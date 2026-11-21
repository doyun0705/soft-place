# Soft Place 인수인계 (AI 작업자용)

이 저장소에서 처음 일하는 AI 작업자(Codex 등)가 지금까지의 작업, 규칙, 남은 일을 한 번에 알 수 있게 쓴 문서예요.
마지막으로 고친 날: 2026-11-22 (한국 시간). 8번 "지금 상태"는 그날 기준이니, 일하기 전에 `git log`와 PR을 다시 확인하세요.

**일을 시작하기 전에 `PLAN.md`도 읽으세요.** 두 작업자(Claude, Codex)가 각각 무엇을 맡는지, 어디를 만지는지, 어떻게 주고받는지가 거기 있어요.

## 1. 한눈에

- **무엇**: 3D 힐링 웹. 솜뭉치 눈사람이 되어 9개 공간을 걸어 다니며 쉬는 곳. 로그인 없이 닉네임만 써요.
- **만드는 사람**: 도윤 (학생, Windows PC, 한국어). 그림과 기획은 도윤, 구조와 코드는 AI 작업자.
- **기술**: 파일 하나(`index.html`) + three.js r128(cdnjs UMD) + Web Audio로 합성한 소리. 빌드, 프레임워크, npm 의존성 없음.
- **크기**: `index.html` 약 4,700줄(290KB). 통째로 다시 쓰지 말고, 필요한 곳만 찾아서 고치세요.

## 2. 작업 위치

| 곳 | 위치 | 비고 |
|---|---|---|
| 원본 | https://github.com/doyun0705/soft-place (Public) | 여기가 기준이에요 |
| 브랜치 | `main` ← `together` (PR #1) ← `camp-real` (PR #2) | **최신은 `camp-real`**. `main`은 아직 맨 처음 버전. 기준 브랜치 찾는 법: `origin/main`에 `AGENTS.md`가 있으면 `main`, 없으면 `camp-real` |
| 이전 작업자(Claude Code)의 작업 폴더 | `/home/claude/soft-place/` (원본), `/home/claude/soft-place-artifact/index.html` (미리보기용 사본), `/mnt/project-files/soft-place/` (보관 사본, 미리보기 그림) | 그 클라우드 세션 안에서만 보이는 경로라 다른 작업자는 못 열어요. 내용은 전부 이 저장소에 올라와 있어요 |
| 도윤 PC | `%USERPROFILE%\soft-place` | 아래 명령으로 받았을 때 |

도윤 PC에 받기 (Win+R → `cmd` → 붙여넣기 → 엔터. git이 깔려 있어야 해요):

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d = Join-Path $env:USERPROFILE 'soft-place'; Write-Host ('[1/3] folder: ' + $d); if (Test-Path (Join-Path $d '.git')) { Write-Host '[2/3] already here, updating'; git -C $d fetch origin; git -C $d checkout camp-real; git -C $d pull origin camp-real } else { Write-Host '[2/3] downloading'; git clone -b camp-real https://github.com/doyun0705/soft-place.git $d }; Write-Host ('[3/3] done. handover doc exists=' + (Test-Path (Join-Path $d 'AGENTS.md')) + ' : ' + (Join-Path $d 'AGENTS.md'))"
```

## 3. 파일

- `index.html`: 전부 (HTML, CSS, 3D, 소리, 같이 있기). 항상 `<!doctype html>`로 시작하는 완성된 문서로 유지하세요. 미리보기 사본을 만들 때 `<title>`~`</head>`와 `<body>` 안쪽을 잘라 쓰기 때문이에요.
- `textures/`: Poly Haven CC0 사진 텍스처 6장 (흙, 돌바닥, 나무껍질의 색 1K + 요철 512). 못 불러오면 코드가 그린 텍스처로 대신해요.
- `database.rules.json`: Firebase Realtime Database 규칙 (`pub/방코드`, `prv/방코드`).
- `README.md`: 사람이 읽는 소개. 기능을 바꾸면 같이 고치세요.
- `AGENTS.md`: 이 문서 (규칙, 코드 지도, 정해진 것).
- `PLAN.md`: 협업 계획 (Claude와 Codex의 할 일, 만지는 곳 나누기, 주고받는 방법).

## 4. 실행

폴더에서 작은 웹 서버를 띄우고 브라우저로 열어요. 둘 중 되는 것:

```
python -m http.server 8000
npx serve -l 8000
```

그다음 http://localhost:8000 . 파일을 더블클릭해서(`file://`) 여는 건 시험해 보지 않았어요. 사진 텍스처가 안 뜰 수 있어요.

- 주소 끝에 `#meteors`를 붙이면 유성우를 바로 볼 수 있어요.
- 같은 브라우저에서 탭을 두 개 열고 같은 방에 들어가면 서로 보여요 (탭 시험 모드).

## 5. index.html 지도

스크립트는 번호 붙은 주석으로 나뉘어 있어요. 줄 번호는 바뀌니 `// 4. 세계 만들기`처럼 제목으로 찾으세요.

| 번호 | 내용 | 찾을 이름 |
|---|---|---|
| 0 | 같이 있기 설정 | `FIREBASE_DB_URL` |
| 1 | 기본 설정값 | `P`(광장 반지름 20), `D`(구역 거리 80), `V`, `FIRE`, `ZONES`, `AMBIENT`, `COLORS`, `ACCESSORIES` |
| 2 | 저장된 꾸미기 불러오기 | `look`, `saveLook` |
| 3 | 렌더러, 장면, 카메라, 조명, 텍스처 도구 | `groundTexture`, `loadReal`, `useReal`, `realMat`, `snowify` |
| 4 | 세계 만들기 (가장 김) | `zoneGround`, `makeFlame`, `buildTent`, `seats`, `colliders`, `walkables` |
| 5 | 눈사람 | `buildSnowman`, `setAccessory` |
| 6 | 상태, 카메라, 입력 | `state`, `cam`, `LOOK_LIMIT`, `handleWorldClick`, `sitDown`, `standUp` |
| 7 | 소리 | `startAudio`, `nb`, `nenv`, `crackle`, `playEat`, `coughAt`, `playBlow`, `playFlare`, `updateAudio` |
| 8 | 화면(UI) | `openPanel`, `enterWorld`, `toggleAerial`, `toggleZen`, `drawMinimap` |
| 8.5 | 같이 있기와 방 | `net`, `others`, `onRemote`, `joinRoom`, `joinRandom`, `leaveRoom`, `joinLocalRoom`, `joinFirebaseRoom` |
| 9 | 매 프레임 업데이트 | `updatePlayer`, `updateFire`, `updateMallow`, `updateSprinkle`, `updatePrints`, `updateAmbient`, `updateCamera`, `loop` |
| 10 | 시작 | `start(data)` |

공간 9곳: 중앙 광장(0,0), 모닥불 캠핑장(0,-D), 딸깍 정원(D,0), 비 오는 숲(-D,0), 파도 해변(0,D), 수다 마당(V,-V), 눈 속 도서관(-V,-V), 눈꽃 온천(-V,V), 풍경 나무(V,V).

알아 두면 좋은 것:

- 자리 종류(`seat.kind`): `sit`, `fire`(불멍), `stars`(누워서 별), `read`(책), `soak`(온천), `view`(전망). `EYES_ONLY`에 든 자리는 1인칭으로 바뀌고 화면 글씨를 숨겨요.
- 1인칭 손(마시멜로 꼬챙이, 가루 뿌리는 손)은 카메라 기준이라 `updateCamera` 다음에 그려요.
- 시작 데이터: `window.claude.hot.data = { mode: "play", x, z, yaw, kind, room }`이 있으면 꾸미기 화면을 건너뛰고 그 자리에서 시작해요. 시험할 때 편해요.
- 재질은 대부분 `MeshLambertMaterial`이고, 사진 텍스처를 쓰는 곳만 `MeshStandardMaterial`이에요.

## 6. 꼭 지킬 규칙 (도윤이 정한 일하는 방식)

1. **가정을 먼저 말하기**. 모르면 추측하지 말고 번호를 붙여 질문하세요. 도윤 말: "내 머릿속에 다 있어, 모르면 질문해."
2. **단순하게**. 부탁받은 것만 만들고 미리 넣지 마세요.
3. **범위 지키기**. 관계없는 코드는 건드리지 마세요.
4. **성공 기준을 정하고 확인하기**. 확인 못 한 건 못 했다고 솔직하게 쓰세요.
5. **Caveman 디버깅**: 상태가 바뀌는 곳마다 `console.log("[🔥 fire] 설명 ->", 값)`처럼 이모지 꼬리표와 값을 찍어요.
6. 주석, 화면 글씨, 커밋 메시지는 쉬운 한국어로. 도윤에게 하는 답도 한국어로, 칭찬보다 문제점을 먼저.
7. 파일 하나를 유지하고, 바깥 스크립트는 cdnjs에서만(three r128 그대로), 글꼴은 Google Fonts에서만 불러와요.
8. PR 합치기, 공개, 삭제처럼 되돌리기 어려운 일은 도윤이 직접 하라고 말했을 때만 하세요.

## 7. 도윤이 정한 것 (물어보지 않고 되돌리지 마세요)

- 눈사람만 솜뭉치처럼 둥글고, 나머지는 "동영상처럼 현실적으로". 캠핑장부터 했고 **나머지 8곳은 아직 예전 모습**이에요.
- 단, 눈은 사진 말고 "예쁘고 뽀송한" 그림 눈 + 반짝이.
- 텐트는 눈사람이 들어갈 만한 크기(2.4배). 안에 못 들어가도 돼요.
- 마시멜로: 얼룩덜룩 굽기 → 먹기 전 눈앞에서 보여 주기 → 익은 정도마다 다른 소리. 탔으면 콜록 기침 + 검은 재 연기(`BURNT_STYLE = "cough"`). 불붙으면 '후~'.
- 원소 6가지는 동그란 솜 손이 가루를 뿌리고, 불이 '휙' 커졌다가 돌아와요. 마시멜로와 원소는 나에게만 보여요(다른 사람에게 안 보냄).
- 마우스 클릭으로 걷지 않아요. 마우스로 끌어서 시야를 돌려요.
- 공중샷(V)으로 눈밭의 발자국 그림을 내려다볼 수 있어요.
- 처음에 혼자 / 아무 방이나(랜덤) / 방 만들기 / 코드로 들어가기 중에 골라요.
- 유성우는 "아주 가끔 예쁘게" (12분마다 70% 기회, 시계 기준이라 모두 같은 시간).
- 음성 대화는 수다 마당에서만 켤 예정이고 아직 없어요.

AI 작업자가 판단해서 정한 것 (도윤이 아직 답하지 않음):

- 폰은 바닥을 톡 눌러 걷기, 지도 눌러 걷기는 남겨 둠.
- 발자국은 그림을 그릴 수 있게 3분 남김(`PRINTS.LIFE`). 도윤의 원래 말은 "시간 지나면 없어지게"였어요.
- 열려 있는 질문: (1) 끌지 않고 마우스만 움직여도 시야가 돌게 할지, (2) 지도 눌러 걷기도 뺄지.

## 8. 지금 상태 (2026-11-22)

- PR #1 `together` → `main`: 열려 있음 (같이 있기 기본).
- PR #2 `camp-real` → `together`: 열려 있음 (캠핑장 실감판, 소리, 조작, 공중샷, 방). #1을 먼저 합쳐야 해요.
- GitHub Pages: 꺼져 있음. 아직 공개 주소 없음.
- `FIREBASE_DB_URL`: 비어 있음. 그래서 "같이 있기"는 같은 브라우저 탭끼리만 돼요.
- 기다리는 것: 도윤의 캐릭터 그림, Firebase Realtime Database 주소, PR 합치라는 말, Pages 공개.

## 9. 확인 못 한 것과 알려진 문제

- **소리**: 귀로 들어 보지 못했어요. `OfflineAudioContext`로 그려서 크기와 길이만 쟀어요.
- **Firebase 방**: 실제 연결로 시험하지 못했어요(탭 시험 모드로만 확인). 규칙은 로그인 없이 누구나 쓰는 시험용이라, 크게 공개하기 전에 익명 로그인과 도배 막기가 필요해요.
- **속도**: 실제 PC와 폰에서 재 보지 못했어요. 전나무가 585그루(그루당 삼각형 390개)라 가벼운 편이 아니에요.
- 다른 탭으로 넘어가 있으면 화면 갱신이 멈춰서, 20초 뒤 다른 사람 화면에서 사라져요.
- 랜덤 방: 두 사람이 동시에 누르면 서로 다른 새 방이 열릴 수 있어요. 방 목록은 `pub` 전체를 읽어서 세기 때문에 사람이 많아지면 바꿔야 해요.
- 폰에는 조이스틱이 없어요. 이름 거르기, 차단, 신고도 없어요.

## 10. 시험 방법

자동 시험 파일은 저장소에 없어요(이전 작업자의 임시 폴더에만 있었어요). 방법은 이래요: Playwright로 페이지를 열고, 시작 데이터로 원하는 자리에 세운 다음, 키를 누르고 화면을 찍어서 눈으로 확인해요.

```js
// 먼저: npm i playwright  그리고 다른 창에서 python -m http.server 8000
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.addInitScript(() => { window.claude = { hot: { data: { mode: 'play', x: 0, z: -86.2, yaw: 0 } } }; });   // 모닥불 앞에서 시작
  await p.goto('http://localhost:8000/');
  await p.waitForTimeout(5000);
  await p.keyboard.press('KeyE');          // 앉기 -> 불멍
  await p.waitForTimeout(5000);
  await p.screenshot({ path: 'fire.png' });
  await b.close();
})();
```

- cdnjs가 막힌 곳에서는 `page.route`로 `three.min.js` 요청을 npm `three@0.128.0`의 `build/three.min.js`로 바꿔 주세요.
- 소프트웨어 그래픽은 아주 느려요. 정해진 시간만큼 기다리지 말고 `page.waitForFunction`으로 상태가 될 때까지 기다리세요.
- 방 시험은 **같은 브라우저 컨텍스트**에서 탭을 여러 개 열어야 해요(`browser.newContext()` 하나에서 `newPage()` 여러 번).
- 소리 시험: 소리 함수를 `OfflineAudioContext`에 그려서 50ms마다 크기(RMS)를 보면 "소리가 나는지, 불 소리에 묻히는지"를 알 수 있어요. 모닥불 우르르 소리의 크기는 RMS 0.06~0.09쯤이에요(어림값).

## 11. 작업자가 둘일 때

자세한 건 `PLAN.md`에 있어요. 요점만:

- 서로 다른 곳을 고치면 git이 알아서 합쳐 줘요. 충돌은 **같은 줄 근처**를 둘이 고칠 때만 나요. 그래서 `PLAN.md` 5번에서 만지는 곳을 나눴어요.
- 특히 조심할 곳: `loop()`, 키보드 처리, `start()`, HUD의 HTML, `README.md`. 여기는 한 줄 끼워 넣는 정도로만 고치세요.
- 브랜치는 `claude/이름`, `codex/이름`. 할 일 한 개 = PR 한 개. 시작 전에 `git fetch`, 끝나면 `PLAN.md`의 자기 칸을 고쳐요.
- 지금 상태가 바뀌면 이 문서의 8번과 아래 작업 기록도 고쳐 주세요.

## 12. 작업 기록

- 2026-11-16 ~ 17: 첫 버전(공간 9곳, 꾸미기, 앉기, 소리). 같이 있기(PR #1). 캠핑장 실감판 시작(PR #2): 솜뭉치 눈사람, 표지판, 은하수와 유성우, 절벽 전망, 전나무, 텐트, 사진 텍스처, 마시멜로, 원소, 뽀송한 눈과 발자국.
- 2026-11-18: 기침 소리 크게, '후~' 소리, 자연스러운 모닥불 소리, 원소 넣을 때 불 커짐, 마우스 클릭 이동 빼기, HUD가 마우스를 가로막던 버그 수정, 앉아서 고개 돌리기, 공중샷, 혼자/방 고르기와 방 기능.
- 2026-11-22: 이 인수인계 문서와 협업 계획(`PLAN.md`) 추가. Codex가 두 번째 작업자로 들어옴.
