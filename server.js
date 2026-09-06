const express = require("express");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const app = express();
const PORT = 3000;

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.js");
const BACKUP_FILE = path.join(ROOT, "data.backup.js");

app.use(express.json({ limit: "10mb" }));

// --------------------------------------------------
// อ่าน data.js
// --------------------------------------------------
function readFamilyData() {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error("ไม่พบไฟล์ data.js");
    }

    const code = fs.readFileSync(DATA_FILE, "utf8");

    const sandbox = {};

    vm.runInNewContext(
        code + "\n;globalThis.__familyData = familyRawData;",
        sandbox
    );

    if (!Array.isArray(sandbox.__familyData)) {
        throw new Error(
            "data.js ต้องมีตัวแปร familyRawData ที่เป็น Array"
        );
    }

    return sandbox.__familyData;
}

// --------------------------------------------------
// บันทึก data.js
// --------------------------------------------------
function writeFamilyData(data) {

    // สำรองไฟล์เดิมก่อน
    if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    }

    const output =
`// Family Tree Data
// แก้ไขผ่านระบบ Manager ได้
// อัปเดตล่าสุด: ${new Date().toLocaleString("th-TH")}

const familyRawData = ${JSON.stringify(data, null, 2)};
`;

    const tempFile = DATA_FILE + ".tmp";

    fs.writeFileSync(tempFile, output, "utf8");

    // เขียนเสร็จแล้วค่อยแทนที่ไฟล์จริง
    fs.renameSync(tempFile, DATA_FILE);
}

// --------------------------------------------------
// ตรวจสอบข้อมูล
// --------------------------------------------------
function normalizePerson(person) {

    return {
        ...person,

        id: Number(person.id),

        name: String(person.name || "").trim(),

        gender:
            person.gender === "ญ"
                ? "ญ"
                : "ช",

        father:
            person.father === null ||
            person.father === undefined ||
            person.father === ""
                ? null
                : Number(person.father),

        mother:
            person.mother === null ||
            person.mother === undefined ||
            person.mother === ""
                ? null
                : Number(person.mother),

        spouse:
            Array.isArray(person.spouse)
                ? person.spouse
                    .filter(x => x !== null && x !== "")
                    .map(Number)
                : [],

        photo:
            person.photo === undefined ||
            person.photo === null
                ? ""
                : String(person.photo)
    };
}

// --------------------------------------------------
// API: อ่านข้อมูลทั้งหมด
// --------------------------------------------------
app.get("/api/family", (req, res) => {

    try {

        const data = readFamilyData();

        res.json({
            success: true,
            data: data
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// --------------------------------------------------
// API: เพิ่มสมาชิก
// --------------------------------------------------
app.post("/api/family", (req, res) => {

    try {

        const data = readFamilyData();

        const body = req.body;

        if (!body.name || !String(body.name).trim()) {

            return res.status(400).json({
                success: false,
                message: "กรุณาระบุชื่อ"
            });
        }

        // หา ID ใหม่
        const maxId = data.reduce(
            (max, person) =>
                Math.max(max, Number(person.id) || 0),
            0
        );

        const newId = maxId + 1;

        const person = normalizePerson({
            ...body,
            id: newId
        });

        // ป้องกันข้อมูลผิด
        person.spouse =
            person.spouse.filter(id => id !== newId);

        if (person.father === newId) {
            person.father = null;
        }

        if (person.mother === newId) {
            person.mother = null;
        }

        data.push(person);

        // ทำคู่สมรสให้เชื่อมกันทั้งสองฝั่ง
        person.spouse.forEach(spouseId => {

            const spouse = data.find(
                p => Number(p.id) === Number(spouseId)
            );

            if (spouse) {

                if (!Array.isArray(spouse.spouse)) {
                    spouse.spouse = [];
                }

                if (!spouse.spouse.includes(newId)) {
                    spouse.spouse.push(newId);
                }
            }
        });

        writeFamilyData(data);

        res.json({
            success: true,
            message: "เพิ่มสมาชิกเรียบร้อย",
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

// --------------------------------------------------
// API: แก้ไขสมาชิก
// --------------------------------------------------
app.put("/api/family/:id", (req, res) => {

    try {

        const id = Number(req.params.id);

        const data = readFamilyData();

        const index = data.findIndex(
            p => Number(p.id) === id
        );

        if (index === -1) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก ID " + id
            });
        }

        const oldPerson = data[index];

        const newPerson = normalizePerson({
            ...oldPerson,
            ...req.body,
            id: id
        });

        // --------------------------------------------------
        // ตรวจสอบคู่สมรส
        // --------------------------------------------------

        const oldSpouses = Array.isArray(oldPerson.spouse)
            ? oldPerson.spouse.map(Number)
            : [];

        const newSpouses = Array.isArray(newPerson.spouse)
            ? [...new Set(
                newPerson.spouse
                    .map(Number)
                    .filter(x => x !== id)
            )]
            : [];

        newPerson.spouse = newSpouses;

        // คนที่เคยเป็นคู่สมรส แต่ถูกเอาออก
        oldSpouses.forEach(spouseId => {

            if (!newSpouses.includes(spouseId)) {

                const spouse = data.find(
                    p => Number(p.id) === spouseId
                );

                if (spouse && Array.isArray(spouse.spouse)) {

                    spouse.spouse =
                        spouse.spouse
                            .map(Number)
                            .filter(x => x !== id);
                }
            }
        });

        // คนที่เพิ่มเข้ามาเป็นคู่สมรส
        newSpouses.forEach(spouseId => {

            const spouse = data.find(
                p => Number(p.id) === spouseId
            );

            if (spouse) {

                if (!Array.isArray(spouse.spouse)) {
                    spouse.spouse = [];
                }

                if (!spouse.spouse.includes(id)) {
                    spouse.spouse.push(id);
                }
            }
        });

        data[index] = newPerson;

        writeFamilyData(data);

        res.json({
            success: true,
            message: "แก้ไขข้อมูลเรียบร้อย",
            data: newPerson
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// --------------------------------------------------
// API: ลบสมาชิก
// --------------------------------------------------
app.delete("/api/family/:id", (req, res) => {

    try {

        const id = Number(req.params.id);

        let data = readFamilyData();

        const exists = data.some(
            p => Number(p.id) === id
        );

        if (!exists) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก ID " + id
            });
        }

        // เอา ID นี้ออกจากคู่สมรส / พ่อ / แม่
        data = data.map(person => {

            const updated = {
                ...person
            };

            if (Array.isArray(updated.spouse)) {

                updated.spouse =
                    updated.spouse
                        .map(Number)
                        .filter(x => x !== id);
            }

            if (Number(updated.father) === id) {
                updated.father = null;
            }

            if (Number(updated.mother) === id) {
                updated.mother = null;
            }

            return updated;
        });

        // ลบสมาชิก
        data = data.filter(
            person => Number(person.id) !== id
        );

        writeFamilyData(data);

        res.json({
            success: true,
            message: "ลบสมาชิกเรียบร้อย"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// --------------------------------------------------
// API: ตรวจสอบระบบ
// --------------------------------------------------
app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        message: "Family Tree Server ทำงานปกติ",
        time: new Date().toISOString()
    });
});

// --------------------------------------------------
// ให้เปิดไฟล์ HTML / CSS / JS ในโฟลเดอร์เดียวกัน
// --------------------------------------------------
app.use(express.static(ROOT, {

    setHeaders: (res, filePath) => {

        // ไม่ให้ browser จำ data.js เก่า
        if (filePath.endsWith("data.js")) {
            res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate"
            );
        }
    }

}));

// --------------------------------------------------
// เริ่ม Server
// --------------------------------------------------
app.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log("   FAMILY TREE SERVER");
    console.log("======================================");
    console.log("");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Manager: http://localhost:${PORT}/manager.html`);
    console.log(`API: http://localhost:${PORT}/api/family`);
    console.log("");
    console.log("ข้อมูลจะถูกบันทึกลง data.js");
    console.log("สำรองข้อมูลไว้ที่ data.backup.js");
    console.log("");
});
