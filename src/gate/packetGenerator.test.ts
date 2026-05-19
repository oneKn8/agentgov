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
    expect(packet.html).toContain("sig&lt;&amp;&gt;");
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
