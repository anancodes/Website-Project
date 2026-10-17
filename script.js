console.log("Gradeway loaded");

// =============================================
// PERFORMANCE OPTIMIZATION: Debouncing & Caching
// =============================================

let classesCache = null;
let gpaCacheTime = 0;
let gpaCacheData = null;
const CACHE_DURATION = 1000; // 1 second

// Load classes from localStorage with error handling
function loadClasses() {
    if (classesCache === null) {
        try {
            classesCache = JSON.parse(localStorage.getItem("classes")) || [];
        } catch (e) {
            console.error("Error loading classes from localStorage:", e);
            classesCache = [];
        }
    }
    return classesCache;
}

// Save classes to localStorage with error handling
function saveClasses() {
    try {
        localStorage.setItem("classes", JSON.stringify(classesCache));
        gpaCacheTime = 0; // Invalidate GPA cache
    } catch (e) {
        console.error("Error saving classes to localStorage:", e);
        alert("Failed to save. Please check your storage.");
    }
}

// =============================================
// GPA CALCULATION (Optimized)
// =============================================

function getCategoryAverage(course, category) {
    const filteredAssignments = course.assignments.filter(
        assignment => assignment.category === category
    );

    if (filteredAssignments.length === 0) {
        return null;
    }

    const total = filteredAssignments.reduce((sum, a) => sum + a.grade, 0);
    return total / filteredAssignments.length;
}

function calculateAverage(course) {
    const majorAverage = getCategoryAverage(course, "major");
    const minorAverage = getCategoryAverage(course, "minor");
    const otherAverage = getCategoryAverage(course, "other");

    let weightedTotal = 0;
    let weightSum = 0;

    if (majorAverage !== null) {
        weightedTotal += majorAverage * course.weights.major;
        weightSum += course.weights.major;
    }

    if (minorAverage !== null) {
        weightedTotal += minorAverage * course.weights.minor;
        weightSum += course.weights.minor;
    }

    if (otherAverage !== null) {
        weightedTotal += otherAverage * course.weights.other;
        weightSum += course.weights.other;
    }

    return weightSum === 0 ? null : weightedTotal / weightSum;
}

function calculateGPA() {
    const classes = loadClasses();
    const now = Date.now();

    // Return cached GPA if still valid
    if (gpaCacheTime && now - gpaCacheTime < CACHE_DURATION) {
        return gpaCacheData;
    }

    let totalPoints = 0;
    let classCount = 0;

    classes.forEach(course => {
        // Skip exempted courses (they should not be included in GPA calculation)
        if (course.exempt) return;

        const average = calculateAverage(course);

        if (average === null) return;

        let points = 0;

        if (course.type === "academic") {
            if (average >= 90) points = 4;
            else if (average >= 80) points = 3;
            else if (average >= 70) points = 2;
            else points = 0;
        } else {
            if (average >= 90) points = 5;
            else if (average >= 80) points = 4;
            else if (average >= 70) points = 3;
            else points = 0;
        }

        totalPoints += points;
        classCount++;
    });

    const gpa = classCount === 0 ? 0 : totalPoints / classCount;

    // Cache the result
    gpaCacheData = gpa;
    gpaCacheTime = now;

    // Update GPA display if element exists
    const resultElement = document.getElementById("result");
    if (resultElement) {
        resultElement.innerText = `Current GPA: ${gpa.toFixed(2)}`;
    }

    return gpa;
}

// =============================================
// CLASS MANAGEMENT
// =============================================

function createClass() {
    const className = document.getElementById("className").value.trim();
    const classType = document.getElementById("classType").value;

    if (className === "") {
        alert("Please enter a class name");
        return;
    }

    classesCache = loadClasses();
    const newClass = {
        name: className,
        type: classType,
        weights: {
            major: 60,
            minor: 30,
            other: 10
        },
        assignments: []
    };

    classesCache.push(newClass);
    saveClasses();

    displayClasses();
    calculateGPA();

    document.getElementById("className").value = "";
    toggleClassForm();
}

function toggleClassForm() {
    const form = document.getElementById("classForm");
    if (form) {
        form.classList.toggle("show");
    }
}

// =============================================
// ASSIGNMENT MANAGEMENT
// =============================================

function addAssignment(index) {
    const name = document.getElementById(`name-${index}`).value.trim();
    const grade = Number(document.getElementById(`grade-${index}`).value);
    const category = document.getElementById(`category-${index}`).value;

    if (name === "") {
        alert("Enter an assignment name");
        return;
    }

    if (grade < 0 || grade > 100 || isNaN(grade)) {
        alert("Enter a valid grade (0-100)");
        return;
    }

    classesCache = loadClasses();
    classesCache[index].assignments.push({
        name: name,
        grade: grade,
        category: category
    });

    saveClasses();

    // Clear inputs
    document.getElementById(`name-${index}`).value = "";
    document.getElementById(`grade-${index}`).value = "";
    document.getElementById(`category-${index}`).value = "major";

    displayClasses();
    calculateGPA();
}

function deleteAssignment(classIndex, assignmentIndex) {
    if (!confirm("Delete this assignment?")) {
        return;
    }

    classesCache = loadClasses();
    classesCache[classIndex].assignments.splice(assignmentIndex, 1);
    saveClasses();

    displayClasses();
    calculateGPA();
}

function editAssignment(classIndex, assignmentIndex) {
    classesCache = loadClasses();
    const assignment = classesCache[classIndex].assignments[assignmentIndex];

    const newName = prompt("Assignment name:", assignment.name);
    if (newName === null) return;

    const newGrade = Number(prompt("Grade (0-100):", assignment.grade));
    if (isNaN(newGrade) || newGrade < 0 || newGrade > 100) {
        alert("Enter a valid grade.");
        return;
    }

    const newCategory = prompt(
        "Category (major/minor/other):",
        assignment.category
    );

    if (["major", "minor", "other"].indexOf(newCategory) === -1) {
        alert("Invalid category.");
        return;
    }

    assignment.name = newName.trim();
    assignment.grade = newGrade;
    assignment.category = newCategory;

    saveClasses();
    displayClasses();
    calculateGPA();
}

// =============================================
// WEIGHTS MANAGEMENT
// =============================================

function saveWeights(index) {
    const major = Number(document.getElementById(`major-${index}`).value);
    const minor = Number(document.getElementById(`minor-${index}`).value);
    const other = Number(document.getElementById(`other-${index}`).value);

    if (isNaN(major) || isNaN(minor) || isNaN(other)) {
        alert("Enter valid weights.");
        return;
    }

    if (major < 0 || minor < 0 || other < 0) {
        alert("Weights cannot be negative.");
        return;
    }

    if (major + minor + other !== 100) {
        alert("Weights must add up to 100.");
        return;
    }

    classesCache = loadClasses();
    classesCache[index].weights.major = major;
    classesCache[index].weights.minor = minor;
    classesCache[index].weights.other = other;

    saveClasses();
    displayClasses();
    calculateGPA();
}

// =============================================
// UI RENDERING (Optimized)
// =============================================

function getGradeClass(average) {
    if (average === null) return "";
    if (average >= 90) return "grade-a";
    if (average >= 80) return "grade-b";
    if (average >= 70) return "grade-c";
    return "grade-f";
}

function displayClasses() {
    const grid = document.getElementById("gradesGrid");
    if (!grid) return;

    classesCache = loadClasses();
    grid.innerHTML = "";

    classesCache.forEach((course, index) => {
        const average = calculateAverage(course);
        const gradeClass = getGradeClass(average);

        // Create card
        const card = document.createElement("div");
        card.className = "grade-card";

        // Create header
        const header = document.createElement("div");
        header.className = "class-header";
        header.onclick = () => toggleClass(index);

        // Class info
        const info = document.createElement("div");
        info.className = "class-info";
        info.innerHTML = `
            <h3>${escapeHtml(course.name)}</h3>
            <p>${course.type.toUpperCase()}</p>
        `;

        // Grade summary
        const summary = document.createElement("div");
        summary.className = `class-summary ${gradeClass}`;
        summary.innerHTML = `
            <span class="grade-value ${gradeClass}">
                ${average === null ? "N/A" : `${average.toFixed(2)}%`}
            </span>
            <span class="expand-icon">▼</span>
        `;

        header.appendChild(info);
        header.appendChild(summary);

        // Create content (expanded section)
        const content = document.createElement("div");
        content.className = "class-content";
        content.id = `class-content-${index}`;

        // Assignments section
        const assignmentsSection = document.createElement("div");
        assignmentsSection.className = "section-title";
        assignmentsSection.innerHTML = "<h4>Assignments</h4>";

        const assignmentsList = document.createElement("div");
        assignmentsList.className = "assignments-list";
        assignmentsList.id = `assignments-${index}`;

        // Render assignments
        course.assignments.forEach((assignment, assignmentIndex) => {
            const assignmentEl = document.createElement("div");
            assignmentEl.className = "assignment";

            const span = document.createElement("span");
            span.textContent = `${assignment.name} - ${assignment.grade}% - ${assignment.category}`;

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "assignment-actions";

            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.onclick = () => editAssignment(index, assignmentIndex);

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => deleteAssignment(index, assignmentIndex);

            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);

            assignmentEl.appendChild(span);
            assignmentEl.appendChild(actionsDiv);
            assignmentsList.appendChild(assignmentEl);
        });

        assignmentsSection.appendChild(assignmentsList);

        // Add assignment form
        const addAssignmentSection = document.createElement("div");
        addAssignmentSection.className = "add-assignment";
        addAssignmentSection.innerHTML = `
            <input
                type="text"
                placeholder="Assignment Name"
                id="name-${index}"
            >
            <input
                type="number"
                placeholder="Grade"
                id="grade-${index}"
                min="0"
                max="100"
            >
            <select id="category-${index}">
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="other">Other</option>
            </select>
            <button onclick="addAssignment(${index})">+ Add Grade</button>
        `;

        // Weights section
        const weightsSection = document.createElement("div");
        weightsSection.className = "weights-section";
        weightsSection.innerHTML = `
            <h4>Grade Weights</h4>
            <div class="weights">
                <div>
                    <label>Major</label>
                    <input
                        type="number"
                        id="major-${index}"
                        value="${course.weights.major}"
                        min="0"
                        max="100"
                    >
                </div>
                <div>
                    <label>Minor</label>
                    <input
                        type="number"
                        id="minor-${index}"
                        value="${course.weights.minor}"
                        min="0"
                        max="100"
                    >
                </div>
                <div>
                    <label>Other</label>
                    <input
                        type="number"
                        id="other-${index}"
                        value="${course.weights.other}"
                        min="0"
                        max="100"
                    >
                </div>
            </div>
            <button class="save-weights-button" onclick="saveWeights(${index})">
                Save Weights
            </button>
        `;

        content.appendChild(assignmentsSection);
        content.appendChild(addAssignmentSection);
        content.appendChild(weightsSection);

        card.appendChild(header);
        card.appendChild(content);
        grid.appendChild(card);
    });
}

function toggleClass(index) {
    const content = document.getElementById(`class-content-${index}`);
    const card = content.closest(".grade-card");

    if (content) {
        content.classList.toggle("expanded");
        card.classList.toggle("expanded");
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// =============================================
// INITIALIZATION
// =============================================

// Load and display classes on page load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        displayClasses();
        calculateGPA();
    });
} else {
    displayClasses();
    calculateGPA();
}
