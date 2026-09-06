const express = require("express");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const app = express();
const PORT = 3000;

const DATA_FILE = path.join(__dirname, "data.js");
const BACKUP_FILE = path.join(__dirname, "data.backup.js");

app.use(express.json({ limit: "10mb" }));

// ======================================================
// อ่านข้อมูลจาก data.js
// ======================================================
function readFamilyData() {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error("ไม่พบไฟล์ data.js");
    }

    const code = fs.readFileSync(DATA_FILE, "utf8");

    const sandbox = {};

    try {
        vm.runInNewContext(
            code + "\nthis.__familyRawData = familyRawData;",
            sandbox
        );
    } catch (error) {
        throw new Error(
            "อ่าน data.js ไม่สำเร็จ: " + error.message
        );
    }

    if (!Array.isArray(sandbox.__familyRawData)) {
        throw new Error(
            "ไม่พบ familyRawData หรือ familyRawData ไม่ใช่ Array"
        );
    }

    return sandbox.__familyRawData;
}

// ======================================================
// บันทึกกลับลง data.js
// ======================================================
function writeFamilyData(data) {

    // สำรองข้อมูลเดิม
    if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    }

    const content =
`// data.js - ข้อมูลสมาชิกครอบครัวแบบ flat array

const familyRawData = ${JSON.stringify(data, null, 2)};
`;

    const tempFile = DATA_FILE + ".tmp";

    fs.writeFileSync(
        tempFile,
        content,
        "utf8"
    );

    fs.renameSync(
        tempFile,
        DATA_FILE
    );
}

// ======================================================
// แปลงข้อมูลให้ตรงกับโครงสร้างเดิม
// ======================================================
function normalizePerson(data) {

    return {
        id: String(data.id),

        name: String(data.name || ""),

        father:
            data.father === null ||
            data.father === undefined
                ? ""
                : String(data.father),

        mother:
            data.mother === null ||
            data.mother === undefined
                ? ""
                : String(data.mother),

        spouse: Array.isArray(data.spouse)
            ? data.spouse.map(String)
            : [],

        gender:
            data.gender === "ญ"
                ? "ญ"
                : "ช",

        photo:
            data.photo === null ||
            data.photo === undefined
                ? ""
                : String(data.photo)
    };
}

// ======================================================
// ตรวจสอบระบบ
// ======================================================
app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        message: "Family Tree Server ทำงานปกติ"
    });

});

// ======================================================
// GET - อ่านสมาชิกทั้งหมด
// ======================================================
app.get("/api/family", (req, res) => {

    try {

        const data = readFamilyData();

        res.json({
            success: true,
            count: data.length,
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

// ======================================================
// GET - สมาชิกคนเดียว
// ======================================================
app.get("/api/family/:id", (req, res) => {

    try {

        const data = readFamilyData();

        const person = data.find(
            p => String(p.id) === String(req.params.id)
        );

        if (!person) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก"
            });

        }

        res.json({
            success: true,
            data: person
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ======================================================
// POST - เพิ่มสมาชิก
// ======================================================
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
        let maxId = 0;

        data.forEach(person => {

            const id = Number(person.id);

            if (!isNaN(id) && id > maxId) {
                maxId = id;
            }

        });

        const newId = String(maxId + 1);

        const person = normalizePerson({
            ...body,
            id: newId
        });

        person.spouse =
            person.spouse.filter(
                id => id !== newId
            );

        data.push(person);

        // เชื่อมคู่สมรสทั้งสองฝั่ง
        person.spouse.forEach(spouseId => {

            const spouse = data.find(
                p => String(p.id) === String(spouseId)
            );

            if (!spouse) return;

            if (!Array.isArray(spouse.spouse)) {
                spouse.spouse = [];
            }

            if (!spouse.spouse.includes(newId)) {
                spouse.spouse.push(newId);
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

// ======================================================
// PUT - แก้ไขสมาชิก
// ======================================================
app.put("/api/family/:id", (req, res) => {

    try {

        const id = String(req.params.id);

        const data = readFamilyData();

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

        const oldSpouses =
            Array.isArray(oldPerson.spouse)
                ? oldPerson.spouse.map(String)
                : [];

        const newPerson = normalizePerson({
            ...oldPerson,
            ...req.body,
            id: id
        });

        // ป้องกันการเลือกตัวเองเป็นคู่สมรส
        newPerson.spouse =
            [...new Set(
                newPerson.spouse
                    .map(String)
                    .filter(x => x !== id)
            )];

        const newSpouses = newPerson.spouse;

        // ----------------------------------------------
        // ลบความสัมพันธ์คู่สมรสเก่า
        // ----------------------------------------------
        oldSpouses.forEach(spouseId => {

            if (!newSpouses.includes(spouseId)) {

                const spouse = data.find(
                    p => String(p.id) === spouseId
                );

                if (spouse && Array.isArray(spouse.spouse)) {

                    spouse.spouse =
                        spouse.spouse
                            .map(String)
                            .filter(x => x !== id);

                }

            }

        });

        // ----------------------------------------------
        // เพิ่มความสัมพันธ์คู่สมรสใหม่
        // ----------------------------------------------
        newSpouses.forEach(spouseId => {

            const spouse = data.find(
                p => String(p.id) === spouseId
            );

            if (!spouse) return;

            if (!Array.isArray(spouse.spouse)) {
                spouse.spouse = [];
            }

            spouse.spouse =
                spouse.spouse.map(String);

            if (!spouse.spouse.includes(id)) {
                spouse.spouse.push(id);
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

// ======================================================
// DELETE - ลบสมาชิก
// ======================================================
app.delete("/api/family/:id", (req, res) => {

    try {

        const id = String(req.params.id);

        let data = readFamilyData();

        const exists = data.some(
            p => String(p.id) === id
        );

        if (!exists) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบสมาชิก ID " + id
            });

        }

        // ลบ ID ออกจากความสัมพันธ์ของทุกคน
        data = data.map(person => {

            const p = {
                ...person
            };

            if (Array.isArray(p.spouse)) {

                p.spouse =
                    p.spouse
                        .map(String)
                        .filter(x => x !== id);

            }

            if (String(p.father) === id) {
                p.father = "";
            }

            if (String(p.mother) === id) {
                p.mother = "";
            }

            return p;

        });

        // ลบตัวสมาชิก
        data = data.filter(
            p => String(p.id) !== id
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

// ======================================================
// ปิด Cache ของ data.js
// ======================================================
app.use(express.static(__dirname, {

    setHeaders: (res, filePath) => {

        if (filePath.endsWith("data.js")) {

            res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate"
            );

        }

    }

}));

// ======================================================
// เริ่ม Server
// ======================================================
app.listen(PORT, () => {

    console.log("");
    console.log("==========================================");
    console.log("       FAMILY TREE SERVER");
    console.log("==========================================");
    console.log("");
    console.log("Server  : http://localhost:" + PORT);
    console.log("Manager : http://localhost:" + PORT + "/manager.html");
    console.log("API     : http://localhost:" + PORT + "/api/family");
    console.log("");
    console.log("Data    : " + DATA_FILE);
    console.log("Backup  : " + BACKUP_FILE);
    console.log("");
    console.log("จำนวนข้อมูลที่อยู่ใน data.js จะอ่านจาก");
    console.log("familyRawData โดยตรง");
    console.log("");
});
