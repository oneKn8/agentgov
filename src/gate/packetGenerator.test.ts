import { describe, expect, it } from "vitest";
import { composeReleasePacket } from "./packetGenerator.js";
import type { ReleaseDecision } from "../schema/types.js";

describe("composeReleasePacket", () => {
  it("escapes untrusted decision fields in the HTML packet", () => {
    const packet = composeReleasePacket({
      release_id: "rel-xss",
      agent_id: "agent-xss",
      agent_name: 'Vendor <img src=x onerror="alert(1)">',
      verdict: "BLOCK",
      pass_rate: 42,
      critical_failures: 1,
      tool_call_failures: 1,
      policy_failures: 1,
      root_causes: ["Missing evidence <script>alert(2)</script>"],
      recommended_fixes: ['Review "dangerous" output & approve manually'],
      owner: "maker@example.com",
      approval_deadline: "2026-06-01",
      created_at: "2026-05-19T00:00:00.000Z",
      evidence_ref: "eval-run-1?x=<bad>",
      policy_version: "policies/vendor-exception.yaml",
      failures: [
        {
          id: "failure-xss",
          category: "evidence",
          severity: "critical",
          message: "Reviewer note includes <iframe srcdoc='<script>alert(3)</script>'></iframe>",
          remediation: "Strip <b>HTML</b> before approval"
        }
      ],
      signature: "sig<&>"
    } satisfies ReleaseDecision);

    expect(packet.html).not.toContain("<script>");
    expect(packet.html).not.toContain("<img");
    expect(packet.html).not.toContain("<iframe");
    expect(packet.html).not.toContain("<b>HTML</b>");
    expect(packet.html).toContain("Vendor &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(packet.html).toContain("Missing evidence &lt;script&gt;alert(2)&lt;/script&gt;");
    expect(packet.html).toContain("srcdoc=&#39;&lt;script&gt;alert(3)&lt;/script&gt;&#39;");
    expect(packet.html).toContain("sig&lt;&amp;&gt;");
  });

  it("escapes untrusted decision fields in the Markdown packet", () => {
    const packet = composeReleasePacket({
      release_id: "rel-md",
      agent_id: "agent-md",
      agent_name: "Vendor <script>alert(1)</script>",
      verdict: "BLOCK",
      pass_rate: 42,
      critical_failures: 1,
      tool_call_failures: 1,
      policy_failures: 1,
      root_causes: ["Click [approve](javascript:alert(2)) now"],
      recommended_fixes: ["Open [fix](javascript:alert(3))", "Inspect C:\\temp\\agentgov"],
      owner: "maker@example.com",
      approval_deadline: "2026-06-01",
      created_at: "2026-05-19T00:00:00.000Z",
      evidence_ref: "eval-run-1?x=<bad>",
      failures: [
        {
          id: "failure-md",
          category: "evidence",
          severity: "critical",
          message: "Line one\n## Forged Heading <iframe src=x></iframe>",
          remediation: "Do **not** click [here](javascript:alert(4))"
        }
      ],
      signature: "sig<&>"
    } satisfies ReleaseDecision);

    expect(packet.markdown).not.toContain("<script>");
    expect(packet.markdown).not.toContain("<iframe");
    expect(packet.markdown).not.toContain("[approve](javascript:");
    expect(packet.markdown).not.toContain("[fix](javascript:");
    expect(packet.markdown).not.toContain("[here](javascript:");
    expect(packet.markdown).not.toContain("\n## Forged Heading");
    expect(packet.markdown).toContain("Vendor &lt;script&gt;alert\\(1\\)&lt;/script&gt;");
    expect(packet.markdown).toContain("Click \\[approve\\]\\(javascript:alert\\(2\\)\\) now");
    expect(packet.markdown).toContain("Do \\*\\*not\\*\\* click \\[here\\]\\(javascript:alert\\(4\\)\\)");
    expect(packet.markdown).toContain("Inspect C:\\\\temp\\\\agentgov");
  });

  it("keeps the Markdown packet readable for CLI output", () => {
    const packet = composeReleasePacket({
      release_id: "rel-pass",
      agent_id: "agent-pass",
      agent_name: "Vendor Exception Agent",
      verdict: "PASS",
      pass_rate: 98,
      critical_failures: 0,
      tool_call_failures: 0,
      policy_failures: 0,
      root_causes: [],
      recommended_fixes: [],
      owner: "owner@example.com",
      approval_deadline: "2026-06-01",
      created_at: "2026-05-19T00:00:00.000Z",
      evidence_ref: "eval-run-pass",
      failures: []
    } satisfies ReleaseDecision);

    expect(packet.markdown).toContain("# AgentGov Release Packet: Vendor Exception Agent");
    expect(packet.markdown).toContain("## Required Fixes\n- No remediation required.");
  });
});
