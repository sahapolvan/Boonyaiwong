const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "sahpvan";
const GITHUB_REPO = process.env.GITHUB_REPO || "Boonyaiwong";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_FILE = "data.js";

const ALLOWED_ORIGIN = "https://sahapvan.github.io";

app.use(express.json({ limit: "10mb" }));

// ======================================================
// CORS
// ======================================================

app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin === ALLOWED_ORIGIN) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, PUT, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// ======================================================
// ตรวจสอบ Environment
// ======================================================

function checkConfig() {
    if (!GITHUB_TOKEN) {
        throw new Error("ยังไม่ได้ตั้งค่า GITHUB_TOKEN");
    }

    if (!GITHUB_OWNER) {
        throw new Error("ยังไม่ได้ตั้งค่า GITHUB_OWNER");
    }

    if (!GITHUB_REPO) {
        throw new Error("ยังไม่ได้ตั้งค่า GITHUB_REPO");
    }

    if (!GITHUB_BRANCH) {
        throw new Error("ยังไม่ได้ตั้งค่า GITHUB_BRANCH");
    }
}

// ======================================================
// GitHub API
// ======================================================

function githubHeaders() {
    checkConfig();

    return {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Boonyaiwong-Family-API",
        "Content-Type": "application/json"
    };
}

function githubFileUrl() {
    return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
}

// ======================================================
// อ่าน data.js จาก GitHub
// ======================================================

async function getGithubData() {

    const response = await fetch(
        githubFileUrl(),
        {
            method: "GET",
            headers: githubHeaders()
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            `GitHub GET ${response.status}: ${
                result.message || "ไม่สามารถอ่าน data.js ได้"
            }`
        );
    }

    if (!result.content) {
        throw new Error("GitHub ไม่ส่งข้อมูล content ของ data.js กลับมา");
    }

    const content = Buffer
        .from(result.content.replace(/\n/g, ""), "base64")
        .toString("utf8");

    const data = parseFamilyRawData(content);

    return {
        data,
        sha: result.sha,
        content
    };
}

// ======================================================
// แปลง data.js → familyRawData
// ======================================================

function parseFamilyRawData(content) {

    const match = content.match(
        /const\s+familyRawData\s*=\s*(\[[\s\S]*?\]);/
    );

    if (!match) {
        throw new Error(
            "ไม่พบ const familyRawData = [...] ใน data.js"
        );
    }

    let data;

    try {
        data = JSON.parse(match[1]);
    } catch (error) {
        throw new Error(
            "ไม่สามารถแปลง familyRawData เป็น JSON ได้: " +
            error.message
        );
    }

    if (!Array.isArray(data)) {
        throw new Error(
            "familyRawData ไม่ใช่ Array"
        );
    }

    return data;
}

// ======================================================
// สร้างเนื้อหา data.js
// ======================================================

function createDataFile(data) {

    return `// data.js - ข้อมูลสมาชิกครอบครัวแบบ flat array

const familyRawData = ${JSON.stringify(data, null, 2)};
`;
}

// ======================================================
// ตรวจสอบข้อมูลบุคคล
// ======================================================

function normalizePerson(person, currentPerson) {

    const result = {
        id: String(
            person.id ??
            currentPerson.id
        ),

        name: String(
            person.name ??
            ""
        ).trim(),

        father:
            person.father === null ||
            person.father === undefined
                ? ""
                : String(person.father).trim(),

        mother:
            person.mother === null ||
            person.mother === undefined
                ? ""
                : String(person.mother).trim(),

        spouse:
            Array.isArray(person.spouse)
                ? person.spouse.map(String)
                : [],

        gender:
            person.gender === "ญ"
                ? "ญ"
                : "ช",

        photo:
            person.photo === null ||
            person.photo === undefined
                ? ""
                : String(person.photo)
    };

    // ห้าม ID ตัวเองเป็นคู่สมรส
    result.spouse = [
        ...new Set(
            result.spouse.filter(
                id => id !== result.id
            )
        )
    ];

    return result;
}

// ======================================================
// ตรวจสอบความถูกต้องของข้อมูล
// ======================================================

function validatePerson(person, data) {

    if (!person.name) {
        throw new Error("กรุณาระบุชื่อ");
    }

    const id = String(person.id);

    if (person.father === id) {
        throw new Error("บุคคลไม่สามารถเป็นบิดาของตัวเองได้");
    }

    if (person.mother === id) {
        throw new Error("บุคคลไม่สามารถเป็นมารดาของตัวเองได้");
    }

    const ids = new Set(
        data.map(p => String(p.id))
    );

    if (
        person.father &&
        !ids.has(String(person.father))
    ) {
        throw new Error(
            `ไม่พบข้อมูลบิดา ID ${person.father}`
        );
    }

    if (
        person.mother &&
        !ids.has(String(person.mother))
    ) {
        throw new Error(
            `ไม่พบข้อมูลมารดา ID ${person.mother}`
        );
    }

    for (const spouseId of person.spouse) {

        if (!ids.has(String(spouseId))) {
            throw new Error(
                `ไม่พบข้อมูลคู่สมรส ID ${spouseId}`
            );
        }

        if (String(spouseId) === id) {
            throw new Error(
                "บุคคลไม่สามารถเป็นคู่สมรสของตัวเองได้"
            );
        }
    }
}

// ======================================================
// ทำให้ spouse เชื่อมกันสองทาง
// ======================================================

function syncSpouses(data, personId, newSpouses) {

    const id = String(personId);

    // เอา ID ออกจากคู่สมรสเดิมทั้งหมด
    for (const person of data) {

        if (!Array.isArray(person.spouse)) {
            person.spouse = [];
        }

        person.spouse = person.spouse
            .map(String)
            .filter(spouseId => spouseId !== id);
    }

    // ใส่คู่สมรสใหม่
    const currentPerson = data.find(
        p => String(p.id) === id
    );

    if (!currentPerson) {
        throw new Error(
            `ไม่พบสมาชิก ID ${id}`
        );
    }

    currentPerson.spouse = [
        ...new Set(
            newSpouses
                .map(String)
                .filter(spouseId => spouseId !== id)
        )
    ];

    // เพิ่มกลับไปยังคู่สมรส
    for (const spouseId of currentPerson.spouse) {

        const spouse = data.find(
            p => String(p.id) === spouseId
        );

        if (!spouse) {
            continue;
        }

        if (!Array.isArray(spouse.spouse)) {
            spouse.spouse = [];
        }

        spouse.spouse = spouse.spouse.map(String);

        if (!spouse.spouse.includes(id)) {
            spouse.spouse.push(id);
        }
    }
}

// ======================================================
// เขียน data.js กลับ GitHub
// ======================================================

async function updateGithubData(data, sha) {

    const content = createDataFile(data);

    const encoded = Buffer
        .from(content, "utf8")
        .toString("base64");

    const url =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

    const response = await fetch(
        url,
        {
            method: "PUT",

            headers: githubHeaders(),

            body: JSON.stringify({
                message: "Update family data from Family Tree Manager",
                content: encoded,
                sha: sha,
                branch: GITHUB_BRANCH
            })
        }
    );

    const result = await response.json();

    if (!response.ok) {

        if (response.status === 409) {
            throw new Error(
                "ข้อมูลใน GitHub ถูกแก้ไขพร้อมกัน กรุณาลองบันทึกอีกครั้ง"
            );
        }

        throw new Error(
            `GitHub PUT ${response.status}: ${
                result.message || "บันทึก data.js ไม่สำเร็จ"
            }`
        );
    }

    return result;
}

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", (req, res) => {

    try {

        checkConfig();

        res.json({
            success: true,
            message: "Family Tree Server ทำงานปกติ",
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            branch: GITHUB_BRANCH,
            file: GITHUB_FILE
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ======================================================
// GET ข้อมูลทั้งหมด
// ======================================================

app.get("/api/family", async (req, res) => {

    try {

        const result = await getGithubData();

        res.json({
            success: true,
            count: result.data.length,
            data: result.data
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ======================================================
// GET สมาชิกตาม ID
// ======================================================

app.get("/api/family/:id", async (req, res) => {

    try {

        const result = await getGithubData();

        const person = result.data.find(
            p => String(p.id) === String(req.params.id)
        );

        if (!person) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก ID " + req.params.id
            });
        }

        res.json({
            success: true,
            data: person
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ======================================================
// PUT แก้ไขสมาชิก
// ======================================================

app.put("/api/family/:id", async (req, res) => {

    try {

        const id = String(req.params.id);

        // อ่าน GitHub ล่าสุดทุกครั้งก่อนแก้
        const result = await getGithubData();

        const data = result.data;

        const index = data.findIndex(
            p => String(p.id) === id
        );

        if (index === -1) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก ID " + id
            });
        }

        const oldPerson = data[index];

        const newPerson = normalizePerson(
            {
                ...oldPerson,
                ...req.body,
                id: id
            },
            oldPerson
        );

        validatePerson(
            newPerson,
            data
        );

        // แทนข้อมูลบุคคล
        data[index] = newPerson;

        // จัดการคู่สมรสให้เชื่อมสองทาง
        syncSpouses(
            data,
            id,
            newPerson.spouse
        );

        // เขียนกลับ GitHub
        const githubResult =
            await updateGithubData(
                data,
                result.sha
            );

        res.json({
            success: true,
            message: "แก้ไขข้อมูลและบันทึกลง GitHub เรียบร้อย",
            data: data[index],
            commit: {
                sha: githubResult.commit?.sha || "",
                url: githubResult.commit?.html_url || ""
            }
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ======================================================
// POST / DELETE ปิดไว้
// เพราะ crud.html มีหน้าที่แก้ไขข้อมูลเท่านั้น
// ======================================================

app.post("/api/family", (req, res) => {

    res.status(405).json({
        success: false,
        message: "ระบบนี้ไม่รองรับการเพิ่มสมาชิก"
    });
});

app.delete("/api/family/:id", (req, res) => {

    res.status(405).json({
        success: false,
        message: "ระบบนี้ไม่รองรับการลบสมาชิก"
    });
});

// ======================================================
// Root
// ======================================================

app.get("/", (req, res) => {

    res.json({
        success: true,
        name: "Boonyaiwong Family Tree API",
        status: "online"
    });
});

// ======================================================
// Error handler
// ======================================================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({
        success: false,
        message: err.message || "Server Error"
    });
});

// ======================================================
// START
// ======================================================

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("==========================================");
    console.log("       BOONYAIWONG FAMILY API");
    console.log("==========================================");
    console.log("");
    console.log("Port       :", PORT);
    console.log("Repository :", `${GITHUB_OWNER}/${GITHUB_REPO}`);
    console.log("Branch     :", GITHUB_BRANCH);
    console.log("File       :", GITHUB_FILE);
    console.log("");
    console.log("API        : /api/family");
    console.log("Health     : /api/health");
    console.log("");
    console.log("==========================================");
});
