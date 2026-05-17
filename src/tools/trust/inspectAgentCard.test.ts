import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectAgentCard } from "./inspectAgentCard.js";

describe("inspectAgentCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches remote Agent Card JSON URLs instead of treating them as local files", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: "Remote Card",
        description: "Fetched from a canonical .json URL"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const card = await inspectAgentCard("https://agents.example/.well-known/agent-card.json");

    expect(fetchMock).toHaveBeenCalledWith("https://agents.example/.well-known/agent-card.json", {
      headers: { accept: "application/json" }
    });
    expect(card.name).toBe("Remote Card");
    expect(card.source).toBe("https://agents.example/.well-known/agent-card.json");
  });

  it("fetches well-known Agent Card candidates for remote base URLs", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: url.endsWith("/.well-known/agent.json"),
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        name: "Fallback Card"
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const card = await inspectAgentCard("https://agents.example");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(card.name).toBe("Fallback Card");
    expect(card.source).toBe("https://agents.example/.well-known/agent.json");
  });
});
