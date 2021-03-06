const express = require("express");
const app = express();
const server = require("http").Server(app);
const fs = require("fs");
const compression = require("compression");
const db = require("./utils/db");
const csurf = require("csurf");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cookieSession = require("cookie-session");
const bc = require("./utils/bc");

const multer = require(`multer`);
const uidSafe = require(`uid-safe`);
const path = require(`path`);
// const s3 = require("./s3");
const amazonUrl = require(`./config`).s3Url;
const diskStorage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, __dirname + "/public/documents");
    },
    filename: function(req, file, callback) {
        uidSafe(24).then(function(uid) {
            callback(null, uid + path.extname(file.originalname));
        });
    }
});

const uploader = multer({
    storage: diskStorage,
    limits: {
        fileSize: 2097152
    }
});
app.use(bodyParser.json());
app.use(express.static("./public"));
app.use(compression());

////////////////////////////////////////////////////////////////////////////////

if (process.env.NODE_ENV != "production") {
    app.use(
        "/bundle.js",
        require("http-proxy-middleware")({
            target: "http://localhost:8081/"
        })
    );
} else {
    app.use("/bundle.js", (req, res) => res.sendFile(`${__dirname}/bundle.js`));
}

///////////////////////////////////APP USE////////////////////////////////////////
app.use(
    bodyParser.urlencoded({
        extended: false
    })
);

const cookieSessionMiddleware = cookieSession({
    secret: `I'm always angry.`,
    maxAge: 1000 * 60 * 60 * 24 * 90
});
app.use(cookieSessionMiddleware);

///////////////handle Vulnerabilities//////////////

app.use(csurf()); //place right after bodyParser and cookieSession///

app.use(function(req, res, next) {
    res.cookie("mytoken", req.csrfToken());
    next();
});

app.use(express.static("./public"));

///////////////////////////////// APP GET///////////////////////////////////////

app.get("/", (req, res, next) => {
    if (!req.session.userId) {
        console.log("redirect to welcome");
        res.redirect("/welcome");
    } else {
        next();
    }
});

/////////////////////// GET USER//////////////////
app.get("/user", (req, res) => {
    console.log("*******GET /USER*******");
    //console.log("get user: ", req.session);

    if (!req.session.userId) {
        console.log("redirect to welcome");
        res.redirect("/welcome");
    } else {
        db.getUserDataById(req.session.userId)
            .then(results => {
                const userData = results.rows[0];
                console.log("got user data: ", userData);
                res.json({
                    id: userData.id,
                    first: userData.first,
                    last: userData.last,
                    bio: userData.bio,
                    imageUrl: userData.imgurl,
                    coverImgUrl: userData.coverimgurl,
                    success: true
                });
            })
            .catch(err => {
                console.log("GET USER DATA", err);
            });
    }
});
///////////////////////GET DOCUMENT/////////////////////

app.get("/document/:id", async (req, res) => {
    console.log("*******GET DOCUMENT DATA*******");
    const documentId = req.params.id;
    try {
        const docData = await db.getdocumentById(documentId);
        console.log("doc data: ", docData.rows[0]);

        res.json(docData.rows[0]);
    } catch (err) {
        console.log("GET DOC DATA ERROR: ", err);
    }
});
/////////////////////// GET TEXT /////////////////////
app.get("/text/:id", async (req, res) => {
    console.log("*******GET TEXT DATA*******");
    const documentId = req.params.id;
    try {
        const docData = await db.getTextDocument(documentId);
        console.log("TEXT data: ", docData.rows[0]);

        res.json(docData.rows[0]);
    } catch (err) {
        console.log("GET TEXT ERROR: ", err);
    }
});
////////////////////////////FIND DOCS//////////////////////////

app.post("/find-docs", (req, res) => {
    console.log("*******GET /USERS*******");
    db.findDocs(req.body.find)
        .then(results => {
            let docs = results.rows;

            res.json({
                docs: docs
            });
        })
        .catch(err => {
            console.log("FIND DOCS ERROR", err);
        });
});
/////////////////////////////////store-document/////////////////////////////////
app.post(
    "/store-document",
    uploader.single("file"),
    // s3.upload,
    async (req, res) => {
        console.log("*******store document*******");
        console.log("req.file", req.file);
        // let imageUrl = "https://s3.amazonaws.com/spicedling/" + req.file.filename;
        let imageUrl = "/documents/" + req.file.filename;
        const userId = req.session.userId;
        const text = req.body.text;
        const title = req.body.title || "New Doc";
        const tags = "tags";
        try {
            const stored = await db.storeInDocuments(
                userId,
                imageUrl,
                text,
                title,
                tags
            );
            console.log("stored doc", stored);
            res.json(stored.rows[0].id);
        } catch (e) {
            console.log("error at stored doc", e);
            res.json({
                error: "oops, WRONG INFO"
            });
        }
    }
);
/////////////////////////////////update-xtt/////////////////////////////////
app.post("/update-text", async (req, res) => {
    console.log("*******Update text*******");
    console.log("req.body", req.body);
    const docId = req.body.docId;
    const text = req.body.text;
    const title = req.body.title || "New Doc";
    const tags = req.body.tags || "no tags"; //req.body.tags;
    console.log("*******Update text*******");

    try {
        const newData = await db.updateDoc(docId, text, title, tags);
        console.log("stored update-text doc", newData);
        res.json({ newData: "Ani prostetuzki" });
    } catch (e) {
        console.log("error at stored update-text doc", e);
    }
});
/////////////////////////////////update-title/////////////////////////////////
app.post("/update-title", async (req, res) => {
    console.log("*******Update title*******");
    console.log("req.body", req.body);
    const docId = req.body.id;
    const title = req.body.title;
    console.log("*******Update title*******");

    try {
        const newData = await db.updateDocTitle(docId, title);
        console.log("stored update-title doc", newData.rows[0]);
        res.json(newData.rows[0]);
    } catch (e) {
        console.log("error at stored update-title doc", e);
    }
});

/////////////////////////////////////registration login//////////////////////////////////////

app.post("/register", (req, res) => {
    console.log("*******POST REGISTER*******");
    console.log(req.body.email);
    const first = "first";
    const last = "last";
    const email = req.body.email;
    const password = req.body.password;

    if (!first) {
        res.json({
            error: "missing fields..."
        });
        return;
    }
    bc.hashPassword(password)
        .then(hashedPass => {
            return db.storeInUsers(first, last, email, hashedPass);
        })
        .then(results => {
            const user = results.rows[0];
            console.log("user ID: ", user.id);
            req.session.userId = user.id;

            res.json({
                success: true,
                userId: user.id
            });
        })
        .catch(e => {
            res.json({
                success: false,
                error: "something is wrong. please try again"
            });
            console.log("POST REGISTER ERROR: ", e);
        });
});

app.post("/login", (req, res) => {
    console.log("*******POST LOGIN*******");
    console.log("req.body", req.body);

    if (!req.body.email) {
        res.json({
            error: "missing fields..."
        });
    }
    db.getUserDataByEmail(req.body.email)
        .then(results => {
            console.log("password from table:", results.rows[0].password);
            console.log("password from form: ", req.body.password);
            const user = results.rows[0];
            console.log("get user data by id ", user);
            bc.checkPassword(req.body.password, user.password)
                .then(validPassword => {
                    if (validPassword) {
                        console.log("*******correct password******");

                        req.session.userId = user.id;
                        res.json({
                            success: true,
                            userId: user.id
                        });
                    }
                })
                .then(results => {
                    console.log("req.session  = ", req.session);
                });
        })
        .catch(err => {
            console.log("error", err);
            res.json({
                error: "wrong email or passsword!"
            });
        });
});
//////////////////////////////////delete image////////////////////////////////////////
app.post("/delete", async (req, res) => {
    console.log("req.body", req.body);
    let s3Url = req.body.url;
    let imageId = req.body.id;
    try {
        const docDelte = await db.deleteDoc(imageId);
        const s3Delete = await fs.unlinkSync(req.body.url); // s3.deleteImage(s3Url);
        res.json({ success: true });
    } catch (err) {
        console.log("error", err);
        res.json({
            error: "wrong email or passsword!"
        });
    }
});
//////////////////////////////////Logout////////////////////////////////////////

app.get("/logout", (req, res) => {
    console.log("*******LOG OUT*******");
    req.session = null;
    res.redirect("/welcome");
});
//////////////////////////////////////////////////////////
app.get("*", function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

if (require.main == module) {
    //HEROKU:
    app.listen(process.env.PORT || 8080, () => console.log("Im listening"));
}
