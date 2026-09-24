# SKEAM

KING 동아리가 AI로 만든 게임을 모아 두는 스팀 패러디 상점입니다. 서버 없이 GitHub Pages에서 돌아가고, 돈은 전부 가짜입니다.

## 게임 등록 (동아리원용)

사이트의 **게임 등록** 메뉴(등록 도우미)에서 폼을 채우고 등록을 누르면 2~3분 뒤 상점에 올라갑니다. GitHub 계정이 없어도 됩니다.

- 브라우저 게임: GitHub Pages 주소만 적으면 됩니다. 레포에 push하면 SKEAM에도 바로 반영됩니다.
- Windows 게임: 공개 GitHub 레포 주소를 적으면 최신 Release를 1시간마다 따라갑니다. 레포가 없으면 zip(30MB 이하)을 직접 올리거나 다운로드 링크를 적습니다.
- 자세한 규격과 도전 과제 연동은 사이트의 **등록 가이드** 탭에 있습니다.

git에 익숙하면 `games/<게임id>/` 폴더를 추가하는 PR을 보내도 됩니다. 머지되면 자동 배포됩니다.

## 폴더

| 경로 | 내용 |
| --- | --- |
| `games/<id>/` | 게임 하나: `game.yml`, `about.md`, `header.jpg`, `capsule.jpg`, `hero.jpg`, `screenshots/`, `achievements/`, `news/` |
| `club/` | 커뮤니티 탭의 동아리 소개 (`club.yml`, `about.md`, `photos/`) |
| `site.yml` | 홈 캐러셀에 걸 게임, 등록 창구 주소 |
| `scripts/build-data.mjs` | 위 파일들을 검사해 `public/data/*.json`으로 만듦. 문제 있는 게임은 빼고 이유를 남김 |
| `apps-script/` | 등록 창구와 리뷰를 맡는 Google Apps Script. 설정법은 `apps-script/README.md` |
| `public/skeam-sdk.js` | HTML 게임이 도전 과제를 알리는 SDK |
| `.github/workflows/deploy.yml` | push, 매시간, 등록 창구 요청 때 빌드해서 Pages에 배포 |

## 개발

```
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
```

`http://localhost:5173/?demo=1`로 열면 (개발 모드에서만) 게임 몇 개를 가진 데모 계정으로 시작합니다.

## `game.yml`

```yaml
title: "지글지글 키친"
title_en: "Sizzle Kitchen"        # 선택
developer: KH327
release: 2026-09-24
price: 9900                       # 0이면 무료
discount: 20                      # 선택, %
play_url: https://.../            # 브라우저 게임
repo: https://github.com/a/b      # Windows 게임: 최신 Release를 자동으로 따라감
download: https://...             # 또는 직접 다운로드 링크
download_size: "120 MB"
version: "1.0.0"
tags: [요리, 시뮬레이션]
short: "한 줄 소개"
controls: "마우스"
ai_tools: [Claude Code]
dev_period: "2주"
ai_note: "제작 후기 한 줄"
engine: "Godot 4.7"
video: https://youtu.be/...
hidden: true                      # 상점에서 숨기기
achievements:
  - id: first_win
    name: "첫 승리"
    desc: "첫 판을 이기세요"
    icon: achievements/first_win.png
    code: KING-7F3A               # EXE 게임용 입력 코드 (선택)
```
