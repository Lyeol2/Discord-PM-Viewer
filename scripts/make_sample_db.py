"""Make a sample bot.db with fake data, laid out exactly like Discord-PM-Public's bot/db.py schema.

Used for trying the viewer without a real bot and for the CI smoke test:
    python3 scripts/make_sample_db.py sample/sample.db
Times are relative to now, so the sample always has overdue / upcoming items.
"""

from __future__ import annotations

import random
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE tasks (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    status TEXT NOT NULL DEFAULT 'todo', assignee_id INTEGER, creator_id INTEGER NOT NULL, due_at TEXT,
    created_at TEXT NOT NULL, notified_soon INTEGER NOT NULL DEFAULT 0, notified_overdue INTEGER NOT NULL DEFAULT 0,
    thread_id INTEGER, card_message_id INTEGER, issue_id INTEGER, milestone_id INTEGER,
    notion_page_id TEXT, notion_dirty INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE events (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, title TEXT NOT NULL,
    starts_at TEXT NOT NULL, remind_at TEXT NOT NULL, creator_id INTEGER NOT NULL, reminded INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE issues (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, thread_id INTEGER NOT NULL UNIQUE, card_message_id INTEGER,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', author_id INTEGER NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, at TEXT NOT NULL, actor_id INTEGER,
    kind TEXT NOT NULL, task_id INTEGER, issue_id INTEGER, detail TEXT
);
CREATE TABLE milestones (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT, due_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', creator_id INTEGER NOT NULL, created_at TEXT NOT NULL, closed_at TEXT,
    alerted TEXT NOT NULL DEFAULT '', retro_url TEXT,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE discussions (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, thread_id INTEGER NOT NULL UNIQUE, card_message_id INTEGER,
    title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', opener_id INTEGER NOT NULL, created_at TEXT NOT NULL,
    closed_at TEXT, notion_url TEXT,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE vacations (
    id INTEGER NOT NULL, guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL, start_date TEXT NOT NULL,
    end_date TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', channel_id INTEGER,
    message_id INTEGER, decided_by INTEGER, decided_at TEXT, note TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, id)
);
CREATE TABLE voice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL, left_at TEXT, last_seen TEXT NOT NULL
);
CREATE TABLE bot_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE guild_config (guild_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (guild_id, key));
CREATE TABLE account_links (
    guild_id INTEGER NOT NULL, alt_id INTEGER NOT NULL, main_id INTEGER NOT NULL, created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (guild_id, alt_id)
);
"""

# Snowflake-sized ids (bigger than 2^53) so a viewer that reads them as JS numbers shows wrong ids.
GUILD = 1187654321098765432
GUILD2 = 1198765432109876543
PEOPLE = {
    "minsu": 312345678901234567, "jiyoon": 412345678901234568, "hyunwoo": 512345678901234569,
    "seoyeon": 612345678901234570, "dohyun": 712345678901234571, "jiyoon_alt": 812345678901234572,
}
MAIN = [PEOPLE[k] for k in ("minsu", "jiyoon", "hyunwoo", "seoyeon", "dohyun")]


def fmt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def snowflake(rng: random.Random) -> int:
    return rng.randrange(1_300_000_000_000_000_000, 1_400_000_000_000_000_000)


def main(path: str) -> None:
    rng = random.Random(7)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.unlink(missing_ok=True)
    db = sqlite3.connect(out)
    db.executescript(SCHEMA)

    db.execute("INSERT INTO bot_config VALUES ('BOT_TIMEZONE', 'Asia/Seoul')")
    db.execute("INSERT INTO guild_config VALUES (?, 'GITHUB_PEOPLE', ?)",
               (GUILD, f"minsu-dev={PEOPLE['minsu']},jiyoon-k={PEOPLE['jiyoon']}"))
    db.execute("INSERT INTO account_links VALUES (?, ?, ?, ?, ?)",
               (GUILD, PEOPLE["jiyoon_alt"], PEOPLE["jiyoon"], PEOPLE["minsu"], fmt(now - timedelta(days=20))))

    milestones = [
        (1, "알파 빌드", "핵심 전투·맵 이동이 되는 첫 플레이어블", now - timedelta(days=10), "done"),
        (2, "클로즈드 베타", "외부 테스터 50명 대상 CBT", now + timedelta(days=12), "open"),
        (3, "스토어 페이지 오픈", "스팀 페이지와 트레일러", now + timedelta(days=40), "open"),
    ]
    for mid, title, desc, due, status in milestones:
        closed = fmt(due) if status == "done" else None
        db.execute("INSERT INTO milestones (id, guild_id, title, description, due_at, status, creator_id, created_at,"
                   " closed_at) VALUES (?,?,?,?,?,?,?,?,?)",
                   (mid, GUILD, title, desc, fmt(due.replace(hour=14, minute=59, second=59)), status, MAIN[0],
                    fmt(now - timedelta(days=45)), closed))

    titles = [
        "로그인 API 연동", "맵 에디터 저장 버그", "전투 UI 리뉴얼", "사운드 믹싱 1차", "튜토리얼 시나리오 작성",
        "인벤토리 정렬 기능", "서버 부하 테스트", "보스 패턴 3종", "업적 시스템", "패치 노트 자동화",
        "CBT 신청 폼", "크래시 리포터 붙이기", "옵션 메뉴 키 설정", "NPC 대사 번역", "캐릭터 커스터마이징",
        "트레일러 콘티", "스팀 빌드 파이프라인", "세이브 데이터 암호화", "성능 프로파일링", "아트 리소스 정리",
        "길찾기 최적화", "퀘스트 로그 UI", "리더보드 API", "버그 트리아지 회의 준비", "스토어 스크린샷",
        "엣지 이동 패킷 정리", "파티 매칭", "로딩 화면 팁", "컨트롤러 지원", "접근성 옵션",
    ]
    tasks = []
    for i, title in enumerate(titles, start=1):
        status = rng.choices(["todo", "doing", "done"], [4, 3, 4])[0]
        created = now - timedelta(days=rng.randint(3, 40), hours=rng.randint(0, 20))
        due = None
        if rng.random() < 0.8:
            due = (now + timedelta(days=rng.randint(-6, 20))).replace(hour=9, minute=0, second=0)  # 18:00 KST
        assignee = rng.choice(MAIN + [None])
        milestone = rng.choice([1, 2, 2, 2, 3, 3, None]) if i > 1 else 2
        if milestone == 1:
            status = "done" if rng.random() < 0.9 else "doing"
        tasks.append((i, status, assignee, created, due, milestone))
        db.execute("INSERT INTO tasks (id, guild_id, title, description, status, assignee_id, creator_id, due_at,"
                   " created_at, thread_id, milestone_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (i, GUILD, title, f"{title}에 대한 작업 설명입니다." if i % 3 else None, status,
                    assignee, rng.choice(MAIN), fmt(due) if due else None, fmt(created), snowflake(rng), milestone))

    issue_titles = [("맵 저장 시 크래시", "doing"), ("로그인 화면 깜빡임", "new"), ("업적 아이콘 해상도", "resolved"),
                    ("파티 초대 알림이 안 옴", "new"), ("옵션 저장 안 됨", "hold"), ("리더보드 정렬 질문", "resolved"),
                    ("전투 중 프레임 드랍", "doing"), ("번역 누락", "new")]
    for i, (title, status) in enumerate(issue_titles, start=1):
        created = now - timedelta(days=rng.randint(1, 25))
        db.execute("INSERT INTO issues (id, guild_id, thread_id, title, status, author_id, created_at)"
                   " VALUES (?,?,?,?,?,?,?)", (i, GUILD, snowflake(rng), title, status, rng.choice(MAIN), fmt(created)))
    db.execute("UPDATE tasks SET issue_id = 1 WHERE guild_id = ? AND id = 2", (GUILD,))
    db.execute("UPDATE tasks SET issue_id = 7 WHERE guild_id = ? AND id = 19", (GUILD,))

    # Activity over the last three weeks.
    kinds = [
        ("task_status", "📋 todo → 🔨 in-progress"), ("task_status", "🔨 in-progress → ✅ done"),
        ("task_assigned", "담당 지정"), ("task_due", "마감 변경"), ("task_edited", "제목 수정"),
        ("task_worklog", "작업 기록: 1차 구현 완료, 리뷰 대기"), ("task_milestone", "마일스톤 '클로즈드 베타'에 추가"),
        ("github_activity", "커밋 a1b2c3d 'PM-12 fix save crash' (minsu-dev)"),
    ]
    for i, status, assignee, created, due, milestone in tasks:
        db.execute("INSERT INTO activity (guild_id, at, actor_id, kind, task_id, detail) VALUES (?,?,?,?,?,?)",
                   (GUILD, fmt(created), rng.choice(MAIN), "task_created", i, "작업 생성"))
    for _ in range(140):
        at = now - timedelta(minutes=rng.randint(10, 21 * 24 * 60))
        kind, detail = rng.choice(kinds)
        db.execute("INSERT INTO activity (guild_id, at, actor_id, kind, task_id, detail) VALUES (?,?,?,?,?,?)",
                   (GUILD, fmt(at), rng.choice(MAIN + [PEOPLE["jiyoon_alt"]]), kind, rng.randint(1, len(titles)),
                    detail))
    for i in range(1, len(issue_titles) + 1):
        db.execute("INSERT INTO activity (guild_id, at, actor_id, kind, issue_id, detail) VALUES (?,?,?,?,?,?)",
                   (GUILD, fmt(now - timedelta(days=rng.randint(0, 20))), rng.choice(MAIN), "issue_status", i,
                    "🆕 open → 🛠️ in-progress"))
    db.execute("INSERT INTO activity (guild_id, at, actor_id, kind, issue_id, task_id, detail) VALUES (?,?,?,?,?,?,?)",
               (GUILD, fmt(now - timedelta(days=2)), MAIN[1], "issue_handoff", 1, 2, "이슈 #1 → 작업 #2"))
    db.execute("INSERT INTO activity (guild_id, at, actor_id, kind, detail) VALUES (?,?,?,?,?)",
               (GUILD, fmt(now - timedelta(days=1)), MAIN[0], "milestone_edited", "마일스톤 '클로즈드 베타' 마감 변경"))

    events = [("스프린트 회고", 1, 7), ("CBT 킥오프 미팅", 3, 2), ("주간 빌드 리뷰", -2, 6), ("퍼블리셔 미팅", 9, 5)]
    for i, (title, days, hour) in enumerate(events, start=1):
        starts = (now + timedelta(days=days)).replace(hour=hour, minute=0, second=0)
        db.execute("INSERT INTO events (id, guild_id, channel_id, title, starts_at, remind_at, creator_id, reminded)"
                   " VALUES (?,?,?,?,?,?,?,?)", (i, GUILD, snowflake(rng), title, fmt(starts),
                                                 fmt(starts - timedelta(minutes=30)), rng.choice(MAIN), int(days < 0)))

    today = date.today()
    vacations = [(MAIN[2], 0, 2, "가족 여행", "approved"), (MAIN[3], 5, 6, "병원", "pending"),
                 (MAIN[4], -8, -6, "개인 사유", "approved"), (MAIN[1], 14, 18, "연말 휴가", "approved"),
                 (MAIN[0], 3, 3, "이사", "rejected")]
    for i, (user, start, end, reason, status) in enumerate(vacations, start=1):
        decided = fmt(now - timedelta(days=1)) if status != "pending" else None
        db.execute("INSERT INTO vacations (id, guild_id, user_id, start_date, end_date, reason, status, decided_by,"
                   " decided_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (i, GUILD, user, (today + timedelta(days=start)).isoformat(),
                    (today + timedelta(days=end)).isoformat(), reason, status,
                    MAIN[0] if decided else None, decided, fmt(now - timedelta(days=3))))

    discussions = [("CBT 보상 구성", "open", None), ("전투 밸런스 방향", "closed", "https://www.notion.so/example-minutes"),
                   ("아트 스타일 가이드", "open", None)]
    for i, (title, status, url) in enumerate(discussions, start=1):
        db.execute("INSERT INTO discussions (id, guild_id, thread_id, title, status, opener_id, created_at, closed_at,"
                   " notion_url) VALUES (?,?,?,?,?,?,?,?,?)",
                   (i, GUILD, snowflake(rng), title, status, rng.choice(MAIN), fmt(now - timedelta(days=6 - i)),
                    fmt(now - timedelta(days=1)) if status == "closed" else None, url))

    # Work room time: most weekdays of the last 5 weeks, a few hours each.
    for user in MAIN + [PEOPLE["jiyoon_alt"]]:
        for back in range(35):
            day = now - timedelta(days=back)
            if day.weekday() >= 5 or rng.random() < 0.25:
                continue
            joined = day.replace(hour=rng.randint(0, 3), minute=rng.randint(0, 59), second=0)  # 09~12 KST
            left = joined + timedelta(minutes=rng.randint(40, 420))
            if left > now:
                continue
            db.execute("INSERT INTO voice_sessions (guild_id, user_id, joined_at, left_at, last_seen) VALUES (?,?,?,?,?)",
                       (GUILD, user, fmt(joined), fmt(left), fmt(left)))
    # Someone is in the work room right now.
    db.execute("INSERT INTO voice_sessions (guild_id, user_id, joined_at, left_at, last_seen) VALUES (?,?,?,NULL,?)",
               (GUILD, MAIN[0], fmt(now - timedelta(minutes=95)), fmt(now)))

    # A second, smaller server, so the server picker has something to switch to.
    db.execute("INSERT INTO tasks (id, guild_id, title, status, assignee_id, creator_id, created_at)"
               " VALUES (1, ?, '#1 사이드 프로젝트 기획', 'doing', ?, ?, ?)", (GUILD2, MAIN[0], MAIN[0], fmt(now)))

    db.commit()
    db.close()
    print(f"sample database written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sample/sample.db")
