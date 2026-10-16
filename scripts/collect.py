"""매일 RSS를 읽어 영역별 주요 기사를 고르고 요약해 news.json을 갱신한다."""
import calendar, datetime as dt, json, os, re, time
import feedparser

KST = dt.timezone(dt.timedelta(hours=9))
PER_DOMAIN = 3      # 영역당 하루 선정 건수
CANDIDATES = 15     # AI에게 보여줄 후보 수
KEEP_DAYS = 7       # 보드에 남겨 둘 기간
MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-5-5")


def clean(t):
    return re.sub(r"<[^>]+>", "", t or "").strip()


def fetch(urls):
    items, seen = [], set()
    cutoff = time.time() - 48 * 3600
    for u in urls:
        try:
            feed = feedparser.parse(u)
        except Exception as ex:
            print("feed error", u, ex)
            continue
        src = clean(feed.feed.get("title", "")) if feed.feed else ""
        for e in feed.entries:
            ts = e.get("published_parsed") or e.get("updated_parsed")
            t = calendar.timegm(ts) if ts else time.time()
            link, title = e.get("link"), clean(e.get("title"))
            if not link or not title or t < cutoff:
                continue
            key = re.sub(r"\W", "", title.lower())[:40]
            if key in seen:
                continue
            seen.add(key)
            s = e.get("source")
            items.append(dict(title=title, url=link, ts=t,
                              source=(s.get("title") if s else "") or src,
                              snippet=clean(e.get("summary"))[:300]))
    items.sort(key=lambda x: -x["ts"])
    return items[:CANDIDATES]


def pick(domain, items):
    from anthropic import Anthropic
    lines = "\n".join(f"{i}. {x['title']} | {x['snippet']}" for i, x in enumerate(items))
    prompt = (
        f"다음은 '{domain}' 영역의 최근 기사 후보입니다. 독자가 알아두면 좋은 중요한 기사 "
        f"{PER_DOMAIN}건을 고르고 각각 한국어 1~2문장으로 요약하세요. 후보의 제목과 내용에 있는 "
        "정보만 쓰고 없는 내용은 추측하지 마세요. 같은 사건을 다룬 기사는 하나만 고르세요.\n"
        'JSON 배열만 출력: [{"i": 후보번호, "summary": "요약"}]\n\n' + lines)
    r = Anthropic().messages.create(model=MODEL, max_tokens=800,
                                    messages=[{"role": "user", "content": prompt}])
    m = re.search(r"\[.*\]", r.content[0].text, re.S)
    return json.loads(m.group(0))


def main():
    feeds = json.load(open("feeds.json", encoding="utf-8"))
    try:
        old = json.load(open("news.json", encoding="utf-8"))
    except Exception:
        old = []
    new = []
    for domain, urls in feeds.items():
        items = fetch(urls)
        if not items:
            print("기사 없음:", domain)
            continue
        picks = []
        if os.environ.get("ANTHROPIC_API_KEY"):
            try:
                picks = pick(domain, items)
            except Exception as ex:
                print("AI 요약 실패:", domain, ex)
        if not picks:  # AI를 못 쓰면 원문 발췌로 대체
            picks = [{"i": i, "summary": items[i]["snippet"][:120]}
                     for i in range(min(PER_DOMAIN, len(items)))]
        for p in picks[:PER_DOMAIN]:
            try:
                x = items[int(p["i"])]
            except Exception:
                continue
            new.append(dict(domain=domain, title=x["title"], source=x["source"],
                            date=dt.datetime.fromtimestamp(x["ts"], KST).date().isoformat(),
                            summary=p.get("summary", ""), url=x["url"]))
    by_url = {a["url"]: a for a in old + new if a.get("url")}
    cutoff = (dt.datetime.now(KST).date() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    out = sorted((a for a in by_url.values() if a.get("date", "") >= cutoff),
                 key=lambda a: a["date"], reverse=True)
    json.dump(out, open("news.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"저장 완료: 신규 {len(new)}건, 전체 {len(out)}건")


if __name__ == "__main__":
    main()
