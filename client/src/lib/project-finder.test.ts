import { describe, expect, it } from "vitest";
import { findProjects, getProjectFinderStats } from "./project-finder";

const projects = [
  { name: "Vertical launch", updatedAt: 30, duration: 12, aspectRatio: "9:16", canvas: { width: 2160, height: 3840 } },
  { name: "Brand film", updatedAt: 20, duration: 48, aspectRatio: "16:9", canvas: { width: 3840, height: 2160 } },
  { name: "Square cut", updatedAt: 10, duration: 20, aspectRatio: "1:1", canvas: { width: 1080, height: 1080 } },
];

describe("REVRSE EDITOR project finder", () => {
  it("filters a browser-local project list by text and canvas ratio", () => {
    expect(findProjects(projects, "launch", "9:16", "updated").map(project => project.name)).toEqual(["Vertical launch"]);
    expect(findProjects(projects, "", "16:9", "updated").map(project => project.name)).toEqual(["Brand film"]);
  });

  it("sorts project results without mutating the saved recent-project list", () => {
    const sourceNames = projects.map(project => project.name);
    expect(findProjects(projects, "", "all", "duration").map(project => project.name)).toEqual(["Brand film", "Square cut", "Vertical launch"]);
    expect(findProjects(projects, "", "all", "name").map(project => project.name)).toEqual(["Brand film", "Square cut", "Vertical launch"]);
    expect(projects.map(project => project.name)).toEqual(sourceNames);
  });

  it("reports total duration and full-4K-or-larger projects", () => {
    expect(getProjectFinderStats(projects)).toEqual({ totalProjects: 3, totalDuration: 80, fourKProjects: 2 });
  });
});
