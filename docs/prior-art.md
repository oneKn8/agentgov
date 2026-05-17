# Prior Art & Positioning

AgentGov is not the first project in this space. It is the missing maker/CoE layer between several existing tools.

## The honest matrix

| Tool | Layer | Surface | What it does | Where AgentGov sits |
|---|---|---|---|---|
| **Microsoft Agent 365** ([blog](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/)) | Enterprise control plane | Tenant-wide agent inventory, permissions, behavior, audit | AgentGov produces signed trust/release evidence Agent 365 consumes; AgentGov is the maker-side guardrail Agent 365 governs |
| **EvalGateADO** ([sample](https://microsoft.github.io/CopilotStudioSamples/testing/evaluation/EvalGateADO/)) | CI/CD | Azure DevOps PR pipeline gating merge by Copilot Studio Eval API pass-rate | EvalGateADO gates merges; AgentGov gates *human release readiness* with an approval packet and durable decision record |
| **Copilot Studio Evaluation API** ([docs](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-rest-api)) | Test execution | Generates and runs evaluation test sets against an agent | AgentGov *ingests* Eval API output as one input to the release decision; AgentGov also generates structured test sets from an agent profile |
| **sigstore-a2a** ([repo](https://github.com/sigstore/sigstore-a2a)) | Signing infrastructure | Keyless A2A Agent Card signing (Sigstore/SLSA provenance) | AgentGov consumes signed cards, applies tenant trust policy, sanitizes metadata, issues pre-delegation verdicts |
| **A2A protocol** ([spec](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)) | Open protocol | Defines agent-to-agent message exchange + Agent Card schema | AgentGov sits in the trust-decision layer above A2A; spec [issue #1672](https://github.com/a2aproject/A2A/issues/1672) explicitly leaves identity verification to external mechanisms |
| **Microsoft Purview** ([docs](https://learn.microsoft.com/en-us/purview/ai-copilot-studio)) | Runtime audit | Auto-emits Copilot Studio activity events to unified audit log | Adjacent. Purview is runtime audit; AgentGov is governance-lifecycle (pre-delegation + pre-release) |
| **Azure AI Content Safety** ([docs](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/)) | Runtime input/output filter | Filters violence/hate/sexual/self-harm + jailbreak + prompt injection in live agent responses | Adjacent. Content Safety is runtime; AgentGov is governance-lifecycle |
| **Guardrails AI / Lakera Guard / Noma / Aporia / Check Point** | Runtime moderation | Inline runtime evaluate/block/rewrite via Copilot Studio's [external security provider webhook](https://learn.microsoft.com/en-us/microsoft-copilot-studio/external-security-provider) | Adjacent. These plug into the runtime moderation socket; AgentGov plugs into the pre-delegation and pre-release decision points |
| **Defender for Cloud Apps for AI** | Threat detection | Detects abusive patterns in tenant AI traffic | Adjacent. Threat-detection layer; AgentGov is preventive-governance layer |

## Why the maker/CoE layer is the gap

Microsoft Agent 365 is the answer for **the enterprise governance team** (CISO, compliance, IT). EvalGateADO is the answer for **the platform CI team**. Purview is the answer for **the audit/eDiscovery team**. Guardrails AI is the answer for **the runtime safety team**.

None of these answer the question a **Copilot Studio maker or CoE engineer** asks before clicking "Publish":

> Does my agent meet the bar to ship? Does the external agent I'm delegating to meet the bar to trust? Where is the signed decision record that says so, and who approved it?

AgentGov produces that signed decision record. It is the **maker-facing guardrail** that other layers consume as evidence.

## What AgentGov is not

- **Not an eval runner.** AgentGov ingests eval results from the Copilot Studio Evaluation API or any compatible adapter. EvalGateADO already runs evaluations in CI.
- **Not a signing CA.** AgentGov verifies signatures using pinned keys or a JWKS endpoint. sigstore-a2a is the upstream keyless signing infrastructure.
- **Not a runtime moderator.** AgentGov sits at decision points (pre-delegation and pre-release), not in the user-message data path. Guardrails AI, Lakera, Azure AI Content Safety handle runtime.
- **Not a control plane.** AgentGov produces evidence; Microsoft Agent 365 is the enterprise control plane that consumes it.

## What's genuinely new

To our knowledge, no existing open-source or commercial product offers all three of:

1. A unified governance lifecycle for **both** A2A delegation trust **and** Copilot Studio release readiness, with a single signed decision schema.
2. A **local-first CLI + MCP server** dual-mode design that lets makers verify trust and release decisions without first wiring a Copilot Studio tenant.
3. A documented complementary positioning vs. Microsoft Agent 365, EvalGateADO, sigstore-a2a, and Purview rather than replacing or duplicating any of them.

If a reader knows of a product that covers all three, please open an issue — the positioning will be updated.

## Sources

- [Microsoft Copilot Studio: connect an agent over A2A](https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-agent-agent-to-agent)
- [Microsoft Copilot Studio: Extend an agent with MCP](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-extend-action-mcp)
- [Microsoft Copilot Studio: about agent evaluation](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-intro)
- [Microsoft Copilot Studio: agent evaluation checklist](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/evaluation-checklist)
- [Microsoft Copilot Studio: external security provider](https://learn.microsoft.com/en-us/microsoft-copilot-studio/external-security-provider)
- [Microsoft Agent 365 GA announcement](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/)
- [A2A protocol specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [A2A issue #1672 — identity verification gap](https://github.com/a2aproject/A2A/issues/1672)
- [arXiv 2504.16902 — A2A protocol security analysis](https://arxiv.org/abs/2504.16902)
- [sigstore/sigstore-a2a](https://github.com/sigstore/sigstore-a2a)
- [EvalGateADO sample](https://microsoft.github.io/CopilotStudioSamples/testing/evaluation/EvalGateADO/)
- [Microsoft Purview for Copilot Studio](https://learn.microsoft.com/en-us/purview/ai-copilot-studio)
- [Guardrails for Generative AI + Copilot Studio (Tech Community)](https://techcommunity.microsoft.com/blog/azureinfrastructureblog/guardrails-for-generative-ai-securing-developer-workflows/4505801)
- [Noma Security runtime guardrails for Copilot Studio](https://noma.security/blog/runtime-guardrails-for-microsoft-copilot-studio-agents/)
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
