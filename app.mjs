import pug from 'pug'
import express from 'express'
import { body, oneOf, validationResult } from 'express-validator'
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
        next_user_id: 1,
        next_chore_id: 0,
        next_chore_log_id: 0,
        next_pay_log_id: 0,
        users: [ { id: 0, username: 'admin', password: 'password', role: 'admin' } ],
        chores: [],
        chore_log: [],
        pay_log: [],
        sessions: []
    }
    db.write()
}

// prep the db
db.chain = lodash.chain(db.data)

// use lowdb to store session data
let lss = lowdbstore(session)

// session params
var sess = {
    secret: 'ChoresAreFunForMeAndYou',
    cookie: {},
    saveUninitialized: true,
    resave: false,
    store: new lss(db)
}

// set express to use sessions
app.use(session(sess))

function epoch_to_pretty(date) {
    date = new Date(date)
    return (date.getMonth() + 1) + '-' + date.getDate() + '-' + date.getFullYear() + ' at ' + String(date.getHours()).padStart(2, "0") + ':' + String(date.getMinutes()).padStart(2, "0")
}

// file upload handler
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
    return new Promise((resolve) => {
        http.get(`http://192.168.1.1:8888/get_status/${rule_id}`, (resp) => {
            let data = ''

            resp.on('data', (chunk) => {
                data += chunk
            })

            resp.on('end', () => {
                resolve({ status: 'success', data: data.includes('disable') })
            })
        }).on('error', (e) => {
            resolve({ status: 'error', msg: 'error getting internet status' })
        })
    })
}

async function toggle_internet(rule_id, status) {
    if (status === false) {
        status = 'enable'
    } else {
        status = 'disable'
    }

    return new Promise((resolve) => {
        http.get(`http://192.168.1.1:8888/${status}/${rule_id}`, (resp) => {
            let data = ''

            resp.on('data', (chunk) => {
                data += chunk
            })

            resp.on('end', () => {
                resolve(data)
            })
        })
    })
}

app.get('/', (req, res) => {
    if (req.session.loggedin) {
        let users = []
        let user = db.chain.get('users').find({ id: req.session.user.id }).cloneDeep().value()
        let chores = db.chain.get('chores').cloneDeep().value()
        let chore_log = db.chain.get('chore_log').filter({ user_id: req.session.user.id }).cloneDeep().value().reverse()
        let pay_log = db.chain.get('pay_log').filter({ user_id : req.session.user.id }).cloneDeep().value().reverse()

        if (req.session.user.role == 'admin') {
            users = db.chain.get('users').filter({ role: 'kid' }).value()
        }

        // calculate total pay
        let pay = 0
        for (let i = 0; i < pay_log.length; i++) {
            pay += parseFloat(pay_log[i].pay)
        }

        // convert the pay to a normal form
        user.pay = pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})

        // format various query results
        for (let i = 0; i < users.length; i++) {
            if (!users[i].image) {
                users[i].image = 'placeholder.png'
            }
        }

        for (let i = 0; i < chores.length; i++) {
            chores[i].pay = chores[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
            if (!chores[i].image) {
                chores[i].image = 'placeholder.png'
            }
        }

        for (let i = 0; i < chore_log.length; i++) {
            chore_log[i].timestamp = epoch_to_pretty(chore_log[i].timestamp)
            chore_log[i].pay = chore_log[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
            if (!chore_log[i].image) {
                chore_log[i].image = 'placeholder.png'
            }
        }

        for (let i = 0; i < pay_log.length; i++) {
            pay_log[i].timestamp = epoch_to_pretty(pay_log[i].timestamp)
            pay_log[i].pay = pay_log[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
        }

        return res.render('index', { user: user, users: users, chores: chores, chore_log: chore_log, pay_log: pay_log })
    } else {
        return res.redirect('/login')
    }
})

// view a user
app.get('/user/:id', async (req, res) => {
    let id = parseInt(req.params.id)
    let errors = []

    if (Number.isNaN(id)) {
        return res.redirect('/')
    }

    // get the user info
    let user = db.chain.get('users').find({ id: id }).cloneDeep().value()

    if (!user) {
        return res.redirect('/')
    }

    if (user.fw_id) {
/*        let result = await get_status(user.fw_id)
        if (result.status == 'success') {
            user.internet_status = result.data
        } else {
            user.internet_status = false
            errors.push({ msg: result.msg })
        }
*/
    }

    // get the user's chores
    let chore_log = db.chain.get('chore_log').filter({ user_id: id }).cloneDeep().value().reverse()

    // get the user's pay entries
    let pay_log = db.chain.get('pay_log').filter({ user_id: id }).cloneDeep().value().reverse()

    // calculate total pay
    let pay = 0
    for (let i = 0; i < pay_log.length; i++) {
        pay += parseFloat(pay_log[i].pay)
    }

    // convert the pay to a normal form
    user.pay = pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})

    for (let i = 0; i < chore_log.length; i++) {
        chore_log[i].timestamp = epoch_to_pretty(chore_log[i].timestamp)
        chore_log[i].user_name = user.name
        chore_log[i].pay = chore_log[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
    }

    // convert pay and timestamp
    for (let i = 0; i < pay_log.length; i++) {
        pay_log[i].timestamp = epoch_to_pretty(pay_log[i].timestamp)
        pay_log[i].pay = pay_log[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
    }

    // render
    return res.render('user', { user: user, chore_log: chore_log, pay_log: pay_log, errors: errors })
})


// view a chore
app.get('/chore/:id', (req, res) => {
    let id = parseInt(req.params.id)

    if (Number.isNaN(id)) {
        return res.redirect('/')
    }

    let chore = db.chain.get('chores').find({ id: id }).cloneDeep().value()

    if (!chore) {
        return res.redirect('/')
    }

    let users = db.chain.get('users').filter({ role: 'kid' }).value()
    let chore_log = db.chain.get('chore_log').filter({ chore_id: id }).cloneDeep().value()

    chore.pay = chore.pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})

    if (!chore.image) {
        chore.image = 'placeholder.png'
    }

    for (let i = 0; i < chore_log.length; i++) {
        let user = db.chain.get('users').find({ id: chore_log[i].user_id }).value()
        chore_log[i].timestamp = epoch_to_pretty(chore_log[i].timestamp)
        chore_log[i].user_name = user.name
        chore_log[i].user_image = user.image

        if (!chore_log[i].image) {
            chore_log[i].image = 'placeholder.png'
        }

        // convert pay
        chore_log[i].pay = chore_log[i].pay.toLocaleString('en-US', { style: 'currency', currency: 'USD'})
    }

    return res.render('chore', { user: req.session.user, chore: chore, chore_log: chore_log, users: users })
})


// login redirect
app.get('/login', (req, res) => {
    if (req.session.loggedin) {
        return res.redirect('/')
    } else {
        return res.render('login')
    }
})

// logout
app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy()
    }
    return res.render('login')
})

// login
app.post('/login', (req, res) => {
    let message = ''

    if (req.session.loggedin) {
        return res.redirect('/')
    }
    else {
        if (req.body.username) { //&& req.body.password) {
            let user = db.chain.get('users').find({ username: req.body.username }).pick(['id', 'username', 'role']).value() //, password: req.body.password }).value()

            if (user && user.role) {
                req.session.loggedin = true
                req.session.user = user
                return res.redirect('/')
            }
        }
        message = 'Invalid username or password.'
    }
    return res.render('login', {
        message: message
    })
})

// add / edit user
app.post('/user',
    oneOf([
    [
        body('action').isIn(['new',]),
        body('user_username').isLength({ min: 3 }),
    ],
        body('action').isIn(['update','delete', 'toggle_internet'])
    ]),
    async (req, res) => {
        const errors = validationResult(req).array()

        // make sure user is logged in
        if (!req.session.loggedin) {
            res.redirect('/login')
        }

        let found = db.chain.get('users').find({ id: parseInt(req.body.user_id) }).value()

        // if there are no errors, do something
        if (!errors.length) {
            switch (req.body.action) {
                case 'new':
                case 'update':
                    // not an admin
                    if (req.session.user.role != 'admin') {
                        errors.push({ msg: 'Access denied' })
                        break
                    }

                    // new, but already exists
                    if (found && req.body.action == 'new') {
                        errors.push({ msg: 'Item already exists' })
                        break
                    }

                    // not found, but trying to update
                    else if (!found && req.body.action == 'update') {
                        errors.push({ msg: 'Item does not exist' })
                        break
                    }

                    // make sure password length is good
                    if (req.body.user_password && req.body.user_password.length < 5) {
                        errors.push({ msg: 'Password too short' })
                        break
                    }

                    let user = { username: xss.inHTMLData(req.body.user_username), name: xss.inHTMLData(req.body.user_name), description: xss.inHTMLData(req.body.user_description), fw_id: req.body.user_fw_id, role: 'kid' }

                    if (req.body.user_password) {
                        user.password = req.body.user_password
                    }

                    // check if a image was uploaded
                    if (req.body.user_image) {
                        user.image = handle_upload(req.body.user_image)
                    }

                    // push the user
                    if (req.body.action == 'new') {
                        user.id = db.data.next_user_id++
                        db.data.users.push(user)
                    } else {
                        db.chain.get('users').find({ id: parseInt(req.body.user_id) }).assign(user).value()
                    }

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        console.log(e)
                    }

                    break
                // delete user
                case 'delete':
                    break

                case 'toggle_internet':
                    // not an admin
                    if (req.session.user.role != 'admin') {
                        errors.push({ msg: 'Access denied' })
                        break
                    }

                    let result = await toggle_internet(found.fw_id, req.body.status)

                    return res.status(200).json({ status: result })

                    break

                case 'default':
                    errors.push({ msg: 'Invalid action' })
                    break
            }
        }

        return res.status(400).json({ status: 'error', errors: errors })        
})

// add / edit chore
app.post('/chore',
    oneOf([
        [
            body('action').isIn(['new']),
            body('chore_name').isLength({ min: 1 }),
            body('chore_description').isLength({ min: 1 })
        ],
        [
            body('action').isIn(['finish', 'update','delete']),
        ]
    ]),
    (req, res) => {
        // make sure user is logged in
        if (!req.session.loggedin) {
            res.redirect('/login')
        }

        const errors = validationResult(req).array()

        // get the chore if it exists
        let found_chore = db.chain.get('chores').find({ id: parseInt(req.body.chore_id) }).value()

        // if found, make sure we're  not remaking
        if (found_chore && req.body.action == 'new') {
            errors.push({ msg: 'Item already exists' })
        // else, make sure chore exists
        } else if (!found_chore && req.body.action != 'new') {
            errors.push({ msg: 'Chore not found' })
        }

        // any errors?
        if (!errors.length) {
            // new or updating chore
            switch (req.body.action) {
                case 'new':
                case 'update':
                    // not an admin
                    if (req.session.user.role != 'admin') {
                        errors.push({ msg: 'Access denied' })
                        break
                    }

                    let chore = {}
                    if (req.body.chore_name != undefined) {
                        chore.name = xss.inHTMLData(req.body.chore_name)
                    }

                    if (req.body.chore_description != undefined) {
                        chore.description = xss.inHTMLData(req.body.chore_description)
                    }

                    if (req.body.chore_pay != undefined) {
                        let pay = parseFloat(req.body.chore_pay.replace('$',''))
                        if (pay) {
                            chore.pay = pay
                        } else {
                            chore.pay = 0
                        }
                    }

                    if (req.body.chore_assignment != undefined) {
                        chore.assignment = parseInt(req.body.chore_assignment)
                    }

                    // check if a image was uploaded
                    if (req.body.chore_image != undefined) {
                        chore.image = handle_upload(req.body.chore_image)
                    }

                    if (req.body.chore_internet != undefined) {
                        if (req.body.chore_internet == 'on') {  
                            chore.internet = true
                        } else {
                            chore.internet = false
                        }
                    }

                    // push the chore
                    if (req.body.action == 'new') {
                        chore.id = db.data.next_chore_id++
                        db.data.chores.push(chore)
                    } else {
                        db.chain.get('chores').find({ id: parseInt(req.body.chore_id) }).assign(chore).value()
                    }

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        next(e)
                    }
                break

                case 'finish':
                    // prepare the chore log
                    let chore_log = { chore_id: found_chore.id, user_id: req.session.user.id, chore_name: found_chore.name, description: xss.inHTMLData(req.body.chore_finish_description), pay: found_chore.pay, status: 'pending', timestamp:  Date.now() }

                    // check if a image was uploaded
                    if (req.body.chore_image != undefined) {
                        chore_log.image = handle_upload(req.body.chore_image)
                    }

                    // get next chore log id
                    chore_log.id = db.data.next_chore_log_id++
                    db.data.chore_log.push(chore_log)

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        next(e)
                    }
                break

                case 'delete':
                break

                default:
                    errors.push({ msg: 'Invalid action' })
                    break

            }
            
        }

        return res.status(400).json({ status: 'error', errors: errors })
})

// chore_log
app.post('/chore_log',
    body('chore_log_id').isLength({ min: 1 }),
    body('action').isIn(['approve']),
    (req, res) => {
        const errors = validationResult(req).array()

        // not an admin
        if (req.session.user.role != 'admin') {
            errors.push({ msg: 'Access denied' })
        }

        let found_chore_log = db.chain.get('chore_log').find({ id: parseInt(req.body.chore_log_id) }).value()
        let found_chore = db.chain.get('chores').find({ id: parseInt(found_chore_log.chore_id) }).value()

        if (!errors.length) {
            if (req.body.action == 'approve') {
                if (found_chore_log) {
                    // prepare the pay log
                    let pay_log = { user_id: found_chore_log.user_id, pay: found_chore.pay, description: `Completed ${found_chore.name}.`, timestamp: Date.now() }

                    // get next pay log id
                    pay_log.id = db.data.next_pay_log_id++
                    db.data.pay_log.push(pay_log)

                    // update chore
                    found_chore_log.status = 'approved'
                    found_chore_log.pay_log_id = pay_log.id
                    db.chain.get('chore_log').find({ id: parseInt(req.body.chore_log_id) }).assign(found_chore_log).value()

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        next(e)
                    }
                } else {
                    console.log('Chore log not found')
                }
            }
            errors.push({ msg: 'Invalid action' })
        }

        return res.status(400).json({ status: 'error', errors: errors })
})

// chore_log
app.post('/pay_log',
    body('user_id').isLength({ min: 1 }),
    body('action').isIn(['new','update','delete']),
    (req, res) => {
        const errors = validationResult(req).array()

        let found_user = null
        let pay = parseFloat(req.body.pay_amount.replace('$',''))

        // admin can pay anyone
        if (req.session.user.role == 'admin') {
            found_user = db.chain.get('users').find({ id: parseInt(req.body.user_id) }).value()
        }
        // not an admin, only allow self
        else {
            found_user = db.chain.get('users').find({ id: req.session.user.id }).value()

            // cheater!
            if (pay > 0) {
                errors.push({ msg: 'Nice try, cheater' })
            }

            // get the user's pay entries
            let pay_log = db.chain.get('pay_log').filter({ user_id: req.session.user.id }).cloneDeep().value().reverse()

             // calculate total pay
            let user_pay = 0
            for (let i = 0; i < pay_log.length; i++) {
                user_pay += parseFloat(pay_log[i].pay)
            }

            if (Math.abs(pay) > user_pay) {
                errors.push({ msg: 'You\'re broke, sorry!  Do more chores.' })
            }
        }
        
        let found_pay_log = db.chain.get('pay_log').find({ id: parseInt(req.body.pay_log_id) }).value()

        if (!errors.length) {
            if (req.body.action == 'new') {
                if (found_user) {
                    //
                    if (!req.body.pay_amount) {
                        req.body.pay_amount = 0
                    }

                    // prepare the pay log
                    let pay_log = { user_id: found_user.id, pay: pay, description: xss.inHTMLData(req.body.pay_description), timestamp:  Date.now() }

                    // get next pay log id
                    pay_log.id = db.data.next_pay_log_id++
                    db.data.pay_log.push(pay_log)

                    // save the db
                    try {
                        db.write()
                        return res.status(200).json({ status: 'success' })
                    } catch (e) {
                        next(e)
                    }
                } else {
                    console.log('Pay log not found')
                }
            }
            else if (req.body.action == 'update') {

            }
            errors.push({ msg: 'Invalid action' })
        }

        return res.status(400).json({ status: 'error', errors: errors })
})

// finish a chore
app.post('/finish',
    body('chore_finish_description').isLength({ min: 3 }),
    (req, res) => {
        const errors = validationResult(req).array()
        let chore_id = parseInt(req.body.chore_id)
        let user_id = parseInt(req.session.user.id)
        let found_chore = db.chain.get('chores').find({ id: chore_id }).value()
        let found_user = db.chain.get('users').find({ id: user_id }).value()
        if (!errors.length) {
            if (req.body.action == 'finish') {
                if (found_chore && found_user) {
                    // prepare the chore log
                    let chore_log = { chore_id: chore_id, user_id: user_id, description: xss.inHTMLData(req.body.chore_finish_description), pay: found_chore.pay, status: 'pending', timestamp:  Date.now() }

                    // check if a image was uploaded
                    if (req.body.chore_image != undefined) {
                        chore_log.image = handle_upload(req.body.chore_image)
                    }

                    // get next chore log id
                    chore_log.id = db.data.next_chore_log_id++
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
            errors.push({ msg: 'Invalid action' })
        }
        return res.status(400).json({ status: 'error', errors: errors })
})

// listen
app.listen(port, () => {
    console.log(`Listening on :${port}`)
})
