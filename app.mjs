import pug from 'pug'
import express from 'express'
import { body, validationResult } from 'express-validator'
const app = express()
import { join, resolve, dirname } from 'path'
import { Low, JSONFile } from 'lowdb'
import lodash from 'lodash'
import bodyparser from 'body-parser'
import cookieparser from 'cookie-parser'
import session from 'express-session'
import bcrypt from 'bcrypt'
import http from 'http'
import crypto from 'crypto'
import fs from 'fs'

app.set('view engine', 'pug')
app.locals.pretty = true
app.use(express.static('public'))
app.use('/css', express.static(join(dirname(''), 'node_modules/bootstrap/dist/css')))
app.use('/css', express.static(join(dirname(''), 'node_modules/cropperjs/dist')))
app.use('/js', express.static(join(dirname(''), 'node_modules/bootstrap/dist/js')))
app.use('/js', express.static(join(dirname(''), 'node_modules/jquery/dist')))
app.use('/js', express.static(join(dirname(''), 'node_modules/cropperjs/dist')))

var sess = {
    secret: 'ChoresAreFunForMeAndYou',
    cookie: {},
    saveUninitialized: true,
    resave: true
}

app.use(bodyparser.json({limit: '50mb'}))
app.use(bodyparser.urlencoded({ extended: true }))
app.use(cookieparser())
app.use(session(sess))

const dbf = join(resolve(dirname('')), 'db.json')
const adapter = new JSONFile(dbf)
const db = new Low(adapter)
const hostname = '0.0.0.0'
const port = 3000

// load the db
await db.read()

// allocate an admin if no db available
if (!db.data) {
    db.data = {
        users: [ { username: 'admin', password: 'password', role: 'admin' } ],
        images: {}
    }
    await db.write()
}

// prep the db
db.chain = lodash.chain(db.data)

function handle_upload(data) {
    let base = join(dirname(''), '/uploads')
    let hash = crypto.createHash('md5').update(data).digest('hex')

    // making sure base directory exists
    try {
        let dirstat = fs.statSync(base)
    } catch (err) {
        if (err.code == 'ENOENT') {
            fs.mkdirSync(base, { recursive: true })
            let dirstat = fs.statSync(base)
        } else {
            throw (err)
        }
    }

    let filename = join(base, hash)

    // write file
    try {
        fs.writeFileSync(filename, data)
    } catch (err) {
        throw(err)
    }
}

// grab fw status from edgerouter
async function get_status(rule_id) {
    http.get(`http://192.168.1.1:8888/get_status/${rule_id}`, (resp) => {
        let data = ''

        resp.on('data', (chunk) => {
            data += chunk
        })

        resp.on('end', () => {
            console.log(data)
        })
    })
}

app.get('/', (req, res) => {
    if (req.session.loggedin) {
        res.render('index')
    } else {
        res.redirect('/login')
    }
})

app.get('/kids', (req, res) => {
    if (req.session.loggedin) {
        let page_data = {}
        if (req.session.user.role == 'admin') {
            let kids = lodash.map(db.chain.get('users').filter({ role: 'kid' }).value(), lodash.partialRight(lodash.pick, ['name', 'username', 'description', 'picture']))
            res.status(200).json(kids)
        }
    } else {
        res.end('')
    }
})

app.get('/login', (req, res) => {
    if (req.session.loggedin) {
        res.redirect('/')
    } else {
        res.render('login')
    }
})

app.post('/login', (req, res) => {
    if (req.session.loggedin) {
        res.redirect('/')
    }
    else {
        if (req.body.username) { //&& req.body.password) {
            let user = db.chain.get('users').find({ username: req.body.username }).value() //, password: req.body.password }).value()
            if (user) {
                req.session.loggedin = true
                req.session.user = user
                res.redirect('/')
            }
        } else {
            res.render('login', {
                message: 'Invalid username or password'
            })
        }
    }
})

app.post('/new-kid',
    body('kid_username').isLength({ min: 1 }),
    body('kid_password').isLength({ min: 1 }),
    async (req, res) => {
        const errors = validationResult(req)
        if (errors.isEmpty() && !db.chain.get('users').find({ username: req.body.kid_username }).value()) {
            let user = { username: req.body.kid_username, password: req.body.kid_password, name: req.body.kid_name, description: req.body.kid_description, role: 'kid' }
            // check if a picture was uploaded
            if (req.body.kid_picture) {
                handle_upload(req.body.kid_picture)
            }

            // push the user
            db.data.users.push(user)

            // save the db
            try {
                await db.write()
                res.end()
            } catch (e) {
                next(e)
            }
        } else {
            return res.status(400).json({ errors: errors.array() })
        }
})

app.post('/delete-kid', (req, res) => {

})

app.post('/new-chore',
    body('kid_username').isLength({ min: 1 }),
    body('kid_password').isLength({ min: 1 }),
    (req, res) => {
        const errors = validationResult(req)
        if (errors.isEmpty() && !db.chain.get('users').find({ username: req.body.username }).value()) {
            db.data.users.push({ username: req.body.kid_username, password: req.body.kid_password, name: req.body.kid_name, role: 'kid' })
        } else {
            return res.status(400).json({ errors: errors.array() })
        }
})

app.listen(port, () => {
    console.log(`Listening on :${port}`)
})
