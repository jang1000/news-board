const MAX_PROMPT_LENGTH = 5000;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 허용됩니다." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const task = String(body.prompt || "").trim();

    if (!task) return res.status(400).json({ error: "명령을 입력해 주세요." });
    if (task.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: "명령은 5,000자 이하로 입력해 주세요." });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return res.status(503).json({
        error: "Vercel 환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다. Vercel 프로젝트 설정에서 API 키를 등록해 주세요."
      });
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

    async function ask(system, user) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: user }]
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error?.message || "Claude API 오류: " + response.status;
        const error = new Error(message);
        error.statusCode = response.status === 429 ? 429 : 502;
        throw error;
      }
      return (data.content || [])
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");
    }

    const plan = await ask(
      "당신은 개인 AI 조직의 Orchestrator다. 사용자의 목표를 분석하고 Research, Knowledge, Creator의 작업을 설계한다. 한국어로 답하고 외부 검색을 수행했다고 주장하지 말라.",
      "사용자 요청:\n" + task + "\n작업 계획을 간결하게 정리하라."
    );
    const research = await ask(
      "당신은 Research Agent다. 주제의 배경, 핵심 개념, 쟁점을 분석한다. 웹 검색이 연결되지 않았으므로 최신 사실이나 출처를 지어내지 말고 검증이 필요한 항목을 표시하라.",
      "요청:\n" + task + "\n계획:\n" + plan + "\n조사 분석 메모를 작성하라."
    );
    const knowledge = await ask(
      "당신은 Knowledge Agent다. 현재 입력에 제공된 정보만 활용해 개념과 관점을 연결한다. 개인 문서나 기억을 조회했다고 가장하지 말라.",
      "요청:\n" + task + "\n조사 메모:\n" + research + "\n관점 연결과 새로운 질문을 정리하라."
    );
    const creator = await ask(
      "당신은 Creator Agent다. 앞선 결과를 통합해 바로 활용할 수 있는 결과물을 한국어로 작성한다. 근거가 불확실한 주장은 단정하지 말라.",
      "요청:\n" + task + "\n계획:\n" + plan + "\n조사:\n" + research + "\n관점:\n" + knowledge + "\n최종 결과물을 작성하라."
    );

    return res.status(200).json({
      mode: "ai",
      title: task.length > 60 ? task.slice(0, 60) + "…" : task,
      note: "Claude API 실행 결과입니다. 웹 검색 및 개인 지식 저장소는 아직 연결되지 않았으므로 최신 사실과 개인 문서에 대한 별도 검증이 필요합니다.",
      outputs: [
        { agent: "Research", title: "조사 및 분석 메모", content: research },
        { agent: "Knowledge", title: "관점 및 지식 연결", content: knowledge },
        { agent: "Creator", title: "최종 결과물", content: creator }
      ]
    });
  } catch (error) {
    console.error("orchestrate error:", error);
    return res.status(error.statusCode || 500).json({
      error: error.message || "작업 처리 중 오류가 발생했습니다."
    });
  }
};
