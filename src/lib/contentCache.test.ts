import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchContent = vi.fn();
vi.mock("./fetchContent", () => ({ fetchContent: (url: string) => fetchContent(url) }));

const { clearContentCache, contentCacheSize, fetchContentCached } = await import("./contentCache");

describe("fetchContentCached", () => {
  beforeEach(() => {
    clearContentCache();
    fetchContent.mockReset();
  });

  it("fetches a URL once and serves the rest from memory", async () => {
    fetchContent.mockResolvedValue("# Lesson");

    expect(await fetchContentCached("https://x.test/a.learn.md")).toBe("# Lesson");
    expect(await fetchContentCached("https://x.test/a.learn.md")).toBe("# Lesson");

    expect(fetchContent).toHaveBeenCalledTimes(1);
  });

  it("shares a single request between callers racing for the same URL", async () => {
    // This is the case that matters: the title pass and the reader opening
    // that same step at once must not fetch it twice.
    fetchContent.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("# Lesson"), 5)),
    );

    const [a, b] = await Promise.all([
      fetchContentCached("https://x.test/a.learn.md"),
      fetchContentCached("https://x.test/a.learn.md"),
    ]);

    expect(a).toBe("# Lesson");
    expect(b).toBe("# Lesson");
    expect(fetchContent).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure, so retrying actually retries", async () => {
    fetchContent.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(fetchContentCached("https://x.test/flaky.learn.md")).rejects.toThrow("HTTP 500");

    fetchContent.mockResolvedValueOnce("# Recovered");
    expect(await fetchContentCached("https://x.test/flaky.learn.md")).toBe("# Recovered");
    expect(fetchContent).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entries past the cap rather than growing forever", async () => {
    fetchContent.mockResolvedValue("x");
    for (let i = 0; i < 100; i++) {
      await fetchContentCached(`https://x.test/${i}.learn.md`);
    }
    expect(contentCacheSize()).toBeLessThanOrEqual(80);

    // The oldest URL was dropped, so asking for it fetches again.
    await fetchContentCached("https://x.test/0.learn.md");
    expect(fetchContent).toHaveBeenCalledTimes(101);
  });
});
