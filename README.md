# 에이전트 관제실 + 뉴스 자동 수집

매일 한국시간 오전 6시에 GitHub Actions가 feeds.json의 RSS를 읽고,
Claude가 영역별 주요 기사 3건을 골라 요약해 news.json을 갱신합니다.
news.json이 바뀌면 Netlify가 자동으로 다시 배포합니다.

## 설정 순서
1. GitHub에서 새 저장소를 만들고 이 폴더의 모든 파일(.github 폴더 포함)을 올립니다.
2. 저장소 Settings → Secrets and variables → Actions → New repository secret
   이름 ANTHROPIC_API_KEY, 값은 Anthropic Console에서 발급한 API 키.
3. Actions 탭 → daily-news → Run workflow 로 한 번 수동 실행해 봅니다.
4. Netlify → Add new site → Import an existing project → GitHub 저장소 선택.
   Build command는 비우고 Publish directory는 . (점) 로 둡니다.

## 바꾸고 싶을 때
- 영역/RSS 주소: feeds.json (영역 이름은 교육, AI, 과학, 경제 4개여야 보드 탭에 보입니다)
- 영역당 건수, 보관 기간: scripts/collect.py 위쪽 PER_DOMAIN, KEEP_DAYS
- 실행 시각: .github/workflows/daily-news.yml 의 cron (UTC 기준)
