# SKEAM 클라우드 시험대

`public/skeam-sdk.js`나 `src/state/cloud.ts`를 고쳤으면 배포 전에 돌립니다. 실제 계정이나 등록 창구는 쓰지 않습니다.

1. 가짜 등록 창구(5399)와 가짜 게임(5398)을 켭니다.
   ```
   node tools/cloud-test/server.mjs
   ```
2. 시험 게임 세 개를 넣고 데이터를 가짜 창구로 향하게 합니다.
   ```
   node tools/cloud-test/setup.mjs on
   ```
3. `npm run dev -- --port 5310`로 SKEAM을 켭니다. `npm run dev`는 데이터를 다시 만들기 때문에, 켠 뒤에 2번을 한 번 더 실행하세요.
4. http://localhost:5310 에서 브라우저 콘솔을 열고 실행합니다.
   ```js
   const t = await import('/__cloudtest/run.js'); t.prepare()
   ```
   페이지가 새로고침되면 이어서 실행합니다.
   ```js
   const t = await import('/__cloudtest/run.js'); await t.runAll()
   ```
5. 끝나면 시험 게임을 빼고 데이터를 원래대로 돌립니다.
   ```
   node tools/cloud-test/setup.mjs off
   ```

## 시험하는 것

| 시나리오 | 막으려는 문제 |
| --- | --- |
| 새 기기에서 세이브 복원 | 기본 기능 (localStorage + Godot식 IndexedDB) |
| 같은 주소의 다른 게임을 하고 와도 되돌아가지 않음 | 동기화 기록이 주소마다 하나라 서로 덮어쓰던 문제 (PR #6) |
| 넓게 배운 옛 기록이 있어도 이 게임 폴더만 올라감 | 여러 게임 폴더가 합쳐져 DRAGONIA : RE가 용량 초과가 난 문제 |
| 1MB가 넘는 항목은 빼고 나머지는 저장 | 큰 파일 하나 때문에 세이브 전체가 실패하던 문제 |
| 충돌 창에서 30초 넘게 고민해도 클라우드 저장을 불러옴 | 게임이 25초만 기다리고 먼저 시작해 버리던 문제 |

가짜 게임(`pages/game.html`)은 `/solo/`, `/a/`, `/b/`가 모두 같은 주소(localhost:5398)에 있어서 `<아이디>.github.io`에 여러 게임이 있는 상황과 같습니다.
