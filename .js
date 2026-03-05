// ==UserScript==
// @name         Kahoot AI / MOTHING / MVP
// @namespace    http://tampermonkey.net/
// @version      1.66
// @description  x
// @author       NOTHING X
// @match        https://kahoot.it/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const KEYS = [
        "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",
        "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",
        "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",
        "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",
        "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",
        "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"
    ];

    const MODELS = [
        "openai/gpt-4o-mini",
        "anthropic/claude-opus-4.6",
        "allenai/olmo-3-7b-instruct",
        "arcee-ai/trinity-large-preview:free",
        "arcee-ai/trinity-mini",
        "stepfun/step-3.5-flash"
    ];

    function simpleHash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
        return h.toString(36);
    }

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "env(safe-area-inset-top, 20px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.90)",
        color: "#fff",
        padding: "10px 18px",
        borderRadius: "12px",
        zIndex: "999999999",
        fontFamily: "system-ui, sans-serif",
        fontSize: "clamp(13px, 3.4vw, 15px)",
        maxWidth: "min(90vw, 520px)",
        textAlign: "center",
        boxShadow: "0 6px 20px #0008",
        pointerEvents: "none",
        border: "1px solid #444",
        lineHeight: "1.3",
        display: "none"
    });

    panel.innerHTML = `
        <div id="q" style="color:#ffdd88;font-weight:600;margin-bottom:6px;min-height:1.2em;">---</div>
        <div id="o" style="margin-bottom:8px;min-height:1.6em;"></div>
        <div id="a" style="color:#88ff88;font-weight:bold;font-size:1.2em;">---</div>
    `;
    document.body.appendChild(panel);

    const qDiv = panel.querySelector("#q");
    const oDiv = panel.querySelector("#o");
    const aDiv = panel.querySelector("#a");

    let lastHash = "";

    async function askAI(prompt) {
        let ans = "???";
        for (let i = 0; i < KEYS.length; i++) {
            const key = KEYS[i];
            try {
                const res = await new Promise(r => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: "https://openrouter.ai/api/v1/chat/completions",
                        headers: {
                            "Authorization": `Bearer ${key}`,
                            "HTTP-Referer": "https://kahoot.it",
                            "X-Title": "Kahoot AI",
                            "Content-Type": "application/json"
                        },
                        data: JSON.stringify({
                            model: MODELS[i % MODELS.length],
                            messages: [
                                {role: "system", content: "Odpowiadaj TYLKO poprawną odpowiedzią – bez niczego więcej."},
                                {role: "user", content: prompt}
                            ],
                            temperature: 0.15,
                            max_tokens: 60,
                            top_p: 0.88
                        }),
                        onload: r,
                        onerror: () => r({status: 0})
                    });
                });

                if (res.status === 200) {
                    const json = JSON.parse(res.responseText);
                    ans = json.choices?.[0]?.message?.content?.trim() ?? "";
                    ans = ans.replace(/["„”'‘’„”]+/g, '').replace(/^[1-4.)\s-]+/i, '').trim();
                    if (ans) return ans; // jak dostał odpowiedź → kończymy
                }
            } catch {}
        }
        return ans;
    }

    setInterval(() => {
        const title = document.title.toLowerCase();
        if (!title.includes("quiz")) {
            panel.style.display = "none";
            qDiv.textContent = "";
            oDiv.innerHTML = "";
            aDiv.textContent = "";
            return;
        }

        const qEl = document.querySelector('[data-functional-selector="block-title"], .question-title__Title, h1, [class*="question-title"], [role="heading"]');
        let q = qEl ? qEl.textContent.trim().replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ') : "";

        if (q.length < 8) {
            panel.style.display = "none";
            return;
        }

        const hash = simpleHash(q.slice(0, 140));
        if (hash === lastHash) return;
        lastHash = hash;

        panel.style.display = "block";
        qDiv.textContent = q;

        const btns = document.querySelectorAll('button, [role="button"], [data-functional-selector*="answer"], [data-functional-selector*="choice"], .answer-choice-button');
        const optsSet = new Set();

        btns.forEach(b => {
            let t = (b.textContent || b.innerText || b.getAttribute('aria-label') || '').trim();
            t = t.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
            if (t && t.length > 1 && !t.toLowerCase().includes("przejdź") && !t.toLowerCase().includes("dodaj reakcję")) {
                optsSet.add(t);
            }
        });

        const opts = Array.from(optsSet);
        oDiv.innerHTML = opts.map((t,i) => `<div style="margin:2px 0;">${i+1}) ${t}</div>`).join('') || "(brak)";

        aDiv.textContent = "Myślę...";

        let prompt = `Odpowiedz TYLKO poprawną odpowiedzią – krótko i bez niczego więcej.

Pytanie: ${q}

Opcje:
${opts.map((t,i) => `${i+1}. ${t}`).join("\n")}

Odpowiedź:`;

        askAI(prompt).then(ans => {
            aDiv.textContent = ans;

            document.querySelectorAll('#o div').forEach(div => {
                div.style.color = '#ddd';
                div.style.fontWeight = 'normal';
                if (div.textContent.includes(ans)) {
                    div.style.color = '#00ff88';
                    div.style.fontWeight = 'bold';
                }
            });
        });
    }, 2000);

})();
