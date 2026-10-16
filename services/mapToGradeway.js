// services/mapToGradeway.js
//
// Converts parsed HAC course data into the exact shape Gradeway's
// script.js expects for its "classes" array. Same logic proven out
// in map-to-gradeway.js, wrapped as an importable function.

function detectType(name) {
  // Heuristic: AP/KAP-style courses -> "kap", dual credit -> "dual",
  // everything else -> "academic". Verify against real course names
  // as they show up — this hasn't been tested against an actual
  // dual-credit course yet.
  if (/\bAP\b|\bAP[A-Z]/.test(name)) return "kap";
  if (/\bDC\b|dual\s*credit/i.test(name)) return "dual";
  return "academic";
}

function cleanCourseName(name) {
  // Strips a leading course-code prefix like "0109A - 6 " if present.
  return name.replace(/^\S+\s*-\s*\d+\s*/, "").trim();
}

const WEIGHT_KEYS = { Major: "major", Minor: "minor", Other: "other" };

function mapToGradeway(courses) {
  return courses.map((course) => {
    const weights = { major: 0, minor: 0, other: 0 };
    course.categories.forEach((cat) => {
      const key = WEIGHT_KEYS[cat.category];
      if (key) weights[key] = parseFloat(cat.categoryWeight) || 0;
    });

    const assignments = course.assignments
      .filter((a) => {
        const parsed = parseFloat(a.percentage);
        return !isNaN(parsed); // drop assignments HAC hasn't graded yet
      })
      .map((a) => ({
        name: a.name.replace(/\s*\*$/, "").trim(),
        grade: parseFloat(a.percentage),
        category: (a.category || "").toLowerCase(),
      }));

    // Detect whether the course is marked as exempted in the HAC name.
    // Some districts prefix exempted courses with an "exa..." token at the
    // start of the course name (case-insensitive). Preserve this as an
    // explicit boolean so the frontend can ignore the course for GPA.
    const rawName = course.name || "";
    const isExempt = /^\s*exa/i.test(rawName);

    return {
      name: cleanCourseName(course.name),
      sectionKey: course.sectionKey,
      type: detectType(course.name),
      weights,
      assignments,
      exempt: isExempt,
    };
  });
}

module.exports = { mapToGradeway };
