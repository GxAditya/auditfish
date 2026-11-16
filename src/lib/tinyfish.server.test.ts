import { describe, expect, it } from "vitest";
import { actionKey, detectLoop, lookupGoal } from "./tinyfish.server";

describe("agent loop guard", () => {
  it("treats reworded retries of one action as the same action", () => {
    expect(actionKey("Click the Profession dropdown")).toBe(actionKey("Clicking the profession dropdown again (attempt 3)"));
  });

  it("flags a stuck dropdown (NY register under maintenance)", () => {
    const steps = [
      "Navigate to the license search form",
      "Click the Profession dropdown",
      "Clicking the profession dropdown again",
      "Click the Profession dropdown (attempt 3)",
      "Try clicking the profession dropdown once more",
      "Click the Profession dropdown to see options",
    ];
    expect(detectLoop(steps)).toMatch(/profession dropdown/i);
  });

  it("allows the four name-variant searches the goal permits", () => {
    const steps = ["Type Lee in last name", "Click Search", "Type Danielle in first name", "Click Search", "Clear first name", "Click Search", "Type Lee Danielle", "Click Search"];
    expect(detectLoop(steps)).toBeNull();
  });

  it("does not flag normal progress, or paging through a long result list", () => {
    expect(detectLoop(["Open search", "Type last name Lee", "Type first name Danielle", "Click Search", "Read results"])).toBeNull();
    expect(detectLoop(["Scroll down the results", "Scroll down the results", "Scroll down the results", "Scroll down the results"])).toBeNull();
  });
});

describe("agent goal", () => {
  it("tells the agent to give up on broken form controls instead of retrying", () => {
    const goal = lookupGoal({ name: "Mona Kinkhabwala", record_type: "medical", country: "United States", region: "New York", number: null }, "Medical licence (doctor)");
    expect(goal).toMatch(/never repeat the same action more than twice/);
    expect(goal).toMatch(/skip that filter and search without it/);
  });

  it("tells the agent names may be listed surname first and to keep those rows", () => {
    const goal = lookupGoal({ name: "Ashutosh Sharan", record_type: "medical", country: "India", region: "Bihar", number: null }, "Medical licence (doctor)");
    expect(goal).toMatch(/\(a\) the name in reverse order/);
    expect(goal).toContain('"Sharan Ashutosh"');
    expect(goal).toMatch(/Never leave out a row because its name order differs/);
    expect(goal).toMatch(/"no_results" only if every search showed zero rows/);
  });
});
