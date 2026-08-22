export type ProjectFinderSort = "updated" | "name" | "duration";

export type ProjectFinderRecord = {
  name: string;
  updatedAt: number;
  duration: number;
  aspectRatio: string;
  canvas: { width: number; height: number };
};

export function findProjects<T extends ProjectFinderRecord>(
  projects: T[],
  query: string,
  aspectRatio: string,
  sort: ProjectFinderSort,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return projects
    .filter(project => !normalizedQuery || project.name.toLocaleLowerCase().includes(normalizedQuery))
    .filter(project => aspectRatio === "all" || project.aspectRatio === aspectRatio)
    .slice()
    .sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      if (sort === "duration") return right.duration - left.duration || right.updatedAt - left.updatedAt;
      return right.updatedAt - left.updatedAt;
    });
}

export function getProjectFinderStats(projects: ProjectFinderRecord[]) {
  return {
    totalProjects: projects.length,
    totalDuration: projects.reduce((total, project) => total + project.duration, 0),
    fourKProjects: projects.filter(project => Math.max(project.canvas.width, project.canvas.height) >= 3840).length,
  };
}
