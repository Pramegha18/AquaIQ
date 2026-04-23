const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzeRequest {
  source: string;
  ph: number;
  turbidity: number;
  tds: number;
  bod: number;
}

const SYSTEM_PROMPT = `You are AquaIQ, an expert wastewater treatment AI system. Analyze water quality parameters and provide a structured treatment recommendation based on Indian standards (CPCB/BIS). Use the provided tool to return your analysis.`;

function ruleBasedAnalysis(p: AnalyzeRequest) {
  const { ph, turbidity, tds, bod, source } = p;
  const phOk = ph >= 6.5 && ph <= 8.5;
  const turbOk = turbidity <= 5;
  const tdsOk = tds <= 500;
  const bodOk = bod <= 3;

  const primary = turbidity > 20 || ["Municipal Sewage", "Industrial Effluent", "Stormwater"].includes(source);
  const secondary = bod > 20 || source === "Municipal Sewage" || source === "Industrial Effluent";
  const tertiary = !phOk || !tdsOk || tds > 500 || turbidity > 50;

  let score = 100;
  if (!phOk) score -= 15;
  if (turbidity > 5) score -= Math.min(25, turbidity / 10);
  if (tds > 500) score -= Math.min(25, (tds - 500) / 40);
  if (bod > 3) score -= Math.min(30, bod / 2);
  score = Math.max(5, Math.round(score));

  let reuseClass: "POTABLE" | "INDUSTRIAL" | "IRRIGATION" | "RESTRICTED" = "RESTRICTED";
  if (score > 85 && phOk && tdsOk && bodOk) reuseClass = "POTABLE";
  else if (score > 65) reuseClass = "INDUSTRIAL";
  else if (score > 45) reuseClass = "IRRIGATION";

  const stages = (primary ? 1 : 0) + (secondary ? 1 : 0) + (tertiary ? 1 : 0);
  const cost = 5 + stages * 8 + (tertiary ? 12 : 0);
  const energy = 0.3 + stages * 0.4 + (tertiary ? 0.8 : 0);
  const efficiency = Math.min(99, 60 + stages * 12);

  const status = (ok: boolean, warn: boolean) => (ok ? "PASS" : warn ? "WARN" : "FAIL");

  return {
    qualityScore: score,
    reuseClass,
    treatmentStages: { primary, secondary, tertiary },
    costPerKL: Math.round(cost * 10) / 10,
    energyKWh: Math.round(energy * 100) / 100,
    efficiencyPercent: Math.round(efficiency),
    parameterStatus: {
      ph: status(phOk, ph >= 6 && ph <= 9),
      turbidity: status(turbOk, turbidity <= 50),
      tds: status(tdsOk, tds <= 1000),
      bod: status(bodOk, bod <= 30),
    },
    narrative: `Rule-based analysis for ${source}: pH ${ph}, Turbidity ${turbidity} NTU, TDS ${tds} mg/L, BOD ${bod} mg/L. Recommended ${stages} treatment stage(s). Suitable for ${reuseClass.toLowerCase()} reuse based on Indian CPCB norms. (Generated using fallback logic — AI gateway unavailable.)`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const params: AnalyzeRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify(ruleBasedAnalysis(params)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `Source: ${params.source}\npH: ${params.ph}\nTurbidity: ${params.turbidity} NTU\nTDS: ${params.tds} mg/L\nBOD: ${params.bod} mg/L\n\nAnalyze this wastewater sample.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_water_analysis",
              description: "Submit structured wastewater treatment analysis",
              parameters: {
                type: "object",
                properties: {
                  qualityScore: { type: "integer", minimum: 0, maximum: 100 },
                  reuseClass: { type: "string", enum: ["POTABLE", "INDUSTRIAL", "IRRIGATION", "RESTRICTED"] },
                  treatmentStages: {
                    type: "object",
                    properties: {
                      primary: { type: "boolean" },
                      secondary: { type: "boolean" },
                      tertiary: { type: "boolean" },
                    },
                    required: ["primary", "secondary", "tertiary"],
                    additionalProperties: false,
                  },
                  costPerKL: { type: "number", description: "Cost in INR per kiloliter" },
                  energyKWh: { type: "number", description: "Energy in kWh per kiloliter" },
                  efficiencyPercent: { type: "number" },
                  parameterStatus: {
                    type: "object",
                    properties: {
                      ph: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
                      turbidity: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
                      tds: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
                      bod: { type: "string", enum: ["PASS", "WARN", "FAIL"] },
                    },
                    required: ["ph", "turbidity", "tds", "bod"],
                    additionalProperties: false,
                  },
                  narrative: { type: "string", description: "2-3 paragraph detailed analysis" },
                },
                required: ["qualityScore", "reuseClass", "treatmentStages", "costPerKL", "energyKWh", "efficiencyPercent", "parameterStatus", "narrative"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_water_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(JSON.stringify(ruleBasedAnalysis(params)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify(ruleBasedAnalysis(params)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-water error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
