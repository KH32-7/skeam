# 등록 창구 · 리뷰 설정 (한 번만)

등록 도우미와 리뷰는 내 Google 계정의 시트 하나와 그 시트에 붙은 Apps Script로 돌아갑니다. 10분쯤 걸립니다.

## 1. 시트와 스크립트 만들기

1. Google 드라이브에서 새 스프레드시트를 만들고 이름을 `SKEAM`으로 바꿉니다. 공유 설정은 바꾸지 않습니다 (비공개 그대로).
2. 메뉴 **확장 프로그램 → Apps Script**를 엽니다.
3. `Code.gs` 내용을 모두 지우고 이 폴더의 `Code.gs`를 붙여 넣은 뒤 저장합니다.

## 2. GitHub 토큰 만들기

토큰은 비밀번호와 같습니다. 다른 곳에 붙여 넣거나 공유하지 마세요.

1. GitHub → Settings → Developer settings → **Fine-grained tokens → Generate new token**
2. Repository access: **Only select repositories → skeam**
3. Permissions: **Contents: Read and write**, **Actions: Read and write**
4. 만료일은 1년 정도로 두고 생성, 나온 토큰을 복사합니다.

## 3. 스크립트 속성 넣기

Apps Script 왼쪽 **프로젝트 설정(톱니바퀴) → 스크립트 속성 → 속성 추가**

| 속성 | 값 |
| --- | --- |
| `GITHUB_TOKEN` | 2에서 복사한 토큰 |
| `REPO` | `KH32-7/skeam` |
| `BRANCH` | `main` |

## 4. 웹 앱으로 배포

1. 오른쪽 위 **배포 → 새 배포 → 유형: 웹 앱**
2. 실행 사용자: **나**, 액세스 권한: **모든 사용자**
3. 배포 후 권한 허용 창이 뜨면 허용합니다 (시트 편집, 외부 요청).
4. 나온 **웹 앱 URL**(`https://script.google.com/macros/s/.../exec`)을 복사합니다.

## 5. SKEAM에 연결

GitHub의 skeam 레포 → Settings → Secrets and variables → Actions → **Variables** 탭 → New variable

- 이름: `SKEAM_REGISTER_ENDPOINT`
- 값: 4에서 복사한 웹 앱 URL

그다음 Actions 탭에서 Deploy SKEAM을 한 번 수동 실행하면 등록 도우미와 리뷰가 켜집니다.

## 관리

- 리뷰는 시트의 `reviews` 탭에 쌓입니다. 지우고 싶은 리뷰는 행을 삭제하면 됩니다.
- `Code.gs`를 고쳤다면 **배포 → 배포 관리 → 수정 → 새 버전**으로 다시 배포해야 반영됩니다 (URL은 그대로).
- 문제가 있는 게임은 레포에서 `game.yml`에 `hidden: true`를 넣으면 숨겨집니다.
