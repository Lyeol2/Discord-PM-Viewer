# PM Viewer

[Discord PM 봇](https://github.com/Lyeol2/Discord-PM-Public)이 쌓은 데이터(`data/bot.db`)를 정리해서 보여주는 데스크톱 앱입니다.
봇 DB 파일을 **읽기만** 하고, 파일이 바뀌면 자동으로 다시 읽어서 화면을 새로 그립니다.

| 화면 | 보여주는 것 |
|---|---|
| 📊 개요 | 진행 중·할 일·마감 지남·7일 안 마감 수, 열린 이슈, 지금 작업방에 있는 사람, 마감 챙기기, 마일스톤 진행률, 다가오는 일정·휴가, 최근 활동 |
| ✅ 작업 | 목록/보드. 상태·담당·마일스톤으로 거르고 마감순·번호순 정렬. 누르면 상세(설명, 연결된 이슈, 활동 기록, Discord·노션 링크) |
| 🐞 이슈 | 상태별 이슈와 작업으로 넘긴 내역 |
| 🏁 마일스톤 | D-day, 완료/진행/할 일 비율, 남은 작업 |
| 📅 캘린더 | 월간 달력에 작업 마감·일정·마일스톤·휴가 |
| 📜 활동 기록 | 날짜별 타임라인. 종류·사람·기간으로 거르기 |
| 🎧 작업시간 | 작업방에 있던 시간, 사람별 합계와 날짜별 표 (부계정은 본계정에 합침) |
| 🌴 휴가 · 💬 토론 | 휴가 신청·승인 현황, 토론과 노션 회의록 링크 |
| ⚙️ 설정 | DB 파일, 시간대, 디스코드 ID에 이름 붙이기, 업데이트 확인 |

## 설치

유료 코드 서명 인증서 없이 배포하는 앱이라, 브라우저로 받으면 macOS·Windows가 "확인되지 않은 파일"이라며 막습니다. 아래 방법으로 설치하세요.

### macOS (추천: 터미널 한 줄)

터미널을 열고 아래를 붙여 넣으세요. 최신 버전을 받아 체크섬을 확인한 뒤 `/Applications`에 설치하고 실행합니다.
**업데이트할 때도 같은 명령**을 다시 실행하면 됩니다 (새 버전이 나오면 앱에 알림과 명령 복사 버튼이 뜹니다).

```bash
curl -fsSL https://raw.githubusercontent.com/Lyeol2/Discord-PM-Viewer/main/install-mac.sh | bash
```

`curl`로 받은 파일에는 "인터넷에서 받음" 표시가 붙지 않아서 Gatekeeper가 막지 않습니다. 스크립트 내용은 [install-mac.sh](install-mac.sh)에서 볼 수 있습니다.

<details><summary>dmg로 직접 설치하려면</summary>

[Releases](https://github.com/Lyeol2/Discord-PM-Viewer/releases/latest)에서 `mac-arm64.dmg`(Apple 실리콘) 또는 `mac-x64.dmg`(Intel)를 받아 앱을 응용 프로그램 폴더로 옮긴 뒤, 한 번 열려고 시도하고
**시스템 설정 → 개인정보 보호 및 보안 → 맨 아래 "그래도 열기"** 를 누릅니다. 또는 터미널에서:

```bash
xattr -dr com.apple.quarantine "/Applications/PM Viewer.app"
```
</details>

### Windows

[Releases](https://github.com/Lyeol2/Discord-PM-Viewer/releases/latest)에서 `PM-Viewer-x.y.z-win-x64.exe`를 받습니다.

- 브라우저가 "일반적으로 다운로드되지 않는 파일"이라며 막으면: 다운로드 목록에서 `…` → **보관**(Chrome) / **유지**(Edge)
- 실행할 때 "Windows의 PC 보호" 창이 뜨면: **추가 정보 → 실행**

설치한 뒤에는 새 버전을 백그라운드에서 받아 두었다가 재시작하면 적용됩니다.

### Linux

`PM-Viewer-x.y.z-linux-x86_64.AppImage`를 받아 `chmod +x` 후 실행합니다. 업데이트는 자동입니다.

## 사용법

1. 앱을 열고 **bot.db 열기**를 누릅니다. PM 봇 폴더의 `data/bot.db`입니다 (`.env`의 `DATABASE_PATH`를 바꿨다면 그 위치). 창에 파일을 끌어다 놓아도 됩니다.
2. 한 번 고른 파일은 기억하고, 봇이 기록을 남기면 2초 안에 화면이 갱신됩니다.
3. 봇 DB에는 디스코드 사용자 ID만 있어서 처음엔 `사용자 …1234`처럼 보입니다. **설정 → 이름 붙이기**에서 이름을 넣으면 모든 화면에 이름으로 나옵니다 (`GITHUB_PEOPLE`을 설정했다면 GitHub 아이디가 먼저 보입니다).

봇이 다른 컴퓨터(서버)에서 돈다면 그 `bot.db`를 이 컴퓨터로 복사하거나, 공유 폴더(동기화 폴더·네트워크 드라이브)에 있는 파일을 열면 됩니다.

## 릴리즈 (자동)

`main`에 푸시하면 GitHub Actions(`.github/workflows/release.yml`)가 알아서 릴리즈합니다.

1. 버전 계산 (`scripts/next_version.py`): 마지막 태그의 patch + 1. `package.json`의 버전이 마지막 태그보다 높으면 그 버전.
   - 기능이 크게 바뀌어 `0.2.0`, `1.0.0`으로 올리고 싶으면 `package.json`의 `version`만 고쳐서 푸시하면 됩니다.
2. Linux에서 스모크 테스트: 샘플 `bot.db`를 만들어 앱을 실제로 띄우고 모든 화면을 그려 봅니다. 실패하면 릴리즈하지 않습니다.
3. macOS·Windows·Linux에서 동시에 빌드합니다.
4. `vX.Y.Z` 태그와 GitHub Release를 만들고 설치 파일과 `latest*.yml`(자동 업데이트용)을 올립니다. 릴리즈 노트는 커밋·PR로 자동 작성됩니다.

- 릴리즈 없이 푸시하려면 커밋 메시지에 `[skip release]`를 넣으세요. `README` 등 `.md`만 바꾼 푸시도 릴리즈하지 않습니다.
- 수동으로 다시 돌리려면 Actions → Release → **Run workflow**.
- PR에는 `.github/workflows/ci.yml`이 같은 스모크 테스트를 돌립니다.

## 개발

Node.js 22 이상과 Python 3가 필요합니다.

```bash
npm install
```

```bash
npm run sample
```

```bash
npm start
```

- `npm run sample`: 봇과 같은 스키마로 가짜 데이터가 든 `sample/sample.db`를 만듭니다.
- `npm run smoke`: 스모크 테스트를 로컬에서 실행합니다.
- `npm run dist`: 지금 OS용 설치 파일을 `dist/`에 만듭니다.
- 화면(`app/`)은 빌드 과정 없는 HTML/CSS/JS라서 브라우저로도 열 수 있습니다: `python3 -m http.server` 후 `http://localhost:8000/app/index.html?db=../sample/sample.db`

### 구조

```
install-mac.sh   macOS 설치·업데이트 스크립트 (curl … | bash)
main.js          Electron 메인: 창, bot.db 읽기·감시, 자동 업데이트, 스모크 테스트
preload.js       화면에 열어 주는 최소한의 API (window.pm)
app/
  index.html     화면 뼈대
  bridge.js      데스크톱 앱 / 브라우저 차이를 감추는 층
  data.js        bot.db → 객체 (디스코드 ID는 문자열로 읽어 자릿수 손실 방지), 시간대 처리
  app.js         화면들
  styles.css     라이트/다크 테마
scripts/
  make_sample_db.py  샘플 bot.db 생성
  next_version.py    다음 릴리즈 버전 계산
  copy-vendor.js     sql.js(WebAssembly SQLite)를 app/vendor로 복사 (npm install 때 자동)
```

봇의 DB 스키마는 [Discord-PM-Public `bot/db.py`](https://github.com/Lyeol2/Discord-PM-Public/blob/main/bot/db.py)를 따릅니다. 이전 버전 봇의 DB처럼 테이블·열이 없으면 그 부분은 빈 채로 보여줍니다.
