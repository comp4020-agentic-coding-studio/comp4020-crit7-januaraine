import { describe, expect, it } from "vitest";
import { CATALOGUE_YEAR } from "../src/lib/catalogue-seed";
import { anuCourseUrl } from "../src/lib/course-links";

// Pure unit tests — the URL is generated dynamically from the course code
// and the catalogue year, never hard-coded to one course.
describe("anuCourseUrl", () => {
  it("lowercases the course code into the URL path", () => {
    expect(anuCourseUrl("COMP4020")).toBe(`https://programsandcourses.anu.edu.au/${CATALOGUE_YEAR}/course/comp4020`);
  });

  it("generates the correct URL for a different course code", () => {
    expect(anuCourseUrl("COMP3620")).toBe(`https://programsandcourses.anu.edu.au/${CATALOGUE_YEAR}/course/comp3620`);
  });

  it("works for any course code, not just COMP4020", () => {
    expect(anuCourseUrl("COMP1100")).toBe(`https://programsandcourses.anu.edu.au/${CATALOGUE_YEAR}/course/comp1100`);
    expect(anuCourseUrl("COMP2310")).toBe(`https://programsandcourses.anu.edu.au/${CATALOGUE_YEAR}/course/comp2310`);
  });
});
