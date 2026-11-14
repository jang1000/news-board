exports.handler = async function(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Allow": "POST" }, body: "Method Not Allowed" };
  try {
    const { prompt = "" } = JSON.parse(event.body || "{}");
    const task = String(prompt).trim();
    if (!task) return { statusCode: 400, body: JSON.stringify({ error: "명령을 입력해 주세요." }) };
    if (task.length > 5000) return { statusCode: 400, body: JSON.stringify({ error: "명령은 5,000자 이하로 입력해 주세요." }) };
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { statusCode: 503, body: JSON.stringify({ error: "Netlify 환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다. 데모 모드를 이용하거나 환경변수를 등록해 주세요." }) };
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
    async function ask(system, user) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: user }] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "AI API 오류: " + res.status);
      return (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
    }
    const plan = await ask("당신은 개인 AI 조직의 Orchestrator다. 사용자의 목표를 분석하고 Research, Knowledge, Creator의 작업을 설계한다. 한국어로 답하고 외부 검색을 수행했다고 주장하지 말라.", "사용자 요청:\n" + task + "\n작업 계획을 간결하게 정리하라.");
    const research = await ask("당신은 Research Agent다. 주제의 배경, 핵심 개념, 쟁점을 분석한다. 웹 검색이 연결되지 않았으므로 최신 사실이나 출처를 지어내지 말고 검증이 필요한 항목을 표시하라.", "요청:\n" + task + "\n계획:\n" + plan + "\n조사 분석 메모를 작성하라.");
    const knowledge = await ask("당신은 Knowledge Agent다. 현재 입력에 제공된 정보만 활용해 개념과 관점을 연결한다. 개인 문서나 기억을 조회했다고 가장하지 말라.", "요청:\n" + task + "\n조사 메모:\n" + research + "\n관점 연결과 새로운 질문을 정리하라.");
    const creator = await ask("당신은 Creator Agent다. 앞선 결과를 통합해 바로 활용할 수 있는 결과물을 한국어로 작성한다. 근거가 불확실한 주장은 단정하지 말라.", "요청:\n" + task + "\n계획:\n" + plan + "\n조사:\n" + research + "\n관점:\n" + knowledge + "\n최종 결과물을 작성하라.");
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify({
      mode: "ai", title: task.length > 60 ? task.slice(0,60) + "…" : task,
      note: "Claude API 실행 결과입니다. 웹 검색 및 개인 지식 저장소는 아직 연결되지 않았으므로 최신 사실과 개인 문서에 대한 별도 검증이 필요합니다.",
      outputs: [{ agent:"Research", title:"조사 및 분석 메모", content:research },{ agent:"Knowledge", title:"관점 및 지식 연결", content:knowledge },{ agent:"Creator", title:"최종 결과물", content:creator }]
    }) };
  } catch (e) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: e.message || "작업 처리 중 오류가 발생했습니다." }) };
  }
};