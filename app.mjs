import pug from 'pug'
import express from 'express'
import { body, validationResult } from 'express-validator'
const app = express()
import { join, resolve, dirname } from 'path'
import { LowSync, JSONFileSync } from 'lowdb'
import lodash from 'lodash'
import lowdbstore from './lowdb-session-store.js'
import bodyparser from 'body-parser'
import cookieparser from 'cookie-parser'
import session from 'express-session'
import bcrypt from 'bcrypt'
import http from 'http'
import crypto from 'crypto'
import fs from 'fs'
import xss from 'xss-filters'

app.set('view engine', 'pug')
app.locals.pretty = true
app.use(express.static('public'))
app.use('/images', express.static(join(dirname(''), 'uploads/')))
app.use('/css', express.static(join(dirname(''), 'node_modules/bootstrap/dist/css')))
app.use('/css', express.static(join(dirname(''), 'node_modules/cropperjs/dist')))
app.use('/js', express.static(join(dirname(''), 'node_modules/bootstrap/dist/js')))
app.use('/js', express.static(join(dirname(''), 'node_modules/jquery/dist')))
app.use('/js', express.static(join(dirname(''), 'node_modules/cropperjs/dist')))

app.use(bodyparser.json({limit: '50mb'}))
app.use(bodyparser.urlencoded({ extended: true }))
app.use(cookieparser())

const dbf = join(resolve(dirname('')), 'db.json')
const adapter = new JSONFileSync(dbf)
const db = new LowSync(adapter)
const hostname = '0.0.0.0'
const port = 3000

// load the db
db.read()

// allocate an admin if no db available
if (!db.data) {
    db.data = {
        users: [ { username: 'admin', password: 'password', role: 'admin' } ],
        chores: [],
        chore_log: [],
        sessions: []
    }
    db.write()
}

// prep the db
db.chain = lodash.chain(db.data)

let lss = lowdbstore(session)
var sess = {
    secret: 'ChoresAreFunForMeAndYou',
    cookie: {},
    saveUninitialized: true,
    resave: false,
    store: new lss(db)
}

app.use(session(sess))

function handle_upload(data) {
    let base = join(dirname(''), '/uploads')

    try {
        data = Buffer.from(data.split(',')[1], 'base64')
    } catch(err) {
        throw(err)
    }

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

    return hash
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
        let kids = []
        let chores = db.data.chores
        let chore_log = db.chain.get('chore_log').filter({ kid_name: req.session.user.username }).value()
        let user = db.chain.get('users').find({ username: req.session.user.username }).value()

        if (req.session.user.role == 'admin') {
            kids = db.chain.get('users').filter({ role: 'kid' }).value()
        }

        res.render('index', { user: user, kids: kids, chores: chores, chore_log: chore_log })
    } else {
        res.redirect('/login')
    }
})

app.get('/user/:username', (req, res) => {
    let username = req.params.username
    let user = db.chain.get('users').find({ username: username }).value()
    let chore_log = db.chain.get('chore_log').filter({ kid_name: username }).value()
    res.render('user', { user: user, chore_log: chore_log })
})

app.get('/chore/:name', (req, res) => {
    let chore_name = req.params.name
    let chore = db.chain.get('chores').find({ name: chore_name }).value()
    let kids = db.chain.get('users').filter({ role: 'kid' }).value()
    let chore_log = db.chain.get('chore_log').filter({ chore_name: chore_name }).value()
    for (let i = 0; i < chore_log.length; i++) {
        chore_log[i].kid_image = db.chain.get('users').find({ username: chore_log[i].kid_name }).value().image
    }

    res.render('chore', { user: req.session.user, chore: chore, chore_log: chore_log, kids: kids })
})

app.get('/login', (req, res) => {
    if (req.session.loggedin) {
        res.redirect('/')
    } else {
        res.render('login')
    }
})

app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy()
    }
    res.render('login')
})

app.post('/login', (req, res) => {
    if (req.session.loggedin) {
        res.redirect('/')
    }
    else {
        if (req.body.username) { //&& req.body.password) {
            let user = db.chain.get('users').find({ username: req.body.username }).pick(['username', 'role']).value() //, password: req.body.password }).value()
            if (user) {
                req.session.loggedin = true
                delete user.password
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
    (req, res) => {
        const errors = validationResult(req)
        if (errors.isEmpty() && !db.chain.get('users').find({ username: req.body.kid_username }).value()) {
            let kid = { username: xss.inHTMLData(req.body.kid_username), password: req.body.kid_password, name: xss.inHTMLData(req.body.kid_name), description: xss.inHTMLData(req.body.kid_description), pay: xss.inHTMLData(req.body.kid_pay), role: 'kid' }
            // check if a image was uploaded
            if (req.body.kid_image) {
                kid.image = handle_upload(req.body.kid_image)
            }

            // push the user
            db.data.users.push(kid)

            // save the db
            try {
                db.write()
                res.status(200).json({ status: 'success' })
            } catch (e) {
                next(e)
            }
        } else {
            return res.status(400).json({ status: 'error', errors: errors.array() })
        }
})

app.post('/delete-kid', (req, res) => {

})

app.post('/chore',
    body('chore_name').isLength({ min: 3 }),
    (req, res) => {
        const errors = validationResult(req).array()
        let found = db.chain.get('chores').find({ name: req.body.chore_name }).value()
        if (found && req.body.action == 'new') {
            errors.push({ msg: 'Item already exists' })
        }
        if (!errors.length) {
            if (req.body.action == 'new' || req.body.action == 'update') {
                let chore = {}
                chore.name = xss.inHTMLData(req.body.chore_name)

                if (req.body.chore_description != undefined)
                    chore.description = xss.inHTMLData(req.body.chore_description)

                if (req.body.chore_pay != undefined)
                    chore.pay = xss.inHTMLData(req.body.chore_pay)

                if (req.body.chore_assignment != undefined)
                    chore.assignment = xss.inHTMLData(req.body.chore_assignment)

                // check if a image was uploaded
                if (req.body.chore_image != undefined) {
                    chore.image = handle_upload(req.body.chore_image)
                }

                // push the user
                if (req.body.action == 'new') {
                    db.data.chores.push(chore)
                } else {
                    db.chain.get('chores').find({ name: req.body.chore_name }).assign(chore).value()
                }

                // save the db
                try {
                    db.write()
                    return res.status(200).json({ status: 'success' })
                } catch (e) {
                    next(e)
                }
            }
        }
        return res.status(400).json({ status: 'error', errors: errors })
})

app.post('/finish',
    body('chore_finish_notes').isLength({ min: 3 }),
    (req, res) => {
        const errors = validationResult(req).array()
        let found_chore = db.chain.get('chores').find({ name: req.body.chore_name }).value()
        let found_user = db.chain.get('users').find({ username: req.body.kid_name }).value()
        if (!errors.length) {
            if (req.body.action == 'finish') {
                if (found_chore && found_user) {
                    let chore_log = { chore_name: xss.inHTMLData(req.body.chore_name), kid_name: xss.inHTMLData(req.body.kid_name), notes: xss.inHTMLData(req.body.chore_finish_notes), pay: found_chore.pay }
                    // check if a image was uploaded
                    if (req.body.chore_image != undefined) {
                        chore_log.image = handle_upload(req.body.chore_image)
                    }

                    db.data.chore_log.push(chore_log)

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        next(e)
                    }
                } else {
                    console.log('Chore not found.')
                }
            }
        }
        return res.status(400).json({ status: 'error', errors: errors })
})

app.listen(port, () => {
    console.log(`Listening on :${port}`)
})
