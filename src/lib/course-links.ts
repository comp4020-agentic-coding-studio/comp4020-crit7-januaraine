import { CATALOGUE_YEAR } from "./catalogue-seed";

// The official ANU Programs and Courses page for a course code, generated
// from the same catalogue year the app already seeds from — never
// hard-coded to a specific course, so every seeded code (and any future
// one) resolves correctly.
export function anuCourseUrl(courseCode: string): string {
  return `https://programsandcourses.anu.edu.au/${CATALOGUE_YEAR}/course/${courseCode.toLowerCase()}`;
}
